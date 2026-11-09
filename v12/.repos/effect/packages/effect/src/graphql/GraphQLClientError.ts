/**
 * Serializable GraphQL client errors with an operation name and a
 * `Schema.TaggedError` reason.
 *
 * @stability experimental
 * @since 4.0.0
 */
import type * as Duration from "../Duration.ts"
import type * as Headers from "../http/Headers.ts"
import type * as HttpClientError from "../http/HttpClientError.ts"
import { HeadersSchema, parseRetryAfter } from "../internal/graphqlHeaders.ts"
import { hasProperty } from "../Predicate.ts"
import * as Schema from "../Schema.ts"

const TypeId = "~effect/graphql/GraphQLClientError"

/**
 * One entry of a GraphQL response's `errors` array, as described by the
 * GraphQL specification.
 *
 * **Details**
 *
 * `path[0]` is the response key the error belongs to, which is the alias when
 * the document used one, so callers can match an error to the field it hit.
 * Unknown top-level fields are preserved as JSON values, including GitHub's
 * `type` field.
 *
 * **Example** (Finding which alias an error belongs to)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { GraphQLClientError } from "effect/graphql"
 *
 * const error = Schema.decodeUnknownSync(GraphQLClientError.GraphQLError)({
 *   message: "Could not resolve to a Repository",
 *   path: ["missing", "issues"],
 *   type: "NOT_FOUND"
 * })
 *
 * error.path?.[0] // => "missing"
 * ```
 *
 * @stability experimental
 * @category schemas
 * @since 4.0.0
 */
export const GraphQLError = Schema.StructWithRest(
  Schema.Struct({
    message: Schema.String,
    locations: Schema.optional(Schema.Array(Schema.Struct({ line: Schema.Number, column: Schema.Number }))),
    path: Schema.optional(Schema.Array(Schema.Union([Schema.String, Schema.Number]))),
    extensions: Schema.optional(Schema.Record(Schema.String, Schema.Json))
  }),
  [Schema.Record(Schema.String, Schema.Json)]
)

/**
 * The decoded type of {@link GraphQLError}.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export type GraphQLError = typeof GraphQLError.Type

/**
 * The server answered with a non-empty `errors` array.
 *
 * **Details**
 *
 * Queries and mutations fail even when partial `data` is present, since a
 * field error's `null` cannot be distinguished from a genuine `null`. Use
 * `{ partial: true }` to receive decoded `{ data, errors }` instead.
 *
 * On this error, `data` is raw. `GraphQLError.path[0]` identifies the response
 * key (or alias). Non-2xx HTTP responses with a GraphQL body and `errors`
 * also use this reason rather than `TransportError`, even when they carry
 * `data` and the call used `{ partial: true }`.
 *
 * `status` and `headers` are the HTTP status and response headers, as the
 * transport reported them and middleware left them. Headers use
 * `Headers.Headers` at runtime and encode as a plain string record.
 * Decoding restores the normalized header collection. Both are unset over
 * graphql-ws, and `status` is unset for graphql-sse events. `retryAfter`
 * parses the `Retry-After` response header as whole seconds or an HTTP date,
 * measured from `Date.now()` when the error is constructed. `isRetryable` is
 * true for HTTP status `429` or `500`–`599`, and for any response with a
 * valid `Retry-After`, whatever its status. It is false otherwise, including
 * when there is no status.
 *
 * For queries and mutations, callers opt into retries with `Effect.retry`,
 * and should wait for `retryAfter` when it is set. With
 * `GraphQLClient.pages`, retry each page's call, not the stream:
 * `Stream.retry` starts again from the first page. Subscriptions retry a
 * retryable `ResponseError` on their own, by resubscribing. graphql-sse events
 * carry the stream response's headers, so an event with `errors` is retried
 * when that response had a valid `Retry-After`, and ends the stream
 * otherwise.
 *
 * **Example** (Inspecting the errors of a failed call)
 *
 * ```ts import.meta.vitest
 * import { GraphQLClientError } from "effect/graphql"
 *
 * const reason = new GraphQLClientError.ResponseError({
 *   errors: [{ message: "Not found", path: ["repository"] }],
 *   data: { repository: null },
 *   status: 200
 * })
 *
 * reason.isRetryable // => false
 * reason.status // => 200
 * reason.errors.map((error) => error.path?.[0]) // => ["repository"]
 * ```
 *
 * **Example** (Retrying a call on retryable errors)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { GraphQLClientError } from "effect/graphql"
 *
 * const call = Effect.fail(new GraphQLClientError.GraphQLClientError({
 *   operation: "Viewer",
 *   reason: new GraphQLClientError.ResponseError({
 *     errors: [{ message: "Query timed out" }],
 *     status: 502
 *   })
 * }))
 *
 * const retried = Effect.retry(call, {
 *   while: (error) => error.reason.isRetryable,
 *   times: 3
 * })
 * ```
 *
 * @stability experimental
 * @category errors
 * @since 4.0.0
 */
export class ResponseError
  extends Schema.TaggedError<ResponseError>("effect/graphql/GraphQLClientError/ResponseError")("ResponseError", {
    errors: Schema.NonEmptyArray(GraphQLError),
    data: Schema.optional(Schema.Json),
    extensions: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
    status: Schema.optional(Schema.Int),
    headers: Schema.optional(HeadersSchema)
  })
{
  /**
   * `true` for HTTP status `429` or `500`–`599`, or when the response has a
   * `Retry-After` header that parses, at any status, including a graphql-sse
   * event whose stream response had one; `false` otherwise, including when
   * there is no status and no `Retry-After`. Use this as the `while` predicate
   * of `Effect.retry` on the call, and {@link retryAfter} as the delay when it
   * is set. Subscriptions resubscribe on it.
   *
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    if (this.retryAfter !== undefined) return true
    return this.status !== undefined && isRetryableStatus(this.status)
  }

  readonly #retryAfter = parseRetryAfter(this.headers?.["retry-after"], Date.now())

  /**
   * The `Retry-After` response header parsed as whole seconds or an HTTP
   * date. An HTTP date is measured from `Date.now()` when the error is
   * constructed, so every read returns the same delay. Missing or invalid
   * values yield `undefined`. `Effect.retry` does not apply this delay
   * automatically.
   *
   * @since 4.0.0
   */
  get retryAfter(): Duration.Duration | undefined {
    return this.#retryAfter
  }

  override get message(): string {
    return this.errors.map((error) => error.message).join("; ")
  }
}

const retryableStandardCloseCodes: ReadonlySet<number> = new Set([1000, 1001, 1005, 1006, 1012, 1013, 1014])

const fatalGraphQLWsCloseCodes: ReadonlySet<number> = new Set([4400, 4401, 4403, 4406, 4409, 4429, 4500])

/**
 * Tests whether a WebSocket close code is fatal, meaning a `TransportError`
 * carrying it is not retryable.
 *
 * **Details**
 *
 * Fatal codes are every standard `1xxx` code except `1000`, `1001`, `1005`,
 * `1006`, `1012`, `1013` and `1014`, plus the graphql-ws codes `4400` (bad
 * request), `4401` (unauthorized), `4403` (forbidden), `4406` (subprotocol
 * not acceptable), `4409` (subscriber already exists), `4429` (too many
 * initialisation requests) and `4500` (internal server error). Any other code
 * is retryable.
 *
 * `4403` is fatal because reconnecting with the same credentials is refused
 * again.
 *
 * **Example** (Checking close codes)
 *
 * ```ts import.meta.vitest
 * import { GraphQLClientError } from "effect/graphql"
 *
 * GraphQLClientError.isFatalCloseCode(1006) // => false
 * GraphQLClientError.isFatalCloseCode(1011) // => true
 * GraphQLClientError.isFatalCloseCode(4401) // => true
 * ```
 *
 * @stability experimental
 * @category predicates
 * @since 4.0.0
 */
export const isFatalCloseCode = (code: number): boolean =>
  code >= 1000 && code < 2000 ? !retryableStandardCloseCodes.has(code) : fatalGraphQLWsCloseCodes.has(code)

const isRetryableStatus = (status: number): boolean => status === 429 || (status >= 500 && status < 600)

/**
 * The client could not get a GraphQL response from the server: a network
 * failure, an HTTP response that is not a GraphQL response, a non-2xx HTTP
 * response whose GraphQL body has no `errors`, or a closed WebSocket
 * connection.
 *
 * **Details**
 *
 * - `status` and `headers` are only set for an HTTP response that is not a
 *   GraphQL response, or a non-2xx GraphQL response without `errors`.
 *   Headers use `Headers.Headers` at runtime and encode as a plain string
 *   record; decoding restores the header collection.
 * - `retryAfter` comes from the `Retry-After` header (whole seconds or an
 *   HTTP date) and is encoded as milliseconds. When it is set, the error is
 *   retryable at any status, unless the close code is fatal.
 * - `closeCode` is set when a WebSocket connection closed. See
 *   {@link isFatalCloseCode} for the codes that are not retryable.
 * - `fatal: true` marks a failure that retrying cannot fix, such as an
 *   operation on a graphql-ws transport whose scope has closed.
 * - `cause` holds the original error, such as the `HttpClientError`. Once
 *   encoded it shrinks to `{ name, message }`, the standard `Schema.Defect`
 *   behaviour.
 *
 * **Example** (Retryability of transport failures)
 *
 * ```ts import.meta.vitest
 * import { GraphQLClientError } from "effect/graphql"
 *
 * new GraphQLClientError.TransportError({ description: "ECONNREFUSED" }).isRetryable // => true
 * new GraphQLClientError.TransportError({ description: "503", status: 503 }).isRetryable // => true
 * new GraphQLClientError.TransportError({ description: "404", status: 404 }).isRetryable // => false
 * new GraphQLClientError.TransportError({ description: "closed", closeCode: 4401 }).isRetryable // => false
 * new GraphQLClientError.TransportError({ description: "shut down", fatal: true }).isRetryable // => false
 * ```
 *
 * @stability experimental
 * @category errors
 * @since 4.0.0
 */
export class TransportError
  extends Schema.TaggedError<TransportError>("effect/graphql/GraphQLClientError/TransportError")("TransportError", {
    description: Schema.String,
    status: Schema.optional(Schema.Int),
    headers: Schema.optional(HeadersSchema),
    retryAfter: Schema.optional(Schema.DurationFromMillis),
    closeCode: Schema.optional(Schema.Int),
    fatal: Schema.optional(Schema.Boolean),
    cause: Schema.optional(Schema.Defect())
  })
{
  /**
   * `true` for a network failure (no `status`), a `429` or `500`–`599`
   * status, a `retryAfter` at any status, and any close code that is not
   * fatal (see {@link isFatalCloseCode}). An error marked `fatal` or with a
   * fatal close code is never retryable. When retrying, wait for
   * `retryAfter` when it is set.
   *
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    if (this.fatal === true) return false
    if (this.closeCode !== undefined && isFatalCloseCode(this.closeCode)) return false
    if (this.retryAfter !== undefined) return true
    return this.status === undefined || isRetryableStatus(this.status)
  }

  override get message(): string {
    return this.description
  }

  /**
   * Converts an `HttpClientError` into a `TransportError`, reading `status`,
   * `headers` (as `Headers.Headers`) and `Retry-After` from the response
   * when there is one.
   *
   * **Details**
   *
   * `Retry-After` is read as whole seconds or an HTTP date; any other value
   * is ignored. An HTTP date is measured from `options.now` (epoch
   * milliseconds), which defaults to `Date.now()`. Transports pass the Effect
   * clock's time when the response arrives.
   *
   * @since 4.0.0
   */
  static fromHttpClientError(
    error: HttpClientError.HttpClientError,
    options?: { readonly now?: number | undefined }
  ): TransportError {
    const response = error.response
    return new TransportError({
      description: error.message,
      status: response?.status,
      headers: response?.headers,
      retryAfter: parseRetryAfter(response?.headers["retry-after"], options?.now ?? Date.now()),
      cause: error
    })
  }
}

/**
 * The variables Schema rejected the input, so nothing was sent.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.0
 */
export class EncodeError
  extends Schema.TaggedError<EncodeError>("effect/graphql/GraphQLClientError/EncodeError")("EncodeError", {
    description: Schema.String
  })
{
  /**
   * An `EncodeError` is never retryable.
   *
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return false
  }

  override get message(): string {
    return this.description
  }
}

/**
 * The response was not a GraphQL response, or `data` did not match the result
 * Schema.
 *
 * **Details**
 *
 * `data: null` without `errors` also produces a `DecodeError` for a 2xx
 * response or a result without an HTTP status, since `ResponseError`
 * requires a non-empty errors array. On a non-2xx response it is a
 * `TransportError`.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.0
 */
export class DecodeError
  extends Schema.TaggedError<DecodeError>("effect/graphql/GraphQLClientError/DecodeError")("DecodeError", {
    description: Schema.String
  })
{
  /**
   * A `DecodeError` is never retryable.
   *
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return false
  }

  override get message(): string {
    return this.description
  }
}

/**
 * Cursor paging could not continue. Only `GraphQLClient.pages` and
 * `GraphQLClient.items` raise it, when a connection becomes `null` on a page
 * after the first, or when `hasNextPage` is `true` but `endCursor` is `null`
 * or did not advance.
 *
 * **Details**
 *
 * `cursor` is the last cursor that was sent, `null` on the first page.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.0
 */
export class PaginationError
  extends Schema.TaggedError<PaginationError>("effect/graphql/GraphQLClientError/PaginationError")("PaginationError", {
    description: Schema.String,
    cursor: Schema.NullOr(Schema.String)
  })
{
  /**
   * A `PaginationError` is never retryable.
   *
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return false
  }

  override get message(): string {
    return this.description
  }
}

/**
 * The union of every reason a {@link GraphQLClientError} can carry.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export type Reason = ResponseError | TransportError | EncodeError | DecodeError | PaginationError

const httpReason = (reason: Reason): ResponseError | TransportError | undefined =>
  reason._tag === "ResponseError" || reason._tag === "TransportError" ? reason : undefined

/**
 * The error every `GraphQLClient` method fails with. It names the operation
 * and carries one of the five reasons; `cause` is the reason itself.
 *
 * **Example** (Retrying only what is retryable)
 *
 * ```ts import.meta.vitest
 * import { Duration, Schema } from "effect"
 * import { GraphQLClientError } from "effect/graphql"
 *
 * const error = new GraphQLClientError.GraphQLClientError({
 *   operation: "Viewer",
 *   reason: new GraphQLClientError.TransportError({
 *     description: "503 Service Unavailable",
 *     status: 503,
 *     retryAfter: Duration.seconds(30)
 *   })
 * })
 *
 * error.isRetryable // => true
 * error.retryAfter // => Duration.seconds(30)
 *
 * // Errors round-trip through their Schema
 * const encoded = Schema.encodeSync(GraphQLClientError.GraphQLClientError)(error)
 * Schema.decodeUnknownSync(GraphQLClientError.GraphQLClientError)(encoded).reason._tag // => "TransportError"
 * ```
 *
 * @stability experimental
 * @category errors
 * @since 4.0.0
 */
export class GraphQLClientError extends Schema.TaggedError<GraphQLClientError>(TypeId)("GraphQLClientError", {
  operation: Schema.String,
  reason: Schema.Union([ResponseError, TransportError, EncodeError, DecodeError, PaginationError])
}) {
  /**
   * Marks this value as a GraphQL client error for runtime guards.
   *
   * @stability experimental
   * @since 4.0.0
   */
  readonly [TypeId] = TypeId

  /**
   * The reason, exposed as the error's cause.
   *
   * @since 4.0.0
   */
  override readonly cause = this.reason

  /**
   * Delegates to the reason's `isRetryable`.
   *
   * @since 4.0.0
   */
  get isRetryable(): boolean {
    return this.reason.isRetryable
  }

  /**
   * The `Retry-After` hint of a `ResponseError` or `TransportError` reason,
   * if any. Use it as the delay when retrying on {@link isRetryable}.
   *
   * @since 4.0.0
   */
  get retryAfter(): Duration.Duration | undefined {
    return httpReason(this.reason)?.retryAfter
  }

  /**
   * The HTTP status of a `ResponseError` or `TransportError` reason, if any.
   *
   * @since 4.0.0
   */
  get status(): number | undefined {
    return httpReason(this.reason)?.status
  }

  /**
   * The response headers of a `ResponseError` or `TransportError` reason, if
   * any.
   *
   * @since 4.0.0
   */
  get headers(): Headers.Headers | undefined {
    return httpReason(this.reason)?.headers
  }

  override get message(): string {
    return `${this.operation}: ${this.reason._tag}: ${this.reason.message}`
  }
}

/**
 * Tests whether a value is a {@link GraphQLClientError}.
 *
 * @stability experimental
 * @category guards
 * @since 4.0.0
 */
export const isGraphQLClientError = (u: unknown): u is GraphQLClientError => hasProperty(u, TypeId)
