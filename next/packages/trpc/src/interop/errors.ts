import type { AnyTrpcError } from '../internal/error.ts';
import type { ProcedureType } from '../internal/types.ts';

/** v11's JSON-RPC numbers, by code. */
const RPC_CODES: Record<string, number> = {
  PARSE_ERROR: -32700,
  BAD_REQUEST: -32600,
  INTERNAL_SERVER_ERROR: -32603,
  NOT_IMPLEMENTED: -32603,
  BAD_GATEWAY: -32603,
  SERVICE_UNAVAILABLE: -32603,
  GATEWAY_TIMEOUT: -32603,
  UNAUTHORIZED: -32001,
  PAYMENT_REQUIRED: -32002,
  FORBIDDEN: -32003,
  NOT_FOUND: -32004,
  METHOD_NOT_SUPPORTED: -32005,
  TIMEOUT: -32008,
  CONFLICT: -32009,
  PRECONDITION_FAILED: -32012,
  PAYLOAD_TOO_LARGE: -32013,
  UNSUPPORTED_MEDIA_TYPE: -32015,
  UNPROCESSABLE_CONTENT: -32022,
  PRECONDITION_REQUIRED: -32028,
  TOO_MANY_REQUESTS: -32029,
  CLIENT_CLOSED_REQUEST: -32099,
};

/** v11's code for each HTTP status, for codes v11 doesn't have. */
const CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  402: 'PAYMENT_REQUIRED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_SUPPORTED',
  408: 'TIMEOUT',
  409: 'CONFLICT',
  412: 'PRECONDITION_FAILED',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_CONTENT',
  428: 'PRECONDITION_REQUIRED',
  429: 'TOO_MANY_REQUESTS',
  499: 'CLIENT_CLOSED_REQUEST',
  500: 'INTERNAL_SERVER_ERROR',
  501: 'NOT_IMPLEMENTED',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
  504: 'GATEWAY_TIMEOUT',
};

/**
 * An error as a v11 client reads it: `TRPCClientError`'s `shape`.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export interface V11ErrorShape {
  readonly message: string;
  /** The JSON-RPC number, e.g. `-32004` for `NOT_FOUND`. */
  readonly code: number;
  readonly data: {
    /** A v11 code; a code v11 doesn't have becomes the one for its status. */
    readonly code: string;
    readonly httpStatus: number;
    readonly path?: string;
    readonly [key: string]: unknown;
  };
}

/**
 * What `errorFormatter` receives.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export interface V11ErrorFormatterOpts {
  /** The v12 error, with its own `code`, `data` and `cause`. */
  readonly error: AnyTrpcError;
  /** The default v11 shape. */
  readonly shape: V11ErrorShape;
  readonly path: string | undefined;
  readonly type: ProcedureType | 'unknown';
}

/** The default v11 shape of `err`. @internal */
export function v11Shape(
  err: AnyTrpcError,
  path: string | undefined,
): V11ErrorShape {
  const code =
    err.code in RPC_CODES
      ? err.code
      : (CODE_BY_STATUS[err.status] ?? 'INTERNAL_SERVER_ERROR');
  return {
    message: err.message,
    code: RPC_CODES[code]!,
    data: {
      code,
      httpStatus: err.status,
      ...(path === undefined ? {} : { path }),
    },
  };
}
