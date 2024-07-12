import type { TRPCError } from '../error/TRPCError';
import type { TRPC_ERROR_CODES_BY_KEY, TRPCResponse } from '../rpc';
import { TRPC_ERROR_CODES_BY_NUMBER } from '../rpc';
import { isObject } from '../utils';

const JSONRPC2_TO_HTTP_CODE: Record<
  keyof typeof TRPC_ERROR_CODES_BY_KEY,
  number
> = {
  PARSE_ERROR: 400,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_SUPPORTED: 405,
  TIMEOUT: 408,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNPROCESSABLE_CONTENT: 422,
  TOO_MANY_REQUESTS: 429,
  CLIENT_CLOSED_REQUEST: 499,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
};

function getStatusCodeFromKey(code: keyof typeof TRPC_ERROR_CODES_BY_KEY) {
  return JSONRPC2_TO_HTTP_CODE[code] ?? 500;
}

export function getHTTPStatusCode(json: TRPCResponse | TRPCResponse[]): number {
  const arr = Array.isArray(json) ? json : [json];
  const httpStatuses = new Set<number>(
    arr.map((res) => {
      if ('error' in res && isObject(res.error.data)) {
        if (typeof res.error.data?.['httpStatus'] === 'number') {
          return res.error.data['httpStatus'];
        }
        const code = TRPC_ERROR_CODES_BY_NUMBER[res.error.code];
        return getStatusCodeFromKey(code);
      }
      return 200;
    }),
  );

  if (httpStatuses.size !== 1) {
    return 207;
  }

  const httpStatus = httpStatuses.values().next().value;

  return httpStatus;
}

export function getHTTPStatusCodeFromError(error: TRPCError) {
  return getStatusCodeFromKey(error.code);
}
