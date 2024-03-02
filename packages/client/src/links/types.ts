import type { Observable, Observer } from '@trpc/server/observable';
import type {
  InferrableClientTypes,
  Overwrite,
  ProcedureType,
  TRPCResultMessage,
  TRPCSuccessResponse,
} from '@trpc/server/unstable-core-do-not-import';
import type { ResponseEsque } from '../internals/types';
import type { TRPCClientError } from '../TRPCClientError';

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
export type Operation<
  TInput = unknown,
  TDecoration extends TRPCLinkDecoration = TRPCLinkDecoration,
> = {
  id: number;
  input: TInput;
  path: string;
} & (
  | ({
      type: 'query';
    } & TRPCRequestOptions<TDecoration, 'query'>)
  | ({
      type: 'mutation';
    } & TRPCRequestOptions<TDecoration, 'mutation'>)
  | ({
      type: 'subscription';
    } & TRPCRequestOptions<TDecoration, 'subscription'>)
);

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
  TInferrable extends InferrableClientTypes,
  TOutput = unknown,
> = Observable<OperationResultEnvelope<TOutput>, TRPCClientError<TInferrable>>;

/**
 * @internal
 */
export type OperationResultObserver<
  TInferrable extends InferrableClientTypes,
  TOutput,
> = Observer<OperationResultEnvelope<TOutput>, TRPCClientError<TInferrable>>;

/**
 * @internal
 */
export type OperationLink<
  TInferrable extends InferrableClientTypes,
  TDecoration extends TRPCLinkDecoration = TRPCLinkDecoration,
> = (opts: {
  op: Operation<TInferrable, TDecoration>;
  next: (
    op: Operation<unknown, TDecoration>,
  ) => OperationResultObservable<TInferrable>;
}) => OperationResultObservable<TInferrable>;

/**
 * @internal
 * Links can decorate the stuff we use when using a tRPC client
 */
export type TRPCLinkDecoration = {
  /**
   * Extra params available when calling `.query(undefined, { /* here * /})`
   */
  query: object;
  mutation: object;
  subscription: object;
  /**
   * Extra runtime available
   */
  runtime: object;
};

export type TRPCLinkDecoratorObject<
  TDecoration extends Partial<TRPCLinkDecoration>,
> = Overwrite<TRPCLinkDecoration, TDecoration>;

/**
 * @public
 */
export type TRPCLink<
  TInferrable extends InferrableClientTypes,
  TDecoration extends TRPCLinkDecoration = TRPCLinkDecoration,
> = (
  opts: TRPCClientRuntime & Partial<TDecoration['runtime']>,
) => OperationLink<TInferrable, TDecoration>;

export type TRPCRequestOptions<
  TDecoration extends TRPCLinkDecoration = TRPCLinkDecoration,
  TType extends ProcedureType = ProcedureType,
> = {
  /**
   * Pass additional context to links
   */
  context: OperationContext;
  signal?: AbortSignal;
} & Partial<TDecoration[TType]>;
