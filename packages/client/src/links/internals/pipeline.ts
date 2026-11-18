import type {
  PipelineLimits,
  PipelinePath,
  PipeRead,
  PipeTree,
} from '@trpc/server/unstable-core-do-not-import';
import {
  createDeferred,
  pipelinedBatchBody,
  pipelinedBatchUrl,
  pipelineLimitDefaults,
  planPipelineTree,
  readPipelineCall,
} from '@trpc/server/unstable-core-do-not-import';
import { TRPCClientError } from '../../TRPCClientError';
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
 * operation's request can take more calls, where each goes in its tree, and
 * what each call's result is.
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
  /** The limits of the server, as the link that opens it says */
  limits: ClientPipelineLimits;
  /**
   * The calls added to the operation's request, with `pipeCall()`, and the
   * calls under those. They stay here once the request has gone, for a link
   * that logs the context.
   */
  calls: PipelinedCall[];
  /**
   * The paths of the calls that went in the operation's request. It settles
   * once no more calls can be added: as the request goes, or as the operation
   * ends without one. For a link that logs the operation.
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
  'maxReadsPerCall' | 'maxDepth'
>;

/** What a call reads the data of: an operation, or another call */
type PipelineSource = OperationPipeline | PipelinedCall;

/**
 * A query the server runs in the request of an operation, under the call
 * whose data it reads.
 */
export interface PipelinedCall {
  /** The procedure's path */
  path: string;
  /** The input, with `undefined` in place of what the server fills in */
  input: unknown;
  /** What it is under: the operation or the call whose data it reads */
  parent: PipelineSource;
  /** The list in its parent's data it runs for every item of, or `null` */
  list: string[][] | null;
  /** What the server fills in of its input */
  reads: PipeRead[];
  /** How deep it is: a call under an operation is 2 */
  depth: number;
  /**
   * - `waiting`: the request hasn't gone yet
   * - `sent`: it is in a request
   * - `unresolved`: it didn't run. It wasn't sent, its request failed as a
   *   whole, or the call it is under failed. Its `result` is then an error,
   *   and what wants it makes a request
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

/**
 * A part of a call's input that the server fills in: the value at `path` in
 * the data of `from`, an operation or another call. With `each`, the call
 * runs once for every item of the list at the first `null` in `path`, and
 * reads the rest of `path` in the item.
 */
export interface PipelinedCallRead {
  /** Where the value goes in the call's input. Empty for the whole input */
  to: string[];
  from: PipelineSource;
  path: PipelinePath;
  each: boolean;
}

export function createOperationPipeline(): OperationPipeline {
  const sent = createDeferred<readonly string[]>();
  const pipeline: OperationPipeline = {
    open: false,
    limits: pipelineLimitDefaults,
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

/** A source, then what it is under, up to its operation */
function chainOf(source: PipelineSource): PipelineSource[] {
  const chain: PipelineSource[] = [source];
  for (let at = source; isCall(at); at = at.parent) {
    chain.push(at.parent);
  }
  return chain;
}

/** Whether a call, or a call it is under, runs once for every item of a list */
function runsPerItem(source: PipelineSource): boolean {
  return chainOf(source).some((it) => isCall(it) && it.list !== null);
}

/**
 * Adds a call to the request of the operation whose data it reads, under the
 * call it reads. `null` if that request has gone, no link that pipelines took
 * that operation, or the server would refuse it or couldn't place it: more
 * reads or a deeper tree than it takes, items of two lists, or reads of two
 * calls of which neither is under the other.
 */
export function pipeCall(opts: {
  path: string;
  input: unknown;
  reads: PipelinedCallRead[];
}): PipelinedCall | null {
  // It goes under the deepest call it reads, and reads only what is above it
  const [first, ...more] = opts.reads;
  if (!first) {
    return null;
  }
  const parent = more.reduce(
    (deepest, read) =>
      chainOf(read.from).length > chainOf(deepest).length ? read.from : deepest,
    first.from,
  );
  const chain = chainOf(parent);
  const [owner] = chain.slice(-1);
  if (
    !owner ||
    isCall(owner) ||
    !owner.open ||
    // Under a call for every item, a call would run for every item too
    runsPerItem(parent) ||
    !opts.reads.every((read) => chain.includes(read.from)) ||
    !chain.every((it) => !isCall(it) || it.status === 'waiting')
  ) {
    return null;
  }
  let list: string[][] | null = null;
  const reads: PipeRead[] = [];
  for (const read of opts.reads) {
    if (!read.each) {
      // The data of a call above it: 1, the default, is its parent
      const up = chain.indexOf(read.from) + 1;
      reads.push(up === 1 ? [read.to, read.path] : [read.to, read.path, up]);
      continue;
    }
    // The list is what is before the first `null`, in the parent's data
    const at = read.path.indexOf(null);
    const listPath = read.path.slice(0, at);
    if (
      read.from !== parent ||
      at === -1 ||
      listPath.includes(null) ||
      (list && listPath.join('\0') !== list[0]?.join('\0'))
    ) {
      return null;
    }
    list = [listPath as string[]];
    // The item it runs for
    reads.push([read.to, read.path.slice(at + 1), 0]);
  }
  const depth = chain.length + 1;
  if (
    reads.length > owner.limits.maxReadsPerCall ||
    depth > owner.limits.maxDepth
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
    parent,
    list,
    reads,
    depth,
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
    | { kind: 'not-run'; error: unknown },
) {
  switch (to.kind) {
    case 'sent':
      call.status = 'sent';
      return;
    case 'not-run':
      call.status = 'unresolved';
      call.settle(Promise.reject(to.error));
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
   * A call's result, from its outcome as the response has it, in what a
   * result of the link has. Throws its error
   */
  read: (result: HTTPResult) => PipelinedCallResult;
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
    /** The URL and body of the request */
    request: Pick<ContentOptions, 'getUrl' | 'getBody'>;
    /**
     * Gives the calls their results, from the result of every operation,
     * with the `children` the response has beside it, or what the request
     * failed with
     */
    settle: (
      results: Promise<readonly (HTTPResult | Promise<HTTPResult>)[]>,
    ) => void;
  } | null;
}

/**
 * The value of a batch link's `experimental_pipelining` option. Make one with
 * `experimental_pipelining()`.
 */
export type experimental_Pipelining = (link: PipeliningLink) => BatchPipelining;

/**
 * The URL and body of a request with a tree. Its `tree` is in its body if it
 * has one to put it in, and in its URL if not: both ask the same question,
 * so it is always in one of the two.
 */
function treeRequest(
  tree: PipeTree,
): Pick<ContentOptions, 'getUrl' | 'getBody'> {
  return {
    getUrl: (opts) =>
      pipelinedBatchUrl({
        url: getUrl(opts),
        tree: typeof getBody(opts) === 'string' ? null : tree,
      }),
    getBody: (opts) => {
      const body = getBody(opts);
      return typeof body === 'string'
        ? pipelinedBatchBody({ body, tree })
        : body;
    },
  };
}

/** The `children` beside an operation's outcome in a response */
function childrenOf(result: HTTPResult): unknown {
  const json: unknown = result.json;
  return typeof json === 'object' &&
    json !== null &&
    Object.prototype.hasOwnProperty.call(json, 'children')
    ? (json as Record<string, unknown>)['children']
    : undefined;
}

/** Whether an error is a server's refusal: a bad request */
function isBadRequest(error: unknown) {
  return error instanceof TRPCClientError && error.data?.code === 'BAD_REQUEST';
}

/**
 * What a client keeps to of the server's `experimental_allowPipelining`
 * limits. A call that would go over one isn't pipelined: it waits for the
 * data it reads, and goes in a request of its own.
 *
 * Experimental: it may change in a minor release.
 * @see https://trpc.io/docs/client/tanstack-react-query/nested-queries#limits
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
}

/**
 * Lets `httpBatchLink` or `httpBatchStreamLink` send queries that read parts
 * of their input from the data of other queries in the same request. Pass what
 * it returns as the link's `experimental_pipelining` option.
 *
 * It is apart from the links so that only an app that uses it has its code.
 *
 * Experimental: it may change in a minor release.
 * @see https://trpc.io/docs/client/tanstack-react-query/nested-queries#one-request
 */
export function experimental_pipelining(
  opts?: experimental_PipeliningLinkOptions,
): experimental_Pipelining {
  const limits: ClientPipelineLimits = {
    maxReadsPerCall:
      opts?.maxReadsPerCall ?? pipelineLimitDefaults.maxReadsPerCall,
    maxDepth: opts?.maxDepth ?? pipelineLimitDefaults.maxDepth,
  };
  return (link) => {
    /** The calls that go in the request of a batch, within the link's limits */
    const plan = (ops: readonly BatchOp[]) => {
      const pipelines = ops.map(pipelineOf);
      return planPipelineTree({
        sent: pipelines,
        calls: pipelines
          .flatMap((pipeline) => pipeline?.calls ?? [])
          .filter((call) => call.status === 'waiting'),
        serialize: (input) => link.transformer.input.serialize(input),
        fits: (next) =>
          ops.length + next.calls.length <= link.maxItems &&
          (link.maxURLLength === Infinity ||
            treeRequest(next.tree).getUrl({
              ...link,
              type: 'query',
              path: ops.map((it) => it.path).join(','),
              inputs: ops.map((it) => it.input),
              signal: null,
            }).length <= link.maxURLLength),
      });
    };
    return {
      open(op) {
        const pipeline = pipelineOf(op);
        // Only queries: the server makes no more calls in a mutation's request
        if (pipeline && op.type === 'query') {
          pipeline.open = true;
          pipeline.limits = limits;
        }
      },
      close: closePipeline,
      splits(ops) {
        if (ops.length < 2) {
          return false;
        }
        // An operation's calls go in its request before more operations do,
        // if that lets more calls go. A call that fits in neither request
        // goes in neither
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
          request: treeRequest(planned.tree),
          settle: (results) => {
            /** Whether a call's parent succeeded, and so the call ran */
            const ran = new Map<PipelineSource, Promise<boolean>>();
            for (const [index, op] of ops.entries()) {
              const pipeline = pipelineOf(op);
              if (pipeline) {
                ran.set(
                  pipeline,
                  results
                    .then(async (sent) => {
                      const result = await sent[index];
                      return !!result && !('error' in result.json);
                    })
                    // Such as a response that broke off: what it didn't
                    // have, didn't run for sure
                    .catch(() => false),
                );
              }
            }
            for (const call of planned.calls) {
              const place = planned.places.get(call);
              const result = results.then(async (sent) => {
                const opResult = place ? await sent[place.index] : undefined;
                if (!place || !opResult) {
                  throw new Error(
                    'The server sent no result for a pipelined call',
                  );
                }
                const read = (json: unknown) =>
                  link.read({ ...opResult, json: json as HTTPResult['json'] });
                const children = childrenOf(opResult);
                // The server answered for the request as a whole, such as
                // when it doesn't allow pipelining: that is the call's error
                if (children === undefined && 'error' in opResult.json) {
                  return read(opResult.json);
                }
                const outcome = await readPipelineCall(children, place.steps);
                switch (outcome.kind) {
                  case 'outcome':
                    return read(outcome.outcome);
                  case 'items': {
                    const runs = outcome.items.map((item) => {
                      if (item === undefined) {
                        return undefined;
                      }
                      try {
                        return { result: read(item) };
                      } catch (error) {
                        return { error };
                      }
                    });
                    // Every run refused: the server refused the call, and
                    // its items each ask by themselves
                    const errors = runs.flatMap((run) =>
                      run && 'error' in run ? [run.error] : [],
                    );
                    if (
                      errors.length > 0 &&
                      errors.length === runs.length &&
                      errors.every(isBadRequest)
                    ) {
                      throw errors[0];
                    }
                    return { data: runs };
                  }
                  case 'failed':
                    // A call above it failed: its error, as the link reads one
                    return read({ error: outcome.error });
                  case 'missing':
                    throw new Error(
                      'The server sent no result for a pipelined call',
                    );
                }
              });
              result.catch(() => undefined);
              const parentRan = ran.get(call.parent) ?? Promise.resolve(false);
              const callRan = parentRan.then(async (itRan) => {
                if (!itRan) {
                  return false;
                }
                return result.then(
                  () => true,
                  () => false,
                );
              });
              ran.set(call, callRan);
              call.settle(
                parentRan.then((itRan) => {
                  // The call it is under failed, or the request failed as a
                  // whole: it didn't run, and what wants it asks for it
                  if (!itRan) {
                    call.status = 'unresolved';
                  }
                  return result;
                }),
              );
            }
          },
        };
      },
    };
  };
}
