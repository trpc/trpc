import { Data } from 'effect';
import type * as Cause from 'effect/Cause';

/**
 * Built-in error codes and their default HTTP status.
 *
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export const ERROR_STATUS = {
  PARSE_ERROR: 400,
  BAD_REQUEST: 400,
  UNSUPPORTED_PROTOCOL: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
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
  /** Client-side only: the request never got a response. */
  NETWORK_ERROR: 0,
  /** Client-side only: a link failed. */
  CLIENT_ERROR: 0,
} as const;

/**
 * A built-in error code.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type BuiltinErrorCode = keyof typeof ERROR_STATUS;

/**
 * Options for {@link TrpcError} and {@link error}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TrpcErrorOptions<TCode extends string, TData> {
  /** A built-in code (`'NOT_FOUND'`) or a custom one (`'PAYMENT_REQUIRED'`). */
  code: TCode;
  message?: string | undefined;
  /** Sent to the client, serialized with the endpoint's serializer. */
  data?: TData;
  /** HTTP status. Defaults from the code, or 500 for an unknown custom code. */
  status?: number | undefined;
  /** Whether the error is part of the procedure's typed error union. */
  defined?: boolean | undefined;
  /** Never sent to the client. */
  cause?: unknown;
}

const YieldableBase: new (args: {
  message: string;
  cause?: unknown;
}) => Cause.YieldableError = Data.Error as never;

/**
 * The one error type, on the server and on the client.
 *
 * Return it (or `yield*` it in an Effect) from a resolver or middleware and
 * it becomes part of the procedure's typed error union, `defined: true` on
 * the client. Anything thrown is `defined: false`. Thrown values that are not
 * a `TrpcError` become `INTERNAL_SERVER_ERROR`, and their message is masked in
 * production.
 *
 * @example
 * ```ts
 * const byId = t.procedure
 *   .input(z.object({ id: z.string() }))
 *   .query(async ({ input }) => {
 *     const post = await db.post.find(input.id);
 *     if (!post) return error({ code: 'NOT_FOUND', data: { id: input.id } });
 *     return post;
 *   });
 *
 * const [post, err] = await safe(client.byId.query({ id: '1' }));
 * if (err?.defined && err.code === 'NOT_FOUND') err.data.id; // typed
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export class TrpcError<
  TCode extends string = string,
  TData = unknown,
> extends YieldableBase {
  override readonly name = 'TrpcError';
  readonly code: TCode;
  readonly status: number;
  readonly data: TData;
  readonly defined: boolean;

  constructor(opts: TrpcErrorOptions<TCode, TData>) {
    super({
      message: opts.message ?? opts.code,
      ...(opts.cause === undefined ? {} : { cause: opts.cause }),
    });
    this.code = opts.code;
    this.status =
      opts.status ?? (ERROR_STATUS as Record<string, number>)[opts.code] ?? 500;
    this.data = opts.data as TData;
    this.defined = opts.defined ?? false;
  }
}

/**
 * Any {@link TrpcError}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type AnyTrpcError = TrpcError<string, any>;

/**
 * Creates a {@link TrpcError} to return (or `yield*`) from a resolver or
 * middleware. Returned errors are inferred into the procedure's error union.
 *
 * @example
 * ```ts
 * t.procedure.query(({ ctx }) =>
 *   ctx.user ? ctx.user : error({ code: 'UNAUTHORIZED' }),
 * );
 *
 * t.procedure.query(
 *   Effect.fn(function* () {
 *     return yield* error({ code: 'FORBIDDEN', data: { reason: 'banned' } });
 *   }),
 * );
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function error<const TCode extends string, TData = undefined>(
  opts: Omit<TrpcErrorOptions<TCode, TData>, 'defined'>,
): TrpcError<TCode, TData> {
  return new TrpcError({ ...opts, defined: true });
}

/**
 * Whether `value` is a {@link TrpcError}.
 *
 * @example
 * ```ts
 * if (isTrpcError(cause)) cause.code;
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function isTrpcError(value: unknown): value is AnyTrpcError {
  return value instanceof TrpcError;
}

/**
 * Narrows a client error to the procedure's typed union.
 *
 * @example
 * ```ts
 * if (isDefinedError(err)) err.code; // the procedure's codes only
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function isDefinedError<E>(
  value: E,
): value is Extract<E, { readonly defined: true }> {
  return isTrpcError(value) && value.defined;
}

/** A copy of `err` with `defined` set. @internal */
export function withDefined<E extends AnyTrpcError>(
  err: E,
  defined: boolean,
): E {
  if (err.defined === defined) return err;
  return new TrpcError({
    code: err.code,
    message: err.message,
    data: err.data,
    status: err.status,
    defined,
    cause: err.cause,
  }) as E;
}

/** The JSON shape of an error on the wire. @internal */
export interface WireError {
  error: { code: string; message: string; data?: unknown; defined: boolean };
}

/** @internal */
export function toWireError(err: AnyTrpcError): WireError {
  return {
    error: {
      code: err.code,
      message: err.message,
      ...(err.data === undefined ? {} : { data: err.data }),
      defined: err.defined,
    },
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

/** Rebuilds a {@link TrpcError} from a deserialized error body. @internal */
export function fromWireError(body: unknown, status?: number): TrpcError {
  const inner = isRecord(body) && isRecord(body['error']) ? body['error'] : {};
  const code =
    typeof inner['code'] === 'string' ? inner['code'] : 'INTERNAL_SERVER_ERROR';
  return new TrpcError({
    code,
    message: typeof inner['message'] === 'string' ? inner['message'] : code,
    data: inner['data'],
    status,
    defined: inner['defined'] === true,
  });
}
