import type { Observable, Unsubscribable } from '@trpc/server/observable';
import { observable } from '@trpc/server/observable';
import type {
  AnyClientTypes,
  InferrableClientTypes,
  PipelineCallReads,
  PipelinedBatchPlan,
  PipelineErrorMark,
  PipelineFrame,
  PipelineLimits,
} from '@trpc/server/unstable-core-do-not-import';
import {
  createDeferred,
  hasOwn,
  isObject,
  pipelinedBatchBody,
  pipelinedBatchUrl,
  pipelineFrameOf,
  pipelineLimitDefaults,
  pipelineMarkOf,
  planPipelinedBatch,
  transformResult,
} from '@trpc/server/unstable-core-do-not-import';
import type { BatchLoader } from '../../internals/dataLoader';
import { raceAbortSignals } from '../../internals/signals';
import { isTRPCClientError, TRPCClientError } from '../../TRPCClientError';
import type { HTTPBatchLinkOptions } from '../HTTPBatchLinkOptions';
import type {
  Operation,
  OperationLink,
  OperationResultEnvelope,
} from '../types';
import type {
  ContentOptions,
  HTTPResult,
  ResolvedHTTPLinkOptions,
} from './httpUtils';
import { getBody, getUrl, resolveHTTPLinkOptions } from './httpUtils';
import type { OperationReads } from './pipelineContext';
import {
  fallbacks,
  fillOperation,
  isPipelineFallback,
  pipelineOf,
  priorFailureOf,
  readsOf,
  withoutReads,
} from './pipelineContext';

export { pipelineContext } from './pipelineContext';

/**
 * What a batch link does with the protocol in
 * `@trpc/server/unstable-core-do-not-import/http/pipeline`: when an
 * operation's request can take more calls, which of them fit in it, and what
 * each call's result is.
 */

/**
 * What one unit, such as a call, a run of one or an item, ended with: its
 * data or its error, never both.
 */
export type Outcome<TData> =
  | { ok: true; data: TData }
  | { ok: false; error: unknown };

/**
 * A promise that never rejects: a failure is in what it resolves to, as an
 * `Outcome`. Only `settles()` makes one, so what awaits it can't be failed by
 * a unit that isn't its own.
 */
export type Settles<TValue> = Promise<TValue> & {
  readonly __brand: 'Settles';
};

/** What `run` returns, or what `onError` makes of what it threw or rejected with */
export function settles<TValue>(
  run: () => TValue | PromiseLike<TValue>,
  onError: (cause: unknown) => TValue,
): Settles<TValue> {
  return new Promise<TValue>((resolve) => resolve(run())).then(
    undefined,
    onError,
  ) as Settles<TValue>;
}

/** A failed outcome */
export function failed(error: unknown): Outcome<never> {
  return { ok: false, error };
}

/** The outcome of a promise that can reject, such as a request's */
export function outcomeOf<TData>(
  promise: PromiseLike<TData>,
): Settles<Outcome<TData>> {
  return settles(
    async (): Promise<Outcome<TData>> => ({ ok: true, data: await promise }),
    failed,
  );
}

/**
 * Lets the server make more calls in an operation's request, with parts of
 * their inputs read from the operation's data. Put one in an operation's
 * context with `pipelineContext()`.
 *
 * A call isn't an operation, so no link sees one with a hole in its input.
 * Its outcome comes back with the operation's request, as the call's
 * `settled`.
 */
export interface OperationPipeline {
  /**
   * Whether calls can be added. A link that pipelines sets it as it takes the
   * operation, before the call that sent the operation returns, and unsets it
   * as the operation's request goes.
   */
  open: boolean;
  /** The limits of the server, as the link that opens it says */
  limits: ClientPipelineLimits;
  /**
   * Whether the response of the link that opens it streams, so that each
   * call, and each run of one, settles by itself. `null` until a link opens it
   */
  streams: boolean | null;
  /**
   * The link that took it this attempt, if one that pipelines did. An
   * operation that reads it goes in its request only through the same link:
   * a `splitLink` may send the two to different ones
   */
  link: object | null;
  /**
   * The calls added to the operation's request, with `pipeCall()`. They stay
   * here once the request has gone, for a link that logs the context.
   */
  calls: PipelinedCall[];
  /**
   * The paths of the calls that went in the operation's request. It settles
   * once no more calls can be added: as the request goes, or as the operation
   * ends without one. A link that pipelines replaces it as it opens the
   * pipeline, so an operation sent again has one for each attempt. For a link
   * that logs the operation, which reads it once it has sent the operation on.
   */
  sent: Promise<readonly string[]>;
  /** Only for the link that takes the operation */
  settleSent: (paths: readonly string[]) => void;
  /**
   * The call the operation is in this attempt, if a link put it in the
   * request of an operation it reads, rather than in a request of its own.
   * The operations that read it go in that request too
   */
  attached: PipelinedCall | null;
  /**
   * What runs each time a link opens it: the operations that read it, and
   * wait for an attempt of it to go in
   */
  onOpen: Set<() => void>;
  /** What a link that serializes an operation's context gets: it has no cycles */
  toJSON: () => unknown;
}

/** What a client keeps to of a server's limits, so the server takes its calls */
type ClientPipelineLimits = Pick<
  PipelineLimits,
  'maxReadsPerCall' | 'maxDepth' | 'maxRuns'
>;

/** What a call reads the data of: an operation, or another call */
export type PipelineSource = OperationPipeline | PipelinedCall;

/**
 * One level of the runs of a call for every item, decoded, in the shape the
 * response has it, so that `readPipelinedItem()` reads it too: a list, with a
 * level for each of its items by index, or a run's `{ result }` or
 * `{ error }`. A list that couldn't run is an `{ error }` in place of its
 * items. An error is as the server sent it, or a `TRPCClientError` for a run
 * the link couldn't read, with the mark the server put beside it in its
 * envelope, or `null` for none. `{}` is no run.
 */
export type PipelinedRunsNode =
  | { items: Readonly<Record<string, PipelinedRuns>> }
  | { result: { data: unknown } }
  | { error: unknown; pipeline: PipelineErrorMark | null }
  | Record<string, never>;

/** One run's outcome of a call that the server ran once for every item */
export type PipelinedRun =
  | { kind: 'data'; data: unknown }
  /**
   * As the client throws it, with the mark the server put beside it in its
   * envelope, or beside the error of the list it is in. `null` for none,
   * such as for the error of a procedure, or for a run the link couldn't read
   */
  | { kind: 'error'; error: unknown; mark: PipelineErrorMark | null }
  /** The server sent nothing for the item */
  | { kind: 'missing' };

/**
 * The runs of a call for every item, decoded once by the link. Each level,
 * and each run, settles by itself: a run that failed, or that the link can't
 * read, fails only its own item.
 */
export type PipelinedRuns = Settles<PipelinedRunsNode>;

/** A call's data, decoded once by the link */
export type PipelinedData = {
  /** The response of the request it was in, as a batch link has it */
  meta: HTTPResult['meta'];
} & (
  | {
      /** A call that ran once */
      kind: 'once';
      data: unknown;
    }
  | {
      /** A call that ran for every item: see `readPipelinedRun()` */
      kind: 'each';
      runs: PipelinedRuns;
    }
);

/**
 * Where a call is. It goes from `waiting` to `sent` or `not-run`, and from
 * `sent` to `ran` or `not-run`, once: `ran` and `not-run` are final.
 */
export type PipelinedCallState =
  /** The request hasn't gone yet */
  | { status: 'waiting' }
  /** It is in a request */
  | { status: 'sent' }
  /** The server ran it: its data, or its own error */
  | { status: 'ran'; outcome: Outcome<PipelinedData> }
  /**
   * It didn't run, or the client never had its result. It wasn't sent, its
   * request failed as a whole, its result never arrived, a call it reads
   * failed, or the server refused it before any of its runs ran. What wants
   * it asks for it by itself
   */
  | { status: 'not-run'; error: unknown };

/** The final states of a call */
export type PipelinedCallSettled = Extract<
  PipelinedCallState,
  { status: 'ran' | 'not-run' }
>;

/**
 * A query the server runs in the request of an operation, after the calls
 * whose data it reads.
 */
export interface PipelinedCall {
  /** The procedure's path */
  path: string;
  /** The input, with `undefined` in place of what the server fills in */
  input: unknown;
  reads: PipelineCallReads<PipelineSource>;
  /** Its place in its chain: a call that reads an operation is 2 */
  depth: number;
  /** The items it runs for, or `null` if it runs once */
  frame: PipelineFrame<PipelineSource> | null;
  /** Where it is. Only `moveCall()` changes it */
  readonly state: PipelinedCallState;
  /** Its final state, once it has one. It never rejects */
  settled: Settles<PipelinedCallSettled>;
  /**
   * `state`, as it was named before: `unresolved` is `not-run`, and `ran` is
   * `sent`
   */
  readonly status: 'waiting' | 'sent' | 'unresolved';
  /**
   * `settled`, as a promise that rejects with what the call failed with, or
   * didn't run for. For a call for every item, its data is its runs
   */
  readonly result: Promise<PipelinedCallResult>;
  /** The pipeline of the operation whose request it goes in */
  owner: OperationPipeline;
}

export interface PipelinedCallResult {
  /**
   * Its data. For a call for every item, its runs: see `readPipelinedRun()`
   */
  data: unknown;
}

export function createOperationPipeline(): OperationPipeline {
  const sent = createDeferred<readonly string[]>();
  const pipeline: OperationPipeline = {
    open: false,
    limits: pipelineLimitDefaults,
    streams: null,
    link: null,
    calls: [],
    sent: sent.promise,
    settleSent: sent.resolve,
    attached: null,
    onOpen: new Set(),
    toJSON: () => ({
      calls: pipeline.calls.map((call) => ({
        path: call.path,
        status: call.status,
      })),
    }),
  };
  return pipeline;
}

function isCall(source: PipelineSource): source is PipelinedCall {
  return 'owner' in source;
}

/** A call's state, and what settles its `settled`: only `moveCall()` changes it */
interface CallSettler {
  state: PipelinedCallState;
  settle: (to: PipelinedCallSettled) => void;
}
const settlers = /* @__PURE__ */ new WeakMap<PipelinedCall, CallSettler>();

/**
 * Adds a call to the request of the operations it reads. `null` if that
 * request has gone, no link that pipelines took those operations, or the
 * server would refuse it: more reads or a longer chain than it takes, or
 * items of two lists.
 */
export function pipeCall(opts: {
  path: string;
  input: unknown;
  reads: PipelineCallReads<PipelineSource>;
}): PipelinedCall | null {
  const { each } = opts.reads;
  // It goes with the operation of its first read. Its read limit first,
  // before anything goes through every read
  const first =
    each?.from ??
    opts.reads.reads.find((read) => read.kind === 'whole')?.from ??
    null;
  const owner = first && (isCall(first) ? first.owner : first);
  if (!owner || opts.reads.reads.length > owner.limits.maxReadsPerCall) {
    return null;
  }
  const sources: PipelineSource[] = [
    ...(each ? [each.from] : []),
    ...opts.reads.reads.flatMap((read) =>
      read.kind === 'whole' ? [read.from] : [],
    ),
  ];
  const framed = pipelineFrameOf({
    reads: opts.reads,
    frameOf: (source) => (isCall(source) ? source.frame : null),
  });
  if (
    !framed.fits ||
    // Only a call for every item has an item to read
    (!each && opts.reads.reads.some((read) => read.kind === 'item'))
  ) {
    return null;
  }
  if (
    !sources.every((source) =>
      isCall(source)
        ? source.owner.open && source.state.status === 'waiting'
        : source.open,
    )
  ) {
    return null;
  }
  // A loop, not a spread: a spread of many sources overflows the stack
  let depth = 2;
  for (const source of sources) {
    if (isCall(source)) {
      depth = Math.max(depth, source.depth + 1);
    }
  }
  if (depth > owner.limits.maxDepth) {
    return null;
  }
  const settled = createDeferred<PipelinedCallSettled>();
  const settler: CallSettler = {
    state: { status: 'waiting' },
    settle: settled.resolve,
  };
  const call: PipelinedCall = {
    path: opts.path,
    input: opts.input,
    reads: opts.reads,
    depth,
    frame: framed.frame,
    get state() {
      return settler.state;
    },
    // Resolved only by `moveCall()`, with a final state
    settled: settles(
      () => settled.promise,
      (error) => ({ status: 'not-run', error }),
    ),
    get status() {
      const { status } = settler.state;
      return status === 'not-run'
        ? 'unresolved'
        : status === 'ran'
          ? 'sent'
          : status;
    },
    get result() {
      const result = settled.promise.then(
        (it): PipelinedCallResult | Promise<never> =>
          it.status === 'not-run'
            ? Promise.reject(it.error)
            : it.outcome.ok
              ? {
                  data:
                    it.outcome.data.kind === 'once'
                      ? it.outcome.data.data
                      : it.outcome.data.runs,
                }
              : Promise.reject(it.outcome.error),
      );
      // Read only by what wants the call's result
      result.catch(() => undefined);
      return result;
    },
    owner,
  };
  settlers.set(call, settler);
  owner.calls.push(call);
  return call;
}

/** The states a call can go to from each state */
interface CallMoves {
  waiting: 'sent' | 'not-run';
  sent: 'ran' | 'not-run';
  ran: never;
  'not-run': never;
}

/** A step a call can take: from a state, to one `CallMoves` allows from it */
type CallMove = {
  [TFrom in keyof CallMoves]: {
    from: TFrom;
    to: Extract<PipelinedCallState, { status: CallMoves[TFrom] }>;
  };
}[keyof CallMoves];

/**
 * The one place a call's state changes. It moves only from the state the
 * move is from, so a call settles once: a second move to a final state is
 * ignored.
 */
function moveCall(call: PipelinedCall, move: CallMove) {
  const settler = settlers.get(call);
  if (settler?.state.status !== move.from) {
    return;
  }
  settler.state = move.to;
  if (move.to.status !== 'sent') {
    settler.settle(move.to);
  }
}

/**
 * Ends what an operation's pipeline was waiting for, once the operation has a
 * result: a call still waiting then never went in a request.
 */
function closePipeline(op: Pick<Operation, 'context'>) {
  const pipeline = pipelineOf(op);
  if (!pipeline) {
    return;
  }
  pipeline.open = false;
  for (const call of pipeline.calls) {
    moveCall(call, {
      from: 'waiting',
      to: {
        status: 'not-run',
        error: new Error('The operation this call reads was not sent'),
      },
    });
  }
  // Nothing went, if its request didn't take the calls already
  pipeline.settleSent([]);
}

type BatchOp = Pick<Operation, 'context' | 'path' | 'input'>;

/** What a batch link tells `experimental_pipelining()` about itself */
export interface PipeliningLink extends ResolvedHTTPLinkOptions {
  /** The most calls a request can have */
  maxItems: number;
  /** The longest URL a request can have */
  maxURLLength: number;
  /**
   * Whether its responses stream. A streamed one has each value of a call
   * for every item deserialized already, and as a promise of its own
   */
  streams: boolean;
}

/**
 * A call's result, as the link gives an operation's. Throws its error. A
 * streamed result is deserialized already
 */
function readResult(link: PipeliningLink, result: HTTPResult): unknown {
  if (link.streams) {
    if ('error' in result.json) {
      throw TRPCClientError.from(result.json, { meta: result.meta });
    }
    return result.json.result.data;
  }
  const transformed = transformResult(result.json, link.transformer.output);
  if (!transformed.ok) {
    throw TRPCClientError.from(transformed.error, { meta: result.meta });
  }
  return transformed.result.data;
}

/** A batch's request, with calls in it that read the data of others */
export interface PipelinedBatch {
  /** The calls that go in the request, after the operations */
  calls: readonly Pick<PipelinedCall, 'path' | 'input'>[];
  /** The URL and body of the request */
  request: Pick<ContentOptions, 'getUrl' | 'getBody'>;
  /** The result of every operation, and then of every call, that was sent */
  results: readonly (HTTPResult | Promise<HTTPResult>)[];
}

type RoutedEnvelope = OperationResultEnvelope<unknown, TRPCClientError<any>>;

/**
 * What an operation reads, by what gets the data of each operation in this
 * attempt: its request, or the call a link put it in. `null` if one of them
 * has neither open now, or another link than `link` took it
 */
function sourcesNow(
  reads: OperationReads['reads'],
  link: object,
): PipelineCallReads<PipelineSource> | null {
  const sourceOf = (pipeline: OperationPipeline): PipelineSource | null =>
    pipeline.link !== link
      ? null
      : (pipeline.attached ?? (pipeline.open ? pipeline : null));
  const each = reads.each && {
    from: sourceOf(reads.each.from),
    path: reads.each.path,
  };
  if (each && !each.from) {
    return null;
  }
  const whole: PipelineCallReads<PipelineSource>['reads'] = [];
  for (const read of reads.reads) {
    if (read.kind === 'item') {
      whole.push(read);
      continue;
    }
    const from = sourceOf(read.from);
    if (!from) {
      return null;
    }
    whole.push({ ...read, from });
  }
  return {
    each: each as PipelineCallReads<PipelineSource>['each'],
    reads: whole,
  };
}

/** An operation's input, if the client has what it reads within a moment */
function knownSoon(reads: OperationReads) {
  const known = reads.known();
  if (known) {
    return Promise.resolve(known);
  }
  return new Promise<{ input: unknown } | null>((resolve) => {
    const timer = setTimeout(() => resolve(null));
    reads.resolve().then(
      (input) => {
        clearTimeout(timer);
        resolve({ input });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

/** The operations an operation reads */
function pipelinesRead(reads: OperationReads['reads']) {
  return new Set([
    ...(reads.each ? [reads.each.from] : []),
    ...reads.reads.flatMap((read) =>
      read.kind === 'whole' ? [read.from] : [],
    ),
  ]);
}

/** What a batch link does with the operations it takes, when it pipelines */
export interface BatchPipelining {
  /** Lets calls go in an operation's request, as the link takes it */
  open: (op: Pick<Operation, 'context' | 'type'>) => void;
  /** Ends what an operation's calls wait for, once it has a result */
  close: (op: Pick<Operation, 'context'>) => void;
  /**
   * Takes an operation whose input reads other operations' data: into the
   * request of what it reads, as a call, while that request is open. Else it
   * waits for an attempt of what it reads to open one, or for that data, and
   * goes by itself with `send`. `null` for an operation that reads nothing
   */
  route: (
    op: Operation,
    send: (op: Operation) => Observable<RoutedEnvelope, TRPCClientError<any>>,
  ) => Observable<RoutedEnvelope, TRPCClientError<any>> | null;
  /**
   * Whether the last operation of a batch has to go in the next request: more
   * calls fit in the two requests than in one with it
   */
  splits: (ops: readonly BatchOp[]) => boolean;
  /**
   * Takes a batch's calls into its request, as it goes. `null` if it has none:
   * it is then an ordinary batch.
   */
  take: (ops: readonly BatchOp[]) => {
    calls: readonly PipelinedCall[];
    request: PipelinedBatch['request'];
    /** Gives the calls their results, or what the request failed with */
    settle: (results: Promise<PipelinedBatch['results']>) => void;
  } | null;
  /**
   * The link's batch loader, sending the calls that read a batch's
   * operations in its request
   */
  loader: <TOp extends Operation>(
    loader: PipeliningLoader<TOp>,
  ) => BatchLoader<TOp, HTTPResult>;
  /**
   * The link's handler of an operation, opening each operation's request to
   * calls, and routing an operation that reads others' data with `route()`
   */
  link: <TInferrable extends InferrableClientTypes>(
    handler: OperationLink<TInferrable>,
  ) => OperationLink<TInferrable>;
}

/** A batch link's loader, which can send a batch with a URL and body of its own */
export interface PipeliningLoader<TOp> {
  validate: BatchLoader<TOp, HTTPResult>['validate'];
  /**
   * Its `request` is a pipelined batch's. Optional, as the loader is a
   * `BatchLoader` too, whose `fetch` takes the batch only
   */
  fetch: (
    ops: TOp[],
    request?: PipelinedBatch['request'],
  ) => ReturnType<BatchLoader<TOp, HTTPResult>['fetch']>;
}

/**
 * What a client keeps to of the server's `experimental_allowPipelining`
 * limits. A call that would go over one isn't pipelined: it waits for the
 * data it reads, and goes in a request of its own.
 *
 * Experimental: it may change in a minor release.
 * @see https://trpc.io/docs/client/vanilla/nested-queries#limits
 */
export interface experimental_PipeliningLinkOptions {
  /**
   * The server's `maxReadsPerCall`, or a lower number
   * @default 16
   */
  maxReadsPerCall?: number;
  /**
   * The server's `maxDepth`, or a lower number
   * @default 3
   */
  maxDepth?: number;
  /**
   * The server's `maxRuns`, or a lower number: the most calls a pipelined
   * request has. A server refuses a request with more as a whole, so the
   * link adds no call that would go over it
   * @default 100
   */
  maxRuns?: number;
}

/**
 * The value of a batch link's `experimental_pipelining` option. Make one with
 * `experimental_pipelining()`.
 */
export type experimental_Pipelining = (
  /** The options of the batch link */
  opts: HTTPBatchLinkOptions<AnyClientTypes>,
  /** Whether its responses stream: see `PipeliningLink` */
  streams: boolean,
) => BatchPipelining;

/**
 * The URL and body of a pipelined batch. Its `pipe` is in its body if it has
 * one to put it in, and in its URL if not: both ask the same question, so it
 * is always in one of the two.
 */
function pipelinedRequest(
  pipe: PipelinedBatchPlan<PipelinedCall>['pipe'],
): PipelinedBatch['request'] {
  return {
    getUrl: (opts) =>
      pipelinedBatchUrl({
        url: getUrl(opts),
        pipe: typeof getBody(opts) === 'string' ? null : pipe,
      }),
    getBody: (opts) => {
      const body = getBody(opts);
      return typeof body === 'string'
        ? pipelinedBatchBody({ body, pipe })
        : body;
    },
  };
}

/** An error the client can throw, from one the server sent or anything thrown */
function clientError(cause: unknown) {
  return TRPCClientError.from(
    cause instanceof Error ? cause : new Error(String(cause)),
  );
}

/** See `isUnread()` */
const unread = /* @__PURE__ */ new WeakSet<object>();

/** An error for a result the link couldn't read: see `isUnread()` */
function unreadError(cause: unknown) {
  const error = clientError(cause);
  unread.add(error);
  return error;
}

/**
 * Whether a call's or a run's error is the client's, not the server's: the
 * link couldn't deserialize what the server sent, or it never arrived. It
 * says nothing of whether the server ran it, nor of whether the calls that
 * read it ran.
 */
export function isUnread(error: unknown) {
  return typeof error === 'object' && error !== null && unread.has(error);
}

/**
 * The runs of a call for every item, as a response has them: its `items`, by
 * index, one level for each level of lists, down to a `{ result }` or an
 * `{ error }`. A streamed one has each level, and each run, as a promise of
 * its own. `deserialize` is `null` for a response that streams, which has
 * deserialized them already.
 */
function decodeRuns(
  value: unknown,
  deserialize: ((value: unknown) => unknown) | null,
): PipelinedRuns {
  const read = deserialize ?? ((it: unknown) => it);
  return settles(
    async (): Promise<PipelinedRunsNode> => {
      const node: unknown = await value;
      if (!isObject(node)) {
        return {};
      }
      if ('items' in node) {
        const items: unknown = await node['items'];
        const decoded: Record<string, PipelinedRuns> = {};
        if (isObject(items)) {
          for (const [index, item] of Object.entries(items)) {
            decoded[index] = decodeRuns(item, deserialize);
          }
        }
        return { items: decoded };
      }
      const result = node['result'];
      if (isObject(result)) {
        return { result: { data: read(await result['data']) } };
      }
      // The server's mark is beside the error, never in it. An error the
      // transformer writes as a falsy value, such as `0`, is an error too
      return hasOwn(node, 'error')
        ? { error: read(node['error']), pipeline: pipelineMarkOf(node) }
        : {};
    },
    (cause) => ({ error: unreadError(cause), pipeline: null }),
  );
}

/**
 * One run's outcome, from the runs of a call for every item: `indexes` has an
 * index for each level of lists. A run in a list that couldn't run fails with
 * that list's error. It waits only for the levels that lead to the run, and
 * its error is a `TRPCClientError`.
 */
export function readPipelinedRun(
  runs: PipelinedRuns,
  indexes: readonly number[],
): Settles<PipelinedRun> {
  return settles(
    async (): Promise<PipelinedRun> => {
      let node = await runs;
      for (const index of indexes) {
        if (!('items' in node)) {
          return 'error' in node
            ? errorItem(node.error, node.pipeline)
            : { kind: 'missing' };
        }
        const item = hasOwn(node.items, String(index))
          ? node.items[index]
          : undefined;
        if (!item) {
          return { kind: 'missing' };
        }
        node = await item;
      }
      return 'result' in node
        ? { kind: 'data', data: node.result.data }
        : 'error' in node
          ? errorItem(node.error, node.pipeline)
          : { kind: 'missing' };
    },
    (cause) => errorItem(unreadError(cause), null),
  );
}

/** A run's error, as the client throws it, and the server's mark */
function errorItem(
  error: unknown,
  mark: PipelineErrorMark | null,
): PipelinedRun {
  return {
    kind: 'error',
    error: isTRPCClientError(error) ? error : TRPCClientError.from({ error }),
    mark,
  };
}

/**
 * A call's final state from what the response has for it alone. It didn't
 * run if the server marked its envelope `not-run`, as it refused it before
 * any of its runs ran, such as for a list longer than the server's limits,
 * whatever the error's `data` says, or if its result never
 * arrived, such as from a response that broke off or left it out: whatever
 * the server did, the client has no result of it.
 */
function decodeCall(
  received: Outcome<HTTPResult | undefined>,
  link: PipeliningLink,
): PipelinedCallSettled {
  if (!received.ok) {
    return { status: 'not-run', error: received.error };
  }
  const sent = received.data;
  // No slot for it at all: as from a response that broke off
  if (!sent) {
    return {
      status: 'not-run',
      error: new Error('The server sent no result for a pipelined call'),
    };
  }
  // What isn't an object is no envelope: the call fails, and its siblings
  // keep theirs
  if (!isObject(sent.json)) {
    return {
      status: 'ran',
      outcome: failed(
        new Error('The server sent no result for a pipelined call'),
      ),
    };
  }
  if ('items' in sent.json) {
    return {
      status: 'ran',
      outcome: {
        ok: true,
        data: {
          kind: 'each',
          meta: sent.meta,
          runs: decodeRuns(
            sent.json,
            link.streams
              ? null
              : (value) => link.transformer.output.deserialize(value),
          ),
        },
      },
    };
  }
  try {
    return {
      status: 'ran',
      outcome: {
        ok: true,
        data: { kind: 'once', data: readResult(link, sent), meta: sent.meta },
      },
    };
  } catch (error) {
    if (pipelineMarkOf(sent.json) === 'not-run') {
      return { status: 'not-run', error };
    }
    // The server sent a result, and the link couldn't deserialize it
    if (sentResult(received) && typeof error === 'object' && error !== null) {
      unread.add(error);
    }
    return { status: 'ran', outcome: failed(error) };
  }
}

/**
 * A call's final state, from its own and what has arrived of its sources.
 * It didn't run if its error is the request's, in every slot: the server
 * refused the request as a whole. Nor if the server marked its envelope
 * `source-failed`, as the error it sends in place of a call that reads a
 * failed source, with a failed source that has arrived: the server sends it
 * after the source's error, and one still to come isn't why the call failed.
 * Any other error is the call's own, whatever its code or its `data`: a
 * source can fail in the response after the server filled in what reads it,
 * such as for data that serializes once and then throws, and the call then
 * ran.
 */
export function settlePipelinedCall(opts: {
  own: PipelinedCallSettled;
  /** The mark the server put beside the call's error, in its envelope */
  mark: PipelineErrorMark | null;
  /**
   * Whether the server sent each source a result (`true`) or an error
   * (`false`), or `null` if that hasn't arrived
   */
  sourcesOk: readonly (boolean | null)[];
  /**
   * Whether the call's answer is the request's, the same in every slot, not
   * one of its own
   */
  asWhole: boolean;
}): PipelinedCallSettled {
  const { own } = opts;
  if (own.status !== 'ran' || own.outcome.ok) {
    return own;
  }
  const { error } = own.outcome;
  const readFailedSource =
    opts.mark === 'source-failed' && opts.sourcesOk.includes(false);
  return opts.asWhole || readFailedSource ? { status: 'not-run', error } : own;
}

/**
 * Whether the server sent a result (`true`) or an error (`false`) at an index
 * of the request: whether the server ran the calls that read it. Whether the
 * client can deserialize that result is another matter, and doesn't say
 * whether those calls ran. `null` for what says neither: no slot, a slot
 * that is no envelope, such as `null` or `{}`, or a result that never
 * arrived
 */
function sentResult(received: Outcome<HTTPResult | undefined>) {
  if (!received.ok || !received.data || !isObject(received.data.json)) {
    return null;
  }
  const json = received.data.json;
  if ('result' in json || 'items' in json) {
    return true;
  }
  return 'error' in json ? false : null;
}

/**
 * Gives the calls of a batch their final states, each as its own result
 * arrives. Nothing waits for a result that isn't the call's own.
 */
function settlePipelinedBatch(opts: {
  ops: readonly BatchOp[];
  plan: PipelinedBatchPlan<PipelinedCall>;
  /** The result of every operation, and then of every call, that was sent */
  results: PipelinedBatch['results'];
  link: PipeliningLink;
}) {
  /**
   * Whether the server sent a result or an error at each index of the
   * request, or `null` until it arrives or if it says neither: see
   * `sentResult()`
   */
  const ok: (boolean | null)[] = opts.results.map(() => null);
  /**
   * The first operation's answer, once it arrives. One that isn't by index
   * is the request's, and every slot has that same object: JSON never parses
   * two slots of a list to one
   */
  let first: unknown = undefined;
  // The same steps for an operation and a call, so that each is marked in
  // the order the results arrive
  for (const [index] of opts.ops.entries()) {
    void outcomeOf(Promise.resolve(opts.results[index])).then((received) => {
      ok[index] = sentResult(received);
      if (index === 0 && received.ok) {
        first = received.data?.json;
      }
    });
  }
  for (const [offset, call] of opts.plan.calls.entries()) {
    const index = opts.ops.length + offset;
    const piped = opts.plan.pipe[index];
    const sources = [
      ...(piped?.each ? [piped.each.from] : []),
      ...(piped?.reads ?? []).flatMap((read) =>
        read.from === undefined ? [] : [read.from],
      ),
    ];
    void outcomeOf(Promise.resolve(opts.results[index])).then((received) => {
      const asWhole =
        received.ok &&
        isObject(received.data?.json) &&
        received.data.json === first;
      const settled = settlePipelinedCall({
        // An answer for the request that is no error is the operations'
        // only, as without pipelining: no result of a call
        own: decodeCall(
          asWhole && !('error' in (received.data?.json ?? {}))
            ? { ok: true, data: undefined }
            : received,
          opts.link,
        ),
        mark: received.ok ? pipelineMarkOf(received.data?.json) : null,
        sourcesOk: sources.map((source) => ok[source] ?? null),
        asWhole,
      });
      ok[index] = sentResult(received);
      moveCall(call, { from: 'sent', to: settled });
    });
  }
}

/** Each call that has an operation, as the link sends it: see `route()` */
const sentOps = /* @__PURE__ */ new WeakMap<PipelinedCall, object>();

/**
 * A call as an operation for a link to send. Its signal keeps the request,
 * and a streamed response, going until the call has all of its result
 */
function sentOp(
  call: PipelinedCall,
  opts: {
    /** The operation it is for, if one */
    op: Operation | null;
    /** Aborts once nothing wants its result anymore */
    unsubscribed: AbortSignal | null;
    /** A streamed result is all there once the link calls `settle()` */
    streams: boolean;
  },
) {
  const { op, unsubscribed } = opts;
  const settled = new AbortController();
  if (!opts.streams) {
    void call.settled.then(() => settled.abort());
  }
  return {
    id: -1,
    type: 'query',
    context: {},
    ...op,
    path: call.path,
    input: call.input,
    signal: raceAbortSignals(op?.signal, unsubscribed, settled.signal),
    releaseSignal() {
      // Its signal is its own
    },
    settle: () => settled.abort(),
  };
}

/**
 * Lets `httpBatchLink` or `httpBatchStreamLink` send queries that read parts
 * of their input from the data of other queries in the same request. Pass what
 * it returns as the link's `experimental_pipelining` option.
 *
 * It is apart from the links, so a bundler that tree-shakes leaves its code
 * out of an app that does not import it.
 *
 * Experimental: it may change in a minor release.
 * @see https://trpc.io/docs/client/vanilla/nested-queries#one-request
 */
export function experimental_pipelining(
  opts?: experimental_PipeliningLinkOptions,
): experimental_Pipelining {
  const limits: ClientPipelineLimits = {
    maxReadsPerCall:
      opts?.maxReadsPerCall ?? pipelineLimitDefaults.maxReadsPerCall,
    maxDepth: opts?.maxDepth ?? pipelineLimitDefaults.maxDepth,
    maxRuns: opts?.maxRuns ?? pipelineLimitDefaults.maxRuns,
  };
  return (linkOpts, streams) => {
    const link: PipeliningLink = {
      ...resolveHTTPLinkOptions(linkOpts),
      maxItems: linkOpts.maxItems ?? Infinity,
      maxURLLength: linkOpts.maxURLLength ?? Infinity,
      streams,
    };
    /** The calls that go in the request of a batch, within the link's limits */
    const plan = (ops: readonly BatchOp[]) => {
      const pipelines = ops.map(pipelineOf);
      return planPipelinedBatch({
        sent: pipelines,
        calls: pipelines
          .flatMap((pipeline) => pipeline?.calls ?? [])
          .filter((call) => call.state.status === 'waiting'),
        fits: (next) => {
          const sent = [...ops, ...next.calls];
          if (sent.length > Math.min(link.maxItems, limits.maxRuns)) {
            return false;
          }
          // An input the transformer can't take before the server fills it
          // in, such as one still without an id it reads: the call waits for
          // what it reads and goes on its own, and the request goes without it.
          // Encoded as the request is, so what JSON can't carry fails too. Its
          // URL encodes the body as well, for a query sent as a POST
          let url: string;
          try {
            url = pipelinedRequest(next.pipe).getUrl({
              ...link,
              type: 'query',
              path: sent.map((it) => it.path).join(','),
              inputs: sent.map((it) => it.input),
              signal: null,
            });
          } catch {
            return false;
          }
          return url.length <= link.maxURLLength;
        },
      });
    };
    const pipelining: BatchPipelining = {
      open(op) {
        const pipeline = pipelineOf(op);
        // Only queries: the server makes no more calls in a mutation's request
        if (pipeline && op.type === 'query') {
          pipeline.open = true;
          pipeline.limits = limits;
          pipeline.streams = link.streams;
          pipeline.link = link;
          // Each attempt has its own: an operation sent again sends its calls
          // anew, and a link that logs it waits for those
          const sent = createDeferred<readonly string[]>();
          pipeline.sent = sent.promise;
          pipeline.settleSent = sent.resolve;
          // An attempt of its own: not a call in another's request
          pipeline.attached = null;
          for (const listener of Array.from(pipeline.onOpen)) {
            listener();
          }
        }
      },
      route(op, send) {
        const own = pipelineOf(op);
        if (own && op.type === 'query') {
          // A link that pipelines has it, as it is sent: what reads it can
          // say what it reads
          own.limits = limits;
          own.streams = link.streams;
          own.link = link;
        }
        const failure = priorFailureOf(op);
        if (failure && !failure.replayed) {
          // A run's failure in the request of its list: its first attempt,
          // for a link that retries to count. Without one, it is final
          failure.replayed = true;
          return observable<RoutedEnvelope, TRPCClientError<any>>(
            (observer) => {
              observer.error(TRPCClientError.from(failure.error as Error));
            },
          );
        }
        const reads = readsOf(op);
        if (!reads || !own || op.type !== 'query') {
          return null;
        }
        return observable<RoutedEnvelope, TRPCClientError<any>>((observer) => {
          let done = false;
          let alone: Unsubscribable | null = null;
          const listening = new Map<OperationPipeline, () => void>();
          const stopListening = () => {
            for (const [pipeline, listener] of listening) {
              pipeline.onOpen.delete(listener);
            }
            listening.clear();
          };
          const fail = (error: TRPCClientError<any>) => {
            if (!done) {
              done = true;
              stopListening();
              observer.error(error);
            }
          };
          /** Aborts once nothing wants its result anymore */
          const unsubscribed = new AbortController();
          /** Into the open request of what it reads, as a call */
          const attach = () => {
            const sources = sourcesNow(reads.reads, link);
            const call =
              sources &&
              pipeCall({ path: op.path, input: op.input, reads: sources });
            if (!call) {
              return false;
            }
            sentOps.set(
              call,
              sentOp(call, {
                op,
                unsubscribed: unsubscribed.signal,
                streams: link.streams,
              }),
            );
            own.attached = call;
            stopListening();
            // The operations that read it, and wait for an attempt of it
            for (const listener of Array.from(own.onOpen)) {
              listener();
            }
            void call.settled.then(async (settled) => {
              if (done || own.attached !== call) {
                return;
              }
              if (settled.status === 'not-run') {
                wait();
                return;
              }
              // It ran, so the data it read is there: its input, for the
              // links that log it and for a retry of it. The client may not
              // have read all of that data yet, so it waits a moment for it,
              // and no more: a slow call it reads doesn't hold its result
              const known = reads.perItem ? null : await knownSoon(reads);
              if (known) {
                fillOperation(op, known.input);
              }
              if (done || own.attached !== call) {
                return;
              }
              if (!settled.outcome.ok) {
                fail(TRPCClientError.from(settled.outcome.error as Error));
                return;
              }
              const data = settled.outcome.data;
              done = true;
              observer.next({
                // As a batch link gives an operation's
                context: data.meta,
                result: {
                  type: 'data',
                  data: data.kind === 'once' ? data.data : data.runs,
                },
              });
              observer.complete();
            });
            return true;
          };
          /**
           * The data it reads, filled into its input, once that is there:
           * asked for once, however often it waits
           */
          let resolved: Outcome<unknown> | null = null;
          let resolving = false;
          /** By itself, once that data is there, if no request has it */
          const goAlone = () => {
            if (done || alone || own.attached !== null || !resolved) {
              return;
            }
            if (!resolved.ok) {
              fail(pipelineFallback(resolved.error));
              return;
            }
            stopListening();
            if (reads.perItem) {
              // Its runs are for items it doesn't know: the engine asks
              // for each by itself
              done = true;
              observer.next({ result: { type: 'data', data: notRun } });
              observer.complete();
              return;
            }
            alone = send({
              ...withoutReads(op),
              input: resolved.data,
            }).subscribe({
              next: (envelope) => observer.next(envelope),
              error: (error) => fail(error),
              complete: () => {
                done = true;
                observer.complete();
              },
            });
          };
          /**
           * Until an attempt of what it reads opens a request to go in, or
           * that data is there and it goes by itself. It waits again when a
           * request it went in leaves it out
           */
          const wait = () => {
            own.attached = null;
            // An attempt of what it reads may have opened its request
            // already: a retry goes as soon as its first attempt fails
            if (attach()) {
              return;
            }
            for (const pipeline of pipelinesRead(reads.reads)) {
              const listener = () => {
                if (!done && own.attached === null) {
                  attach();
                }
              };
              pipeline.onOpen.add(listener);
              listening.set(pipeline, listener);
            }
            if (resolving) {
              goAlone();
              return;
            }
            resolving = true;
            void outcomeOf(reads.resolve()).then((outcome) => {
              resolved = outcome;
              goAlone();
            });
          };
          if (!attach()) {
            wait();
          }
          return () => {
            // A call that settled keeps its request until all of its result
            // is there: its runs may still stream
            if (!done) {
              unsubscribed.abort();
            }
            done = true;
            stopListening();
            alone?.unsubscribe();
          };
        });
      },
      close: closePipeline,
      splits(ops) {
        if (ops.length < 2) {
          return false;
        }
        // An operation's calls go in its request before more operations do,
        // if that lets more calls go. A call that fits in neither request, or
        // reads operations of both, goes in neither
        return (
          plan(ops.slice(0, -1)).calls.length +
            plan(ops.slice(-1)).calls.length >
          plan(ops).calls.length
        );
      },
      take(ops) {
        const planned = plan(ops);
        // The request goes: the calls in the plan with it, and no more after
        for (const op of ops) {
          const pipeline = pipelineOf(op);
          if (pipeline) {
            pipeline.open = false;
          }
        }
        for (const call of planned.calls) {
          moveCall(call, { from: 'waiting', to: { status: 'sent' } });
        }
        for (const call of planned.left) {
          moveCall(call, {
            from: 'waiting',
            to: {
              status: 'not-run',
              error: new Error(
                'The call did not fit in the request of what it reads',
              ),
            },
          });
        }
        for (const op of ops) {
          const pipeline = pipelineOf(op);
          pipeline?.settleSent(
            planned.calls
              .filter((call) => call.owner === pipeline)
              .map((call) => call.path),
          );
        }
        if (planned.calls.length === 0) {
          return null;
        }
        return {
          calls: planned.calls,
          request: pipelinedRequest(planned.pipe),
          settle: (results) => {
            results.then(
              (sent) =>
                settlePipelinedBatch({
                  ops,
                  plan: planned,
                  results: sent,
                  link,
                }),
              (error: unknown) => {
                // The request failed as a whole. None of its calls ran: a
                // link can send the operations again, and what wants a call
                // then asks for it
                for (const call of planned.calls) {
                  moveCall(call, {
                    from: 'sent',
                    to: { status: 'not-run', error },
                  });
                }
              },
            );
          },
        };
      },
      loader: (loader) => ({
        validate: (ops) => !pipelining.splits(ops) && loader.validate(ops),
        async fetch(ops) {
          const taken = pipelining.take(ops);
          if (!taken) {
            return loader.fetch(ops);
          }
          // The calls go after the operations, as operations the link sends
          const results = loader.fetch(
            [
              ...ops,
              ...taken.calls.map(
                (call) =>
                  sentOps.get(call) ??
                  sentOp(call, {
                    op: null,
                    unsubscribed: null,
                    streams: link.streams,
                  }),
              ),
            ] as typeof ops,
            taken.request,
          );
          taken.settle(results);
          return (await results).slice(0, ops.length);
        },
      }),
      link: (handler) => (linkOpts) => {
        const send = (op: Operation) =>
          observable<RoutedEnvelope, TRPCClientError<any>>((observer) => {
            pipelining.open(op);
            // Before the observer hears of it: an error handler can send
            // the operation again, and its calls are then the new attempt's
            let closed = false;
            const close = () => {
              if (!closed) {
                closed = true;
                closePipeline(op);
              }
            };
            return handler({ ...linkOpts, op }).subscribe({
              next(envelope) {
                close();
                observer.next(envelope);
              },
              error(error) {
                close();
                observer.error(error);
              },
              complete() {
                observer.complete();
              },
            });
          });
        return (pipelining.route(linkOpts.op, send) ??
          send(linkOpts.op)) as ReturnType<typeof handler>;
      },
    };
    return pipelining;
  };
}

/**
 * What an operation for every item resolves to when it couldn't go in the
 * request of what it reads: the engine asks for each of its runs by itself
 */
export const notRun = /* @__PURE__ */ Object.freeze({
  '~pipeline': 'not-run',
});

/**
 * The error of an operation whose input reads one that failed: it didn't
 * fail for itself. Its cause is that one's error
 */
export function pipelineFallback(cause: unknown): TRPCClientError<any> {
  if (isPipelineFallback(cause)) {
    return cause as TRPCClientError<any>;
  }
  const error = new TRPCClientError<any>('An operation this one reads failed', {
    cause: cause instanceof Error ? cause : undefined,
  });
  fallbacks.add(error);
  return error;
}

/**
 * The input of an operation with what it reads of other operations filled
 * in, once they have their data: for a link that logs it, say. A link that
 * doesn't pipeline never sends a blank: `experimental_load()` aborts such an
 * operation as the link takes it, and sends the query again, filled in.
 *
 * The operation of a query for every item stands for a run per item, each
 * with an input of its own: for it, this resolves to `undefined`, once the
 * data its runs read is there.
 *
 * Experimental: it may change in a minor release.
 * @see https://trpc.io/docs/client/vanilla/nested-queries#links
 */
export function experimental_inputOf(
  op: Pick<Operation, 'context' | 'input'>,
): Promise<unknown> {
  const reads = readsOf(op);
  return reads
    ? reads
        .resolve()
        .catch((error: unknown) => Promise.reject(pipelineFallback(error)))
    : Promise.resolve(op.input);
}
