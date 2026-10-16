/**
 * Provides server-side access to the current incoming HTTP request.
 *
 * `HttpServerRequest` is the context service used by handlers, middleware,
 * schema decoders, multipart parsers, WebSocket upgrades, and adapters. A
 * request stores its method, URL, original URL, headers, cookies, remote
 * address, body stream, and platform source object. This module also includes
 * request conversions and schema decoders for cookies, headers, search
 * parameters, JSON, forms, URL-encoded bodies, and multipart bodies.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as Arr from "../Array.ts"
import * as Channel from "../Channel.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import type * as FileSystem from "../FileSystem.ts"
import * as Inspectable from "../Inspectable.ts"
import * as InternalRecord from "../internal/record.ts"
import * as Option from "../Option.ts"
import type * as Path from "../Path.ts"
import type { ReadonlyRecord } from "../Record.ts"
import * as Result from "../Result.ts"
import * as Schema from "../Schema.ts"
import type { ParseOptions } from "../SchemaAST.ts"
import type * as Scope from "../Scope.ts"
import * as Socket from "../socket/Socket.ts"
import * as Stream from "../Stream.ts"
import * as Cookies from "./Cookies.ts"
import * as Headers from "./Headers.ts"
import * as HttpBody from "./HttpBody.ts"
import * as HttpClientRequest from "./HttpClientRequest.ts"
import * as HttpIncomingMessage from "./HttpIncomingMessage.ts"
import { hasBody, type HttpMethod } from "./HttpMethod.ts"
import { HttpServerError, type RequestError, RequestParseError } from "./HttpServerError.ts"
import * as bodyInternal from "./internal/httpBody.ts"
import * as Multipart from "./Multipart.ts"
import * as UrlParams from "./UrlParams.ts"

/**
 * @stability unstable
 */
export {
  /**
   * Provides the `MaxBodySize` fiber reference for configuring request body limits.
   *
   * **When to use**
   *
   * Use to configure the maximum body size accepted while reading server
   * request bodies.
   *
   * @stability unstable
   * @category references
   * @since 4.0.0
   */
  MaxBodySize
} from "./HttpIncomingMessage.ts"

/**
 * Runtime type identifier for `HttpServerRequest` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId = "~effect/http/HttpServerRequest"

/**
 * Server-side representation of an incoming HTTP request.
 *
 * **Details**
 *
 * It extends `HttpIncomingMessage` with request metadata, parsed cookies,
 * multipart accessors, WebSocket upgrade support, and a `modify` method for
 * creating adjusted request views.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface HttpServerRequest extends HttpIncomingMessage.HttpIncomingMessage<HttpServerError> {
  readonly [TypeId]: typeof TypeId
  readonly source: object
  readonly url: string
  readonly originalUrl: string
  readonly method: HttpMethod
  readonly cookies: ReadonlyRecord<string, string>

  readonly multipart: Effect.Effect<
    Multipart.Persisted,
    Multipart.MultipartError,
    Scope.Scope | FileSystem.FileSystem | Path.Path
  >
  readonly multipartStream: Stream.Stream<Multipart.Part, Multipart.MultipartError>

  readonly upgrade: Effect.Effect<Socket.Socket, HttpServerError>

  readonly modify: (
    options: {
      readonly url?: string
      readonly headers?: Headers.Headers
      readonly remoteAddress?: Option.Option<string>
    }
  ) => HttpServerRequest
}

/**
 * Service tag for the active server-side HTTP request.
 *
 * **When to use**
 *
 * Use to access the request currently being handled by HTTP server routes and
 * middleware.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const HttpServerRequest: Context.Service<HttpServerRequest, HttpServerRequest> = Context.Service(
  "effect/http/HttpServerRequest"
)

/**
 * Service that contains decoded URL query parameters for the current request.
 *
 * **When to use**
 *
 * Use to access query parameters that have already been parsed for the current
 * server request.
 *
 * **Details**
 *
 * Each key maps to a string value, or to an array when the parameter appears more
 * than once.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class ParsedSearchParams extends Context.Service<
  ParsedSearchParams,
  ReadonlyRecord<string, string | Array<string>>
>()("effect/http/ParsedSearchParams") {}

/**
 * Converts a `URL` object's search parameters into a record.
 *
 * **Details**
 *
 * Repeated parameters are represented as arrays in insertion order.
 *
 * @stability unstable
 * @category parsing
 * @since 4.0.0
 */
export const searchParamsFromURL = (url: URL): ReadonlyRecord<string, string | Array<string>> => {
  const out: Record<string, string | Array<string>> = {}
  for (const [key, value] of url.searchParams.entries()) {
    if (Object.hasOwn(out, key)) {
      const entry = out[key]
      if (Array.isArray(entry)) {
        entry.push(value)
      } else {
        InternalRecord.assignProperty(out, key, [entry, value])
      }
    } else {
      InternalRecord.assignProperty(out, key, value)
    }
  }
  return out
}

/**
 * Creates a channel backed by the current request's upgraded socket.
 *
 * **Details**
 *
 * The channel reads incoming socket messages and writes byte chunks to the
 * socket, failing if the request cannot be upgraded or the socket fails.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const upgradeChannel = <IE = never>(): Channel.Channel<
  Arr.NonEmptyReadonlyArray<Uint8Array>,
  HttpServerError | IE | Socket.SocketError,
  void,
  Arr.NonEmptyReadonlyArray<string | Uint8Array | Socket.CloseEvent>,
  IE,
  unknown,
  HttpServerRequest
> =>
  HttpServerRequest.pipe(
    Effect.flatMap((_) => _.upgrade),
    Effect.map(Socket.toChannelWith<IE>()),
    Channel.unwrap
  )

/**
 * Decodes a schema from the cookies of the current request.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const schemaCookies = <A, I extends Readonly<Record<string, string | undefined>>, RD>(
  schema: Schema.ConstraintCodec<A, I, RD, unknown>,
  options?: ParseOptions | undefined
): Effect.Effect<A, Schema.SchemaError, RD | HttpServerRequest> => {
  const parse = Schema.decodeUnknownEffect(schema)
  return Effect.flatMap(HttpServerRequest, (req) => parse(req.cookies, options))
}

/**
 * Decodes a schema from the headers of the current request.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const schemaHeaders = <A, I extends Readonly<Record<string, string | undefined>>, RD>(
  schema: Schema.ConstraintCodec<A, I, RD, unknown>,
  options?: ParseOptions | undefined
): Effect.Effect<A, Schema.SchemaError, HttpServerRequest | RD> => {
  const parse = Schema.decodeUnknownEffect(schema)
  return Effect.flatMap(HttpServerRequest, (req) => parse(req.headers, options))
}

/**
 * Decodes a schema from the parsed search parameters of the current request.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const schemaSearchParams = <
  A,
  I extends Readonly<Record<string, string | ReadonlyArray<string> | undefined>>,
  RD
>(
  schema: Schema.ConstraintCodec<A, I, RD, unknown>,
  options?: ParseOptions | undefined
): Effect.Effect<A, Schema.SchemaError, ParsedSearchParams | RD> => {
  const parse = Schema.decodeUnknownEffect(schema)
  return Effect.flatMap(ParsedSearchParams, (params) => parse(params, options))
}
/**
 * Reads the current request body as JSON and decodes it with the supplied schema.
 *
 * **Details**
 *
 * The effect can fail if the body cannot be read or parsed, or if schema decoding
 * fails.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const schemaBodyJson = <A, RD>(
  schema: Schema.ConstraintDecoder<A, RD>,
  options?: (ParseOptions & HttpIncomingMessage.JsonOptions) | undefined
): Effect.Effect<A, HttpServerError | Schema.SchemaError, HttpServerRequest | RD> => {
  const parse = HttpIncomingMessage.schemaBodyJson(schema, options)
  return Effect.flatMap(HttpServerRequest, parse)
}

const isMultipart = (request: HttpServerRequest) =>
  request.headers["content-type"]?.toLowerCase().includes("multipart/form-data") === true ||
  getFormDataBody(request) !== undefined

/**
 * Decodes the current request body as form data.
 *
 * **Details**
 *
 * Multipart requests are persisted and decoded as multipart data; other form
 * requests are decoded from URL-encoded body parameters.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const schemaBodyForm = <A, I extends Partial<Multipart.Persisted>, RD>(
  schema: Schema.ConstraintCodec<A, I, RD, unknown>,
  options?: ParseOptions | undefined
) => {
  const parseMultipart = Multipart.schemaPersisted(schema)
  const parseUrlParams = HttpIncomingMessage.schemaBodyUrlParams(
    schema as Schema.ConstraintCodec<A, any, RD, unknown>,
    options
  )
  return Effect.flatMap(HttpServerRequest, (request): Effect.Effect<
    A,
    Multipart.MultipartError | Schema.SchemaError | HttpServerError,
    RD | HttpServerRequest | Scope.Scope | FileSystem.FileSystem | Path.Path
  > => {
    if (isMultipart(request)) {
      return Effect.flatMap(request.multipart, (_) => parseMultipart(_, options))
    }
    return parseUrlParams(request)
  })
}

/**
 * Reads the current request body as URL-encoded parameters and decodes them with
 * the supplied schema.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const schemaBodyUrlParams = <
  A,
  I extends Readonly<Record<string, string | ReadonlyArray<string> | undefined>>,
  RD
>(
  schema: Schema.ConstraintCodec<A, I, RD, unknown>,
  options?: ParseOptions | undefined
): Effect.Effect<A, HttpServerError | Schema.SchemaError, HttpServerRequest | RD> => {
  const parse = HttpIncomingMessage.schemaBodyUrlParams(schema, options)
  return Effect.flatMap(HttpServerRequest, parse)
}

/**
 * Persists the current multipart request body and decodes it with the supplied
 * schema.
 *
 * **Details**
 *
 * The effect requires the services needed to persist multipart files, including a
 * scope, file system, and path service.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const schemaBodyMultipart = <A, I extends Partial<Multipart.Persisted>, RD>(
  schema: Schema.ConstraintCodec<A, I, RD, unknown>,
  options?: ParseOptions | undefined
): Effect.Effect<
  A,
  Multipart.MultipartError | Schema.SchemaError,
  HttpServerRequest | Scope.Scope | FileSystem.FileSystem | Path.Path | RD
> => {
  const parse = Multipart.schemaPersisted(schema)
  return HttpServerRequest.pipe(
    Effect.flatMap((_) => _.multipart),
    Effect.flatMap((_) => parse(_, options))
  )
}

/**
 * Creates a decoder for a JSON value stored in a form field.
 *
 * **Details**
 *
 * For multipart requests, the named multipart field is decoded as JSON. For
 * URL-encoded requests, the named parameter is decoded as JSON and then decoded
 * with the supplied schema.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const schemaBodyFormJson = <A, RD>(
  schema: Schema.ConstraintDecoder<A, RD>,
  options?: (ParseOptions & HttpIncomingMessage.JsonOptions) | undefined
) => {
  const parseMultipart = Multipart.schemaJson(schema, options)
  return (field: string) => {
    const parseUrlParams = Schema.JsonFromUrlParamsField(field, options).pipe(
      Schema.decodeTo(schema),
      Schema.decodeEffect
    )
    return Effect.flatMap(
      HttpServerRequest,
      (request): Effect.Effect<
        A,
        Schema.SchemaError | HttpServerError,
        RD | FileSystem.FileSystem | Path.Path | Scope.Scope | HttpServerRequest
      > => {
        if (isMultipart(request)) {
          return Effect.flatMap(
            Effect.mapError(request.multipart, (cause) =>
              new HttpServerError({
                reason: new RequestParseError({
                  request,
                  cause
                })
              })),
            parseMultipart(field)
          )
        }
        return Effect.flatMap(request.urlParamsBody, (_) => parseUrlParams(_, options))
      }
    )
  }
}

/**
 * Creates an `HttpServerRequest` view of an `HttpClientRequest`.
 *
 * **Details**
 *
 * If the client request can be converted to an absolute URL, that URL is used as
 * the original URL.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const fromClientRequest = (request: HttpClientRequest.HttpClientRequest): HttpServerRequest => {
  const url = Option.match(HttpClientRequest.toUrl(request), {
    onNone: () => request.url,
    onSome: (url) => url.toString()
  })
  return new ClientRequestImpl(request, url)
}

/**
 * Wraps a Web `Request` as an `HttpServerRequest`.
 *
 * **Details**
 *
 * The request's current URL is stored without the scheme and host, while the
 * original Web URL remains available as `originalUrl`.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const fromWeb = (request: globalThis.Request): HttpServerRequest =>
  new ServerRequestImpl(request, removeHost(request.url))

/**
 * Converts an `HttpServerRequest` into an `HttpClientRequest`.
 *
 * **Details**
 *
 * The converted request preserves the method, headers, body stream, and a URL
 * derived from the request when possible.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toClientRequest = (request: HttpServerRequest): HttpClientRequest.HttpClientRequest => {
  const body = toClientBody(request)
  const headers = body._tag !== "Empty" && body.contentLength === undefined
    ? Headers.remove(request.headers, "content-length")
    : request.headers
  return HttpClientRequest.setUrl(
    HttpClientRequest.makeWith(
      request.method,
      "",
      UrlParams.empty,
      Option.none(),
      headers,
      body
    ),
    Option.getOrElse(toURL(request), () => request.url)
  )
}

const toClientBody = (request: HttpServerRequest): HttpBody.HttpBody => {
  if (!hasBody(request.method)) {
    return HttpBody.empty
  }
  const formData = getFormDataBody(request)
  return formData === undefined
    ? HttpBody.stream(
      request.stream,
      request.headers["content-type"],
      bodyInternal.parseContentLength(request.headers["content-length"])
    )
    : HttpBody.formData(formData)
}

const removeHost = (url: string) => {
  if (url[0] === "/") {
    return url
  }
  const index = url.indexOf("/", url.indexOf("//") + 2)
  return index === -1 ? "/" : url.slice(index)
}

class ServerRequestImpl extends Inspectable.Class implements HttpServerRequest {
  readonly [TypeId]: typeof TypeId
  readonly [HttpIncomingMessage.TypeId]: typeof HttpIncomingMessage.TypeId
  readonly source: Request
  readonly url: string
  public headersOverride?: Headers.Headers | undefined
  private remoteAddressOverride?: Option.Option<string> | undefined

  constructor(
    source: Request,
    url: string,
    headersOverride?: Headers.Headers,
    remoteAddressOverride?: Option.Option<string>
  ) {
    super()
    this[TypeId] = TypeId
    this[HttpIncomingMessage.TypeId] = HttpIncomingMessage.TypeId
    this.source = source
    this.url = url
    this.headersOverride = headersOverride
    this.remoteAddressOverride = remoteAddressOverride
  }
  toJSON(): unknown {
    return HttpIncomingMessage.inspect(this, {
      _id: "HttpServerRequest",
      method: this.method,
      url: this.originalUrl
    })
  }
  modify(
    options: {
      readonly url?: string | undefined
      readonly headers?: Headers.Headers | undefined
      readonly remoteAddress?: Option.Option<string> | undefined
    }
  ) {
    return new ServerRequestImpl(
      this.source,
      options.url ?? this.url,
      options.headers ?? this.headersOverride,
      "remoteAddress" in options ? options.remoteAddress : this.remoteAddressOverride
    )
  }
  get method(): HttpMethod {
    return this.source.method.toUpperCase() as HttpMethod
  }
  get originalUrl() {
    return this.source.url
  }
  get remoteAddress(): Option.Option<string> {
    return this.remoteAddressOverride ?? Option.none()
  }
  get headers(): Headers.Headers {
    this.headersOverride ??= Headers.fromInput(this.source.headers as any)
    return this.headersOverride
  }

  private cachedCookies: ReadonlyRecord<string, string> | undefined
  get cookies() {
    if (this.cachedCookies) {
      return this.cachedCookies
    }
    return this.cachedCookies = Cookies.parseHeader(this.headers.cookie ?? "")
  }

  get stream(): Stream.Stream<Uint8Array, HttpServerError> {
    return this.source.body
      ? Stream.fromReadableStream({
        evaluate: () => this.source.body as any,
        onError: (cause) =>
          new HttpServerError({
            reason: new RequestParseError({
              request: this,
              cause
            })
          })
      })
      : Stream.fail(
        new HttpServerError({
          reason: new RequestParseError({
            request: this,
            description: "can not create stream from empty body"
          })
        })
      )
  }

  private textEffect: Effect.Effect<string, HttpServerError> | undefined
  get text(): Effect.Effect<string, HttpServerError> {
    if (this.textEffect) {
      return this.textEffect
    }
    this.textEffect = Effect.runSync(Effect.cached(
      Effect.tryPromise({
        try: () => this.source.text(),
        catch: (cause) =>
          new HttpServerError({
            reason: new RequestParseError({
              request: this,
              cause
            })
          })
      })
    ))
    return this.textEffect
  }

  get json(): Effect.Effect<Schema.Json, HttpServerError> {
    return Effect.flatMap(this.text, (text) =>
      Effect.try({
        try: () => JSON.parse(text) as Schema.Json,
        catch: (cause) =>
          new HttpServerError({
            reason: new RequestParseError({
              request: this,
              cause
            })
          })
      }))
  }

  get urlParamsBody(): Effect.Effect<UrlParams.UrlParams, HttpServerError> {
    return Effect.flatMap(this.text, (_) =>
      Effect.try({
        try: () => UrlParams.fromInput(new URLSearchParams(_)),
        catch: (cause) =>
          new HttpServerError({
            reason: new RequestParseError({
              request: this,
              cause
            })
          })
      }))
  }

  private multipartEffect:
    | Effect.Effect<
      Multipart.Persisted,
      Multipart.MultipartError,
      Scope.Scope | FileSystem.FileSystem | Path.Path
    >
    | undefined
  get multipart(): Effect.Effect<
    Multipart.Persisted,
    Multipart.MultipartError,
    Scope.Scope | FileSystem.FileSystem | Path.Path
  > {
    if (this.multipartEffect) {
      return this.multipartEffect
    }
    this.multipartEffect = Effect.runSync(Effect.cached(
      Multipart.toPersisted(this.multipartStream)
    ))
    return this.multipartEffect
  }

  get multipartStream(): Stream.Stream<Multipart.Part, Multipart.MultipartError> {
    return Stream.pipeThroughChannel(
      Stream.mapError(this.stream, (cause) => Multipart.MultipartError.fromReason("InternalError", cause)),
      Multipart.makeChannel(this.headers)
    )
  }

  private arrayBufferEffect: Effect.Effect<ArrayBuffer, HttpServerError> | undefined
  get arrayBuffer(): Effect.Effect<ArrayBuffer, HttpServerError> {
    if (this.arrayBufferEffect) {
      return this.arrayBufferEffect
    }
    this.arrayBufferEffect = Effect.runSync(Effect.cached(
      Effect.tryPromise({
        try: () => this.source.arrayBuffer(),
        catch: (cause) =>
          new HttpServerError({
            reason: new RequestParseError({
              request: this,
              cause
            })
          })
      })
    ))
    return this.arrayBufferEffect
  }

  get upgrade(): Effect.Effect<Socket.Socket, HttpServerError> {
    return Effect.fail(
      new HttpServerError({
        reason: new RequestParseError({
          request: this,
          description: "Not an upgradeable ServerRequest"
        })
      })
    )
  }
}

class ClientRequestImpl extends Inspectable.Class implements HttpServerRequest {
  readonly [TypeId]: typeof TypeId
  readonly [HttpIncomingMessage.TypeId]: typeof HttpIncomingMessage.TypeId
  readonly source: HttpClientRequest.HttpClientRequest
  public originalUrl: string
  public headersOverride?: Headers.Headers | undefined
  private remoteAddressOverride?: Option.Option<string> | undefined
  private urlOverride?: string | undefined

  constructor(
    source: HttpClientRequest.HttpClientRequest,
    originalUrl: string,
    urlOverride?: string,
    headersOverride?: Headers.Headers,
    remoteAddressOverride?: Option.Option<string>
  ) {
    super()
    this[TypeId] = TypeId
    this[HttpIncomingMessage.TypeId] = HttpIncomingMessage.TypeId
    this.source = source
    this.originalUrl = originalUrl
    this.urlOverride = urlOverride
    this.headersOverride = headersOverride
    this.remoteAddressOverride = remoteAddressOverride
  }

  toJSON(): unknown {
    return HttpIncomingMessage.inspect(this, {
      _id: "HttpServerRequest",
      method: this.method,
      url: this.originalUrl
    })
  }

  modify(
    options: {
      readonly url?: string | undefined
      readonly headers?: Headers.Headers | undefined
      readonly remoteAddress?: Option.Option<string> | undefined
    }
  ) {
    return new ClientRequestImpl(
      this.source,
      this.originalUrl,
      options.url ?? this.url,
      options.headers ?? this.headersOverride,
      "remoteAddress" in options ? options.remoteAddress : this.remoteAddressOverride
    )
  }

  get method(): HttpMethod {
    return this.source.method
  }

  get url(): string {
    return this.urlOverride ?? removeHost(this.originalUrl)
  }

  get remoteAddress(): Option.Option<string> {
    return this.remoteAddressOverride ?? Option.none()
  }

  get headers(): Headers.Headers {
    return this.headersOverride ??= this.source.headers
  }

  private cachedCookies: ReadonlyRecord<string, string> | undefined
  get cookies() {
    if (this.cachedCookies) {
      return this.cachedCookies
    }
    return this.cachedCookies = Cookies.parseHeader(this.headers.cookie ?? "")
  }

  get stream(): Stream.Stream<Uint8Array, HttpServerError> {
    const body = this.source.body
    switch (body._tag) {
      case "Empty": {
        return Stream.empty
      }
      case "Uint8Array": {
        return Stream.succeed(body.body)
      }
      case "Stream": {
        return Stream.mapError(body.stream, (cause) => requestParseError(this, undefined, cause))
      }
      case "FormData": {
        return streamFromReadable(this, new Response(body.formData).body)
      }
      case "Raw": {
        return rawBodyStream(this, body.body)
      }
    }
  }

  private bytesEffect: Effect.Effect<Uint8Array, HttpServerError> | undefined
  private get bytes(): Effect.Effect<Uint8Array, HttpServerError> {
    if (this.bytesEffect) {
      return this.bytesEffect
    }
    const body = this.source.body
    let effect: Effect.Effect<Uint8Array, HttpServerError>
    switch (body._tag) {
      case "Empty": {
        effect = Effect.succeed(new Uint8Array(0))
        break
      }
      case "Uint8Array": {
        effect = Effect.succeed(body.body)
        break
      }
      case "FormData": {
        effect = bytesFromBodyInit(this, body.formData)
        break
      }
      case "Stream": {
        effect = Stream.mkUint8Array(this.stream)
        break
      }
      case "Raw": {
        effect = rawBodyBytes(this, body.body)
        break
      }
    }
    this.bytesEffect = Effect.runSync(Effect.cached(effect))
    return this.bytesEffect
  }

  get text(): Effect.Effect<string, HttpServerError> {
    return Effect.map(this.bytes, (bytes) => textDecoder.decode(bytes))
  }

  get json(): Effect.Effect<Schema.Json, HttpServerError> {
    return Effect.flatMap(this.text, (text) =>
      Effect.try({
        try: () => text === "" ? null : JSON.parse(text),
        catch: (cause) => requestParseError(this, undefined, cause)
      }))
  }

  get urlParamsBody(): Effect.Effect<UrlParams.UrlParams, HttpServerError> {
    return Effect.flatMap(this.text, (_) =>
      Effect.try({
        try: () => UrlParams.fromInput(new URLSearchParams(_)),
        catch: (cause) => requestParseError(this, undefined, cause)
      }))
  }

  private multipartEffect:
    | Effect.Effect<
      Multipart.Persisted,
      Multipart.MultipartError,
      Scope.Scope | FileSystem.FileSystem | Path.Path
    >
    | undefined
  get multipart(): Effect.Effect<
    Multipart.Persisted,
    Multipart.MultipartError,
    Scope.Scope | FileSystem.FileSystem | Path.Path
  > {
    if (this.multipartEffect) {
      return this.multipartEffect
    }
    this.multipartEffect = Effect.runSync(Effect.cached(
      Multipart.toPersisted(this.multipartStream)
    ))
    return this.multipartEffect
  }

  get multipartStream(): Stream.Stream<Multipart.Part, Multipart.MultipartError> {
    const formData = this.source.body._tag === "FormData" && this.source.body.formData
    if (formData) {
      return Stream.fromIterable(formDataToParts(formData))
    }
    return Stream.pipeThroughChannel(
      Stream.mapError(this.stream, (cause) => Multipart.MultipartError.fromReason("InternalError", cause)),
      Multipart.makeChannel(this.headers)
    )
  }

  get arrayBuffer(): Effect.Effect<ArrayBuffer, HttpServerError> {
    return Effect.map(
      this.bytes,
      // Copy this view because Buffer views may share a larger ArrayBuffer.
      (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    )
  }

  get upgrade(): Effect.Effect<Socket.Socket, HttpServerError> {
    return Effect.fail(requestParseError(this, "Not an upgradeable ServerRequest"))
  }
}

const getFormDataBody = (request: HttpServerRequest): FormData | undefined => {
  if (!HttpClientRequest.isHttpClientRequest(request.source)) {
    return undefined
  }
  const body = request.source.body
  if (body._tag === "FormData") {
    return body.formData
  }
  if (body._tag === "Raw" && isFormData(body.body)) {
    return body.body
  }
  return undefined
}

const rawBodyStream = (request: HttpServerRequest, body: unknown): Stream.Stream<Uint8Array, HttpServerError> => {
  if (body instanceof Request) {
    return streamFromReadable(request, body.body)
  }
  if (isReadableStream(body)) {
    return streamFromReadable(request, body)
  }
  if (isBodyInit(body)) {
    return streamFromReadable(request, new Response(body).body)
  }
  return Stream.fail(requestParseError(request, "Unsupported body type"))
}

const rawBodyBytes = (request: HttpServerRequest, body: unknown): Effect.Effect<Uint8Array, HttpServerError> => {
  if (body instanceof Request) {
    return Effect.tryPromise({
      try: () => body.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
      catch: (cause) => requestParseError(request, undefined, cause)
    })
  }
  if (isBodyInit(body)) {
    return bytesFromBodyInit(request, body)
  }
  return Effect.fail(requestParseError(request, "Unsupported body type"))
}

const bytesFromBodyInit = (request: HttpServerRequest, body: BodyInit): Effect.Effect<Uint8Array, HttpServerError> =>
  Effect.tryPromise({
    try: () => new Response(body).arrayBuffer().then((buffer) => new Uint8Array(buffer)),
    catch: (cause) => requestParseError(request, undefined, cause)
  })

const streamFromReadable = (
  request: HttpServerRequest,
  body: ReadableStream<Uint8Array> | null | undefined
): Stream.Stream<Uint8Array, HttpServerError> =>
  body
    ? Stream.fromReadableStream({
      evaluate: () => body,
      onError: (cause) => requestParseError(request, undefined, cause)
    })
    : Stream.empty

const requestParseError = (
  request: HttpServerRequest,
  description?: string,
  cause?: unknown
) =>
  new HttpServerError({
    reason: new RequestParseError({
      request,
      ...(description === undefined ? undefined : { description }),
      ...(cause === undefined ? undefined : { cause })
    })
  })

const formDataToParts = (formData: FormData): Array<Multipart.Part> => {
  const parts: Array<Multipart.Part> = []
  for (const [key, value] of formData.entries()) {
    parts.push(typeof value === "string" ? new MultipartFieldPart(key, value) : new MultipartFilePart(key, value))
  }
  return parts
}

class MultipartFieldPart extends Inspectable.Class implements Multipart.Field {
  readonly [Multipart.TypeId]: typeof Multipart.TypeId
  readonly _tag = "Field"
  readonly contentType = "text/plain"
  readonly key: string
  readonly value: string

  constructor(
    key: string,
    value: string
  ) {
    super()
    this[Multipart.TypeId] = Multipart.TypeId
    this.key = key
    this.value = value
  }

  toJSON(): unknown {
    return {
      _id: "@effect/platform/Multipart/Part",
      _tag: "Field",
      key: this.key,
      contentType: this.contentType,
      value: this.value
    }
  }
}

class MultipartFilePart extends Inspectable.Class implements Multipart.File {
  readonly [Multipart.TypeId]: typeof Multipart.TypeId
  readonly _tag = "File"
  readonly key: string
  readonly name: string
  readonly contentType: string
  readonly content: Stream.Stream<Uint8Array, Multipart.MultipartError>
  readonly contentEffect: Effect.Effect<Uint8Array, Multipart.MultipartError>

  constructor(
    key: string,
    file: File
  ) {
    super()
    this[Multipart.TypeId] = Multipart.TypeId
    this.key = key
    this.name = file.name
    this.contentType = file.type
    this.content = Stream.fromReadableStream({
      evaluate: () => file.stream() as ReadableStream<Uint8Array>,
      onError: (cause) => Multipart.MultipartError.fromReason("InternalError", cause)
    })
    this.contentEffect = Effect.tryPromise({
      try: () => file.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
      catch: (cause) => Multipart.MultipartError.fromReason("InternalError", cause)
    })
  }

  toJSON(): unknown {
    return {
      _id: "@effect/platform/Multipart/Part",
      _tag: "File",
      key: this.key,
      name: this.name,
      contentType: this.contentType
    }
  }
}

const isReadableStream = (u: unknown): u is ReadableStream<Uint8Array> =>
  typeof ReadableStream !== "undefined" && u instanceof ReadableStream

const isFormData = (u: unknown): u is FormData => typeof FormData !== "undefined" && u instanceof FormData

const isBodyInit = (u: unknown): u is BodyInit =>
  typeof u === "string" ||
  (typeof ArrayBuffer !== "undefined" && (u instanceof ArrayBuffer || ArrayBuffer.isView(u))) ||
  (typeof Blob !== "undefined" && u instanceof Blob) ||
  isFormData(u) ||
  (typeof URLSearchParams !== "undefined" && u instanceof URLSearchParams) ||
  isReadableStream(u)

const textDecoder = new TextDecoder()

/**
 * Attempts to construct an absolute `URL` for a server request safely.
 *
 * **Details**
 *
 * The host comes from the `host` header, defaulting to `localhost`, and the
 * protocol is `https` only when `x-forwarded-proto` is `https`; invalid URLs
 * return `Option.none`.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toURL = (self: HttpServerRequest): Option.Option<URL> => {
  const host = self.headers.host ?? "localhost"
  const protocol = self.headers["x-forwarded-proto"] === "https" ? "https" : "http"
  try {
    return Option.some(new URL(self.url, `${protocol}://${host}`))
  } catch {
    return Option.none()
  }
}

/**
 * Converts an `HttpServerRequest` safely to a Web `Request` as a `Result`.
 *
 * **Details**
 *
 * If the source is already a Web `Request`, it is returned unchanged. Otherwise
 * an absolute URL is derived from the request; invalid URLs fail with a
 * `RequestParseError`.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toWebResult = (self: HttpServerRequest, options?: {
  readonly signal?: AbortSignal | undefined
  readonly context?: Context.Context<never> | undefined
}): Result.Result<Request, RequestError> => {
  if (self.source instanceof Request) {
    return Result.succeed(self.source)
  }
  const url = toURL(self)
  if (Option.isNone(url)) {
    return Result.fail(
      new RequestParseError({
        request: self,
        description: "Invalid URL"
      })
    )
  }
  const requestInit: RequestInit = {
    method: self.method,
    headers: self.headers
  }
  if (options?.signal) {
    requestInit.signal = options.signal
  }
  if (hasBody(self.method)) {
    requestInit.body = Stream.toReadableStreamWith(self.stream, options?.context ?? Context.empty())
    ;(requestInit as any).duplex = "half"
  }
  return Result.succeed(new Request(url.value, requestInit))
}

/**
 * Converts an `HttpServerRequest` to a Web `Request` in `Effect`.
 *
 * **Details**
 *
 * The current context is used when streaming the request body into the Web
 * request.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toWeb = (self: HttpServerRequest, options?: {
  readonly signal?: AbortSignal | undefined
}): Effect.Effect<Request, RequestError> =>
  Effect.contextWith((context) =>
    Effect.fromResult(toWebResult(self, {
      context,
      signal: options?.signal
    }))
  )
