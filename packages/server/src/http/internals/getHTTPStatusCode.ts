import { TRPCResponse, TRPC_ERROR_CODES_BY_KEY } from '../../rpc';
import { invert } from './invert';

export const TRPC_ERROR_CODES_BY_NUMBER = invert(TRPC_ERROR_CODES_BY_KEY);
type ValueOf<T> = T[keyof T];

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
  CLIENT_CLOSED_REQUEST: 499,
  PAYLOAD_TOO_LARGE: 413,
  METHOD_NOT_SUPPORTED: 405,
};

export function getHTTPStatusCode(json: TRPCResponse | TRPCResponse[]) {
  const arr = Array.isArray(json) ? json : [json];
  const codes = new Set(
    arr.map((res) => {
      if ('error' in res) {
        return res.error.code;
      }
      return 200;
    }),
  );

  if (codes.size !== 1) {
    return 207;
  }

  const code: TRPC_ERROR_CODE_NUMBER | 200 = codes.values().next().value;

  if (code === 200) {
    return 200;
  }
  const key = TRPC_ERROR_CODES_BY_NUMBER[code];

  const res = JSONRPC2_TO_HTTP_CODE[key] ?? 500;

  return res;
}
