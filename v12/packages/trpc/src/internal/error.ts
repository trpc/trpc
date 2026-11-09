import { Data } from 'effect';
import type * as Cause from 'effect/Cause';
import type { AnySchema, OutOf } from '../server/validation/index.ts';

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
   * `experimental_validationLink`'s check.
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
 * The code of an `UndeclaredError`: a custom code the types don't know.
 * Type only: no literal matches the pattern, so `case 'NOT_FOUND':` and
 * `err.code === 'NOT_FOUND'` leave it out. At runtime it is the code sent.
 * @since 0.1.0
 * @stability stable
 */
export type UndeclaredCode = `~undeclared:${string}`;

/**
 * A type error when `TCode` is `unexpected`: that is `matchError()`'s
 * catch-all key, and a defined error with that code would share it.
 * @since 0.1.0
 * @stability stable
 */
export type ReservedCodeCheck<TCode extends string> = 'unexpected' extends TCode
  ? string extends TCode
    ? unknown
    : { readonly '~reserved': ReservedCodeMessage }
  : unknown;

/**
 * {@link ReservedCodeCheck} for an error map's keys.
 * @since 0.1.0
 * @stability stable
 */
export interface ReservedKeyCheck {
  readonly unexpected?: ReservedCodeMessage;
}

/**
 * The message of {@link ReservedCodeCheck}.
 * @since 0.1.0
 * @stability stable
 */
export type ReservedCodeMessage =
  "'unexpected' is matchError()'s catch-all key: name this code something else";

/**
 * The `_tag` of each built-in code's class, its name: `NOT_FOUND` is
 * `TrpcError.NotFound`, tagged `NotFound`.
 * @since 0.1.0
 * @stability stable
 */
export interface CodeTags {
  PARSE_ERROR: 'ParseError';
  BAD_REQUEST: 'BadRequest';
  UNSUPPORTED_PROTOCOL: 'UnsupportedProtocol';
  UNAUTHORIZED: 'Unauthorized';
  PAYMENT_REQUIRED: 'PaymentRequired';
  FORBIDDEN: 'Forbidden';
  NOT_FOUND: 'NotFound';
  METHOD_NOT_SUPPORTED: 'MethodNotSupported';
  TIMEOUT: 'Timeout';
  CONFLICT: 'Conflict';
  PRECONDITION_FAILED: 'PreconditionFailed';
  PAYLOAD_TOO_LARGE: 'PayloadTooLarge';
  UNSUPPORTED_MEDIA_TYPE: 'UnsupportedMediaType';
  UNPROCESSABLE_CONTENT: 'UnprocessableContent';
  TOO_MANY_REQUESTS: 'TooManyRequests';
  CLIENT_CLOSED_REQUEST: 'ClientClosedRequest';
  INTERNAL_SERVER_ERROR: 'InternalServerError';
  NOT_IMPLEMENTED: 'NotImplemented';
  BAD_GATEWAY: 'BadGateway';
  SERVICE_UNAVAILABLE: 'ServiceUnavailable';
  GATEWAY_TIMEOUT: 'GatewayTimeout';
  NETWORK_ERROR: 'NetworkError';
  BAD_RESPONSE: 'BadResponse';
  CLIENT_ERROR: 'ClientError';
  STREAM_INTERRUPTED: 'StreamInterrupted';
}

/**
 * The failures tRPC tells apart within a built-in code, each with its own
 * `_tag`, by the code it has. A failure that is just its code's meaning is
 * that code's class (`PayloadTooLarge` for a body over `maxBodySize`).
 * Clients see only {@link ClientTags}; the rest arrive as their code's
 * class.
 * @since 0.1.0
 * @stability stable
 */
export interface FailureTags extends ClientTags {
  /** A URL outside the endpoint, or no OpenAPI route for it. */
  RouteNotFound: 'NOT_FOUND';
  /** A batch with more calls than the handler's `batch.maxItems`. */
  BatchTooLarge: 'PAYLOAD_TOO_LARGE';
  /** A batch sent to a handler without `batch`. */
  BatchingDisabled: 'BAD_REQUEST';
  /** A batch body that isn't an array, or a batched subscription. */
  InvalidBatch: 'BAD_REQUEST';
  /** A request body or byte stream that failed while it was read. */
  UnreadableBody: 'BAD_REQUEST';
  /** A byte stream input read a second time. */
  ByteStreamConsumed: 'BAD_REQUEST';
  /** A body a middleware mounted before tRPC read without keeping it. */
  BodyConsumed: 'INTERNAL_SERVER_ERROR';
  /** A body that isn't JSON, multipart or a form, or doesn't decode. */
  InvalidBody: 'PARSE_ERROR';
  /** A multipart body without its `input` field. */
  MissingInputField: 'BAD_REQUEST';
  /** An OpenAPI path param that isn't valid, or doesn't fit the body. */
  InvalidPathParam: 'BAD_REQUEST';
  /** A cross-site OpenAPI request without a JSON content type. */
  CrossSiteRequest: 'FORBIDDEN';
  /** A socket message that isn't one. */
  InvalidMessage: 'PARSE_ERROR';
  /** A socket message of an unknown type. */
  UnknownMessage: 'BAD_REQUEST';
  /** A socket request without a unique numeric id. */
  InvalidRequestId: 'BAD_REQUEST';
  /** A contract procedure without an implementation. */
  ProcedureNotImplemented: 'NOT_IMPLEMENTED';
  /** A `Response`, or a streamed durable replay, over a transport that can't carry it. */
  UnsupportedResponse: 'BAD_REQUEST';
  /** An output that failed its schema. */
  InvalidOutput: 'INTERNAL_SERVER_ERROR';
  /** `experimental_durable()`: a call id reused with another input. */
  CallIdConflict: 'CONFLICT';
  /** `experimental_durable()`: a malformed call id or resume header. */
  InvalidDurableHeader: 'BAD_REQUEST';
  /** `experimental_connectionToken()`: a missing, malformed or forged token. */
  InvalidConnectionToken: 'UNAUTHORIZED';
  /** `experimental_connectionToken()`: a token past its `ttl`. */
  ConnectionTokenExpired: 'UNAUTHORIZED';
  /** An input that failed its schema: defined, with `data.issues`. */
  InvalidInput: 'BAD_REQUEST';
}

/**
 * The failures in {@link FailureTags} that reach clients with their tag,
 * since a client acts on them: the server sends the first two, links make
 * the third. Everything else arrives as its code's class.
 * @since 0.1.0
 * @stability stable
 */
export interface ClientTags {
  /** The server has no procedure at the path: the client is newer than the server, so reload. */
  ProcedureNotFound: 'NOT_FOUND';
  /** The procedure is a query on the server and a mutation on the client, or the other way: reload. */
  ProcedureTypeMismatch: 'METHOD_NOT_SUPPORTED';
  /** The server and the link use different transformers. */
  TransformerMismatch: 'UNSUPPORTED_PROTOCOL';
}

/**
 * Every `_tag` a built-in code's errors can have: its class's and its
 * {@link FailureTags}.
 * @since 0.1.0
 * @stability stable
 */
export type BuiltinTag<TCode extends BuiltinErrorCode = BuiltinErrorCode> =
  | CodeTags[TCode]
  | {
      [T in keyof FailureTags]: FailureTags[T] extends TCode ? T : never;
    }[keyof FailureTags];

/**
 * The `_tag` an error with code `TCode` has unless it names another: a
 * built-in code's class name, or the code itself.
 * @since 0.1.0
 * @stability stable
 */
export type TagOfCode<TCode extends string> = TCode extends BuiltinErrorCode
  ? CodeTags[TCode]
  : TCode;

/**
 * Instances of the built-in classes for `TCode`, one member per code, so
 * `Effect.catchTag` takes them one at a time:
 * `CodeError<'PARSE_ERROR' | 'PAYLOAD_TOO_LARGE'>`.
 * @since 0.1.0
 * @stability stable
 */
export type CodeError<TCode extends BuiltinErrorCode> =
  TCode extends BuiltinErrorCode ? TrpcError<TCode, undefined> : never;

/**
 * The error of a failure in {@link FailureTags}, one member per tag:
 * `Failure<'ProcedureNotFound'>` is a `NOT_FOUND` tagged
 * `ProcedureNotFound`.
 * @since 0.1.0
 * @stability stable
 */
export type Failure<TTag extends keyof FailureTags> = TTag extends unknown
  ? TrpcError<FailureTags[TTag], undefined, TTag>
  : never;

/**
 * A class for a built-in code, like `TrpcError.NotFound`. Its instances are
 * `TrpcError<TCode, undefined>`, tagged with the class's name unless `tag`
 * names one of the code's {@link FailureTags}; `defined: false` until a
 * resolver returns one.
 * @since 0.1.0
 * @stability stable
 */
export interface BuiltinErrorClass<TCode extends BuiltinErrorCode> {
  new <TTag extends BuiltinTag<TCode> = CodeTags[TCode]>(
    opts?: BuiltinErrorOptions<TTag>,
  ): TrpcError<TCode, undefined, TTag>;
  readonly code: TCode;
}

/**
 * What a {@link BuiltinErrorClass} takes.
 * @since 0.1.0
 * @stability stable
 */
export interface BuiltinErrorOptions<
  TTag extends string = string,
> extends TaggedErrorOptions {
  /** One of the code's {@link FailureTags}. @default the class's name */
  readonly tag?: TTag | undefined;
}

/**
 * Options for {@link TrpcError} and {@link error}.
 * @since 0.1.0
 * @stability stable
 */
export interface TrpcErrorOptions<
  TCode extends string,
  TData,
  TTag extends string = string,
> {
  /** A built-in code (`'NOT_FOUND'`) or a custom one (`'PAYMENT_REQUIRED'`). */
  code: TCode;
  /**
   * The `_tag`, naming this failure. @default a built-in code's class name
   * (`NotFound`), or the code
   */
  tag?: TTag | undefined;
  message?: string | undefined;
  /** Sent to the client, serialized with the endpoint's transformer. */
  data?: TData;
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
 * the client. A thrown one is `defined: false`: a built-in code loses its
 * `data`, and a custom code keeps both, unless the procedure declares its
 * errors with `.errors()` and not this one, which makes it
 * `INTERNAL_SERVER_ERROR`. Any other thrown value is `INTERNAL_SERVER_ERROR`
 * too, its message masked in production.
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
  TTag extends string = TagOfCode<TCode>,
> extends YieldableBase {
  override readonly name = 'TrpcError';
  /**
   * What failed, so `Effect.catchTag('ProcedureNotFound', …)` takes this
   * failure alone. Several tags can share a `code`.
   */
  readonly _tag: TTag;
  /** The HTTP-like code, which `switch`, `matchError()` and the wire use. */
  readonly code: TCode;
  readonly data: TData;
  readonly defined: boolean;

  constructor(opts: TrpcErrorOptions<TCode, TData, TTag>) {
    super({
      message: opts.message ?? opts.code,
      ...(opts.cause === undefined ? {} : { cause: opts.cause }),
    });
    this._tag = (opts.tag ?? defaultTag(opts.code)) as TTag;
    this.code = opts.code;
    this.data = opts.data as TData;
    this.defined = opts.defined ?? false;
  }

  /** `PARSE_ERROR`: the server couldn't parse the request. */
  declare static readonly ParseError: BuiltinErrorClass<'PARSE_ERROR'>;
  /** `BAD_REQUEST`. */
  declare static readonly BadRequest: BuiltinErrorClass<'BAD_REQUEST'>;
  /** `UNSUPPORTED_PROTOCOL`: a request in a protocol the server doesn't speak. */
  declare static readonly UnsupportedProtocol: BuiltinErrorClass<'UNSUPPORTED_PROTOCOL'>;
  /** `UNAUTHORIZED`. */
  declare static readonly Unauthorized: BuiltinErrorClass<'UNAUTHORIZED'>;
  /** `PAYMENT_REQUIRED`. */
  declare static readonly PaymentRequired: BuiltinErrorClass<'PAYMENT_REQUIRED'>;
  /** `FORBIDDEN`. */
  declare static readonly Forbidden: BuiltinErrorClass<'FORBIDDEN'>;
  /** `NOT_FOUND`, also what a call to a procedure the server lacks gets. */
  declare static readonly NotFound: BuiltinErrorClass<'NOT_FOUND'>;
  /** `METHOD_NOT_SUPPORTED`: the wrong HTTP method for the procedure. */
  declare static readonly MethodNotSupported: BuiltinErrorClass<'METHOD_NOT_SUPPORTED'>;
  /** `TIMEOUT`: a server's `408`, or the call's `signal` timed out (`AbortSignal.timeout()`). */
  declare static readonly Timeout: BuiltinErrorClass<'TIMEOUT'>;
  /** `CONFLICT`. */
  declare static readonly Conflict: BuiltinErrorClass<'CONFLICT'>;
  /** `PRECONDITION_FAILED`. */
  declare static readonly PreconditionFailed: BuiltinErrorClass<'PRECONDITION_FAILED'>;
  /** `PAYLOAD_TOO_LARGE`: a body over the handler's `maxBodySize`. */
  declare static readonly PayloadTooLarge: BuiltinErrorClass<'PAYLOAD_TOO_LARGE'>;
  /** `UNSUPPORTED_MEDIA_TYPE`: a body in a content type the server can't read. */
  declare static readonly UnsupportedMediaType: BuiltinErrorClass<'UNSUPPORTED_MEDIA_TYPE'>;
  /** `UNPROCESSABLE_CONTENT`. */
  declare static readonly UnprocessableContent: BuiltinErrorClass<'UNPROCESSABLE_CONTENT'>;
  /** `TOO_MANY_REQUESTS`. */
  declare static readonly TooManyRequests: BuiltinErrorClass<'TOO_MANY_REQUESTS'>;
  /** `CLIENT_CLOSED_REQUEST`: the call's `signal` aborted it, for any reason but a timeout. */
  declare static readonly ClientClosedRequest: BuiltinErrorClass<'CLIENT_CLOSED_REQUEST'>;
  /** `INTERNAL_SERVER_ERROR`: a crash, masked in production. */
  declare static readonly InternalServerError: BuiltinErrorClass<'INTERNAL_SERVER_ERROR'>;
  /** `NOT_IMPLEMENTED`. */
  declare static readonly NotImplemented: BuiltinErrorClass<'NOT_IMPLEMENTED'>;
  /** `BAD_GATEWAY`. */
  declare static readonly BadGateway: BuiltinErrorClass<'BAD_GATEWAY'>;
  /** `SERVICE_UNAVAILABLE`. */
  declare static readonly ServiceUnavailable: BuiltinErrorClass<'SERVICE_UNAVAILABLE'>;
  /** `GATEWAY_TIMEOUT`. */
  declare static readonly GatewayTimeout: BuiltinErrorClass<'GATEWAY_TIMEOUT'>;
  /** `NETWORK_ERROR`, client-side: the request got no response. */
  declare static readonly NetworkError: BuiltinErrorClass<'NETWORK_ERROR'>;
  /** `BAD_RESPONSE`, client-side: a response the client couldn't read. */
  declare static readonly BadResponse: BuiltinErrorClass<'BAD_RESPONSE'>;
  /** `CLIENT_ERROR`, client-side: a link failed. */
  declare static readonly ClientError: BuiltinErrorClass<'CLIENT_ERROR'>;
  /** `STREAM_INTERRUPTED`, client-side: a stream stopped without an end. */
  declare static readonly StreamInterrupted: BuiltinErrorClass<'STREAM_INTERRUPTED'>;

  /**
   * A public error class: yield or throw it and it reaches the client as a
   * typed error, with no mapping. Its `_tag` is `tag` (a built-in code's is
   * its class name: `Tagged('NOT_FOUND')` is tagged `NotFound`), its `code`
   * is `spec.code` (`tag` without one), and its `data` is validated with the
   * schema before it is sent. Errors that aren't marked public stay masked.
   *
   * @example
   * ```ts
   * class PostNotFound extends TrpcError.Tagged('PostNotFound', {
   *   code: 'NOT_FOUND',
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
    const TTag extends string,
    TSchema extends AnySchema | undefined = undefined,
    const TStatus extends number | undefined = undefined,
    const TCode extends string = TTag,
  >(
    tag: TTag extends 'unexpected' ? ReservedCodeMessage : TTag,
    spec: TaggedErrorSpec<TSchema, TStatus, TCode> = {},
  ): TaggedErrorClass<TCode, TSchema, TStatus, TagOfCode<TTag>> {
    const hasData = spec.data !== undefined;
    const code = spec.code ?? tag;
    tag = defaultTag(tag) as typeof tag;
    class Tagged extends TrpcError<string, unknown, string> {
      static readonly [TAGGED] = true;
      static readonly code = code;
      static readonly tag = tag;
      static readonly data = spec.data;
      static readonly status = spec.status;
      static readonly message = spec.message;
      constructor(...args: unknown[]) {
        const opts = (hasData ? args[1] : args[0]) as
          | TaggedErrorOptions
          | undefined;
        super({
          code,
          tag,
          data: hasData ? args[0] : undefined,
          message: opts?.message ?? spec.message,
          cause: opts?.cause,
          defined: true,
        });
      }
    }
    return Tagged as unknown as TaggedErrorClass<
      TCode,
      TSchema,
      TStatus,
      TagOfCode<TTag>
    >;
  }
}

const codeTag = (code: string): string =>
  code.replace(
    /_?(\w)([A-Z]*)/g,
    (_, first: string, rest: string) => first + rest.toLowerCase(),
  );

/**
 * The `_tag` of an error with `code` that names no other: a built-in code's
 * class name (`NotFound`), or the code.
 * @internal
 */
export const defaultTag = (code: string): string =>
  isBuiltinCode(code) ? codeTag(code) : code;

// Named from the code (`PAYLOAD_TOO_LARGE` is `PayloadTooLarge`) so clients
// don't ship 25 names.
for (const code of Object.keys(ERROR_STATUS) as BuiltinErrorCode[]) {
  (TrpcError as unknown as Record<string, unknown>)[codeTag(code)] =
    class extends TrpcError<BuiltinErrorCode, undefined, string> {
      static readonly code = code;
      constructor(opts?: BuiltinErrorOptions) {
        super({ ...opts, code });
      }
    };
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
  TCode extends string = string,
> {
  /**
   * The code clients `switch` and `matchError()` on, and the wire carries.
   * @default the tag
   */
  readonly code?: TCode;
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
  TTag extends string = TagOfCode<TCode>,
> {
  new (
    ...args: [TSchema] extends [AnySchema]
      ? [data: OutOf<TSchema>, opts?: TaggedErrorOptions]
      : [opts?: TaggedErrorOptions]
  ): TrpcError<TCode, TaggedData<TSchema>, TTag> & {
    /** Type only: the class's status, for the TypeScript OpenAPI generator. */
    readonly '~status'?: TStatus;
  };
  readonly code: TCode;
  readonly tag: TTag;
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
  opts: Omit<TrpcErrorOptions<TCode, TData>, 'defined' | 'tag'> &
    ReservedCodeCheck<TCode>,
): TrpcError<TCode, TData> {
  return new TrpcError<TCode, TData>({ ...opts, defined: true });
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

/**
 * A refinement for errors with `code`, whatever their `_tag`, for Effect's
 * `catchIf` and `filter`: `Effect.catchIf(hasCode('NOT_FOUND'), …)` takes
 * every `NOT_FOUND` (a declared one, a thrown one, `ProcedureNotFound`) out
 * of the error channel.
 *
 * @example
 * ```ts
 * client.post.byId.query({ id }).pipe(
 *   Effect.catchIf(hasCode('NOT_FOUND'), () => Effect.succeed(null)),
 * );
 * ```
 * @since 0.1.0
 * @stability stable
 */
export const hasCode =
  <const TCode extends string>(code: TCode) =>
  <E>(err: E): err is Extract<E, { readonly code: TCode }> =>
    isTrpcError(err) && err.code === code;

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
 * Whether `value` is an `Error`, also one made in another realm (`node:vm`,
 * an iframe), which fails `instanceof Error`.
 * @internal
 */
export const isErrorLike = (value: unknown): value is Error =>
  value instanceof Error ||
  Object.prototype.toString.call(value) === '[object Error]';

const isTimeoutReason = (reason: unknown) =>
  reason instanceof Error && reason.name === 'TimeoutError';

/**
 * Whether `cause` is what an aborted `fetch` rejects with: the signal's
 * reason, an `AbortError` or `AbortSignal.timeout()`'s `TimeoutError`.
 * @internal
 */
export const isAbortReason = (cause: unknown): boolean =>
  isTimeoutReason(cause) ||
  (cause instanceof Error && cause.name === 'AbortError');

/**
 * What a call its signal aborted with `reason` fails with: `TIMEOUT` for
 * `AbortSignal.timeout()`'s `TimeoutError`, `CLIENT_CLOSED_REQUEST` for
 * anything else. The reason is its `cause`.
 * @internal
 */
export function abortedError(reason: unknown): AnyTrpcError {
  return isTimeoutReason(reason)
    ? new TrpcError({
        code: 'TIMEOUT',
        message: 'The request timed out',
        cause: reason,
      })
    : new TrpcError({
        code: 'CLIENT_CLOSED_REQUEST',
        message: 'The request was aborted',
        cause: reason,
      });
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
      tag: err._tag,
      message: err.message,
      data: err.data,
      defined,
      cause: err.cause,
    }),
    statusOf(err),
  ) as E;
}

const CLIENT_TAGS: { readonly [T in keyof ClientTags]: ClientTags[T] } = {
  ProcedureNotFound: 'NOT_FOUND',
  ProcedureTypeMismatch: 'METHOD_NOT_SUPPORTED',
  TransformerMismatch: 'UNSUPPORTED_PROTOCOL',
};

/** Whether an undefined error with `code` keeps `tag` on a client. */
const isClientTag = (tag: string, code: string): boolean =>
  tag === defaultTag(code) ||
  (Object.hasOwn(CLIENT_TAGS, tag) &&
    CLIENT_TAGS[tag as keyof ClientTags] === code);

/**
 * `err` as clients type it. Defined errors and custom codes stay as they
 * are: a server only sends an undefined custom code from a procedure that
 * declares no errors. A built-in code loses its `data`, which no schema
 * checked, and a tag clients don't see ({@link ClientTags}), keeping `err`
 * as the cause.
 * @internal
 */
export function toUntypedError(err: AnyTrpcError): AnyTrpcError {
  if (!err.defined && !isBuiltinCode(err.code)) return keepUntyped(err);
  const tagged = isClientTag(err._tag, err.code);
  if (err.defined || (err.data === undefined && tagged)) return err;
  return new TrpcError({
    code: err.code,
    tag: tagged ? err._tag : undefined,
    message: err.message,
    cause: err,
  });
}

const keptUntyped = new WeakSet<AnyTrpcError>();

/**
 * Marks an undefined error with a custom code that a server sends as it
 * is, so links don't fold it into `CLIENT_ERROR` like their own.
 * @internal
 */
export function keepUntyped<E extends AnyTrpcError>(err: E): E {
  keptUntyped.add(err);
  return err;
}

/** Whether {@link keepUntyped} marked `err`. @internal */
export const isKeptUntyped = (err: AnyTrpcError): boolean =>
  keptUntyped.has(err);

/**
 * The JSON shape of an error on the wire.
 * @since 0.1.0
 * @stability stable
 */
export interface WireError {
  error: {
    code: string;
    /** Only when it isn't the code's default and the client keeps it. */
    tag?: string;
    message: string;
    data?: unknown;
    defined: boolean;
  };
}

/**
 * The `_tag` the wire carries for `err`, when a client can't rebuild it from
 * the code: a defined error's own tag, or one of {@link ClientTags}.
 * @internal
 */
export const wireTag = (err: AnyTrpcError): string | undefined =>
  err._tag !== defaultTag(err.code) &&
  (err.defined || isClientTag(err._tag, err.code))
    ? err._tag
    : undefined;

/**
 * @since 0.1.0
 * @stability stable
 */
export function toWireError(err: AnyTrpcError): WireError {
  const tag = wireTag(err);
  return {
    error: {
      code: err.code,
      ...(tag === undefined ? {} : { tag }),
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
 * error with a built-in code loses its `data`; one with a custom code keeps
 * both, untyped.
 * @since 0.1.0
 * @stability stable
 */
export function fromWireError(body: unknown): TrpcError {
  const inner = isRecord(body) && isRecord(body['error']) ? body['error'] : {};
  const code =
    typeof inner['code'] === 'string' ? inner['code'] : 'INTERNAL_SERVER_ERROR';
  return toUntypedError(
    new TrpcError({
      code,
      tag: typeof inner['tag'] === 'string' ? inner['tag'] : undefined,
      message: typeof inner['message'] === 'string' ? inner['message'] : code,
      data: inner['data'],
      defined: inner['defined'] === true,
    }),
  ) as TrpcError;
}

/**
 * What a streamed value rejects with when its stream dies or ends early,
 * for `Transformer.deserializeStream`.
 * @internal
 */
export const streamErrors = {
  streamFailed: (cause: unknown): CodeError<'INTERNAL_SERVER_ERROR'> =>
    new TrpcError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Stream failed',
      cause,
    }),
  streamInterrupted: (): CodeError<'STREAM_INTERRUPTED'> =>
    new TrpcError({
      code: 'STREAM_INTERRUPTED',
      message: 'Stream interrupted',
    }),
};
