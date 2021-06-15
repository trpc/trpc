import { ProcedureType } from '../router';
import { invert } from './internals/invert';

// https://www.jsonrpc.org/specification
export const TRPC_ERROR_CODES_BY_KEY = {
  /**
   * Invalid JSON was received by the server.
   * An error occurred on the server while parsing the JSON text.
   */
  PARSE_ERROR: -32700,
  /**
   * The JSON sent is not a valid Request object.
   */
  BAD_REQUEST: -32600,
  /**
   * The method does not exist / is not available.
   */
  NOT_FOUND: -32601,
  /**
   * Internal JSON-RPC error.
   */
  INTERNAL_SERVER_ERROR: -32603,
  /**
   * -32000 to -32099
   * Reserved for implementation-defined server-errors.
   */
  UNAUTHORIZED: -32001,
  FORBIDDEN: -32003,
  TIMEOUT: -32008,
  PAYLOAD_TOO_LARGE: -32013,
  CLIENT_CLOSED_REQUEST: -32099,
} as const;

export const TRPC_ERROR_CODES_BY_NUMBER = invert(TRPC_ERROR_CODES_BY_KEY);

type ValueOf<T> = T[keyof T];

export type TRPC_ERROR_CODE_NUMBER = ValueOf<typeof TRPC_ERROR_CODES_BY_KEY>;
export type TRPC_ERROR_CODE_KEY = keyof typeof TRPC_ERROR_CODES_BY_KEY;

export const JSONRPC2_TO_HTTP_CODE: Record<
  keyof typeof TRPC_ERROR_CODES_BY_KEY,
  number
> = {
  PARSE_ERROR: 400,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  TIMEOUT: 408,
  CLIENT_CLOSED_REQUEST: 499,
  PAYLOAD_TOO_LARGE: 413,
};

export type JSONRPC2RequestId = number /*|string  | null*/;
export interface JSONRPC2BaseEnvelope {
  id?: JSONRPC2RequestId;
  jsonrpc?: '2.0';
}
export interface JSONRPC2BaseError {
  code: TRPC_ERROR_CODE_NUMBER;
  message: string;
}

export interface JSONRPC2Request<
  TMethod extends string = string,
  TParams = unknown,
> extends JSONRPC2BaseEnvelope {
  method: TMethod;
  params: TParams;
}

export interface JSONRPC2ResultResponse<TResult = unknown>
  extends JSONRPC2BaseEnvelope {
  result: TResult;
}
export interface JSONRPC2ErrorResponse<
  TError extends JSONRPC2BaseError = JSONRPC2BaseError,
> extends JSONRPC2BaseEnvelope {
  error: TError;
}

export type TRPCRequestId = NonNullable<JSONRPC2RequestId>;

export type JSONRPC2Response<
  TResult = unknown,
  TError extends JSONRPC2BaseError = JSONRPC2BaseError,
> = JSONRPC2ResultResponse<TResult> | JSONRPC2ErrorResponse<TError>;

// TRPC specific
export type TRPCRequestEnvelope =
  | JSONRPC2Request<'subscription.stop'>
  | JSONRPC2Request<
      ProcedureType,
      {
        path: string;
        input: unknown;
      }
    >;

export type TRPCReconnectRequest = JSONRPC2Request<'reconnect', undefined>;

export type TRPCSubscriptionResponse = JSONRPC2Response<
  | {
      type: 'data';
      data: unknown;
    }
  | {
      type: 'started';
    }
  | {
      type: 'stopped';
    }
>;

export type TRPCResult<TData = unknown> =
  | {
      type: 'data';
      data: TData;
    }
  | {
      type: 'started';
    }
  | {
      type: 'stopped';
    };
export type TRPCResponseEnvelope<TData = unknown> =
  | JSONRPC2ResultResponse<TRPCResult<TData>>
  | JSONRPC2ErrorResponse;
export type TRPCClientMessage = TRPCResponseEnvelope | TRPCReconnectRequest;
