import {
  codeOfStatus,
  toUntypedError,
  TrpcError,
  wireTag,
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
  /** The `_tag`, when it isn't the code's class name and the client keeps it. */
  readonly tag?: string;
  readonly message: string;
  readonly data?: unknown;
}

/** @internal */
export const toOpenApiError = (err: AnyTrpcError): OpenApiErrorBody => {
  const tag = wireTag(err);
  return {
    defined: err.defined,
    code: err.code,
    ...(tag === undefined ? {} : { tag }),
    message: err.message,
    ...(err.data === undefined ? {} : { data: err.data }),
  };
};

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
  return toUntypedError(
    new TrpcError({
      code,
      tag: typeof b.tag === 'string' ? b.tag : undefined,
      message: typeof b.message === 'string' ? b.message : code,
      data: b.data,
      defined: b.defined === true,
    }),
  ) as TrpcError;
}
