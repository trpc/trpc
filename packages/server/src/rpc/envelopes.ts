/* eslint-disable @typescript-eslint/no-namespace */
import { ProcedureType } from '../deprecated/router';
import { TRPC_ERROR_CODE_NUMBER } from './codes';

/**
 * Error response
 */
export interface TRPCErrorShape<
  TCode extends number = TRPC_ERROR_CODE_NUMBER,
  TData extends Record<string, unknown> = Record<string, unknown>,
> {
  code: TCode;
  message: string;
  data: TData;
}

/**
 * JSON-RPC 2.0 Specification
 */
export namespace JSONRPC2 {
  export type RequestId = number | string | null;

  /**
   * All requests/responses extends this shape
   */
  export interface BaseEnvelope {
    id?: RequestId;
    jsonrpc?: '2.0';
  }

  export interface BaseRequest<TMethod extends string = string>
    extends BaseEnvelope {
    method: TMethod;
  }

  export interface Request<TMethod extends string = string, TParams = unknown>
    extends BaseRequest<TMethod> {
    params: TParams;
  }

  export interface ResultResponse<TResult = unknown> extends BaseEnvelope {
    result: TResult;
  }

  export interface ErrorResponse<TError extends TRPCErrorShape = TRPCErrorShape>
    extends BaseEnvelope {
    error: TError;
  }
}

/////////////////////////// HTTP envelopes ///////////////////////

export interface TRPCRequest
  extends JSONRPC2.Request<ProcedureType, { path: string; input: unknown }> {}

export interface TRPCResult<TData = unknown> {
  data: TData;
}

export interface TRPCSuccessResponse<TData>
  extends JSONRPC2.ResultResponse<
    TRPCResult<TData> & {
      type?: 'data';
    }
  > {}

/**
 * @deprecated use `TRPCSuccessResponse` instead
 */
export type TRPCResultResponse<TData = unknown> = TRPCSuccessResponse<TData>;

export interface TRPCErrorResponse<
  TError extends TRPCErrorShape = TRPCErrorShape,
> extends JSONRPC2.ErrorResponse<TError> {}

export type TRPCResponse<
  TData = unknown,
  TError extends TRPCErrorShape = TRPCErrorShape,
> = TRPCSuccessResponse<TData> | TRPCErrorResponse<TError>;

/////////////////////////// WebSocket envelopes ///////////////////////

export type TRPCRequestMessage = {
  id: JSONRPC2.RequestId;
} & TRPCRequest;

/**
 * The client asked the server to unsubscribe
 */
export interface TRPCSubscriptionStopNotification
  extends JSONRPC2.BaseRequest<'subscription.stop'> {
  id: null;
}

/**
 * The client's outgoing request types
 */
export type TRPCClientOutgoingRequest = TRPCSubscriptionStopNotification;

/**
 * The client's sent messages shape
 */
export type TRPCClientOutgoingMessage =
  | TRPCRequestMessage
  | ({ id: JSONRPC2.RequestId } & JSONRPC2.BaseRequest<'subscription.stop'>);

export interface TRPCResultMessage<TData>
  extends JSONRPC2.ResultResponse<
    | (TRPCResult<TData> & { type: 'data' })
    | { type: 'started' }
    | { type: 'stopped' }
  > {}

export type TRPCResponseMessage<
  TData = unknown,
  TError extends TRPCErrorShape = TRPCErrorShape,
> = { id: JSONRPC2.RequestId } & (
  | TRPCResultMessage<TData>
  | TRPCErrorResponse<TError>
);

/**
 * The server asked the client to reconnect - useful when restarting/redeploying service
 */
export interface TRPCReconnectNotification
  extends JSONRPC2.BaseRequest<'reconnect'> {
  id: JSONRPC2.RequestId;
}

/**
 * The client's incoming request types
 */
export type TRPCClientIncomingRequest = TRPCReconnectNotification;

/**
 * The client's received messages shape
 */
export type TRPCClientIncomingMessage<
  TResult = unknown,
  TError extends TRPCErrorShape = TRPCErrorShape,
> = TRPCResponseMessage<TResult, TError> | TRPCClientIncomingRequest;
