import { TRPC_ERROR_CODES_BY_KEY } from '@trpc/server/rpc';
import type {
  PipelineCallReads,
  PipelinedBatchPlan,
  PipelinedItem,
  PipelineFrame,
  PipelineLimits,
} from '@trpc/server/unstable-core-do-not-import';
import {
  createDeferred,
  hasOwn,
  isObject,
  isPipelineNotRun,
  pipelinedBatchBody,
  pipelinedBatchUrl,
  pipelineFrameOf,
  pipelineLimitDefaults,
  planPipelinedBatch,
} from '@trpc/server/unstable-core-do-not-import';
import { isTRPCClientError, TRPCClientError } from '../../TRPCClientError';
import type { Operation } from '../types';
import type {
  ContentOptions,
  HTTPResult,
  ResolvedHTTPLinkOptions,
} from './httpUtils';
import { getBody, getUrl } from './httpUtils';
import { pipelineOf } from './pipelineContext';

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
 * the link couldn't read. `{}` is no run.
 */
export type PipelinedRunsNode =
  | { items: Readonly<Record<string, PipelinedRuns>> }
  | { result: { data: unknown } }
  | { error: unknown }
  | Record<string, never>;

/**
 * The runs of a call for every item, decoded once by the link. Each level,
 * and each run, settles by itself: a run that failed, or that the link can't
 * read, fails only its own item.
 */
export type PipelinedRuns = Settles<PipelinedRunsNode>;

/** A call's data, decoded once by the link */
export type PipelinedData =
  /** A call that ran once */
  | { kind: 'once'; data: unknown }
  /** A call that ran for every item: see `readPipelinedRun()` */
  | { kind: 'each'; runs: PipelinedRuns };

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
    calls: [],
    sent: sent.promise,
    settleSent: sent.resolve,
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
  /** A call's result, as the link gives an operation's. Throws its error */
  read: (result: HTTPResult) => PipelinedCallResult;
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

/** What a batch link does with the operations it takes, when it pipelines */
export interface BatchPipelining {
  /** Lets calls go in an operation's request, as the link takes it */
  open: (op: Pick<Operation, 'context' | 'type'>) => void;
  /** Ends what an operation's calls wait for, once it has a result */
  close: (op: Pick<Operation, 'context'>) => void;
  /**
   * Once every call of an operation has its result: a link that streams
   * keeps reading the response for them, also when the operation failed
   */
  settled: (op: Pick<Operation, 'context'>) => Promise<unknown>;
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
    calls: PipelinedBatch['calls'];
    request: PipelinedBatch['request'];
    /** Gives the calls their results, or what the request failed with */
    settle: (results: Promise<PipelinedBatch['results']>) => void;
  } | null;
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
export type experimental_Pipelining = (link: PipeliningLink) => BatchPipelining;

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
      return node['error'] ? { error: read(node['error']) } : {};
    },
    (cause) => ({ error: unreadError(cause) }),
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
): Settles<PipelinedItem> {
  return settles(
    async (): Promise<PipelinedItem> => {
      let node = await runs;
      for (const index of indexes) {
        if (!('items' in node)) {
          return 'error' in node ? errorItem(node.error) : { kind: 'missing' };
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
          ? errorItem(node.error)
          : { kind: 'missing' };
    },
    (cause) => errorItem(unreadError(cause)),
  );
}

/** A run's error, as the client throws it */
function errorItem(error: unknown): PipelinedItem {
  return {
    kind: 'error',
    error: isTRPCClientError(error) ? error : TRPCClientError.from({ error }),
  };
}

/**
 * A call's final state from what the response has for it alone. It didn't
 * run if the server says it refused it before any of its runs ran, such as
 * for a list longer than the server's limits, or if its result never
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
      outcome: { ok: true, data: { kind: 'once', data: link.read(sent).data } },
    };
  } catch (error) {
    if (isTRPCClientError(error) && isPipelineNotRun(error.data)) {
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
 * refused the request as a whole. Nor if it is a `PRECONDITION_FAILED`
 * with a failed source that has arrived: the server sends that in place of
 * a call that reads a failed source, after the source's error, and one
 * still to come isn't why the call failed. Any other error is the call's
 * own: a source can fail in the response after the server filled in what
 * reads it, such as for data that serializes once and then throws, and the
 * call then ran.
 *
 * @param sourcesOk whether the server sent each source a result (`true`)
 * or an error (`false`), or `null` if that hasn't arrived
 * @param asWhole whether the call's answer is the request's, the same in
 * every slot, not one of its own
 */
export function settlePipelinedCall(
  own: PipelinedCallSettled,
  sourcesOk: readonly (boolean | null)[],
  asWhole: boolean,
): PipelinedCallSettled {
  if (own.status !== 'ran' || own.outcome.ok) {
    return own;
  }
  const { error } = own.outcome;
  const readFailedSource =
    isTRPCClientError(error) &&
    error.shape?.code === TRPC_ERROR_CODES_BY_KEY.PRECONDITION_FAILED &&
    sourcesOk.includes(false);
  return asWhole || readFailedSource ? { status: 'not-run', error } : own;
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
      const settled = settlePipelinedCall(
        decodeCall(received, opts.link),
        sources.map((source) => ok[source] ?? null),
        received.ok &&
          isObject(received.data?.json) &&
          received.data.json === first,
      );
      ok[index] = sentResult(received);
      moveCall(call, { from: 'sent', to: settled });
    });
  }
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
  return (link) => {
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
    return {
      open(op) {
        const pipeline = pipelineOf(op);
        // Only queries: the server makes no more calls in a mutation's request
        if (pipeline && op.type === 'query') {
          pipeline.open = true;
          pipeline.limits = limits;
          pipeline.streams = link.streams;
          // Each attempt has its own: an operation sent again sends its calls
          // anew, and a link that logs it waits for those
          const sent = createDeferred<readonly string[]>();
          pipeline.sent = sent.promise;
          pipeline.settleSent = sent.resolve;
        }
      },
      close: closePipeline,
      settled: (op) =>
        Promise.all(pipelineOf(op)?.calls.map((call) => call.settled) ?? []),
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
    };
  };
}
