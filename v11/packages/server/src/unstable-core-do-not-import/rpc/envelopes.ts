/* oxlint-disable typescript/no-namespace */
import type { TRPCRequestInfo } from '../http/types';
import type { ProcedureType } from '../procedure';
import type { TRPC_ERROR_CODE_NUMBER } from './codes';

/**
 * The error object of an error response: a JSON-RPC code, a message and
 * any `data` the error formatter adds.
 * @see https://trpc.io/docs/rpc#error-response
 */
export interface TRPCErrorShape<TData extends object = object> {
  code: TRPC_ERROR_CODE_NUMBER;
  message: string;
  /** Extra details, such as the tRPC code and HTTP status. */
  data: TData;
}

/**
 * Types for the JSON-RPC 2.0 messages tRPC's envelopes build on.
 * @see https://www.jsonrpc.org/specification
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

  export interface BaseRequest<
    TMethod extends string = string,
  > extends BaseEnvelope {
    method: TMethod;
  }

  export interface Request<
    TMethod extends string = string,
    TParams = unknown,
  > extends BaseRequest<TMethod> {
    params: TParams;
  }

  export interface ResultResponse<TResult = unknown> extends BaseEnvelope {
    result: TResult;
  }

  export interface ErrorResponse<
    TError extends TRPCErrorShape = TRPCErrorShape,
  > extends BaseEnvelope {
    error: TError;
  }
}

/////////////////////////// HTTP envelopes ///////////////////////

/** A call to a procedure. */
export interface TRPCRequest extends JSONRPC2.Request<
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

/** The `result` of a successful response. */
export interface TRPCResult<TData = unknown> {
  data: TData;
  type?: 'data';
  /**
   * The id of the message to keep track of in case of a reconnect
   */
  id?: string;
}

/**
 * A successful response.
 * @see https://trpc.io/docs/rpc#successful-response
 */
export interface TRPCSuccessResponse<TData> extends JSONRPC2.ResultResponse<
  TRPCResult<TData>
> {}

/**
 * An error response.
 * @see https://trpc.io/docs/rpc#error-response
 */
export interface TRPCErrorResponse<
  TError extends TRPCErrorShape = TRPCErrorShape,
> extends JSONRPC2.ErrorResponse<TError> {}

/**
 * A response to a call: a success or an error.
 * @see https://trpc.io/docs/rpc#http-response-specification
 */
export type TRPCResponse<
  TData = unknown,
  TError extends TRPCErrorShape = TRPCErrorShape,
> = TRPCErrorResponse<TError> | TRPCSuccessResponse<TData>;

/////////////////////////// WebSocket envelopes ///////////////////////

/**
 * A call to a procedure over WebSockets, with the id its responses carry.
 * @see https://trpc.io/docs/server/websockets#websockets-rpc-specification
 */
export type TRPCRequestMessage = TRPCRequest & {
  id: JSONRPC2.RequestId;
};

/**
 * The client asks the server to stop a subscription.
 * @see https://trpc.io/docs/server/websockets#to-cancel-a-subscription-call-subscriptionstop
 */
export interface TRPCSubscriptionStopNotification extends JSONRPC2.BaseRequest<'subscription.stop'> {
  id: null;
}

/**
 * The notifications a WebSocket client sends.
 */
export type TRPCClientOutgoingRequest = TRPCSubscriptionStopNotification;

/**
 * Any message a WebSocket client sends.
 * @see https://trpc.io/docs/server/websockets#websockets-rpc-specification
 */
export type TRPCClientOutgoingMessage =
  | TRPCRequestMessage
  | (JSONRPC2.BaseRequest<'subscription.stop'> & { id: JSONRPC2.RequestId });

/**
 * A result sent over WebSockets: data, or a subscription's `started` or
 * `stopped` event.
 * @see https://trpc.io/docs/server/websockets#subscription-response-shape
 */
export interface TRPCResultMessage<TData> extends JSONRPC2.ResultResponse<
  | { type: 'started'; data?: never }
  | { type: 'stopped'; data?: never }
  | TRPCResult<TData>
> {}

/**
 * A response sent over WebSockets, with the id of the call it answers.
 * @see https://trpc.io/docs/server/websockets#response
 */
export type TRPCResponseMessage<
  TData = unknown,
  TError extends TRPCErrorShape = TRPCErrorShape,
> = { id: JSONRPC2.RequestId } & (
  | TRPCErrorResponse<TError>
  | TRPCResultMessage<TData>
);

/**
 * The server asks the client to reconnect, for example before a restart.
 * @see https://trpc.io/docs/server/websockets#notifications-from-server-to-client
 */
export interface TRPCReconnectNotification extends JSONRPC2.BaseRequest<'reconnect'> {
  id: JSONRPC2.RequestId;
}

/**
 * The notifications a WebSocket client receives.
 */
export type TRPCClientIncomingRequest = TRPCReconnectNotification;

/**
 * Any message a WebSocket client receives.
 * @see https://trpc.io/docs/server/websockets#websockets-rpc-specification
 */
export type TRPCClientIncomingMessage<
  TResult = unknown,
  TError extends TRPCErrorShape = TRPCErrorShape,
> = TRPCClientIncomingRequest | TRPCResponseMessage<TResult, TError>;

/**
 * The connection params a WebSocket client sends as its first message.
 * @see https://trpc.io/docs/server/websockets#connection-params
 */
export interface TRPCConnectionParamsMessage extends JSONRPC2.BaseRequest<'connectionParams'> {
  data: TRPCRequestInfo['connectionParams'];
}
