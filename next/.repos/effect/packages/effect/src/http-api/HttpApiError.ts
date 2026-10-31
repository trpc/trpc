/**
 * Built-in error schemas for common HTTP API failure responses.
 *
 * This module provides reusable `Schema.Error` values for common HTTP
 * status codes, plus `HttpApiSchemaError` for request decoding failures raised
 * by the HTTP API runtime. The status errors can be used in endpoint or
 * middleware error declarations and are understood by builders, generated
 * clients, reflection, and OpenAPI generation.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as ByteSize from "../ByteSize.ts"
import type * as Cause from "../Cause.ts"
import * as Data from "../Data.ts"
import * as Effect from "../Effect.ts"
import * as ErrorReporter from "../ErrorReporter.ts"
import * as HttpServerRespondable from "../http/HttpServerRespondable.ts"
import * as HttpServerResponse from "../http/HttpServerResponse.ts"
import * as ProblemDetails from "../http/ProblemDetails.ts"
import { hasProperty } from "../Predicate.ts"
import * as Schema from "../Schema.ts"
import type { Simplify } from "../Struct.ts"
import * as HttpApiSchema from "./HttpApiSchema.ts"

const badRequestResponse = HttpServerResponse.empty({ status: 400 })
const unauthorizedResponse = HttpServerResponse.empty({ status: 401 })
const forbiddenResponse = HttpServerResponse.empty({ status: 403 })
const notFoundResponse = HttpServerResponse.empty({ status: 404 })
const methodNotAllowedResponse = HttpServerResponse.empty({ status: 405 })
const notAcceptableResponse = HttpServerResponse.empty({ status: 406 })
const requestTimeoutResponse = HttpServerResponse.empty({ status: 408 })
const conflictResponse = HttpServerResponse.empty({ status: 409 })
const goneResponse = HttpServerResponse.empty({ status: 410 })
const payloadTooLargeResponse = HttpServerResponse.empty({ status: 413 })
const unprocessableEntityResponse = HttpServerResponse.empty({ status: 422 })
const internalServerErrorResponse = HttpServerResponse.empty({ status: 500 })
const notImplementedResponse = HttpServerResponse.empty({ status: 501 })
const serviceUnavailableResponse = HttpServerResponse.empty({ status: 503 })

/**
 * Built-in HTTP API error for a `400 Bad Request` response. When used directly as
 * a server response, it renders as an empty response with status 400.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class BadRequest extends Schema.Error<BadRequest>("effect/HttpApiError/BadRequest")({
  _tag: Schema.tag("BadRequest")
}, {
  description: "BadRequest",
  httpApiStatus: 400
}) {
  override readonly [ErrorReporter.ignore] = true;
  [HttpServerRespondable.symbol]() {
    return Effect.succeed(badRequestResponse)
  }
  static readonly singleton = new BadRequest()
}

/**
 * No-content schema variant for `BadRequest`, decoding an empty 400 response into
 * a `BadRequest` error value.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const BadRequestNoContent = BadRequest.pipe(HttpApiSchema.asNoContent({
  decode: () => new BadRequest({})
}))

/**
 * Built-in HTTP API error for a `401 Unauthorized` response. When used directly as
 * a server response, it renders as an empty response with status 401.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class Unauthorized extends Schema.Error<Unauthorized>("effect/HttpApiError/Unauthorized")({
  _tag: Schema.tag("Unauthorized")
}, {
  description: "Unauthorized",
  httpApiStatus: 401
}) {
  override readonly [ErrorReporter.ignore] = true;
  [HttpServerRespondable.symbol]() {
    return Effect.succeed(unauthorizedResponse)
  }
}

/**
 * No-content schema variant for `Unauthorized`, decoding an empty 401 response
 * into an `Unauthorized` error value.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const UnauthorizedNoContent = Unauthorized.pipe(HttpApiSchema.asNoContent({
  decode: () => new Unauthorized({})
}))

/**
 * Built-in HTTP API error for a `403 Forbidden` response. When used directly as a
 * server response, it renders as an empty response with status 403.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class Forbidden extends Schema.Error<Forbidden>("effect/HttpApiError/Forbidden")({
  _tag: Schema.tag("Forbidden")
}, {
  description: "Forbidden",
  httpApiStatus: 403
}) {
  override readonly [ErrorReporter.ignore] = true;
  [HttpServerRespondable.symbol]() {
    return Effect.succeed(forbiddenResponse)
  }
}

/**
 * No-content schema variant for `Forbidden`, decoding an empty 403 response into a
 * `Forbidden` error value.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ForbiddenNoContent = Forbidden.pipe(HttpApiSchema.asNoContent({
  decode: () => new Forbidden({})
}))

/**
 * Built-in HTTP API error for a `404 Not Found` response. When used directly as a
 * server response, it renders as an empty response with status 404.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class NotFound extends Schema.Error<NotFound>("effect/HttpApiError/NotFound")({
  _tag: Schema.tag("NotFound")
}, {
  description: "NotFound",
  httpApiStatus: 404
}) {
  override readonly [ErrorReporter.ignore] = true;
  [HttpServerRespondable.symbol]() {
    return Effect.succeed(notFoundResponse)
  }
}

/**
 * No-content schema variant for `NotFound`, decoding an empty 404 response into a
 * `NotFound` error value.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const NotFoundNoContent = NotFound.pipe(HttpApiSchema.asNoContent({
  decode: () => new NotFound({})
}))

/**
 * Built-in HTTP API error for a `405 Method Not Allowed` response. When used
 * directly as a server response, it renders as an empty response with status 405.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class MethodNotAllowed extends Schema.Error<MethodNotAllowed>("effect/HttpApiError/MethodNotAllowed")({
  _tag: Schema.tag("MethodNotAllowed")
}, {
  description: "MethodNotAllowed",
  httpApiStatus: 405
}) {
  override readonly [ErrorReporter.ignore] = true;
  [HttpServerRespondable.symbol]() {
    return Effect.succeed(methodNotAllowedResponse)
  }
}

/**
 * No-content schema variant for `MethodNotAllowed`, decoding an empty 405 response
 * into a `MethodNotAllowed` error value.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MethodNotAllowedNoContent = MethodNotAllowed.pipe(HttpApiSchema.asNoContent({
  decode: () => new MethodNotAllowed({})
}))

/**
 * Built-in HTTP API error for a `406 Not Acceptable` response. When used directly
 * as a server response, it renders as an empty response with status 406.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class NotAcceptable extends Schema.Error<NotAcceptable>("effect/HttpApiError/NotAcceptable")({
  _tag: Schema.tag("NotAcceptable")
}, {
  description: "NotAcceptable",
  httpApiStatus: 406
}) {
  override readonly [ErrorReporter.ignore] = true;
  [HttpServerRespondable.symbol]() {
    return Effect.succeed(notAcceptableResponse)
  }
}

/**
 * No-content schema variant for `NotAcceptable`, decoding an empty 406 response
 * into a `NotAcceptable` error value.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const NotAcceptableNoContent = NotAcceptable.pipe(HttpApiSchema.asNoContent({
  decode: () => new NotAcceptable({})
}))

/**
 * Built-in HTTP API error for a `408 Request Timeout` response. When used directly
 * as a server response, it renders as an empty response with status 408.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class RequestTimeout extends Schema.Error<RequestTimeout>("effect/HttpApiError/RequestTimeout")({
  _tag: Schema.tag("RequestTimeout")
}, {
  description: "RequestTimeout",
  httpApiStatus: 408
}) {
  override readonly [ErrorReporter.ignore] = true;
  [HttpServerRespondable.symbol]() {
    return Effect.succeed(requestTimeoutResponse)
  }
}

/**
 * No-content schema variant for `RequestTimeout`, decoding an empty 408 response
 * into a `RequestTimeout` error value.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const RequestTimeoutNoContent = RequestTimeout.pipe(HttpApiSchema.asNoContent({
  decode: () => new RequestTimeout({})
}))

/**
 * Built-in HTTP API error for a `409 Conflict` response. When used directly as a
 * server response, it renders as an empty response with status 409.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class Conflict extends Schema.Error<Conflict>("effect/HttpApiError/Conflict")({
  _tag: Schema.tag("Conflict")
}, {
  description: "Conflict",
  httpApiStatus: 409
}) {
  override readonly [ErrorReporter.ignore] = true;
  [HttpServerRespondable.symbol]() {
    return Effect.succeed(conflictResponse)
  }
}

/**
 * No-content schema variant for `Conflict`, decoding an empty 409 response into a
 * `Conflict` error value.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ConflictNoContent = Conflict.pipe(HttpApiSchema.asNoContent({
  decode: () => new Conflict({})
}))

/**
 * Built-in HTTP API error for a `410 Gone` response. When used directly as a
 * server response, it renders as an empty response with status 410.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class Gone extends Schema.Error<Gone>("effect/HttpApiError/Gone")({
  _tag: Schema.tag("Gone")
}, {
  description: "Gone",
  httpApiStatus: 410
}) {
  override readonly [ErrorReporter.ignore] = true;
  [HttpServerRespondable.symbol]() {
    return Effect.succeed(goneResponse)
  }
}

/**
 * No-content schema variant for `Gone`, decoding an empty 410 response into a
 * `Gone` error value.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const GoneNoContent = Gone.pipe(HttpApiSchema.asNoContent({
  decode: () => new Gone({})
}))

/**
 * Built-in HTTP API error for a `422 Unprocessable Entity` response. When used
 * directly as a server response, it renders as an empty response with status 422.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class UnprocessableEntity extends Schema.Error<UnprocessableEntity>("effect/HttpApiError/UnprocessableEntity")({
  _tag: Schema.tag("UnprocessableEntity")
}, {
  description: "UnprocessableEntity",
  httpApiStatus: 422
}) {
  override readonly [ErrorReporter.ignore] = true;
  [HttpServerRespondable.symbol]() {
    return Effect.succeed(unprocessableEntityResponse)
  }
}

/**
 * No-content schema variant for `UnprocessableEntity`, decoding an empty 422
 * response into an `UnprocessableEntity` error value.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const UnprocessableEntityNoContent = UnprocessableEntity.pipe(HttpApiSchema.asNoContent({
  decode: () => new UnprocessableEntity({})
}))

/**
 * Built-in HTTP API error for a `500 Internal Server Error` response. When used
 * directly as a server response, it renders as an empty response with status 500.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class InternalServerError extends Schema.Error<InternalServerError>("effect/HttpApiError/InternalServerError")({
  _tag: Schema.tag("InternalServerError")
}, {
  description: "InternalServerError",
  httpApiStatus: 500
}) {
  [HttpServerRespondable.symbol]() {
    return Effect.succeed(internalServerErrorResponse)
  }
}

/**
 * No-content schema variant for `InternalServerError`, decoding an empty 500
 * response into an `InternalServerError` error value.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const InternalServerErrorNoContent = InternalServerError.pipe(HttpApiSchema.asNoContent({
  decode: () => new InternalServerError({})
}))

/**
 * Built-in HTTP API error for a `501 Not Implemented` response. When used directly
 * as a server response, it renders as an empty response with status 501.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class NotImplemented extends Schema.Error<NotImplemented>("effect/HttpApiError/NotImplemented")({
  _tag: Schema.tag("NotImplemented")
}, {
  description: "NotImplemented",
  httpApiStatus: 501
}) {
  [HttpServerRespondable.symbol]() {
    return Effect.succeed(notImplementedResponse)
  }
}

/**
 * No-content schema variant for `NotImplemented`, decoding an empty 501 response
 * into a `NotImplemented` error value.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const NotImplementedNoContent = NotImplemented.pipe(HttpApiSchema.asNoContent({
  decode: () => new NotImplemented({})
}))

/**
 * Built-in HTTP API error for a `503 Service Unavailable` response. When used
 * directly as a server response, it renders as an empty response with status 503.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class ServiceUnavailable extends Schema.Error<ServiceUnavailable>("effect/HttpApiError/ServiceUnavailable")({
  _tag: Schema.tag("ServiceUnavailable")
}, {
  description: "ServiceUnavailable",
  httpApiStatus: 503
}) {
  [HttpServerRespondable.symbol]() {
    return Effect.succeed(serviceUnavailableResponse)
  }
}

/**
 * No-content schema variant for `ServiceUnavailable`, decoding an empty 503
 * response into a `ServiceUnavailable` error value.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ServiceUnavailableNoContent = ServiceUnavailable.pipe(HttpApiSchema.asNoContent({
  decode: () => new ServiceUnavailable({})
}))

/**
 * The constant members of a typed problem declaration.
 *
 * @stability unstable
 * @category models
 * @since 4.0.6
 */
export interface ProblemDeclaration<Type extends string, Status extends number> {
  /**
   * The problem type URI. It is the discriminator between problem classes that
   * share a status.
   */
  readonly type: Type
  /**
   * The HTTP status of the response.
   */
  readonly status: Status
  /**
   * The short human-readable summary of the problem type.
   */
  readonly title: string
}

/**
 * The standard problem members of a typed problem class.
 *
 * **Details**
 *
 * `type`, `status` and `title` are fixed by the declaration and are constructor
 * defaults that are always encoded. `type` is the discriminator: a body with a
 * different `type` is rejected. `status` and `title` decode to the declared
 * value whatever the body carries, so the HTTP status stays authoritative.
 * `detail` and `instance` are optional per-instance members that declared
 * fields may replace.
 *
 * @stability unstable
 * @category models
 * @since 4.0.6
 */
export interface ProblemMembers<Type extends string, Status extends number> {
  readonly type: Schema.tag<Type>
  readonly status: FixedMember<Status>
  readonly title: FixedMember<string>
  readonly detail: OptionalMember<Schema.String>
  readonly instance: OptionalMember<Schema.String>
}

type FixedMember<L extends string | number> = Schema.middlewareDecoding<
  Schema.withDecodingDefaultKey<Schema.tag<L>>,
  never
>

type OptionalMember<S extends Schema.Constraint> = Schema.middlewareDecoding<Schema.optionalKey<S>, never>

/**
 * The fields of a typed problem class: the standard members plus the declared
 * extension fields.
 *
 * @stability unstable
 * @category models
 * @since 4.0.6
 */
export type ProblemFields<Type extends string, Status extends number, Fields extends Schema.Struct.Fields> = Simplify<
  Omit<ProblemMembers<Type, Status>, keyof Fields> & Fields
>

/**
 * The extension fields a typed problem may declare. The fixed members `type`,
 * `status` and `title` are reserved.
 *
 * @stability unstable
 * @category models
 * @since 4.0.6
 */
export type ProblemExtensionFields = Schema.Struct.Fields & {
  readonly type?: never
  readonly status?: never
  readonly title?: never
}

const problemEncoding: HttpApiSchema.ResponseEncoding = { _tag: "Json", contentType: ProblemDetails.contentType }

/**
 * The class returned by {@link Problem}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.6
 */
export interface ProblemClass<
  Self,
  Tag extends string,
  Type extends string,
  Status extends number,
  Fields extends Schema.Struct.Fields,
  Brand
> extends
  Schema.Class<
    Self,
    Schema.Struct<ProblemFields<Type, Status, Fields>>,
    Cause.YieldableError & HttpServerRespondable.Respondable & Brand & { readonly _tag: Tag }
  >
{}

type MissingSelfGeneric = "Missing `Self` generic - use `class Self extends HttpApiError.Problem<Self>()(...)`"

/**
 * Declares a typed RFC 9457 problem as a yieldable error class.
 *
 * **Details**
 *
 * The class is a `Schema.Error` whose `_tag` is the given tag, so `Effect.catchTag`
 * works without `_tag` on the wire. It carries the `httpApiStatus` and
 * `application/problem+json` annotations, so endpoints that declare it as an
 * error render, document and decode it as a problem. Problem classes that
 * share a status are told apart by `type`. The extension fields are validated
 * on both sides and cannot replace `type`, `status` or `title`; unknown
 * extensions are not kept. An undeclared instance still renders as a problem
 * through `HttpServerRespondable`.
 *
 * **Example** (Declaring and using a typed problem)
 *
 * ```ts
 * import { Effect, Schema } from "effect"
 * import { HttpApiEndpoint, HttpApiError } from "effect/http-api"
 *
 * class OutOfCredit extends HttpApiError.Problem<OutOfCredit>()("OutOfCredit", {
 *   type: "https://example.com/probs/out-of-credit",
 *   status: 403,
 *   title: "You do not have enough credit."
 * }, {
 *   balance: Schema.Number
 * }) {}
 *
 * const buy = HttpApiEndpoint.post("buy", "/buy", { error: OutOfCredit })
 *
 * const failing = Effect.fail(new OutOfCredit({ balance: 30 }))
 * // Responds with 403 and { "type": "https://example.com/probs/out-of-credit",
 * //   "status": 403, "title": "You do not have enough credit.", "balance": 30 }
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.6
 */
export const Problem = <Self = never, Brand = {}>() =>
<
  const Tag extends string,
  const Type extends string,
  const Status extends number,
  const Fields extends ProblemExtensionFields = {}
>(
  tag: Tag,
  declaration: ProblemDeclaration<Type, Status>,
  fields?: Fields,
  annotations?: Schema.Annotations.Declaration<Self, readonly [Schema.Struct<ProblemFields<Type, Status, Fields>>]>
): [Self] extends [never] ? MissingSelfGeneric
  : ProblemClass<Self, Tag, Type, Status, Fields, Brand> =>
{
  const struct = Schema.Struct({
    detail: ProblemDetails.optionalMember(Schema.String),
    instance: ProblemDetails.optionalMember(Schema.String),
    ...fields,
    type: Schema.tag(declaration.type),
    status: ProblemDetails.fixedMember(declaration.status),
    title: ProblemDetails.fixedMember(declaration.title)
  })
  const encode = Schema.encodeUnknownEffect(struct)
  const Base = Schema.Error<any, {}>(tag)(struct, {
    description: declaration.title,
    httpApiStatus: declaration.status,
    "~httpApiEncoding": problemEncoding,
    ...annotations as {}
  })
  Object.assign(Base.prototype, {
    _tag: tag,
    [ErrorReporter.ignore]: declaration.status < 500,
    [HttpServerRespondable.symbol](this: object) {
      return Effect.map(
        encode(this),
        (body) =>
          HttpServerResponse.jsonUnsafe(body, { status: declaration.status, contentType: ProblemDetails.contentType })
      )
    }
  })
  Object.defineProperty(Base.prototype, "message", {
    get(this: { readonly detail?: string }) {
      return this.detail ?? declaration.title
    },
    configurable: true
  })
  return Base as any
}

/**
 * One entry of `BadRequestProblem.errors`: the location of a request value
 * that failed decoding and the reason.
 *
 * **Details**
 *
 * The first path segment names the request slot (`params`, `headers`, `query`
 * or `payload`).
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.6
 */
export const ProblemIssue = Schema.Struct({
  path: Schema.Array(Schema.Union([Schema.String, Schema.Number])),
  message: Schema.String
})

/**
 * The problem rendered by `HttpApiMiddleware.layerProblemDetails` when a
 * request fails decoding.
 *
 * **Details**
 *
 * The body is generic by default. `errors` is only filled when the layer is
 * built with `includeDetails: true`.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.6
 */
export class BadRequestProblem extends Problem<BadRequestProblem>()("BadRequestProblem", {
  type: ProblemDetails.blankType,
  status: 400,
  title: "Bad Request"
}, {
  errors: Schema.optionalKey(Schema.Array(ProblemIssue))
}) {}

/**
 * The problem rendered by `HttpApiMiddleware.layerProblemDetails` when a
 * response fails encoding.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.6
 */
export class InternalServerErrorProblem extends Problem<InternalServerErrorProblem>()("InternalServerErrorProblem", {
  type: ProblemDetails.blankType,
  status: 500,
  title: "Internal Server Error"
}) {}

/**
 * Type-level identifier used to mark `HttpApiSchemaError` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type HttpApiSchemaErrorTypeId = "~effect/http-api/HttpApiError/HttpApiSchemaError"

/**
 * Runtime identifier used to mark and detect `HttpApiSchemaError` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const HttpApiSchemaErrorTypeId: HttpApiSchemaErrorTypeId = "~effect/http-api/HttpApiError/HttpApiSchemaError"

/**
 * Error raised when an HTTP API request or response component fails schema
 * decoding or encoding. Request decoding failures respond with an empty
 * `400 Bad Request` and are ignored by error reporters. Response encoding
 * failures respond with an empty `500 Internal Server Error` and are reported.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class HttpApiSchemaError extends Data.TaggedClass("HttpApiSchemaError")<{
  readonly kind: "Params" | "Headers" | "Query" | "Body" | "Payload" | "ResponseHeaders"
  readonly cause: Schema.SchemaError
}> {
  readonly [HttpApiSchemaErrorTypeId]: HttpApiSchemaErrorTypeId = HttpApiSchemaErrorTypeId

  get [ErrorReporter.ignore](): boolean {
    return this.kind !== "Body" && this.kind !== "ResponseHeaders"
  }

  static is(u: unknown): u is HttpApiSchemaError {
    return hasProperty(u, HttpApiSchemaErrorTypeId)
  }

  static wrap<A, R>(
    kind: HttpApiSchemaError["kind"],
    effect: Effect.Effect<A, Schema.SchemaError, R>
  ): Effect.Effect<A, HttpApiSchemaError, R> {
    // Decoders return completed Exit values for synchronous results, so map
    // eagerly and skip the error wrapper when nothing remains to run.
    return Effect.mapErrorEager(effect, (error) => new HttpApiSchemaError({ kind, cause: error }))
  }

  readonly name = "HttpApiSchemaError"
  readonly message = this.kind;

  [HttpServerRespondable.symbol]() {
    return Effect.succeed(this[ErrorReporter.ignore] ? badRequestResponse : internalServerErrorResponse)
  }
}

/**
 * Type-level identifier used to mark `HttpApiPayloadTooLarge` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.6
 */
export type HttpApiPayloadTooLargeTypeId = "~effect/http-api/HttpApiError/HttpApiPayloadTooLarge"

/**
 * Runtime identifier used to mark and detect `HttpApiPayloadTooLarge` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.6
 */
export const HttpApiPayloadTooLargeTypeId: HttpApiPayloadTooLargeTypeId =
  "~effect/http-api/HttpApiError/HttpApiPayloadTooLarge"

/**
 * Error raised when a streaming request payload exceeds a limit declared on
 * its `HttpApiSchema.StreamUint8Array` or `HttpApiSchema.StreamNdjson` schema.
 * It responds with an empty `413 Payload Too Large` and is ignored by error
 * reporters.
 *
 * **Details**
 *
 * `limit` names the option that was exceeded: `maxBytes` caps the whole body
 * and `maxElementBytes` caps one NDJSON line. `size` is its configured value.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.6
 */
export class HttpApiPayloadTooLarge extends Data.TaggedClass("HttpApiPayloadTooLarge")<{
  readonly limit: "maxBytes" | "maxElementBytes"
  readonly size: ByteSize.ByteSize
}> {
  readonly [HttpApiPayloadTooLargeTypeId]: HttpApiPayloadTooLargeTypeId = HttpApiPayloadTooLargeTypeId
  readonly [ErrorReporter.ignore] = true

  static is(u: unknown): u is HttpApiPayloadTooLarge {
    return hasProperty(u, HttpApiPayloadTooLargeTypeId)
  }

  readonly name = "HttpApiPayloadTooLarge"
  readonly message = `Payload exceeds ${this.limit} of ${this.size} bytes`;

  [HttpServerRespondable.symbol]() {
    return Effect.succeed(payloadTooLargeResponse)
  }
}
