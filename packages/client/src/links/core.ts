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

export type OperationResult<TRouter extends AnyRouter> =
  | TRPCProcedureSuccessEnvelope<unknown>
  | TRPCClientError<TRouter>;

export type PrevCallback<TRouter extends AnyRouter> = (
  result: OperationResult<TRouter>,
) => void;
export type OperationLink<TRouter extends AnyRouter> = (opts: {
  op: Operation;
  prev: PrevCallback<TRouter>;
  next: (op: Operation, callback: PrevCallback<TRouter>) => void;
  onDestroy: (callback: () => void) => void;
}) => void;

export type TRPCLink<TRouter extends AnyRouter> = (
  opts: LinkRuntimeOptions,
) => OperationLink<TRouter>;

export type LinkRuntimeOptions = Readonly<{
  transformer: DataTransformer;
  headers: () => Record<string, string | string[] | undefined>;
  fetch: typeof fetch;
  AbortController?: typeof AbortController;
}>;

export interface HttpLinkOptions {
  url: string;
}
export type CancelFn = () => void;

export type PromiseAndCancel<TValue> = {
  promise: Promise<TValue>;
  cancel: CancelFn;
};
