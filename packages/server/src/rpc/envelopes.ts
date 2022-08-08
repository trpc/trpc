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

/**
 * TRPC HTTP Envelopes
 */

export type TRPCRequest = JSONRPC2.Request<
  ProcedureType,
  { path: string; input: unknown }
>;

export type TRPCResult<TData = unknown> = { data: TData };

export type TRPCSuccessResponse<TData> = JSONRPC2.ResultResponse<
  TRPCResult<TData>
>;
export type TRPCErrorResponse<TError extends TRPCErrorShape = TRPCErrorShape> =
  JSONRPC2.ErrorResponse<TError>;

export type TRPCResponse<
  TData = unknown,
  TError extends TRPCErrorShape = TRPCErrorShape,
> = TRPCSuccessResponse<TData> | TRPCErrorResponse<TError>;

/**
 * HTTP WS Envelopes
 */

export type TRPCRequestMessage = {
  id: JSONRPC2.RequestId;
} & TRPCRequest;

/**
 * The client asked the server to unsubscribe
 */
export type TRPCSubscriptionStopNotification = {
  id: null;
} & JSONRPC2.BaseRequest<'subscription.stop'>;

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

export type TRPCResultMessage<TData = unknown> =
  | ({ type: 'data' } & TRPCResult<TData>)
  | { type: 'started' }
  | { type: 'stopped' };

export type TRPCResponseMessage<
  TResult = unknown,
  TError extends TRPCErrorShape = TRPCErrorShape,
> = { id: JSONRPC2.RequestId } & (
  | JSONRPC2.ResultResponse<TRPCResultMessage<TResult>>
  | TRPCErrorResponse<TError>
);

/**
 * The server asked the client to reconnect - useful when restarting/redeploying service
 */
export type TRPCReconnectNotification = {
  id: JSONRPC2.RequestId;
} & JSONRPC2.BaseRequest<'reconnect'>;

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
