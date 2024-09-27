/* eslint-disable @typescript-eslint/no-namespace */
import type { TRPCRequestInfo } from '../http/types';
import type { ProcedureType } from '../procedure';
import type { TRPC_ERROR_CODE_NUMBER } from './codes';

/**
 * Error response
 */
export interface TRPCErrorShape<TData extends object = object> {
  code: TRPC_ERROR_CODE_NUMBER;
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
  extends JSONRPC2.Request<
    ProcedureType,
    {
      path: string;
      input: unknown;
      /**
       * The last event id that the client received
       */
      lastEventId?: string;
    }
  > {}

export interface TRPCResult<TData = unknown> {
  data: TData;
}

export interface TRPCSuccessResponse<TData>
  extends JSONRPC2.ResultResponse<
    TRPCResult<TData> & {
      type?: 'data';
    }
  > {}

export interface TRPCErrorResponse<
  TError extends TRPCErrorShape = TRPCErrorShape,
> extends JSONRPC2.ErrorResponse<TError> {}

export type TRPCResponse<
  TData = unknown,
  TError extends TRPCErrorShape = TRPCErrorShape,
> = TRPCErrorResponse<TError> | TRPCSuccessResponse<TData>;

/////////////////////////// WebSocket envelopes ///////////////////////

export type TRPCRequestMessage = TRPCRequest & {
  id: JSONRPC2.RequestId;
};

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
  | (JSONRPC2.BaseRequest<'subscription.stop'> & { id: JSONRPC2.RequestId });

export interface TRPCResultMessage<TData>
  extends JSONRPC2.ResultResponse<
    | { type: 'started'; data?: never }
    | { type: 'stopped'; data?: never }
    | (TRPCResult<TData> & {
        type: 'data';
        /**
         * The id of the message to keep track of in case of a reconnect
         */
        id?: string;
      })
  > {}

export type TRPCResponseMessage<
  TData = unknown,
  TError extends TRPCErrorShape = TRPCErrorShape,
> = { id: JSONRPC2.RequestId } & (
  | TRPCErrorResponse<TError>
  | TRPCResultMessage<TData>
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
> = TRPCClientIncomingRequest | TRPCResponseMessage<TResult, TError>;

/**
 * The client sends connection params - always sent as the first message
 */
export interface TRPCConnectionParamsMessage
  extends JSONRPC2.BaseRequest<'connectionParams'> {
  data: TRPCRequestInfo['connectionParams'];
}
