import { AnyRouter } from '../router';

// https://www.jsonrpc.org/specification
export const TRPC_ERROR_CODES_MAP = {
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

type ValueOf<T> = T[keyof T];

export type TRPC_ERROR_CODE_NUMBER = ValueOf<typeof TRPC_ERROR_CODES_MAP>;
export type TRPC_ERROR_CODE_KEY = keyof typeof TRPC_ERROR_CODES_MAP;

export const JSONRPC2_TO_HTTP_CODE: Record<
  keyof typeof TRPC_ERROR_CODES_MAP,
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

export type JSONRPC2RequestId = null | string | number;
export interface JSONRPC2BaseEnvelope {
  id?: JSONRPC2RequestId;
  jsonrpc?: '2.0';
}
export interface JSONRPC2BaseError {
  code: TRPC_ERROR_CODE_NUMBER;
  message: string;
}

export interface JSONRPC2RequestNoParams<TMethod extends string = string>
  extends JSONRPC2BaseEnvelope {
  method: TMethod;
  params?: unknown;
}
export interface JSONRPC2RequestWithParams<
  TMethod extends string = string,
  TParams = unknown,
> extends JSONRPC2RequestNoParams<TMethod> {
  params: TParams;
}

export interface JSONRPC2Result<TResult = unknown>
  extends JSONRPC2BaseEnvelope {
  result: TResult;
}
export interface JSONRPC2Error<
  TError extends JSONRPC2BaseError = JSONRPC2BaseError,
> extends JSONRPC2BaseEnvelope {
  error: TError;
}

export type TRPCRequestId = NonNullable<JSONRPC2RequestId>;

export type JSONRPC2Response<
  TResult = unknown,
  TError extends JSONRPC2BaseError = JSONRPC2BaseError,
> = JSONRPC2Result<TResult> | JSONRPC2Error<TError>;
