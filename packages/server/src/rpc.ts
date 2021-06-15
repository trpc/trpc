// https://www.jsonrpc.org/specification

// --> [1,2,3]
// <-- {"jsonrpc": "2.0", "error": {"code": -32600, "message": "Invalid Request."}, "id": null}
// --> {"jsonrpc": "2.0", "method": 1, "params": "bar"}
// <-- {"jsonrpc": "2.0", "error": {"code": -32600, "message": "Invalid Request."}, "id": null}

export const ERROR_CODES = {
  /**
   * Invalid JSON was received by the server.
   * An error occurred on the server while parsing the JSON text.
   */
  PARSE_ERROR: -32700,
  /**
   * The JSON sent is not a valid Request object.
   */
  INVALID_REQUEST: -32600,
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
  UNAUTHENTICATED: -32000,
};

export type JSONRPCRequestId = null | string | number;
export interface JSONRPCBaseEnvelope {
  id?: JSONRPCRequestId;
  jsonrpc?: '2.0';
}
export interface JSONRPCBaseError {
  code: number;
  message: string;
}

export interface JSONRPCRequestNoParams<TMethod extends string = string>
  extends JSONRPCBaseEnvelope {
  method: TMethod;
  params?: unknown;
}
export interface JSONRPCRequestWithParams<
  TMethod extends string = string,
  TParams = unknown,
> extends JSONRPCRequestNoParams<TMethod> {
  params: TParams;
}

export interface JSONRPCResult<TResult> extends JSONRPCBaseEnvelope {
  result: TResult;
}
export interface JSONRPCError<TError extends JSONRPCBaseError>
  extends JSONRPCBaseEnvelope {
  error: TError;
}
