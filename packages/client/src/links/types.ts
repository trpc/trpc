import type { Observable, Observer } from '@trpc/server/observable';
import type {
  InferrableClientTypes,
  Maybe,
  TRPCResultMessage,
  TRPCSuccessResponse,
} from '@trpc/server/unstable-core-do-not-import';
import type { ClientContext, ResponseEsque } from '../internals/types';
import type { TRPCClientError } from '../TRPCClientError';
import type { TRPCConnectionState } from './internals/subscriptions';

export {
  isNonJsonSerializable,
  isFormData,
  isOctetType,
} from './internals/contentTypes';

/**
 * @internal
 */
export interface OperationContext extends ClientContext {}

/**
 * @internal
 */
export type Operation<
  TInput = unknown,
  TContext extends OperationContext = OperationContext,
> = {
  id: number;
  type: 'mutation' | 'query' | 'subscription';
  input: TInput;
  path: string;
  context: TContext;
  signal: Maybe<AbortSignal>;
};

interface HeadersInitEsque {
  [Symbol.iterator](): IterableIterator<[string, string]>;
}

/**
 * @internal
 */
export type HTTPHeaders =
  | HeadersInitEsque
  | Record<string, string[] | string | undefined>;

/**
 * The default `fetch` implementation has an overloaded signature. By convention this library
 * only uses the overload taking a string and options object.
 */
export type TRPCFetch = (
  url: string,
  options?: RequestInit,
) => Promise<ResponseEsque>;

export interface TRPCClientRuntime {
  // nothing here anymore
}

/**
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
 * @internal
 */
export type OperationLink<
  TInferrable extends InferrableClientTypes,
  TContext extends OperationContext = OperationContext,
  TInput = unknown,
  TOutput = unknown,
> = (opts: {
  op: Operation<TInput, TContext>;
  next: (
    op: Operation<TInput, TContext>,
  ) => OperationResultObservable<TInferrable, TOutput>;
}) => OperationResultObservable<TInferrable, TOutput>;

/**
 * @public
 */
export type TRPCLink<
  TInferrable extends InferrableClientTypes,
  TContext extends ClientContext,
> = (
  opts: TRPCClientRuntime,
) => OperationLink<TInferrable, TContext, unknown, unknown>;
