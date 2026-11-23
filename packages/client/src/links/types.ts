import type { Observable, Observer } from '@trpc/server/observable';
import type {
  InferrableClientTypes,
  Maybe,
  TRPCResultMessage,
  TRPCSuccessResponse,
} from '@trpc/server/unstable-core-do-not-import';
import type { ResponseEsque } from '../internals/types';
import type { TRPCClientError } from '../TRPCClientError';
import type { TRPCConnectionState } from './internals/subscriptions';

export {
  isNonJsonSerializable,
  isFormData,
  isOctetType,
} from './internals/contentTypes';

/**
 * Context an operation carries through the links, set per call.
 * @see https://trpc.io/docs/client/links#managing-context
 * @internal
 */
export interface OperationContext extends Record<string, unknown> {}

/**
 * A procedure call as it goes through the links.
 * @internal
 */
export type Operation<TInput = unknown> = {
  /** A number unique to the call within its client. */
  id: number;
  type: 'mutation' | 'query' | 'subscription';
  input: TInput;
  path: string;
  context: OperationContext;
  signal: Maybe<AbortSignal>;
};

interface HeadersInitEsque {
  [Symbol.iterator](): IterableIterator<[string, string]>;
}

/**
 * Request headers: a `Headers`-like iterable, or an object.
 * @internal
 */
export type HTTPHeaders =
  | HeadersInitEsque
  | Record<string, string[] | string | undefined>;

/**
 * The `fetch` the HTTP links call: only its `(url, options)` form.
 */
export type TRPCFetch = (
  url: string,
  options?: RequestInit,
) => Promise<ResponseEsque>;

/** What a link gets when the client is created. Empty for now. */
export interface TRPCClientRuntime {
  // nothing here anymore
}

/**
 * A result a link passes back: data, a subscription's `started` or
 * `stopped` event, or a change of connection state.
 * @internal
 */
export interface OperationResultEnvelope<TOutput, TError> {
  result:
    | TRPCResultMessage<TOutput>['result']
    | TRPCSuccessResponse<TOutput>['result']
    | TRPCConnectionState<TError>;
  context?: OperationContext;
}

/**
 * The observable of results a link returns for an operation.
 * @internal
 */
export type OperationResultObservable<
  TInferrable extends InferrableClientTypes,
  TOutput,
> = Observable<
  OperationResultEnvelope<TOutput, TRPCClientError<TInferrable>>,
  TRPCClientError<TInferrable>
>;

/**
 * An observer of a link's results.
 * @internal
 */
export type OperationResultObserver<
  TInferrable extends InferrableClientTypes,
  TOutput,
> = Observer<
  OperationResultEnvelope<TOutput, TRPCClientError<TInferrable>>,
  TRPCClientError<TInferrable>
>;

/**
 * Handles one operation: pass it on with `next(op)`, or send it and
 * return the results.
 * @see https://trpc.io/docs/client/links#creating-a-custom-link
 * @internal
 */
export type OperationLink<
  TInferrable extends InferrableClientTypes,
  TInput = unknown,
  TOutput = unknown,
> = (opts: {
  op: Operation<TInput>;
  next: (
    op: Operation<TInput>,
  ) => OperationResultObservable<TInferrable, TOutput>;
}) => OperationResultObservable<TInferrable, TOutput>;

/**
 * A link: a step every call goes through, such as logging or sending it
 * over HTTP. It's called once when the client is created.
 * @see https://trpc.io/docs/client/links#creating-a-custom-link
 * @public
 */
export type TRPCLink<TInferrable extends InferrableClientTypes> = (
  opts: TRPCClientRuntime,
) => OperationLink<TInferrable>;
