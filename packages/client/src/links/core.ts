import { AnyRouter, DataTransformer } from '@trpc/server';
import { TRPCResult } from '@trpc/server/rpc';
import { TRPCClientError } from '../TRPCClientError';

export type OperationContext = Record<string, unknown>;
export type Operation<TInput = unknown> = {
  id: number;
  type: 'query' | 'mutation' | 'subscription';
  input: TInput;
  path: string;
  context: OperationContext;
};

export type OperationResponse<TRouter extends AnyRouter, TOutput = unknown> =
  | TRPCResult<TOutput>
  | TRPCClientError<TRouter>;

export type PrevCallback<TRouter extends AnyRouter, TOutput = unknown> = (
  result: OperationResponse<TRouter, TOutput>,
) => void;
export type OperationLink<
  TRouter extends AnyRouter,
  TInput = unknown,
  TOutput = unknown,
> = (opts: {
  op: Operation;
  prev: PrevCallback<TRouter, TOutput>;
  next: (
    op: Operation<TInput>,
    callback: PrevCallback<TRouter, TOutput>,
  ) => void;
  onDestroy: (callback: () => void) => void;
}) => void;

export type TRPCLink<TRouter extends AnyRouter> = (
  opts: LinkRuntimeOptions,
) => OperationLink<TRouter>;

export interface HTTPLinkOptions {
  url: string;
}

/**
 * @deprecated use `HTTPLinkOptions`
 */
export type HttpLinkOptions = HTTPLinkOptions;

export type HTTPHeaders = Record<string, string | string[] | undefined>;

/**
 * The default `fetch` implementation has an overloaded signature. By convention this library
 * only uses the overload taking a string and options object.
 */
export type TRPCFetch = (
  url: string,
  options?: RequestInit,
) => Promise<Response>;

export type LinkRuntimeOptions = Readonly<{
  transformer: DataTransformer;
  headers: () => HTTPHeaders | Promise<HTTPHeaders>;
  fetch: TRPCFetch;
  AbortController?: typeof AbortController;
}>;

export type CancelFn = () => void;

export type PromiseAndCancel<TValue> = {
  promise: Promise<TValue>;
  cancel: CancelFn;
};
