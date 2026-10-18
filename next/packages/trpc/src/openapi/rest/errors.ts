import {
  codeOfStatus,
  toBuiltinError,
  TrpcError,
  type AnyTrpcError,
} from '../../internal/error.ts';

/**
 * The JSON body of an OpenAPI error response.
 * @since 0.1.0
 * @stability experimental
 */
export interface OpenApiErrorBody {
  /** Whether the error is part of the procedure's typed union. */
  readonly defined: boolean;
  readonly code: string;
  readonly message: string;
  readonly data?: unknown;
}

/** @internal */
export const toOpenApiError = (err: AnyTrpcError): OpenApiErrorBody => ({
  defined: err.defined,
  code: err.code,
  message: err.message,
  ...(err.data === undefined ? {} : { data: err.data }),
});

/** @internal */
export function fromOpenApiError(body: unknown, status: number): TrpcError {
  const b =
    typeof body === 'object' && body !== null
      ? (body as Partial<OpenApiErrorBody>)
      : {};
  const code =
    typeof b.code === 'string'
      ? b.code
      : (codeOfStatus(status) ?? 'INTERNAL_SERVER_ERROR');
  return toBuiltinError(
    new TrpcError({
      code,
      message: typeof b.message === 'string' ? b.message : code,
      data: b.data,
      defined: b.defined === true,
    }),
    'INTERNAL_SERVER_ERROR',
  ) as TrpcError;
}
