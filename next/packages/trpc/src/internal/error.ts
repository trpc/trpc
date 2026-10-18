import { Data } from 'effect';
import type * as Cause from 'effect/Cause';
import type { AnySchema, OutOf } from '../server/schema.ts';
import type { TrpcErrorReason } from './failure.ts';

/**
 * Built-in error codes and their default HTTP status.
 *
 * @since 0.1.0
 * @stability stable
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
  /**
   * Client-side only: a response the client couldn't read. It wasn't a tRPC
   * response (a proxy's HTML page), it didn't decode, or it failed
   * `validationLink`'s check.
   */
  BAD_RESPONSE: 0,
  /** Client-side only: a link failed. */
  CLIENT_ERROR: 0,
  /** Client-side only: a stream stopped without an end or an error. */
  STREAM_INTERRUPTED: 0,
} as const;

/**
 * A built-in error code.
 * @since 0.1.0
 * @stability stable
 */
export type BuiltinErrorCode = keyof typeof ERROR_STATUS;

/**
 * Whether `code` is a {@link BuiltinErrorCode}.
 * @since 0.1.0
 * @stability stable
 */
export function isBuiltinCode(code: string): code is BuiltinErrorCode {
  return Object.hasOwn(ERROR_STATUS, code);
}

/**
 * Options for {@link TrpcError} and {@link error}.
 * @since 0.1.0
 * @stability stable
 */
export interface TrpcErrorOptions<TCode extends string, TData> {
  /** A built-in code (`'NOT_FOUND'`) or a custom one (`'PAYMENT_REQUIRED'`). */
  code: TCode;
  message?: string | undefined;
  /** Sent to the client, serialized with the endpoint's serializer. */
  data?: TData;
  /** Whether the error is part of the procedure's typed error union. */
  defined?: boolean | undefined;
  /** Never sent to the client. */
  cause?: unknown;
}

/** The option key `failure()` sets a reason with; users can't. @internal */
export const REASON: unique symbol = Symbol.for('@trpc12/trpc/ErrorReason');

const YieldableBase: new (args: {
  message: string;
  cause?: unknown;
}) => Cause.YieldableError = Data.Error as never;

/**
 * The one error type, on the server and on the client.
 *
 * Return it (or `yield*` it in an Effect) from a resolver or middleware and
 * it becomes part of the procedure's typed error union, `defined: true` on
 * the client. Anything thrown is `defined: false`, with a built-in code and
 * no `data`: a thrown `TrpcError` with a custom code, and any other thrown
 * value, become `INTERNAL_SERVER_ERROR`, and their message is masked in
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
 * if (err) {
 *   if (err.defined && err.code === 'NOT_FOUND') return `No post ${err.data.id}`;
 *   return err.message;
 * }
 * post.title; // no `undefined` once the error is handled
 * ```
 * @since 0.1.0
 * @stability stable
 */
export class TrpcError<
  TCode extends string = string,
  TData = unknown,
> extends YieldableBase {
  override readonly name = 'TrpcError';
  /** The code, so `Effect.catchTag('NOT_FOUND', …)` narrows on it. */
  readonly _tag: TCode;
  readonly code: TCode;
  readonly data: TData;
  readonly defined: boolean;
  /**
   * Why tRPC failed the call, when tRPC made the error
   * (`Predicate.isTagged(err.reason, 'BodyTooLarge')`). Never sent across a
   * wire.
   */
  declare readonly reason?: TrpcErrorReason;

  constructor(opts: TrpcErrorOptions<TCode, TData>) {
    super({
      message: opts.message ?? opts.code,
      ...(opts.cause === undefined ? {} : { cause: opts.cause }),
    });
    this._tag = opts.code;
    this.code = opts.code;
    this.data = opts.data as TData;
    this.defined = opts.defined ?? false;
    const reason = (opts as { [REASON]?: TrpcErrorReason })[REASON];
    if (reason !== undefined) this.reason = reason;
  }

  /**
   * A public error class: yield or throw it and it reaches the client as a
   * typed error, with no mapping. Its `_tag` is its code and its `data` is
   * validated with the schema before it is sent. Errors that aren't marked
   * public stay masked.
   *
   * @example
   * ```ts
   * class PostNotFound extends TrpcError.Tagged('POST_NOT_FOUND', {
   *   status: 404,
   *   data: Schema.Struct({ id: Schema.String }),
   * }) {}
   *
   * t.procedure.query(({ input }) =>
   *   Effect.gen(function* () {
   *     const post = yield* db.find(input.id);
   *     if (!post) return yield* new PostNotFound({ id: input.id });
   *     return post;
   *   }),
   * );
   * ```
   */
  static Tagged<
    const TCode extends string,
    TSchema extends AnySchema | undefined = undefined,
    const TStatus extends number | undefined = undefined,
  >(
    code: TCode,
    spec: TaggedErrorSpec<TSchema, TStatus> = {},
  ): TaggedErrorClass<TCode, TSchema, TStatus> {
    const hasData = spec.data !== undefined;
    class Tagged extends TrpcError<TCode, unknown> {
      static readonly [TAGGED] = true;
      static readonly code = code;
      static readonly data = spec.data;
      static readonly status = spec.status;
      static readonly message = spec.message;
      constructor(...args: unknown[]) {
        const opts = (hasData ? args[1] : args[0]) as
          | TaggedErrorOptions
          | undefined;
        super({
          code,
          data: hasData ? args[0] : undefined,
          message: opts?.message ?? spec.message,
          cause: opts?.cause,
          defined: true,
        });
      }
    }
    return Tagged as unknown as TaggedErrorClass<TCode, TSchema, TStatus>;
  }
}

const TAGGED: unique symbol = Symbol.for('@trpc12/trpc/TaggedError');

/**
 * The options of a {@link TrpcError.Tagged} class.
 * @since 0.1.0
 * @stability stable
 */
export interface TaggedErrorSpec<
  TSchema,
  TStatus extends number | undefined = number | undefined,
> {
  /** Validates the error's `data`, and documents it in OpenAPI. */
  readonly data?: TSchema;
  /**
   * The HTTP status the RPC and OpenAPI handlers answer with. Kept as a
   * literal type, so the TypeScript OpenAPI generator sees it. Instances
   * don't carry it. @default the code's built-in status, or 400
   */
  readonly status?: TStatus;
  readonly message?: string | undefined;
}

/**
 * What a {@link TrpcError.Tagged} instance takes besides its `data`.
 * @since 0.1.0
 * @stability stable
 */
export interface TaggedErrorOptions {
  readonly message?: string | undefined;
  /** Never sent to the client. */
  readonly cause?: unknown;
}

/**
 * The `data` type of a {@link TrpcError.Tagged} class.
 * @since 0.1.0
 * @stability stable
 */
export type TaggedData<TSchema> = [TSchema] extends [AnySchema]
  ? OutOf<TSchema>
  : undefined;

/**
 * A class made by {@link TrpcError.Tagged}. Its statics make it an error
 * spec, so `.errors({ POST_NOT_FOUND: PostNotFound })` documents it too.
 * @since 0.1.0
 * @stability stable
 */
export interface TaggedErrorClass<
  TCode extends string,
  TSchema,
  TStatus extends number | undefined = number | undefined,
> {
  new (
    ...args: [TSchema] extends [AnySchema]
      ? [data: OutOf<TSchema>, opts?: TaggedErrorOptions]
      : [opts?: TaggedErrorOptions]
  ): TrpcError<TCode, TaggedData<TSchema>> & {
    /** Type only: the class's status, for the TypeScript OpenAPI generator. */
    readonly '~status'?: TStatus;
  };
  readonly code: TCode;
  readonly data: TSchema;
  readonly status: TStatus;
  readonly message: string | undefined;
}

/** The class spec of a {@link TrpcError.Tagged} instance, if it is one. @internal */
export function taggedSpec(err: AnyTrpcError):
  | {
      readonly data?: AnySchema | undefined;
      readonly status?: number | undefined;
    }
  | undefined {
  const ctor = err.constructor as {
    [TAGGED]?: true;
    data?: AnySchema;
    status?: number;
  };
  return ctor[TAGGED] ? ctor : undefined;
}

const statusHints = new WeakMap<AnyTrpcError, number>();

/**
 * Gives an error rebuilt from storage the status it had, for
 * {@link statusOf}. The instance itself doesn't carry it.
 * @internal
 */
export function withStatusHint<E extends AnyTrpcError>(
  err: E,
  status: number,
): E {
  statusHints.set(err, status);
  return err;
}

/**
 * The HTTP status for `err`: the procedure's declared spec for its code, the
 * status it was kept with, its {@link TrpcError.Tagged} class's, the code's
 * built-in status, or 400.
 * @internal
 */
export function statusOf(
  err: AnyTrpcError,
  declared?: Readonly<Record<string, { readonly status?: number | undefined }>>,
): number {
  return (
    declared?.[err.code]?.status ??
    statusHints.get(err) ??
    taggedSpec(err)?.status ??
    (ERROR_STATUS as Record<string, number>)[err.code] ??
    400
  );
}

/**
 * Any {@link TrpcError}.
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
 */
export function error<const TCode extends string, TData = undefined>(
  opts: Omit<TrpcErrorOptions<TCode, TData>, 'defined'>,
): TrpcError<TCode, TData> {
  return new TrpcError({ ...opts, defined: true });
}

/**
 * The built-in code for an HTTP status that isn't a tRPC error body (a
 * proxy's 502, say), if there is one.
 * @internal
 */
export function codeOfStatus(status: number): BuiltinErrorCode | undefined {
  if (status < 400) return undefined;
  const codes = Object.keys(ERROR_STATUS) as BuiltinErrorCode[];
  return codes.find((code) => ERROR_STATUS[code] === status);
}

/**
 * Whether `err` stands for the server failing or no response (a 5xx or a
 * client-side code), which links may retry. A `BAD_RESPONSE` arrived, and
 * reading it again would fail the same way.
 * @internal
 */
export function serverFailure(err: AnyTrpcError): boolean {
  if (err.code === 'BAD_RESPONSE') return false;
  const status = statusOf(err);
  return status === 0 || status >= 500;
}

/**
 * Whether `value` is a {@link TrpcError}.
 *
 * @example
 * ```ts
 * if (isTrpcError(cause)) cause.code;
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function isTrpcError(value: unknown): value is AnyTrpcError {
  return value instanceof TrpcError;
}

/** Whether `value` carries a string `digest`, React's and Next's mark. */
export const hasDigest = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { digest?: unknown }).digest === 'string';

/**
 * The framework control-flow error an in-process call wrapped, if any:
 * Next's `redirect()`, `notFound()` and dynamic-API bailouts carry a string
 * `digest` and must reach the framework unchanged. Errors that crossed a
 * wire have no such cause.
 * @internal
 */
export function frameworkError(err: AnyTrpcError): unknown {
  return hasDigest(err.cause) ? err.cause : undefined;
}

/**
 * Narrows a client error to the procedure's typed union.
 *
 * @example
 * ```ts
 * if (isDefinedError(err)) err.code; // the procedure's codes only
 * ```
 * @since 0.1.0
 * @stability stable
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
  return withStatusHint(
    new TrpcError({
      code: err.code,
      message: err.message,
      data: err.data,
      defined,
      cause: err.cause,
      ...reasonOption(err),
    }),
    statusOf(err),
  ) as E;
}

const reasonOption = (err: AnyTrpcError): { [REASON]?: TrpcErrorReason } =>
  err.reason === undefined ? {} : { [REASON]: err.reason };

/**
 * `err` as clients type it. Defined errors stay as they are. Anything else
 * keeps a built-in code but not its `data`, which no schema checked; a
 * custom code becomes `fallback`, with `err` as the cause.
 * @internal
 */
export function toBuiltinError(
  err: AnyTrpcError,
  fallback: BuiltinErrorCode,
): AnyTrpcError {
  if (err.defined || (err.data === undefined && isBuiltinCode(err.code))) {
    return err;
  }
  return new TrpcError({
    code: isBuiltinCode(err.code) ? err.code : fallback,
    message: err.message,
    cause: err,
    ...reasonOption(err),
  });
}

/**
 * The JSON shape of an error on the wire.
 * @since 0.1.0
 * @stability stable
 */
export interface WireError {
  error: { code: string; message: string; data?: unknown; defined: boolean };
}

/**
 * @since 0.1.0
 * @stability stable
 */
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

/**
 * Rebuilds a {@link TrpcError} from a deserialized error body. An undefined
 * error with a custom code (a server that doesn't mask them) becomes
 * `INTERNAL_SERVER_ERROR`.
 * @since 0.1.0
 * @stability stable
 */
export function fromWireError(body: unknown): TrpcError {
  const inner = isRecord(body) && isRecord(body['error']) ? body['error'] : {};
  const code =
    typeof inner['code'] === 'string' ? inner['code'] : 'INTERNAL_SERVER_ERROR';
  return toBuiltinError(
    new TrpcError({
      code,
      message: typeof inner['message'] === 'string' ? inner['message'] : code,
      data: inner['data'],
      defined: inner['defined'] === true,
    }),
    'INTERNAL_SERVER_ERROR',
  ) as TrpcError;
}
