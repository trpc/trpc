import {
  AnyRouter,
  DataTransformer,
  Dict,
  inferRouterError,
} from '@trpc/server';
import { TRPCResponse } from '@trpc/server/rpc';
import { TRPCClientError } from '../TRPCClientError';
import { Observable, Observer } from '../observable/types';

export type CancelFn = () => void;

export type PromiseAndCancel<TValue> = {
  promise: Promise<TValue>;
  cancel: CancelFn;
};

export type OperationContext = Record<string, unknown>;
export type Operation<TInput = unknown> = {
  id: number;
  type: 'query' | 'mutation' | 'subscription';
  input: TInput;
  path: string;
  context?: OperationContext;
};

export type HTTPHeaders = Dict<string | string[]>;

/**
 * The default `fetch` implementation has an overloaded signature. By convention this library
 * only uses the overload taking a string and options object.
 */
export type TRPCFetch = (
  url: string,
  options?: RequestInit,
) => Promise<Response>;

export interface TRPCClientRuntime {
  headers: () => HTTPHeaders | Promise<HTTPHeaders>;
  fetch: TRPCFetch;
  AbortController?: typeof AbortController;
  transformer: DataTransformer;
}

export interface OperationResult<TRouter extends AnyRouter, TOutput> {
  data: TRPCResponse<TOutput, inferRouterError<TRouter>>;
  context?: OperationContext;
}

export type OperationResultObservable<
  TRouter extends AnyRouter,
  TOutput,
> = Observable<OperationResult<TRouter, TOutput>, TRPCClientError<TRouter>>;

export type OperationResultObserver<
  TRouter extends AnyRouter,
  TOutput,
> = Observer<OperationResult<TRouter, TOutput>, TRPCClientError<TRouter>>;

export type OperationLink<
  TRouter extends AnyRouter,
  TInput = unknown,
  TOutput = unknown,
> = (opts: {
  op: Operation<TInput>;
  next: (op: Operation<TInput>) => OperationResultObservable<TRouter, TOutput>;
}) => OperationResultObservable<TRouter, TOutput>;

export type TRPCLink<TRouter extends AnyRouter> = (
  opts: TRPCClientRuntime,
) => OperationLink<TRouter>;
