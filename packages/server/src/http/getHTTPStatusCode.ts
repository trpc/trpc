import { TRPCError } from '../error/TRPCError';
import { invert } from '../internals/invert';
import { TRPCResponse, TRPC_ERROR_CODES_BY_KEY } from '../rpc';

export const TRPC_ERROR_CODES_BY_NUMBER = invert(TRPC_ERROR_CODES_BY_KEY);
type ValueOf<TType> = TType[keyof TType];

export type TRPC_ERROR_CODE_NUMBER = ValueOf<typeof TRPC_ERROR_CODES_BY_KEY>;
const JSONRPC2_TO_HTTP_CODE: Record<
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
  CONFLICT: 409,
  CLIENT_CLOSED_REQUEST: 499,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  METHOD_NOT_SUPPORTED: 405,
  UNPROCESSABLE_CONTENT: 422,
  TOO_MANY_REQUESTS: 429,
};

function getStatusCodeFromKey(code: keyof typeof TRPC_ERROR_CODES_BY_KEY) {
  return JSONRPC2_TO_HTTP_CODE[code] ?? 500;
}

export function getHTTPStatusCode(json: TRPCResponse | TRPCResponse[]) {
  const arr = Array.isArray(json) ? json : [json];
  const httpStatuses = new Set(
    arr.map((res) => {
      if ('error' in res) {
        const data = res.error.data;
        if (typeof data.httpStatus === 'number') {
          return data.httpStatus;
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
  const { code } = error;

  return getStatusCodeFromKey(code);
}
