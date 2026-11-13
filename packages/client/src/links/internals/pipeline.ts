import type {
  PipelinePath,
  PipelineReads,
} from '@trpc/server/unstable-core-do-not-import';
import type { Operation, OperationContext } from '../types';
import type { ContentOptions } from './httpUtils';
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
   * - `unresolved`: it didn't run. It wasn't sent, or a call it reads failed.
   *   Its `result` is then an error, and what wants it makes a request
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

export function pipelineOf(
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
 * request has gone, or no link that pipelines took those operations.
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
    !owners.every((pipeline) => pipeline.open) ||
    !opts.reads.every(
      (read) => !isCall(read.from) || read.from.status === 'waiting',
    )
  ) {
    return null;
  }
  let settle: PipelinedCall['settle'] = () => undefined;
  const result = new Promise<PipelinedCallResult>((resolve) => {
    settle = resolve;
  });
  // Read only by what wants the call's result
  result.catch(() => undefined);
  const call: PipelinedCall = {
    ...opts,
    status: 'waiting',
    result,
    owner,
    settle,
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
export function closePipeline(op: Pick<Operation, 'context'>) {
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

export interface PipelinedBatchPlan {
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
export function planPipelinedBatch(opts: {
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
  const plan: PipelinedBatchPlan = { calls: [], reads: {}, left: [] };
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

/** Whether any operation of a batch has a call to make in its request */
export function hasPipelinedCalls(ops: readonly BatchOp[]) {
  return ops.some((op) =>
    pipelineOf(op)?.calls.some((call) => call.status === 'waiting'),
  );
}

/**
 * Takes a batch's calls into its request, as it goes: the ones in `plan` are
 * sent, and the rest never run.
 */
export function sendPipelinedBatch(opts: {
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
export function settlePipelinedBatch<TResult extends { json: object }>(opts: {
  ops: readonly BatchOp[];
  plan: PipelinedBatchPlan;
  /** The result of every operation, and then of every call, that was sent */
  results: readonly (TResult | Promise<TResult>)[];
  /** A call's result, as the link gives an operation's. Throws its error */
  read: (result: TResult) => PipelinedCallResult;
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
      call.reads.map((read) => ok.get(read.from) ?? Promise.resolve(false)),
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

/** Fails the calls of a request that failed as a whole */
export function failPipelinedBatch(plan: PipelinedBatchPlan, error: unknown) {
  for (const call of plan.calls) {
    call.settle(Promise.reject(error));
  }
}

/**
 * The URL and body of a pipelined batch: `?batch=pipeline`, with its `pipe` in the
 * body of a POST, beside the inputs, and in a search param of a GET, which
 * has no body. A server that doesn't accept pipelined batches runs none of it.
 */
export function pipelinedRequest(
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
 * takes the batch for a call to one procedure, and finds none.
 */
export function assertPipelinedBatchAccepted(opts: {
  json: unknown;
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
          data?: { code?: unknown };
        } | null);
  if (
    error &&
    (error.data?.code === 'NOT_FOUND' ||
      String(error.message).includes('Streaming requests must be batched'))
  ) {
    throw new Error(
      'The server did not accept a pipelined batch. Set `experimental_allowPipelining: true` on its handler, or turn off `experimental_pipelining` on the link',
    );
  }
}
