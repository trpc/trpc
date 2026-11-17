import type {
  PipelineCallReads,
  PipelinedBatchPlan,
  PipelineRead,
} from '@trpc/server/unstable-core-do-not-import';
import {
  createDeferred,
  groupPipelineReads,
  isObject,
  pipelinedBatchBody,
  pipelinedBatchUrl,
  pipelinedCallsRan,
  pipelineReadsLimit,
  planPipelinedBatch,
} from '@trpc/server/unstable-core-do-not-import';
import type { Operation, OperationContext } from '../types';
import type {
  ContentOptions,
  HTTPResult,
  ResolvedHTTPLinkOptions,
} from './httpUtils';
import { getBody, getUrl } from './httpUtils';

/**
 * What a batch link does with the protocol in
 * `@trpc/server/unstable-core-do-not-import/http/pipeline`: when an
 * operation's request can take more calls, which of them fit in it, and what
 * each call's result is.
 */

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

/** What a call reads the data of: an operation, or another call */
type PipelineSource = OperationPipeline | PipelinedCall;

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
  /** Only for the link that sends it */
  settle: (result: PipelinedCallResult | Promise<PipelinedCallResult>) => void;
}

export interface PipelinedCallResult {
  data: unknown;
}

/** A part of a call's input that the server fills in */
export type PipelinedCallRead = PipelineRead<PipelineSource>;

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

/** Anything can be in a context: this is one only if it has what a link uses */
function isOperationPipeline(value: unknown): value is OperationPipeline {
  return (
    isObject(value) &&
    typeof value['open'] === 'boolean' &&
    Array.isArray(value['calls'])
  );
}

function pipelineOf(op: Pick<Operation, 'context'>): OperationPipeline | null {
  const pipeline = op.context[contextKey];
  return isOperationPipeline(pipeline) ? pipeline : null;
}

function isCall(source: PipelineSource): source is PipelinedCall {
  return 'owner' in source;
}

/**
 * Adds a call to the request of the operations it reads. `null` if that
 * request has gone, no link that pipelines took those operations, or the
 * server would refuse its reads: more than it takes, or items of two lists.
 */
export function pipeCall(opts: {
  path: string;
  input: unknown;
  reads: PipelinedCallRead[];
}): PipelinedCall | null {
  const grouped = groupPipelineReads(opts.reads);
  if (!grouped.ok || opts.reads.length > pipelineReadsLimit) {
    return null;
  }
  const owners = opts.reads.map((read) =>
    isCall(read.from) ? read.from.owner : read.from,
  );
  // It goes with the operation of its first read
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
  const settled = createDeferred<
    PipelinedCallResult | Promise<PipelinedCallResult>
  >();
  const result: Promise<PipelinedCallResult> = settled.promise.then((it) => it);
  // Read only by what wants the call's result
  result.catch(() => undefined);
  const call: PipelinedCall = {
    path: opts.path,
    input: opts.input,
    reads: grouped.reads,
    status: 'waiting',
    result,
    owner,
    settle: settled.resolve,
  };
  owner.calls.push(call);
  return call;
}

/**
 * The one place a call's status changes. A call goes from `waiting` to `sent`
 * or `unresolved`, and from `sent` to `unresolved`.
 */
function moveCall(
  call: PipelinedCall,
  to:
    | { kind: 'sent' }
    /** It didn't run, and its result is this error */
    | { kind: 'not-run'; error: unknown }
    /** It didn't run, as its own result says: a call it reads failed */
    | { kind: 'source-failed' },
) {
  switch (to.kind) {
    case 'sent':
      call.status = 'sent';
      return;
    case 'not-run':
      call.status = 'unresolved';
      call.settle(Promise.reject(to.error));
      return;
    case 'source-failed':
      call.status = 'unresolved';
      return;
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
    if (call.status === 'waiting') {
      moveCall(call, {
        kind: 'not-run',
        error: new Error('The operation this call reads was not sent'),
      });
    }
  }
}

type BatchOp = Pick<Operation, 'context' | 'path' | 'input'>;

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
 * The URL and body of a pipelined batch: its `pipe` is in the body of a
 * request that has one, and in the URL of one that has none.
 */
function pipelinedRequest(
  pipe: PipelinedBatchPlan<PipelinedCall>['reads'],
): PipelinedBatch['request'] {
  return {
    getUrl: (opts) =>
      pipelinedBatchUrl({
        url: getUrl(opts),
        pipe: opts.methodOverride === 'POST' ? null : pipe,
      }),
    getBody: (opts) => {
      const body = getBody(opts);
      return typeof body === 'string'
        ? pipelinedBatchBody({ body, pipe })
        : body;
    },
  };
}

/**
 * Gives the calls of a batch their results. A call that reads a failed one
 * didn't run, and is `unresolved`.
 */
function settlePipelinedBatch(opts: {
  ops: readonly BatchOp[];
  plan: PipelinedBatchPlan<PipelinedCall>;
  /** The result of every operation, and then of every call, that was sent */
  results: PipelinedBatch['results'];
  read: PipeliningLink['read'];
}) {
  const calls = opts.plan.calls.map((call, index) => {
    const result = Promise.resolve(opts.results[opts.ops.length + index]).then(
      (sent) => {
        if (!sent) {
          throw new Error('The server sent no result for a pipelined call');
        }
        return opts.read(sent);
      },
    );
    result.catch(() => undefined);
    return { call, result };
  });
  const settled = pipelinedCallsRan({
    sent: opts.ops.map((_op, index) =>
      Promise.resolve(opts.results[index]).then(
        (result) => !!result && !('error' in result.json),
        () => false,
      ),
    ),
    reads: opts.plan.reads,
    calls,
  });
  for (const { call: sent, ran } of settled) {
    sent.call.settle(
      ran.then((itRan) => {
        if (!itRan) {
          moveCall(sent.call, { kind: 'source-failed' });
        }
        return sent.result;
      }),
    );
  }
}

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
    const plan = (ops: readonly BatchOp[]) => {
      const pipelines = ops.map(pipelineOf);
      return planPipelinedBatch({
        sent: pipelines,
        calls: pipelines
          .flatMap((pipeline) => pipeline?.calls ?? [])
          .filter((call) => call.status === 'waiting'),
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
    };
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
        // The request goes: the calls in the plan with it, and no more after
        for (const op of ops) {
          const pipeline = pipelineOf(op);
          if (pipeline) {
            pipeline.open = false;
          }
        }
        for (const call of planned.calls) {
          moveCall(call, { kind: 'sent' });
        }
        for (const call of planned.left) {
          moveCall(call, {
            kind: 'not-run',
            error: new Error(
              'The call did not fit in the request of what it reads',
            ),
          });
        }
        if (planned.calls.length === 0) {
          return null;
        }
        return {
          calls: planned.calls,
          request: pipelinedRequest(planned.reads),
          settle: (results) => {
            results.then(
              (sent) =>
                settlePipelinedBatch({
                  ops,
                  plan: planned,
                  results: sent,
                  read: link.read,
                }),
              (error: unknown) => {
                // The request failed as a whole. None of its calls ran: a
                // link can send the operations again, and what wants a call
                // then asks for it
                for (const call of planned.calls) {
                  moveCall(call, { kind: 'not-run', error });
                }
              },
            );
          },
        };
      },
    };
  };
}
