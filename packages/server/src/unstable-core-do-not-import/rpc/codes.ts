import type { InvertKeyValue, ValueOf } from '../types';

// reference: https://www.jsonrpc.org/specification

/**
 * JSON-RPC 2.0 Error codes
 *
 * `-32000` to `-32099` are reserved for implementation-defined server-errors.
 * For tRPC we're copying the last digits of HTTP 4XX errors.
 */
export const TRPC_ERROR_CODES_BY_KEY = {
  /**
   * Invalid JSON was received by the server.
   * An error occurred on the server while parsing the JSON text.
   */
  PARSE_ERROR: -32700,
  /**
   * The JSON sent is not a valid Request object.
   */
  BAD_REQUEST: -32600, // 400

  // Internal JSON-RPC error
  INTERNAL_SERVER_ERROR: -32603, // 500
  NOT_IMPLEMENTED: -32603, // 501
  BAD_GATEWAY: -32603, // 502
  SERVICE_UNAVAILABLE: -32603, // 503
  GATEWAY_TIMEOUT: -32603, // 504

  // Implementation specific errors
  UNAUTHORIZED: -32001, // 401
  PAYMENT_REQUIRED: -32002, // 402
  FORBIDDEN: -32003, // 403
  NOT_FOUND: -32004, // 404
  METHOD_NOT_SUPPORTED: -32005, // 405
  TIMEOUT: -32008, // 408
  CONFLICT: -32009, // 409
  PRECONDITION_FAILED: -32012, // 412
  PAYLOAD_TOO_LARGE: -32013, // 413
  UNSUPPORTED_MEDIA_TYPE: -32015, // 415
  UNPROCESSABLE_CONTENT: -32022, // 422
  PRECONDITION_REQUIRED: -32028, // 428
  TOO_MANY_REQUESTS: -32029, // 429
  CLIENT_CLOSED_REQUEST: -32099, // 499
} as const;

// pure
export const TRPC_ERROR_CODES_BY_NUMBER: InvertKeyValue<
  typeof TRPC_ERROR_CODES_BY_KEY
> = {
  [-32700]: 'PARSE_ERROR',
  [-32600]: 'BAD_REQUEST',
  [-32603]: 'INTERNAL_SERVER_ERROR',
  [-32001]: 'UNAUTHORIZED',
  [-32002]: 'PAYMENT_REQUIRED',
  [-32003]: 'FORBIDDEN',
  [-32004]: 'NOT_FOUND',
  [-32005]: 'METHOD_NOT_SUPPORTED',
  [-32008]: 'TIMEOUT',
  [-32009]: 'CONFLICT',
  [-32012]: 'PRECONDITION_FAILED',
  [-32013]: 'PAYLOAD_TOO_LARGE',
  [-32015]: 'UNSUPPORTED_MEDIA_TYPE',
  [-32022]: 'UNPROCESSABLE_CONTENT',
  [-32028]: 'PRECONDITION_REQUIRED',
  [-32029]: 'TOO_MANY_REQUESTS',
  [-32099]: 'CLIENT_CLOSED_REQUEST',
};

export type TRPC_ERROR_CODE_NUMBER = ValueOf<typeof TRPC_ERROR_CODES_BY_KEY>;
export type TRPC_ERROR_CODE_KEY = keyof typeof TRPC_ERROR_CODES_BY_KEY;

/**
 * tRPC error codes that are considered retryable
 * With out of the box SSE, the client will reconnect when these errors are encountered
 */
export const retryableRpcCodes: TRPC_ERROR_CODE_NUMBER[] = [
  TRPC_ERROR_CODES_BY_KEY.BAD_GATEWAY,
  TRPC_ERROR_CODES_BY_KEY.SERVICE_UNAVAILABLE,
  TRPC_ERROR_CODES_BY_KEY.GATEWAY_TIMEOUT,
  TRPC_ERROR_CODES_BY_KEY.INTERNAL_SERVER_ERROR,
];
