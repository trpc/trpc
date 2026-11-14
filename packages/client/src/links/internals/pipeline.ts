import type {
  PipelinePath,
  PipelineReads,
} from '@trpc/server/unstable-core-do-not-import';
import {
  createDeferred,
  pipelineReadsLimit,
} from '@trpc/server/unstable-core-do-not-import';
import type { Operation, OperationContext } from '../types';
import type {
  ContentOptions,
  HTTPResult,
  ResolvedHTTPLinkOptions,
} from './httpUtils';
import { getBody, getUrl } from './httpUtils';

/**
 * Lets the server make more calls in an operation's request, with parts of
 * their inputs read from the operation's data. Put one in an operation's
 * context with `pipelineContext()`.
 *
 * A call isn't an operation, so no link sees one with a hole in its input.
 * Its result comes back with the operation's request, as the call's `result`.
 */
export interface OperationPipeline {
  /**
   * Whether calls can be added. A link that pipelines sets it as it takes the
   * operation, before the call that sent the operation returns, and unsets it
   * as the operation's request goes.
   */
  open: boolean;
  /**
   * The calls added to the operation's request, with `pipeCall()`. They stay
   * here once the request has gone, for a link that logs the context.
   */
  calls: PipelinedCall[];
  /** What a link that serializes an operation's context gets: it has no cycles */
  toJSON: () => unknown;
}

/**
 * A query the server runs in the request of an operation, after the calls
 * whose data it reads.
 */
export interface PipelinedCall {
  /** The procedure's path */
  path: string;
  /** The input, with `undefined` in place of what the server fills in */
  input: unknown;
  reads: PipelinedCallRead[];
  /**
   * - `waiting`: the request hasn't gone yet
   * - `sent`: it is in a request
   * - `unresolved`: it didn't run. It wasn't sent, its request failed as a
   *   whole, or a call it reads failed. Its `result` is then an error, and
   *   what wants it makes a request
   */
  status: 'waiting' | 'sent' | 'unresolved';
  /** Rejects with what the call failed with */
  result: Promise<PipelinedCallResult>;
  /** The pipeline of the operation whose request it goes in */
  owner: OperationPipeline;
  settle: (result: PipelinedCallResult | Promise<PipelinedCallResult>) => void;
}

export interface PipelinedCallResult {
  data: unknown;
}

export interface PipelinedCallRead {
  /** Where the value goes in the input. Empty for the whole input */
  to: string[];
  /** Whose data it comes from: an operation's, or another call's */
  from: OperationPipeline | PipelinedCall;
  /** Where the value is in that data. Empty for all of it */
  path: PipelinePath;
  /**
   * Makes the server run the call once for every item of the array at the
   * first `null` in `path`. Its data is then a list with a `{ result }` or an
   * `{ error }` for every item.
   */
  each: boolean;
}

const contextKey = '~pipeline';

export function createOperationPipeline(): OperationPipeline {
  const pipeline: OperationPipeline = {
    open: false,
    calls: [],
    toJSON: () => ({
      calls: pipeline.calls.map((call) => ({
        path: call.path,
        status: call.status,
      })),
    }),
  };
  return pipeline;
}

/** The context to send an operation with, for it to take part in pipelining */
export function pipelineContext(pipeline: OperationPipeline): OperationContext {
  return { [contextKey]: pipeline };
}

function pipelineOf(
  op: Pick<Operation, 'context'>,
): OperationPipeline | undefined {
  return op.context[contextKey] as OperationPipeline | undefined;
}

function isCall(
  from: OperationPipeline | PipelinedCall,
): from is PipelinedCall {
  return 'owner' in from;
}

/**
 * Adds a call to the request of the operations it reads. `null` if that
 * request has gone, no link that pipelines took those operations, or it reads
 * more values than a server takes.
 */
export function pipeCall(
  opts: Pick<PipelinedCall, 'path' | 'input' | 'reads'>,
): PipelinedCall | null {
  const owners = opts.reads.map((read) =>
    isCall(read.from) ? read.from.owner : read.from,
  );
  const [owner] = owners;
  if (
    !owner ||
    // The server refuses a request with a call that reads more
    opts.reads.length > pipelineReadsLimit ||
    !owners.every((pipeline) => pipeline.open) ||
    !opts.reads.every(
      (read) => !isCall(read.from) || read.from.status === 'waiting',
    )
  ) {
    return null;
  }
  const settled = createDeferred<
    PipelinedCallResult | Promise<PipelinedCallResult>
  >();
  const result: Promise<PipelinedCallResult> = settled.promise.then((it) => it);
  // Read only by what wants the call's result
  result.catch(() => undefined);
  const call: PipelinedCall = {
    ...opts,
    status: 'waiting',
    result,
    owner,
    settle: settled.resolve,
  };
  owner.calls.push(call);
  return call;
}

function unresolve(call: PipelinedCall, message: string) {
  call.status = 'unresolved';
  call.settle(Promise.reject(new Error(message)));
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
    if (call.status === 'waiting') {
      unresolve(call, 'The operation this call reads was not sent');
    }
  }
}

type BatchOp = Pick<Operation, 'context' | 'path' | 'input'>;

interface PipelinedBatchPlan {
  /** The calls that go in the request, after the operations */
  calls: PipelinedCall[];
  /** What the server fills in, by index in the request */
  reads: PipelineReads;
  /** The calls that don't go: they don't fit, or read what isn't in the batch */
  left: PipelinedCall[];
}

/**
 * The calls that go in the request of a batch of operations. A call goes
 * after everything it reads.
 */
function planPipelinedBatch(opts: {
  ops: readonly BatchOp[];
  /** Whether a request with these calls is within the link's limits */
  fits: (plan: Pick<PipelinedBatchPlan, 'calls' | 'reads'>) => boolean;
}): PipelinedBatchPlan {
  const indexes = new Map<object, number>();
  for (const [index, op] of opts.ops.entries()) {
    const pipeline = pipelineOf(op);
    if (pipeline) {
      indexes.set(pipeline, index);
    }
  }
  const plan: PipelinedBatchPlan = {
    calls: [],
    reads: {},
    left: [],
  };
  let waiting = opts.ops
    .flatMap((op) => pipelineOf(op)?.calls ?? [])
    .filter((call) => call.status === 'waiting');
  let placed = true;
  while (placed) {
    placed = false;
    const later: PipelinedCall[] = [];
    for (const call of waiting) {
      const reads = call.reads.flatMap((read) => {
        const from = indexes.get(read.from);
        return from === undefined
          ? []
          : [
              {
                to: read.to,
                from,
                path: read.path,
                ...(read.each ? { each: true as const } : {}),
              },
            ];
      });
      if (reads.length !== call.reads.length) {
        // What it reads isn't in the request, or not yet
        later.push(call);
        continue;
      }
      const index = opts.ops.length + plan.calls.length;
      const next = {
        calls: [...plan.calls, call],
        reads: { ...plan.reads, [index]: reads },
      };
      if (!opts.fits(next)) {
        plan.left.push(call);
        continue;
      }
      plan.calls = next.calls;
      plan.reads = next.reads;
      indexes.set(call, index);
      placed = true;
    }
    waiting = later;
  }
  plan.left.push(...waiting);
  return plan;
}

/**
 * Takes a batch's calls into its request, as it goes: the ones in `plan` are
 * sent, and the rest never run.
 */
function sendPipelinedBatch(opts: {
  ops: readonly BatchOp[];
  plan: PipelinedBatchPlan;
}) {
  for (const op of opts.ops) {
    const pipeline = pipelineOf(op);
    if (pipeline) {
      pipeline.open = false;
    }
  }
  for (const call of opts.plan.calls) {
    call.status = 'sent';
  }
  for (const call of opts.plan.left) {
    unresolve(call, 'The call did not fit in the request of what it reads');
  }
}

/**
 * Gives the calls of a batch their results. A call that reads a failed one
 * didn't run, and is marked `unresolved`.
 */
function settlePipelinedBatch(opts: {
  ops: readonly BatchOp[];
  plan: PipelinedBatchPlan;
  /** The result of every operation, and then of every call, that was sent */
  results: PipelinedBatch['results'];
  read: PipeliningLink['read'];
}) {
  const ok = new Map<object, Promise<boolean>>();
  for (const [index, op] of opts.ops.entries()) {
    const pipeline = pipelineOf(op);
    if (pipeline) {
      ok.set(
        pipeline,
        Promise.resolve(opts.results[index]).then(
          (result) => !!result && !('error' in result.json),
          () => false,
        ),
      );
    }
  }
  for (const [index, call] of opts.plan.calls.entries()) {
    const own = Promise.resolve(opts.results[opts.ops.length + index]).then(
      (result) => {
        if (!result) {
          throw new Error('The server sent no result for a pipelined call');
        }
        return opts.read(result);
      },
    );
    own.catch(() => undefined);
    const settled = Promise.all(
      // Every call in a plan reads what is in its request
      call.reads.map(async (read) => (await ok.get(read.from)) === true),
    ).then((sources) => {
      if (!sources.every(Boolean)) {
        call.status = 'unresolved';
      }
      return own;
    });
    ok.set(
      call,
      settled.then(
        () => true,
        () => false,
      ),
    );
    call.settle(settled);
  }
}

/**
 * Fails the calls of a request that failed as a whole. None of them ran: a
 * link can send the operations again, and what wants a call then asks for it.
 */
function failPipelinedBatch(plan: PipelinedBatchPlan, error: unknown) {
  for (const call of plan.calls) {
    call.status = 'unresolved';
    call.settle(Promise.reject(error));
  }
}

/**
 * The URL and body of a pipelined batch: `?batch=pipeline`, with its `pipe` in the
 * body of a POST, beside the inputs, and in a search param of a GET, which
 * has no body. A server that doesn't accept pipelined batches runs none of it.
 */
function pipelinedRequest(
  reads: PipelineReads,
): Pick<ContentOptions, 'getUrl' | 'getBody'> {
  return {
    getUrl: (opts) => {
      const url = getUrl(opts).replace(
        /([?&])batch=1(?=&|$)/,
        '$1batch=pipeline',
      );
      return opts.methodOverride === 'POST'
        ? url
        : `${url}&pipe=${encodeURIComponent(JSON.stringify(reads))}`;
    },
    getBody: (opts) => {
      const body = getBody(opts);
      return typeof body === 'string' && opts.methodOverride === 'POST'
        ? JSON.stringify({ ...JSON.parse(body), pipe: reads })
        : body;
    },
  };
}

/**
 * What a server that doesn't accept pipelined batches answers one with. It
 * takes the batch for a call to one procedure, named as all of the batch's
 * are together, and finds none.
 */
function assertPipelinedBatchAccepted(opts: {
  json: unknown;
  /** The paths of what was sent, as they are in the URL */
  path: string;
  /** The link's transformer for what the server sends */
  deserialize: (error: unknown) => unknown;
}) {
  const { json } = opts;
  const shape = Array.isArray(json)
    ? undefined
    : (json as { error?: unknown } | null)?.error;
  const error =
    shape === undefined
      ? undefined
      : (opts.deserialize(shape) as {
          message?: unknown;
          data?: { code?: unknown; path?: unknown };
        } | null);
  // Not any "not found": one for the whole request, such as from a proxy,
  // isn't for these paths. An error formatter can leave the path out of
  // `data`: the server's message has it then
  const forBatch =
    error?.data?.code === 'NOT_FOUND' &&
    (error.data.path === opts.path ||
      (error.data.path === undefined &&
        String(error.message).includes(`"${opts.path}"`)));
  if (
    error &&
    (forBatch ||
      String(error.message).includes('Streaming requests must be batched'))
  ) {
    throw new Error(
      'The server did not accept a pipelined batch. Set `experimental_allowPipelining: true` on its handler, or remove `experimental_pipelining` from the link',
      { cause: error },
    );
  }
}

/** What a batch link tells `experimental_pipelining()` about itself */
export interface PipeliningLink extends ResolvedHTTPLinkOptions {
  /** The most calls a request can have */
  maxItems: number;
  /** The longest URL a request can have */
  maxURLLength: number;
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
    /** Throws if `json`, the response, is of a server that takes no such batch */
    accepted: (json: unknown) => void;
    /** Gives the calls their results, or what the request failed with */
    settle: (results: Promise<PipelinedBatch['results']>) => void;
  } | null;
}

/**
 * The value of a batch link's `experimental_pipelining` option. Make one with
 * `experimental_pipelining()`.
 */
export type experimental_Pipelining = (link: PipeliningLink) => BatchPipelining;

/**
 * Lets `httpBatchLink` or `httpBatchStreamLink` send queries that read parts
 * of their input from the data of other queries in the same request. Pass what
 * it returns as the link's `experimental_pipelining` option.
 *
 * It is apart from the links so that only an app that uses it has its code.
 *
 * Experimental: it may change in a minor release.
 * @see https://trpc.io/docs/client/tanstack-react-query/dependent-queries#one-request
 */
export function experimental_pipelining(): experimental_Pipelining {
  return (link) => {
    /** The calls that go in the request of a batch, within the link's limits */
    const plan = (ops: readonly BatchOp[]) =>
      planPipelinedBatch({
        ops,
        fits: (next) => {
          const sent = [...ops, ...next.calls];
          return (
            sent.length <= link.maxItems &&
            (link.maxURLLength === Infinity ||
              pipelinedRequest(next.reads).getUrl({
                ...link,
                type: 'query',
                path: sent.map((it) => it.path).join(','),
                inputs: sent.map((it) => it.input),
                signal: null,
              }).length <= link.maxURLLength)
          );
        },
      });
    return {
      open(op) {
        const pipeline = pipelineOf(op);
        // Only queries: the server makes no more calls in a mutation's request
        if (pipeline && op.type === 'query') {
          pipeline.open = true;
        }
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
        sendPipelinedBatch({ ops, plan: planned });
        if (planned.calls.length === 0) {
          return null;
        }
        return {
          calls: planned.calls,
          request: pipelinedRequest(planned.reads),
          accepted: (json) =>
            assertPipelinedBatchAccepted({
              json,
              path: [...ops, ...planned.calls].map((it) => it.path).join(','),
              deserialize: (error) =>
                link.transformer.output.deserialize(error),
            }),
          settle: (results) => {
            results.then(
              (sent) =>
                settlePipelinedBatch({
                  ops,
                  plan: planned,
                  results: sent,
                  read: link.read,
                }),
              (error: unknown) => failPipelinedBatch(planned, error),
            );
          },
        };
      },
    };
  };
}
