import { DataTransformer, HTTPResponseEnvelope } from '@trpc/server';
import { TRPCClientError } from '../createTRPCClient';

export type Operation<TInput = unknown> = {
  type: 'query' | 'mutation' | 'subscription';
  input: TInput;
  path: string;
};
type ResponseEnvelope = HTTPResponseEnvelope<any, any>;
type ErrorResult = TRPCClientError<any>;

export type OperationResult = ResponseEnvelope | ErrorResult;

export type PrevCallback = (result: OperationResult) => void;
export type OperationLink = (opts: {
  op: Operation;
  prev: PrevCallback;
  next: (op: Operation, callback: PrevCallback) => void;
  onDestroy: (callback: () => void) => void;
}) => void;

export type TRPCLink = (opts: LinkRuntimeOptions) => OperationLink;

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
