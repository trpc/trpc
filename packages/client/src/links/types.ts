import type { Observable, Observer } from '@trpc/server/observable';
import type {
  InferrableClientTypes,
  Maybe,
  TRPCResultMessage,
  TRPCSuccessResponse,
} from '@trpc/server/unstable-core-do-not-import';
import type { ResponseEsque } from '../internals/types';
import type { TRPCClientError } from '../TRPCClientError';

export {
  isNonJsonSerializable,
  isFormData,
  isOctetType,
} from './internals/contentTypes';

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

export type ConnectionState = 'idle' | 'connecting' | 'pending' | 'error';

export interface ConnectionStateMessageBase {
  type: 'state';
}

export interface IdleStateMessage extends ConnectionStateMessageBase {
  state: 'idle';
}

export interface ConnectingStateMessage<TError>
  extends ConnectionStateMessageBase {
  state: 'connecting';
  error: TError | null;
}

export interface PendingStateMessage extends ConnectionStateMessageBase {
  state: 'pending';
}

export interface ErrorStateMessage<TError> extends ConnectionStateMessageBase {
  state: 'error';
  error: TError;
}

export type TRPCConnectionStateMessage<TError> =
  | IdleStateMessage
  | ConnectingStateMessage<TError>
  | PendingStateMessage
  | ErrorStateMessage<TError>;

export const isConnectionStateMessage = <TError>(
  msg: unknown,
): msg is TRPCConnectionStateMessage<TError> => {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    msg.type === 'state'
  );
};

/**
 * @internal
 */
export interface OperationResultEnvelope<TOutput, TError = unknown> {
  result:
    | TRPCConnectionStateMessage<TError>
    | TRPCResultMessage<TOutput>['result']
    | TRPCSuccessResponse<TOutput>['result'];
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
> = Observer<OperationResultEnvelope<TOutput>, TRPCClientError<TInferrable>>;

/**
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
 * @public
 */
export type TRPCLink<TInferrable extends InferrableClientTypes> = (
  opts: TRPCClientRuntime,
) => OperationLink<TInferrable>;
