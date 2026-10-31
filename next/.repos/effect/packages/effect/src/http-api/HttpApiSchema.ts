/**
 * Attaches HTTP API metadata to Effect Schema values.
 *
 * This module is the schema-side bridge for HttpApi endpoint builders,
 * generated clients, and OpenAPI support. It does not define routes or perform
 * IO. Instead, the helpers annotate schemas so the surrounding HTTP API tooling
 * can choose response status codes, content types, body codecs, multipart
 * handling, and no-body response behavior.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as ByteSize from "../ByteSize.ts"
import * as Sse from "../encoding/Sse.ts"
import { constVoid, type LazyArg } from "../Function.ts"
import { hasBody, type HttpMethod } from "../http/HttpMethod.ts"
import * as HttpStatus from "../http/HttpStatus.ts"
import type * as Multipart_ from "../http/Multipart.ts"
import * as ProblemDetails from "../http/ProblemDetails.ts"
import * as Predicate from "../Predicate.ts"
import * as Schema from "../Schema.ts"
import * as SchemaAST from "../SchemaAST.ts"
import * as SchemaTransformation from "../SchemaTransformation.ts"
import * as Socket from "../socket/Socket.ts"
import * as Stream from "../Stream.ts"
import * as MediaType from "./internal/mediaType.ts"

declare module "../Schema.ts" {
  namespace Annotations {
    interface Augment {
      readonly httpApiStatus?: number | undefined
      /**
       * The encoding of the payload or response.
       * This is kept internal because encodings are only exposed through the `as*` functions.
       * @internal
       */
      readonly "~httpApiEncoding"?: Encoding | undefined
      /**
       * Marks schemas produced by `encodeToWithHeaders`, carrying the body and
       * headers schemas so integrations can split the encoded pair.
       * @internal
       */
      readonly "~httpApiWithHeaders"?: WithHeadersAnnotation | undefined
    }
  }
}

/**
 * Annotation payload attached by `encodeToWithHeaders`.
 *
 * @internal
 */
export interface WithHeadersAnnotation {
  readonly body: Schema.Top
  readonly headers: Schema.Top
  /**
   * Codecs from the body and headers types to their response representation.
   * `HttpApiEndpoint` replaces them with the response encoding codecs.
   */
  readonly bodyCodec: Schema.Top
  readonly headersCodec: Schema.Top
  /**
   * The user mapping between the `{ body, headers }` pair and the schema type.
   */
  readonly transformation: {
    readonly decode: (pair: { readonly body: unknown; readonly headers: unknown }) => unknown
    readonly encode: (value: unknown) => { readonly body: unknown; readonly headers: unknown }
  }
}

/**
 * HTTP API body encoding metadata used by payloads and responses.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Encoding = PayloadEncoding | ResponseEncoding

/**
 * HTTP API request payload encoding metadata.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type PayloadEncoding =
  | {
    readonly _tag: "Multipart"
    readonly mode: "buffered" | "stream"
    readonly contentType: string
    readonly limits?: Multipart_.withLimits.Options | undefined
  }
  | {
    readonly _tag: "Json" | "FormUrlEncoded" | "Uint8Array" | "Text"
    readonly contentType: string
  }

/**
 * HTTP API response body encoding metadata.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ResponseEncoding = {
  readonly _tag: "Json" | "FormUrlEncoded" | "Uint8Array" | "Text"
  readonly contentType: string
}

const StreamSchemaTypeId = "~effect/http-api/HttpApiSchema/Stream"

/**
 * Common HTTP status code literals accepted by {@link status}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type StatusLiteral = HttpStatus.Literal

/**
 * Sets the HTTP status code of a schema.
 *
 * **Details**
 *
 * Stores the status with `.annotateKey({ httpApiStatus: code })` unless the
 * schema or any of its checks already has an ordinary `httpApiStatus`
 * annotation, including an explicit `undefined`. In that case, uses
 * `.annotate({ httpApiStatus: code })` instead.
 *
 * Ordinary status annotations take precedence over key annotations. Checks
 * without a status annotation preserve the existing status. You can pass
 * either a numeric code (for example, `201`) or a common literal name
 * (for example, `"Created"`).
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export function status(code: number): {
  <S extends Schema.Top>(self: S): S["Rebuild"]
}
/**
 * @stability unstable
 */
export function status(code: StatusLiteral): {
  <S extends Schema.Top>(self: S): S["Rebuild"]
}
/**
 * @stability unstable
 */
export function status(code: number | StatusLiteral) {
  const statusCode = typeof code === "string" ? HttpStatus.fromLiteral(code) : code
  return <S extends Schema.Top>(self: S): S["Rebuild"] =>
    findHttpApiStatusAnnotation(self.ast) === undefined
      ? self.annotateKey({ httpApiStatus: statusCode })
      : self.annotate({ httpApiStatus: statusCode })
}

/**
 * Creates a void schema with the given HTTP status code.
 * This is used to represent empty responses with a specific status code.
 *
 * @see {@link NoContent} for the predefined 204 no content schema.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Empty = (code: number): Schema.Void => Schema.Void.pipe(status(code))

/**
 * Type of the `NoContent` schema, a void schema annotated with HTTP status code 204.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface NoContent extends Schema.Void {}

/**
 * Schema for empty HTTP responses with status code 204.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const NoContent: NoContent = Empty(204)

/**
 * Type of the `Created` schema, a void schema annotated with HTTP status code 201.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Created extends Schema.Void {}

/**
 * Schema for empty HTTP responses with status code 201.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Created: Created = Empty(201)

/**
 * Type of the `Accepted` schema, a void schema annotated with HTTP status code 202.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Accepted extends Schema.Void {}

/**
 * Schema for empty HTTP responses with status code 202.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Accepted: Accepted = Empty(202)

/**
 * Schema type returned by `asNoContent`, encoding as `void` while decoding to the original schema type.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export interface asNoContent<S extends Schema.Constraint> extends Schema.decodeTo<Schema.toType<S>, Schema.Void> {}

/**
 * Marks a schema as a no-content response while preserving a decoded client value.
 *
 * **Details**
 *
 * The server encodes the response as `void`; generated clients call `decode` to
 * produce the schema's decoded value when the response has no body.
 *
 * @see {@link NoContent} for a void schema with the status code 204.
 * @see {@link Empty} for creating a void schema with a specific status code.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export function asNoContent<S extends Schema.Constraint>(options: {
  readonly decode: LazyArg<S["Type"]>
}) {
  return (self: S): asNoContent<S> => {
    return Schema.Void.pipe(
      Schema.decodeTo(
        Schema.toType(self),
        SchemaTransformation.transform({
          decode: options.decode,
          encode: constVoid
        })
      )
    )
  }
}

/**
 * Schema type returned by `asProblem`, encoding as a problem details body
 * while decoding to the original schema type.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.6
 */
export interface asProblem<S extends Schema.Constraint> extends
  Schema.decodeTo<
    Schema.toType<S>,
    Schema.Struct<{
      readonly type: Schema.tag<string>
      readonly status: Schema.middlewareDecoding<Schema.withDecodingDefaultKey<Schema.tag<number>>, never>
      readonly title: Schema.middlewareDecoding<Schema.withDecodingDefaultKey<Schema.tag<string>>, never>
    }>
  >
{}

/**
 * Renders an error class as an RFC 9457 problem.
 *
 * **Details**
 *
 * The server encodes the error as an `application/problem+json` body carrying
 * `type`, `title` and the status of the class. Generated clients decode a body
 * with the same `type` back into an instance by calling `decode`, which
 * defaults to constructing the class without arguments; a body with a
 * different `type` is rejected.
 *
 * **Example** (A built-in error as a problem)
 *
 * ```ts
 * import { HttpApiEndpoint, HttpApiError, HttpApiSchema } from "effect/http-api"
 *
 * const user = HttpApiEndpoint.get("user", "/user", {
 *   error: HttpApiError.NotFound.pipe(HttpApiSchema.asProblem({ title: "Not Found" }))
 * })
 * // A NotFound failure responds with 404 and
 * // { "type": "about:blank", "title": "Not Found", "status": 404 }
 * ```
 *
 * @see {@link asNoContent} for the empty-body equivalent.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.6
 */
export function asProblem<S extends Schema.Constraint & (new() => S["Type"])>(options: {
  /**
   * The problem type URI. Defaults to `about:blank`.
   */
  readonly type?: string | undefined
  readonly title: string
  readonly decode?: LazyArg<S["Type"]> | undefined
}) {
  return (self: S): asProblem<S> => {
    const status = getStatusError(self.ast)
    const type = options.type ?? ProblemDetails.blankType
    const body = { type, status, title: options.title }
    const decode = options.decode ?? (() => new self())
    const problem = Schema.Struct({
      type: Schema.tag(type),
      status: ProblemDetails.fixedMember(status),
      title: ProblemDetails.fixedMember(options.title)
    })
    return problem.pipe(
      Schema.decodeTo(
        Schema.toType(self),
        SchemaTransformation.transform({
          decode,
          encode: () => body
        })
      ),
      asJson({ contentType: ProblemDetails.contentType })
    )
  }
}

type StreamMode = "sse" | "uint8array" | "ndjson"

/**
 * Mode describing whether an SSE stream emits full events or raw data values.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type StreamSseMode = "events" | "data"

/**
 * Schema for a Server-Sent Events success response.
 *
 * **Details**
 *
 * `events` describes successful application events emitted by the stream, and
 * `error` describes typed stream failures that will be encoded by later
 * endpoint/server/client integrations using the reserved failure event. If
 * `error` is omitted, it defaults to `Schema.Never`. When `StreamSse` is
 * constructed from `data`, handlers and clients expose raw data values while
 * the server and client still use an SSE event schema internally.
 *
 * **Gotchas**
 *
 * The client treats `effect/http-api/stream/failure` as a stream failure only
 * when its decoded `data` is a `Cause`. If an event schema accepts that name
 * dynamically but decodes `data` to another value, the client emits it as an
 * application event. Endpoint construction rejects event schemas that declare
 * the reserved name statically.
 *
 * `StreamSse` is response-only. The `payload` slot's type excludes it, and
 * endpoint construction rejects it.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface StreamSse<
  Events extends Sse.EventCodec,
  Error extends Schema.Constraint,
  Value = Events["Type"]
> extends
  Schema.BottomLazy<
    SchemaAST.Declaration,
    StreamSse<Events, Error, Value>
  >
{
  readonly "Type": Stream.Stream<Value, Error["Type"], never>
  readonly "Encoded": Stream.Stream<Value, Error["Type"], never>
  readonly "DecodingServices": Events["DecodingServices"] | Error["DecodingServices"]
  readonly "EncodingServices": Events["EncodingServices"] | Error["EncodingServices"]
  readonly "Rebuild": StreamSse<Events, Error, Value>
  readonly "~type.make.in": Stream.Stream<Value, Error["Type"], never>
  readonly "~type.make": Stream.Stream<Value, Error["Type"], never>
  readonly "Iso": Stream.Stream<Value, Error["Type"], never>
  readonly [StreamSchemaTypeId]: typeof StreamSchemaTypeId
  readonly _tag: "StreamSse"
  readonly mode: "sse"
  readonly sseMode: StreamSseMode
  readonly contentType: string
  readonly contentTypes: Arr.NonEmptyReadonlyArray<string>
  readonly events: Events
  readonly error: Error
  readonly "~Value"?: Value | undefined
}

/**
 * Event schema produced when {@link StreamSse} is constructed from a JSON data schema.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SseEventFromData<Data extends Schema.Constraint> extends
  Schema.ConstraintCodec<
    {
      readonly id?: string | undefined
      readonly event: string
      readonly data: Data["Type"]
    },
    {
      readonly id?: string | undefined
      readonly event?: string | undefined
      readonly data: string
    },
    Data["DecodingServices"],
    Data["EncodingServices"]
  >
{}

/**
 * Schema for a streaming `Uint8Array` body.
 *
 * **Details**
 *
 * It works as a success response or as a request payload. It is intentionally
 * separate from the buffered `asUint8Array` encoding. As a payload, the handler
 * receives the body as it is read, and `maxBytes` caps the bytes read. It has
 * no default and does not fall back to `MaxBodySize`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface StreamUint8Array extends
  Schema.Bottom<
    Stream.Stream<Uint8Array, unknown, never>,
    Stream.Stream<Uint8Array, unknown, never>,
    never,
    never,
    SchemaAST.Declaration,
    StreamUint8Array
  >
{
  readonly "Rebuild": StreamUint8Array
  readonly [StreamSchemaTypeId]: typeof StreamSchemaTypeId
  readonly _tag: "StreamUint8Array"
  readonly mode: "uint8array"
  readonly contentType: string
  readonly contentTypes: Arr.NonEmptyReadonlyArray<string>
  readonly maxBytes: ByteSize.ByteSize | undefined
}

/**
 * Schema for a stream of newline-delimited JSON elements.
 *
 * **Details**
 *
 * Each element is encoded as one line of JSON followed by `\n`, including the
 * last. When decoding, `\n`, `\r\n` and a bare `\r` end a line, empty lines are
 * skipped, a leading BOM is stripped and invalid UTF-8 fails. The first
 * malformed line or element that fails to decode ends the stream, after every
 * element before it has been delivered. A missing final newline is accepted if
 * the last line parses.
 *
 * `maxElementBytes` caps the UTF-8 bytes of one line, without its terminator.
 * `maxBytes` caps the whole body and has no default.
 *
 * As a request payload, the handler receives the elements as the body is
 * read. Malformed lines and elements that fail to decode are an
 * `HttpApiSchemaError`, and limit breaches are an `HttpApiPayloadTooLarge`.
 *
 * **Gotchas**
 *
 * There is no `error` schema. A failure mid-stream aborts the connection, so
 * the reader sees a body read error, never a clean end. Typed failures
 * mid-stream are a {@link StreamSse} feature. A body cut cleanly at a line
 * boundary can't be told apart from a complete one.
 *
 * @stability unstable
 * @category models
 * @since 4.0.6
 */
export interface StreamNdjson<S extends Schema.Constraint> extends
  Schema.BottomLazy<
    SchemaAST.Declaration,
    StreamNdjson<S>
  >
{
  readonly "Type": Stream.Stream<S["Type"], unknown, never>
  readonly "Encoded": Stream.Stream<S["Type"], unknown, never>
  readonly "DecodingServices": S["DecodingServices"]
  readonly "EncodingServices": S["EncodingServices"]
  readonly "Rebuild": StreamNdjson<S>
  readonly "~type.make.in": Stream.Stream<S["Type"], unknown, never>
  readonly "~type.make": Stream.Stream<S["Type"], unknown, never>
  readonly "Iso": Stream.Stream<S["Type"], unknown, never>
  readonly [StreamSchemaTypeId]: typeof StreamSchemaTypeId
  readonly _tag: "StreamNdjson"
  readonly mode: "ndjson"
  readonly contentType: string
  readonly contentTypes: Arr.NonEmptyReadonlyArray<string>
  readonly schema: S
  readonly maxBytes: ByteSize.ByteSize | undefined
  readonly maxElementBytes: ByteSize.ByteSize
}

/**
 * Schema for a streaming HTTP API body.
 *
 * **Details**
 *
 * {@link StreamUint8Array} and {@link StreamNdjson} describe the body in either
 * direction, with the endpoint slot deciding which. {@link StreamSse} is for
 * success responses only.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type StreamSchema =
  | StreamSse<Sse.EventCodec, Schema.Top, unknown>
  | StreamUint8Array
  | StreamNdjson<Schema.Top>

const streamSchema = Schema.declare(Stream.isStream)

const defaultMaxElementBytes = ByteSize.mebibytes(1)

/**
 * Creates a Server-Sent Events streaming success response schema.
 *
 * **Details**
 *
 * `StreamSse` is response-only. Endpoint construction rejects it in `payload`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const StreamSse: {
  <Events extends Sse.EventCodec, Error extends Schema.Constraint = Schema.Never>(options: {
    readonly contentType?: string | undefined
    readonly events: Events
    readonly error?: Error | undefined
  }): StreamSse<Events, Error, Events["Type"]>
  <Data extends Schema.Constraint, Error extends Schema.Constraint = Schema.Never>(options: {
    readonly contentType?: string | undefined
    readonly data: Data
    readonly error?: Error | undefined
  }): StreamSse<SseEventFromData<Data>, Error, Data["Type"]>
} = (options: {
  readonly contentType?: string | undefined
  readonly events?: Sse.EventCodec | undefined
  readonly data?: Schema.Constraint | undefined
  readonly error?: Schema.Constraint | undefined
}): StreamSse<Sse.EventCodec, Schema.Top, unknown> => {
  const events = options.events ?? (options.data === undefined ? undefined : Schema.Struct({
    ...Sse.EventEncoded.fields,
    data: Schema.fromJsonString(Schema.toCodecJson(options.data))
  }))
  if (events === undefined) {
    throw new Error("StreamSse requires either an events schema or a data schema")
  }
  return Schema.make<StreamSse<Sse.EventCodec, Schema.Top, unknown>>(streamSchema.ast, {
    [StreamSchemaTypeId]: StreamSchemaTypeId,
    _tag: "StreamSse",
    mode: "sse",
    sseMode: options.events === undefined ? "data" : "events",
    ...streamContentTypes(options.contentType, "sse"),
    events,
    error: options.error ?? Schema.Never
  })
}

/**
 * Creates a streaming `Uint8Array` body schema.
 *
 * **Details**
 *
 * `contentType` defaults to `application/octet-stream`. Pass a list when the
 * same stream is sent under several media types. The first entry is the
 * default response type, and payloads are accepted under every entry.
 * `maxBytes` only applies to request payloads and has no default.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const StreamUint8Array = (options?: {
  readonly contentType?: string | ReadonlyArray<string> | undefined
  readonly maxBytes?: ByteSize.Input | undefined
}): StreamUint8Array =>
  Schema.make<StreamUint8Array>(streamSchema.ast, {
    [StreamSchemaTypeId]: StreamSchemaTypeId,
    _tag: "StreamUint8Array",
    mode: "uint8array",
    ...streamContentTypes(options?.contentType, "uint8array"),
    maxBytes: options?.maxBytes === undefined ? undefined : ByteSize.fromInputUnsafe(options.maxBytes)
  })

/**
 * Creates a schema for a stream of newline-delimited JSON elements.
 *
 * **Details**
 *
 * `contentType` defaults to `application/x-ndjson` and `maxElementBytes` to 1
 * MiB. `maxBytes` has no default. Pass a list of content types to accept
 * aliases such as `application/jsonl`. The first entry is the default.
 *
 * **Example** (Declaring an NDJSON request payload)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { HttpApiEndpoint, HttpApiSchema } from "effect/http-api"
 *
 * const Event = Schema.Struct({ id: Schema.Number })
 * const payload = HttpApiSchema.StreamNdjson({ schema: Event, maxBytes: "100 MiB" })
 *
 * // The handler receives a Stream of Events
 * const importEvents = HttpApiEndpoint.post("importEvents", "/events", {
 *   payload,
 *   success: Schema.Number
 * })
 *
 * importEvents.path // => "/events"
 * payload.contentType // => "application/x-ndjson"
 * payload.maxElementBytes // => 1048576n
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.6
 */
export const StreamNdjson = <S extends Schema.Constraint>(options: {
  readonly schema: S
  readonly contentType?: string | ReadonlyArray<string> | undefined
  readonly maxBytes?: ByteSize.Input | undefined
  readonly maxElementBytes?: ByteSize.Input | undefined
}): StreamNdjson<S> =>
  Schema.make<StreamNdjson<S>>(streamSchema.ast, {
    [StreamSchemaTypeId]: StreamSchemaTypeId,
    _tag: "StreamNdjson",
    mode: "ndjson",
    ...streamContentTypes(options.contentType, "ndjson"),
    schema: options.schema,
    maxBytes: options.maxBytes === undefined ? undefined : ByteSize.fromInputUnsafe(options.maxBytes),
    maxElementBytes: options.maxElementBytes === undefined
      ? defaultMaxElementBytes
      : ByteSize.fromInputUnsafe(options.maxElementBytes)
  })

/**
 * @internal
 */
export const isStreamSchema = (u: unknown): u is StreamSchema =>
  Schema.isSchema(u) && Predicate.hasProperty(u, StreamSchemaTypeId)

/**
 * @internal
 */
export const isStreamSse = (u: unknown): u is StreamSse<Sse.EventCodec, Schema.Top, unknown> =>
  isStreamSchema(u) && u._tag === "StreamSse"

/**
 * @internal
 */
export const isStreamUint8Array = (u: unknown): u is StreamUint8Array =>
  isStreamSchema(u) && u._tag === "StreamUint8Array"

/**
 * @internal
 */
export const isStreamNdjson = (u: unknown): u is StreamNdjson<Schema.Top> =>
  isStreamSchema(u) && u._tag === "StreamNdjson"

const UpgradeTypeId = "~effect/http-api/HttpApiSchema/Upgrade"

/**
 * Schema for a success response that switches the connection to another
 * protocol with an HTTP/1.1 upgrade.
 *
 * **Details**
 *
 * Created with {@link Upgrade}. The response is `101 Switching Protocols`, and
 * the connection then carries raw bytes in both directions as a `Socket`.
 * `Headers` is the schema of the custom `101` headers, or `never` when the
 * upgrade declares none.
 *
 * @stability unstable
 * @category models
 * @since 4.0.6
 */
export interface Upgrade<Headers extends Schema.Top = Schema.Top> extends
  Schema.Bottom<
    Socket.Socket,
    Socket.Socket,
    never,
    never,
    SchemaAST.Declaration,
    Upgrade<Headers>
  >
{
  readonly "Rebuild": Upgrade<Headers>
  readonly [UpgradeTypeId]: typeof UpgradeTypeId
  readonly protocol: string
  readonly headers: Headers | undefined
}

const upgradeSchema = Schema.declare(Socket.isSocket).pipe(status(101))

/**
 * Declares an endpoint success that upgrades the connection to `protocol`,
 * such as Docker's `tcp` for container attach.
 *
 * **When to use**
 *
 * Use when an endpoint hands over its connection as a raw byte stream after
 * `101 Switching Protocols`. For WebSocket, upgrade the request with
 * `HttpServerRequest.upgrade` and connect with `Socket.makeWebSocket` instead.
 *
 * **Details**
 *
 * The handler receives an `upgrade` function that returns the connection.
 * The `101` response is sent when the handler acquires the socket's reader,
 * so a handler can still fail with a declared error before then. Requests
 * that do not ask for `protocol` get `426 Upgrade Required`.
 *
 * `headers` declares custom `101` response headers, encoded like
 * `WithHeaders` headers. The handler passes them to `upgrade`, so they can
 * depend on the decoded request. `Connection`, `Upgrade`, `Content-Length`
 * and `Transfer-Encoding` cannot be set.
 *
 * The endpoint may declare a buffered payload, which is decoded before the
 * handler runs. Streaming payloads are rejected.
 *
 * The endpoint may also declare buffered or no-content successes at statuses
 * other than `101`, for a server that declines the upgrade (RFC 9110 §7.8).
 * The handler then either calls `upgrade` and returns nothing, or returns one
 * of those successes without calling it. An endpoint declares at most one
 * upgrade, and streaming successes cannot be combined with it.
 *
 * The client sends `Connection: Upgrade` and `Upgrade: protocol`, and returns
 * the response headers with the connection, decoded with `headers` when
 * declared. Ordinary success responses are decoded as usual, and
 * `HttpApiClient.isUpgraded` tells the two apart. Other responses are decoded
 * as the endpoint's errors.
 *
 * **Example** (Declaring an exec start endpoint)
 *
 * ```ts
 * import { Schema } from "effect"
 * import { HttpApiEndpoint, HttpApiSchema } from "effect/http-api"
 *
 * const start = HttpApiEndpoint.post("start", "/exec/:id/start", {
 *   params: { id: Schema.String },
 *   payload: Schema.Struct({ Detach: Schema.Boolean, Tty: Schema.Boolean }),
 *   success: [
 *     HttpApiSchema.Upgrade({
 *       protocol: "tcp",
 *       headers: {
 *         "content-type": Schema.Literals([
 *           "application/vnd.docker.raw-stream",
 *           "application/vnd.docker.multiplexed-stream"
 *         ])
 *       }
 *     }),
 *     // a detached exec answers with an empty 200 instead
 *     HttpApiSchema.Empty(200)
 *   ]
 * })
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.6
 */
export function Upgrade(options: { readonly protocol: string }): Upgrade<never>
/**
 * @stability unstable
 */
export function Upgrade<H extends Schema.Struct.Fields>(options: {
  readonly protocol: string
  readonly headers: H
}): Upgrade<Schema.Struct<H>>
/**
 * @stability unstable
 */
export function Upgrade<H extends Schema.Top>(options: {
  readonly protocol: string
  readonly headers: H
}): Upgrade<H>
/**
 * @stability unstable
 */
export function Upgrade(options: {
  readonly protocol: string
  readonly headers?: Schema.Top | Schema.Struct.Fields | undefined
}): Upgrade {
  if (options.protocol.toLowerCase() === "websocket") {
    throw new Error("Upgrade does not support WebSocket")
  }
  const headers = options.headers === undefined || Schema.isSchema(options.headers)
    ? options.headers
    : Schema.Struct(options.headers)
  return rebuildUpgrade(options.protocol, headers)
}

/**
 * @internal
 */
export const rebuildUpgrade = (protocol: string, headers: Schema.Top | undefined): Upgrade =>
  Schema.make<Upgrade>(upgradeSchema.ast, {
    [UpgradeTypeId]: UpgradeTypeId,
    protocol,
    headers
  })

/**
 * @internal
 */
export const isUpgrade = (u: unknown): u is Upgrade => Schema.isSchema(u) && Predicate.hasProperty(u, UpgradeTypeId)

function streamContentTypes(
  contentType: string | ReadonlyArray<string> | undefined,
  mode: StreamMode
): { readonly contentType: string; readonly contentTypes: Arr.NonEmptyReadonlyArray<string> } {
  if (contentType === undefined) contentType = defaultStreamContentType(mode)
  if (typeof contentType === "string") return { contentType, contentTypes: [contentType] }
  if (!Arr.isReadonlyArrayNonEmpty(contentType)) {
    throw new Error("Stream schemas require at least one content type")
  }
  const seen = new Set<string>()
  for (const entry of contentType) {
    const normalized = MediaType.normalize(entry)
    if (seen.has(normalized)) {
      throw new Error(`Duplicate stream content type: ${entry}`)
    }
    seen.add(normalized)
  }
  return { contentType: contentType[0], contentTypes: contentType }
}

function defaultStreamContentType(mode: StreamMode): string {
  switch (mode) {
    case "sse":
      return "text/event-stream"
    case "uint8array":
      return "application/octet-stream"
    case "ndjson":
      return "application/x-ndjson"
  }
}

/**
 * Runtime brand key used to mark `WithHeaders` response schemas.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const WithHeadersTypeId = "~effect/http-api/HttpApiSchema/WithHeaders"

/**
 * Type-level brand identifier used by `WithHeaders`.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type WithHeadersTypeId = typeof WithHeadersTypeId

/**
 * Runtime brand key used to mark `WithHeaders` response values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const WithHeadersValueTypeId = "~effect/http-api/HttpApiSchema/WithHeadersValue"

/**
 * Type-level brand identifier used by `WithHeaders` response values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type WithHeadersValueTypeId = typeof WithHeadersValueTypeId

/**
 * A response schema wrapping a body schema together with a response headers
 * schema.
 *
 * **Details**
 *
 * `WithHeaders` is a branded declaration schema: it carries the inner success
 * schema and the headers schema as properties, and server, client, and OpenAPI
 * integrations detect the brand and handle body and headers separately. It is
 * supported for error responses, though {@link encodeToWithHeaders} is usually
 * more convenient there because handlers can fail with the domain error value.
 *
 * - `schema` is the inner response schema. Success responses may wrap
 *   `StreamSse` and `StreamUint8Array`; error responses remain non-streaming.
 *   Nesting `WithHeaders` is rejected at construction.
 * - `headers` is any schema; endpoint construction applies
 *   a StringTree codec unless codecs are disabled. Optional headers that encode
 *   to `undefined` are omitted from the response.
 * - Status and response-encoding annotations are resolved from the wrapper
 *   first, falling through to the inner schema.
 * - A header-carrying response cannot share its status and content type with
 *   another response in the same success or error union. Endpoint construction
 *   rejects ambiguous declarations, including those made with
 *   {@link encodeToWithHeaders}.
 * - `Rebuild` preserves the brand and both parts, so `.annotate` keeps the
 *   wrapper intact.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface WithHeaders<S extends Schema.Top, H extends Schema.Top> extends
  Schema.Bottom<
    withHeaders<S["Type"], H["Type"]>,
    withHeaders<S["Encoded"], Schema.StringTree>,
    S["DecodingServices"] | H["DecodingServices"],
    S["EncodingServices"] | H["EncodingServices"],
    SchemaAST.Declaration,
    WithHeaders<S, H>
  >
{
  readonly "Rebuild": WithHeaders<S, H>
  readonly [WithHeadersTypeId]: typeof WithHeadersTypeId
  readonly schema: S
  readonly headers: H
}

/**
 * The Type of a `WithHeaders` schema: what handlers return and what the
 * client resolves to, constructed via {@link withHeaders}.
 *
 * **Details**
 *
 * `body` is the inner success value. For stream success schemas it is the
 * `Stream` itself, so headers are decided before the body starts streaming.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface withHeaders<A, H> {
  readonly [WithHeadersValueTypeId]: WithHeadersValueTypeId
  readonly body: A
  readonly headers: H
}

/**
 * @internal
 */
export const isWithHeadersValue = (u: unknown): u is withHeaders<unknown, unknown> =>
  Predicate.hasProperty(u, WithHeadersValueTypeId)

const withHeadersValueSchema = Schema.declare(isWithHeadersValue)

/**
 * Wraps a success schema with a response headers schema.
 *
 * **Details**
 *
 * Headers accept either a schema or a fields shorthand, mirroring the
 * request-side headers option.
 *
 * **Example** (Adding response headers to a success schema)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { HttpApiSchema } from "effect/http-api"
 *
 * const schema = HttpApiSchema.WithHeaders(Schema.String, {
 *   "x-total-count": Schema.FiniteFromString
 * })
 * const response: typeof schema.Type = HttpApiSchema.withHeaders({
 *   body: "created",
 *   headers: { "x-total-count": 1 }
 * })
 *
 * HttpApiSchema.isWithHeaders(schema) // => true
 * response.body // => "created"
 * response.headers // => { "x-total-count": 1 }
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export function WithHeaders<S extends Schema.Top, H extends Schema.Struct.Fields>(
  schema: S,
  headers: H
): WithHeaders<S, Schema.Struct<H>>
/**
 * @stability unstable
 */
export function WithHeaders<S extends Schema.Top, H extends Schema.Top>(
  schema: S,
  headers: H
): WithHeaders<S, H>
/**
 * @stability unstable
 */
export function WithHeaders(
  schema: Schema.Top,
  headers: Schema.Top | Schema.Struct.Fields
): WithHeaders<Schema.Top, Schema.Top> {
  if (isWithHeaders(schema)) {
    throw new Error("WithHeaders schemas cannot be nested")
  }
  if (isUpgrade(schema)) {
    throw new Error("WithHeaders cannot wrap an upgrade")
  }
  return Schema.make<WithHeaders<Schema.Top, Schema.Top>>(withHeadersValueSchema.ast, {
    [WithHeadersTypeId]: WithHeadersTypeId,
    schema,
    headers: Schema.isSchema(headers) ? headers : Schema.Struct(headers)
  })
}

/**
 * Constructs a `WithHeaders` response value from a body and headers.
 *
 * **Details**
 *
 * The returned value is branded so servers and clients can detect it exactly,
 * including in mixed success unions. The same shape is used on both sides: a
 * value received from a client can be returned from another handler unchanged.
 *
 * See {@link WithHeaders} for an example that constructs a schema and its
 * corresponding response value.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const withHeaders = <A, H>(options: {
  readonly body: A
  readonly headers: H
}): withHeaders<A, H> => ({
  [WithHeadersValueTypeId]: WithHeadersValueTypeId,
  body: options.body,
  headers: options.headers
})

/**
 * Returns `true` when a schema is a `WithHeaders` response schema.
 *
 * **Example** (Detecting a response headers schema)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { HttpApiSchema } from "effect/http-api"
 *
 * const schema = HttpApiSchema.WithHeaders(Schema.String, {
 *   "x-request-id": Schema.String
 * })
 *
 * HttpApiSchema.isWithHeaders(schema) // => true
 * HttpApiSchema.isWithHeaders(Schema.String) // => false
 * ```
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const isWithHeaders = (u: unknown): u is WithHeaders<Schema.Top, Schema.Top> =>
  Schema.isSchema(u) && Predicate.hasProperty(u, WithHeadersTypeId)

/**
 * @internal
 */
export function rebuildWithHeaders(
  self: WithHeaders<Schema.Top, Schema.Top>,
  schema: Schema.Top,
  headers: Schema.Top
): WithHeaders<Schema.Top, Schema.Top> {
  return Schema.make<WithHeaders<Schema.Top, Schema.Top>>(self.ast, {
    [WithHeadersTypeId]: WithHeadersTypeId,
    schema,
    headers
  })
}

/**
 * Schema type returned by `encodeToWithHeaders`, encoding as a `{ body, headers }`
 * pair while decoding to the source schema type.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export interface encodeToWithHeaders<
  S extends Schema.Top,
  Body extends Schema.Top,
  Headers extends Schema.Struct.Fields
> extends
  Schema.decodeTo<
    Schema.toType<S>,
    Schema.Struct<{
      readonly body: Body
      readonly headers: Schema.Struct<Headers>
    }>
  >
{}

/**
 * Encodes a schema as a `{ body, headers }` pair, folding response headers into
 * an opaque domain type such as an error class.
 *
 * **Details**
 *
 * The encoded side is the pair of the body schema and the headers fields; the
 * Type stays the source schema's Type. The body schema is authoritative for
 * everything wire-level: status, content type, and response encoding resolve
 * from the body schema's annotations.
 *
 * The mappings are pure total functions: validation lives in the body and
 * header schemas, the mappings only reshape valid data.
 *
 * Streams used as the body schema turn mid-stream transport errors into
 * defects on the client. Stream responses should use {@link WithHeaders},
 * which preserves the body stream's error channel in the generated client.
 *
 * **Example** (Encoding an error with headers)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { HttpApiSchema } from "effect/http-api"
 *
 * class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", {
 *   userId: Schema.Int
 * }) {}
 *
 * const UserNotFoundWithHeaders = UserNotFound.pipe(
 *   HttpApiSchema.encodeToWithHeaders({
 *     body: HttpApiSchema.Empty(404),
 *     headers: {
 *       "x-user-id": Schema.Int
 *     }
 *   }, {
 *     decode: ({ headers }) => new UserNotFound({ userId: headers["x-user-id"] }),
 *     encode: (error) => ({
 *       headers: { "x-user-id": error.userId },
 *       body: undefined
 *     })
 *   })
 * )
 *
 * const encoded = Schema.encodeSync(UserNotFoundWithHeaders)(new UserNotFound({ userId: 123 }))
 * encoded // => { body: undefined, headers: { "x-user-id": 123 } }
 * ```
 *
 * @see {@link WithHeaders} for the structural wrapper recommended for success
 * responses, including streams.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export function encodeToWithHeaders<
  S extends Schema.Top,
  Body extends Schema.Top,
  Headers extends Schema.Struct.Fields
>(options: {
  readonly body: Body
  readonly headers: Headers
}, transformation: {
  readonly decode: (
    value: Schema.Struct.Type<{ readonly body: Body; readonly headers: Schema.Struct<Headers> }>
  ) => S["Type"]
  readonly encode: (
    value: S["Type"]
  ) => Schema.Struct.Type<{ readonly body: Body; readonly headers: Schema.Struct<Headers> }>
}) {
  return (self: S): encodeToWithHeaders<S, Body, Headers> => {
    const body = options.body
    if (isUpgrade(body)) {
      throw new Error("encodeToWithHeaders cannot wrap an upgrade")
    }
    const headers = Schema.Struct(options.headers)
    const status = resolveHttpApiStatus(body.ast)
    const encoding = resolveHttpApiEncoding(body.ast)
    return Schema.Struct({ body, headers }).pipe(
      Schema.decodeTo(
        Schema.toType(self),
        SchemaTransformation.transform(transformation)
      )
    ).annotate({
      "~httpApiWithHeaders": {
        body,
        headers,
        bodyCodec: body,
        headersCodec: headers,
        transformation
      } as WithHeadersAnnotation,
      httpApiStatus: status,
      "~httpApiEncoding": encoding
    })
  }
}

/**
 * Runtime brand key used to mark schemas as buffered multipart payloads.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const MultipartTypeId = "~effect/http-api/HttpApiSchema/Multipart"

/**
 * Type-level brand identifier used by `asMultipart`.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type MultipartTypeId = typeof MultipartTypeId

/**
 * Schema type returned by `asMultipart` for buffered multipart payloads.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export interface asMultipart<S extends Schema.Top> extends Schema.brand<S["Rebuild"], MultipartTypeId> {}

/**
 * Marks a schema as a multipart payload.
 *
 * @see {@link asMultipartStream} for a multipart stream payload.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export function asMultipart(options?: Multipart_.withLimits.Options) {
  return <S extends Schema.Top>(self: S): asMultipart<S> =>
    self.pipe(Schema.brand(MultipartTypeId)).annotate({
      "~httpApiEncoding": {
        _tag: "Multipart",
        mode: "buffered",
        contentType: defaultContentType("Multipart"),
        limits: options
      }
    })
}

/**
 * Runtime brand key used to mark schemas as streaming multipart payloads.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const MultipartStreamTypeId = "~effect/http-api/HttpApiSchema/MultipartStream"

/**
 * Type-level brand identifier used by `asMultipartStream`.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type MultipartStreamTypeId = typeof MultipartStreamTypeId

/**
 * Schema type returned by `asMultipartStream` for streaming multipart payloads.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export interface asMultipartStream<S extends Schema.Top> extends Schema.brand<S["Rebuild"], MultipartStreamTypeId> {}

/**
 * Marks a schema as a multipart stream payload.
 *
 * @see {@link asMultipart} for a buffered multipart payload.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export function asMultipartStream(options?: Multipart_.withLimits.Options) {
  return <S extends Schema.Top>(self: S): asMultipartStream<S> =>
    self.pipe(Schema.brand(MultipartStreamTypeId)).annotate({
      "~httpApiEncoding": {
        _tag: "Multipart",
        mode: "stream",
        contentType: defaultContentType("Multipart"),
        limits: options
      }
    })
}

function asNonMultipartEncoding<S extends Schema.Top>(self: S, options: {
  readonly _tag: "Json" | "FormUrlEncoded" | "Uint8Array" | "Text"
  readonly contentType?: string | undefined
}): S["Rebuild"] {
  return self.annotate({
    "~httpApiEncoding": {
      _tag: options._tag,
      contentType: options.contentType ?? defaultContentType(options._tag)
    }
  })
}

function defaultContentType(_tag: Encoding["_tag"]): string {
  switch (_tag) {
    case "Multipart":
      return "multipart/form-data"
    case "Json":
      return "application/json"
    case "FormUrlEncoded":
      return "application/x-www-form-urlencoded"
    case "Uint8Array":
      return "application/octet-stream"
    case "Text":
      return "text/plain"
  }
}

/**
 * Marks a schema as a JSON payload / response.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export function asJson(options?: {
  readonly contentType?: string
}) {
  return <S extends Schema.Top>(self: S) => asNonMultipartEncoding(self, { _tag: "Json", ...options })
}

/**
 * Marks a schema as an `application/x-www-form-urlencoded` payload or response.
 *
 * **Details**
 *
 * The schema's encoded side must be a record of strings.
 *
 * **Gotchas**
 *
 * Fields are flat on the server. A field that encodes to a nested object is
 * sent as bracket keys that the server does not read back; use an explicit
 * codec such as `Schema.fromJsonString(...)` for structured values.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export function asFormUrlEncoded(options?: {
  readonly contentType?: string
}) {
  return <S extends Schema.Top>(
    self: S
  ) => asNonMultipartEncoding(self, { _tag: "FormUrlEncoded", ...options })
}

/**
 * Marks a schema as a text payload / response.
 *
 * **Details**
 *
 * The schema encoded side must be a string.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export function asText(options?: {
  readonly contentType?: string
}) {
  return <S extends Schema.Top & { readonly Encoded: string }>(self: S) =>
    asNonMultipartEncoding(self, { _tag: "Text", ...options })
}

/**
 * Marks a schema as a binary payload / response.
 *
 * **Details**
 *
 * The schema encoded side must be a `Uint8Array`.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export function asUint8Array(options?: {
  readonly contentType?: string
}) {
  return <S extends Schema.Top & { readonly Encoded: Uint8Array }>(self: S) =>
    asNonMultipartEncoding(self, { _tag: "Uint8Array", ...options })
}
/**
 * Returns `true` when a schema AST represents a no-content response.
 *
 * **Details**
 *
 * The check succeeds for direct `void` schemas and schemas whose encoded or
 * transformation target is `void`.
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const isNoContent = (ast: SchemaAST.AST): boolean => {
  if (SchemaAST.isVoid(ast)) return true
  const encoded = SchemaAST.toEncoded(ast)
  if (SchemaAST.isVoid(encoded)) return true
  const target = ast.encoding?.[0].to
  if (target === undefined) return false
  return SchemaAST.isVoid(target)
}

const resolveHttpApiEncoding = SchemaAST.resolveAt<Encoding>("~httpApiEncoding")

/**
 * @internal
 */
export const getWithHeadersAnnotation = SchemaAST.resolveAt<WithHeadersAnnotation>("~httpApiWithHeaders")

function findHttpApiStatusAnnotation(
  ast: SchemaAST.AST | SchemaAST.FilterGroup<any>
): Schema.Annotations.Annotations | undefined {
  if (ast.checks) {
    for (let i = ast.checks.length - 1; i >= 0; i--) {
      const check = ast.checks[i]
      if (check.annotations && "httpApiStatus" in check.annotations) return check.annotations
      if (check._tag === "FilterGroup") {
        const annotations = findHttpApiStatusAnnotation(check)
        if (annotations !== undefined) return annotations
      }
    }
  }
  const annotations = ast.annotations
  return annotations && "httpApiStatus" in annotations ? annotations : undefined
}

function resolveHttpApiStatus(ast: SchemaAST.AST): number | undefined {
  const annotations = findHttpApiStatusAnnotation(ast)
  // An explicit undefined clears the status instead of falling back to key context.
  if (annotations !== undefined) return annotations.httpApiStatus as number | undefined
  return ast.context?.annotations?.httpApiStatus
}

const defaultJsonEncoding: Encoding = {
  _tag: "Json",
  contentType: "application/json"
}
const defaultUrlEncodedEncoding: Encoding = {
  _tag: "FormUrlEncoded",
  contentType: "application/x-www-form-urlencoded"
}

function getEncoding(ast: SchemaAST.AST): Encoding {
  return resolveHttpApiEncoding(ast) ?? defaultJsonEncoding
}

/**
 * @internal
 */
export function getPayloadEncoding(ast: SchemaAST.AST, method: HttpMethod): PayloadEncoding {
  const encoding = resolveHttpApiEncoding(ast)
  if (encoding) return encoding
  return hasBody(method) ? defaultJsonEncoding : defaultUrlEncodedEncoding
}

/**
 * @internal
 */
export function getResponseEncoding(ast: SchemaAST.AST): ResponseEncoding {
  const out = getEncoding(ast)
  if (out._tag === "Multipart") {
    throw new Error("Multipart is not supported in response")
  }
  return out
}

/**
 * @internal
 */
export function getStatusSuccess(self: SchemaAST.AST): number {
  return resolveHttpApiStatus(self) ?? 200
}

/**
 * @internal
 */
export function getStatusSuccessSchema(schema: Schema.Constraint): number {
  if (isWithHeaders(schema)) {
    return resolveHttpApiStatus(schema.ast) ?? getStatusSuccess(schema.schema.ast)
  }
  return getStatusSuccess(schema.ast)
}

/**
 * @internal
 */
export function getResponseEncodingSchema(schema: Schema.Constraint): ResponseEncoding {
  if (isWithHeaders(schema) && resolveHttpApiEncoding(schema.ast) === undefined) {
    return getResponseEncoding(schema.schema.ast)
  }
  return getResponseEncoding(schema.ast)
}

/**
 * @internal
 */
export function getStatusError(self: SchemaAST.AST): number {
  return resolveHttpApiStatus(self) ?? 500
}

/**
 * @internal
 */
export function getStatusErrorSchema(schema: Schema.Constraint): number {
  if (isWithHeaders(schema)) {
    return resolveHttpApiStatus(schema.ast) ?? getStatusError(schema.schema.ast)
  }
  return getStatusError(schema.ast)
}
