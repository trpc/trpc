import {
  DataTransformer,
  TRPCProcedureSuccessEnvelope,
  AnyRouter,
} from '@trpc/server';
import { TRPCClientError } from '../createTRPCClient';

export type OperationContext = Record<string, unknown>;
export type Operation<TInput = unknown> = {
  type: 'query' | 'mutation' | 'subscription';
  input: TInput;
  path: string;
  context: OperationContext;
};

export type OperationResult<TRouter extends AnyRouter, TOutput = unknown> =
  | TRPCProcedureSuccessEnvelope<TOutput>
  | TRPCClientError<TRouter>;

export type PrevCallback<TRouter extends AnyRouter, TOutput = unknown> = (
  result: OperationResult<TRouter, TOutput>,
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

export interface HttpLinkOptions {
  url: string;
}

export type LinkRuntimeOptions = Readonly<{
  transformer: DataTransformer;
  headers: () => Record<string, string | string[] | undefined>;
  fetch: typeof fetch;
  AbortController?: typeof AbortController;
}>;

export type CancelFn = () => void;

export type PromiseAndCancel<TValue> = {
  promise: Promise<TValue>;
  cancel: CancelFn;
};
