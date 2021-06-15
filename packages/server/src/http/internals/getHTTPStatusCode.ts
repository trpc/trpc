import {
  JSONRPC2Response,
  JSONRPC2_TO_HTTP_CODE,
  TRPC_ERROR_CODES_BY_KEY,
  TRPC_ERROR_CODE_NUMBER,
} from '../../jsonrpc2';

export function getHTTPStatusCode(json: JSONRPC2Response | JSONRPC2Response[]) {
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
  const key = TRPC_ERROR_CODES_BY_KEY[code];
  return JSONRPC2_TO_HTTP_CODE[code];
}
