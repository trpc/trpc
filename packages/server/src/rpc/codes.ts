import { invert } from '../http/internals/invert';

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
   * Copying the last digits of 4XX errors
   */
  /**
   * Unauthorized
   */
  UNAUTHORIZED: -32001,
  FORBIDDEN: -32003,
  METHOD_NOT_SUPPORTED: -32005,
  TIMEOUT: -32008,
  PAYLOAD_TOO_LARGE: -32013,
  CLIENT_CLOSED_REQUEST: -32099,
} as const;

export const TRPC_ERROR_CODES_BY_NUMBER = invert(TRPC_ERROR_CODES_BY_KEY);
type ValueOf<T> = T[keyof T];

export type TRPC_ERROR_CODE_NUMBER = ValueOf<typeof TRPC_ERROR_CODES_BY_KEY>;
export type TRPC_ERROR_CODE_KEY = keyof typeof TRPC_ERROR_CODES_BY_KEY;
