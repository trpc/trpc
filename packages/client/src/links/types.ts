import { AnyRouter, DataTransformer, inferRouterError } from '@trpc/server';
import { Observable, Observer } from '@trpc/server/observable';
import { TRPCResponse, TRPCResponseMessage } from '@trpc/server/rpc';
import { TRPCClientError } from '../TRPCClientError';

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
  context: OperationContext;
};

export type HTTPHeaders = Record<string, string | string[]>;

/**
 * The default `fetch` implementation has an overloaded signature. By convention this library
 * only uses the overload taking a string and options object.
 */
export type TRPCFetch = (
  url: string,
  options?: RequestInit,
) => Promise<Response>;

export interface TRPCClientRuntime {
  fetch: TRPCFetch;
  AbortController?: typeof AbortController;
  headers: () => HTTPHeaders | Promise<HTTPHeaders>;
  transformer: DataTransformer;
}

type OperationResultData<TRouter extends AnyRouter, TOutput> =
  | TRPCResponse<TOutput, inferRouterError<TRouter>>
  | TRPCResponseMessage<TOutput, inferRouterError<TRouter>>;

export interface OperationResultEnvelope<TRouter extends AnyRouter, TOutput> {
  result: OperationResultData<TRouter, TOutput>;
  context?: OperationContext;
}

export type OperationResultObservable<
  TRouter extends AnyRouter,
  TOutput,
> = Observable<
  OperationResultEnvelope<TRouter, TOutput>,
  TRPCClientError<TRouter>
>;

export type OperationResultObserver<
  TRouter extends AnyRouter,
  TOutput,
> = Observer<
  OperationResultEnvelope<TRouter, TOutput>,
  TRPCClientError<TRouter>
>;

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
