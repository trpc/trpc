import type { Observable, Unsubscribable } from '@trpc/server/observable';
import { observable } from '@trpc/server/observable';
import type { PipelineCallReads } from '@trpc/server/unstable-core-do-not-import';
import { isObject } from '@trpc/server/unstable-core-do-not-import';
import { TRPCClientError } from '../../TRPCClientError';
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
    typeof value['settleSent'] === 'function'
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
 * request of what it reads; any other link that sends it gets its input from
 * `experimental_inputOf()`.
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
  /**
   * Its input as the server filled it in, once an attempt of it ran in the
   * request of what it reads: a retry of it is then an operation like any
   * other, with that input, and the operations that read it go in its
   * request. `null` until then
   */
  filled: { input: unknown } | null;
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
 * The operation as a retry sends it: with its input as the server filled it
 * in, if an attempt of it ran, and nothing more to read. As it is if not
 * @internal
 */
export function withFilledInput<
  TOp extends Pick<Operation, 'context' | 'input'>,
>(op: TOp): TOp {
  const filled = readsOf(op)?.filled;
  return filled ? { ...withoutReads(op), input: filled.input } : op;
}

/**
 * An operation that failed once already, where the link that sent it can't
 * retry it: a run of a call for every item, in its request. A link that
 * retries, such as `retryLink`, counts that failure and takes it out; the
 * link that sends the operation fails it with that error if none did.
 * @internal
 */
export interface PriorFailure {
  error: unknown;
  /** The attempts made, that one included */
  attempts: number;
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
  return isObject(failure) && typeof failure.attempts === 'number'
    ? (failure as PriorFailure)
    : null;
}

/** The operation, with its prior failure counted: taken out of its context */
export function withoutPriorFailure<TOp extends Pick<Operation, 'context'>>(
  op: TOp,
): TOp {
  const { [priorFailureKey]: _failure, ...context } = op.context;
  return { ...op, context };
}

/**
 * The errors of an operation that didn't fail for itself: one the link
 * couldn't put in the request of what it reads, and that is for every item
 * (`not-run`), or one whose input reads an operation that failed
 * (`blocked`). A link that retries passes them on: sending it again changes
 * nothing.
 */
const fallbacks = /* @__PURE__ */ new WeakMap<object, 'not-run' | 'blocked'>();

/** An error that `isPipelineFallback()` marks */
export function pipelineFallback(
  kind: 'not-run' | 'blocked',
  cause: unknown,
): TRPCClientError<any> {
  const error = new TRPCClientError<any>(
    kind === 'blocked'
      ? 'An operation this one reads failed'
      : 'The operation runs for every item, and could not go in the request of what it reads',
    { cause: cause instanceof Error ? cause : undefined },
  );
  fallbacks.set(error, kind);
  return error;
}

/** What an error is if `pipelineFallback()` made it */
export function isPipelineFallback(
  error: unknown,
): 'not-run' | 'blocked' | null {
  return isObject(error) ? (fallbacks.get(error) ?? null) : null;
}

/**
 * The input of an operation as a link that doesn't pipeline sends it: with
 * what it reads of other operations filled in, once they have their data.
 * Rejects with an operation's prior failure, if no link counted it.
 *
 * Experimental: it may change in a minor release.
 * @see https://trpc.io/docs/client/vanilla/nested-queries#links
 */
export function experimental_inputOf(
  op: Pick<Operation, 'context' | 'input'>,
): Promise<unknown> {
  const failure = priorFailureOf(op);
  if (failure) {
    return Promise.reject(failure.error);
  }
  const reads = readsOf(op);
  return reads ? resolveReads(reads) : Promise.resolve(op.input);
}

/**
 * The input of an operation that reads others, once they have their data.
 * Rejects with `blocked` if one fails, and with `not-run` for an operation
 * for every item, once it could go by itself
 * @internal
 */
export function resolveReads(reads: OperationReads): Promise<unknown> {
  return reads.resolve().then(
    (input) =>
      reads.perItem ? Promise.reject(pipelineFallback('not-run', null)) : input,
    (error: unknown) =>
      Promise.reject(
        isPipelineFallback(error) ? error : pipelineFallback('blocked', error),
      ),
  );
}

/**
 * How a terminating link takes an operation: one with a prior failure that
 * no link counted fails with it, one whose input reads others' data goes
 * once that is filled in, and any other one goes as it is
 * @internal
 */
export function takeOperation<TEnvelope>(
  op: Operation,
  send: (op: Operation) => Observable<TEnvelope, TRPCClientError<any>>,
): Observable<TEnvelope, TRPCClientError<any>> {
  const failure = priorFailureOf(op);
  const reads = readsOf(op);
  if (!failure && !reads) {
    return send(op);
  }
  return observable((observer) => {
    if (failure) {
      observer.error(TRPCClientError.from(failure.error as Error));
      return;
    }
    let sent: Unsubscribable | null = null;
    let done = false;
    experimental_inputOf(op).then(
      (input) => {
        if (!done) {
          sent = send({ ...withoutReads(op), input }).subscribe(observer);
        }
      },
      (error: unknown) => {
        if (!done) {
          observer.error(
            isPipelineFallback(error)
              ? (error as TRPCClientError<any>)
              : TRPCClientError.from(error as Error),
          );
        }
      },
    );
    return () => {
      done = true;
      sent?.unsubscribe();
    };
  });
}
