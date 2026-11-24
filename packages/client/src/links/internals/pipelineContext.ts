import type { PipelineCallReads } from '@trpc/server/unstable-core-do-not-import';
import { isObject } from '@trpc/server/unstable-core-do-not-import';
import type { Operation, OperationContext } from '../types';
import type { OperationPipeline } from './pipeline';

/**
 * Where an operation's pipeline is in its context. Apart from the pipelining
 * code, so that a link that only reads the pipeline, such as `loggerLink`,
 * doesn't bring that code into a bundle.
 */
const contextKey = '~pipeline';

/** The context to send an operation with, for it to take part in pipelining */
export function pipelineContext(pipeline: OperationPipeline): OperationContext {
  return { [contextKey]: pipeline };
}

/** Anything can be in a context: this is one only if it has what a link uses */
function isOperationPipeline(value: unknown): value is OperationPipeline {
  return (
    isObject(value) &&
    typeof value['open'] === 'boolean' &&
    Array.isArray(value['calls']) &&
    value['sent'] instanceof Promise &&
    typeof value['settleSent'] === 'function' &&
    value['onOpen'] instanceof Set
  );
}

/** The operation's pipeline, if its context has one */
export function pipelineOf(
  op: Pick<Operation, 'context'>,
): OperationPipeline | null {
  const pipeline = op.context[contextKey];
  return isOperationPipeline(pipeline) ? pipeline : null;
}

/**
 * What an operation's input reads of other operations' data: the operation
 * made by `experimental_load()` for a query that reads another. Its `input`
 * has `undefined` where a read goes. A link that pipelines puts it in the
 * request of what it reads. Any other link that takes it gets it aborted at
 * once, and the query again with its input filled in. Its input, filled in,
 * is what `experimental_inputOf()` gives.
 * @internal
 */
export interface OperationReads {
  /**
   * What the server reads, as in a call's `pipe`, by the pipeline of each
   * operation it reads
   */
  reads: PipelineCallReads<OperationPipeline>;
  /**
   * Whether it runs for every item of a list: no link sends it by itself,
   * as its runs are for items it doesn't know
   */
  perItem: boolean;
  /**
   * Its input with every read filled in, once the operations it reads have
   * their final data, after their retries. Rejects with an error that
   * `isPipelineFallback()` marks if one of them fails
   */
  resolve: () => Promise<unknown>;
  /**
   * Its input with every read filled in, if the client has all that data
   * now. `null` if not
   */
  known: () => { input: unknown } | null;
}

const readsKey = '~reads';

/** The context of an operation whose input reads others' data */
export function readsContext(reads: OperationReads): OperationContext {
  return { [readsKey]: reads };
}

/** What an operation's input reads, if its context says */
export function readsOf(op: Pick<Operation, 'context'>): OperationReads | null {
  const reads = op.context[readsKey] as Partial<OperationReads> | undefined;
  return isObject(reads) && typeof reads.resolve === 'function'
    ? (reads as OperationReads)
    : null;
}

/** The operation with its input filled in: it reads nothing any more */
export function withoutReads<TOp extends Pick<Operation, 'context'>>(
  op: TOp,
): TOp {
  const { [readsKey]: _reads, ...context } = op.context;
  return { ...op, context };
}

/**
 * Writes an operation's input as the server filled it in, once an attempt of
 * it ran in the request of what it reads, and takes out what it reads. The
 * links hold this operation: a retry of it is then one like any other, with
 * that input, which the operations that read it go in the request of
 * @internal
 */
export function fillOperation(op: Operation, input: unknown) {
  op.input = input;
  delete op.context[readsKey];
}

/**
 * An operation that failed once already, in the request of what it reads,
 * where no link could see it: a run of a call for every item. The link that
 * sends it fails its first attempt with that error, without sending it, so
 * that a link that retries, such as `retryLink`, counts it as one, and no
 * retry happens without one
 * @internal
 */
export interface PriorFailure {
  error: unknown;
  /** Whether an attempt failed with it already */
  replayed: boolean;
}

const priorFailureKey = '~priorFailure';

export function priorFailureContext(failure: PriorFailure): OperationContext {
  return { [priorFailureKey]: failure };
}

export function priorFailureOf(
  op: Pick<Operation, 'context'>,
): PriorFailure | null {
  const failure = op.context[priorFailureKey] as
    | Partial<PriorFailure>
    | undefined;
  return isObject(failure) && typeof failure.replayed === 'boolean'
    ? (failure as PriorFailure)
    : null;
}

/** The errors that `pipelineFallback()` made */
export const fallbacks = /* @__PURE__ */ new WeakSet<object>();

/**
 * Whether an error only means that a query this one reads failed, so this
 * one never ran. Only a load with pipelining makes one. A retry of it can't
 * do better than the query it reads did, so `retryLink`'s `retry` can skip
 * it:
 *
 * ```ts
 * retry: (opts) => !experimental_isPipelineFallback(opts.error) && opts.attempts < 3
 * ```
 */
export function isPipelineFallback(error: unknown): boolean {
  return isObject(error) && fallbacks.has(error);
}
