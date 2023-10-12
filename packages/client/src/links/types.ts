import {
  AnyRouter,
  CombinedDataTransformer,
  DataTransformer,
} from '@trpc/server';
import { Observable, Observer } from '@trpc/server/observable';
import { TRPCResultMessage, TRPCSuccessResponse } from '@trpc/server/rpc';
import { ResponseEsque } from '../internals/types';
import { TRPCClientError } from '../TRPCClientError';

/**
 * @internal
 */
export type CancelFn = () => void;

/**
 * @internal
 */
export type PromiseAndCancel<TValue> = {
  promise: Promise<TValue>;
  cancel: CancelFn;
};

/**
 * @internal
 */
export interface OperationContext extends Record<string, unknown> {}

/**
 * @internal
 */
export type Operation<TInput = unknown> = {
  id: number;
  type: 'mutation' | 'query' | 'subscription';
  input: TInput;
  path: string;
  context: OperationContext;
};

/**
 * @internal
 */
export type HTTPHeaders = Record<string, string[] | string | undefined>;

/**
 * The default `fetch` implementation has an overloaded signature. By convention this library
 * only uses the overload taking a string and options object.
 */
export type TRPCFetch = (
  url: string,
  options?: RequestInit,
) => Promise<ResponseEsque>;

export interface TRPCClientRuntime {
  transformer: DataTransformer;
  // FIXME: we should be able to remove this - added as `withTRPC()` needs it, but we can have it as an extra option on SSR instead
  combinedTransformer: CombinedDataTransformer;
}

/**
 * @internal
 */
export interface OperationResultEnvelope<TOutput> {
  result:
    | TRPCResultMessage<TOutput>['result']
    | TRPCSuccessResponse<TOutput>['result'];
  context?: OperationContext;
}

/**
 * @internal
 */
export type OperationResultObservable<
  TRouter extends AnyRouter,
  TOutput,
> = Observable<OperationResultEnvelope<TOutput>, TRPCClientError<TRouter>>;

/**
 * @internal
 */
export type OperationResultObserver<
  TRouter extends AnyRouter,
  TOutput,
> = Observer<OperationResultEnvelope<TOutput>, TRPCClientError<TRouter>>;

/**
 * @internal
 */
export type OperationLink<
  TRouter extends AnyRouter,
  TInput = unknown,
  TOutput = unknown,
> = (opts: {
  op: Operation<TInput>;
  next: (op: Operation<TInput>) => OperationResultObservable<TRouter, TOutput>;
}) => OperationResultObservable<TRouter, TOutput>;

/**
 * @public
 */
export type TRPCLink<TRouter extends AnyRouter> = (
  opts: TRPCClientRuntime,
) => OperationLink<TRouter>;
