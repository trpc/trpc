/**
 * Describes immutable responses returned by Effect HTTP handlers.
 *
 * An `HttpServerResponse` stores the status, optional status text, headers,
 * cookies, and body that the server runtime later turns into a platform
 * response such as a Web `Response`. This module includes constructors for
 * common response bodies, helpers for updating response data, file response
 * support through `HttpPlatform`, and conversions to or from Web and Effect
 * HTTP client responses.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as ByteSize from "../ByteSize.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as ErrorReporter from "../ErrorReporter.ts"
import { constVoid, dual } from "../Function.ts"
import * as Inspectable from "../Inspectable.ts"
import { PipeInspectableProto } from "../internal/core.ts"
import * as Option from "../Option.ts"
import { type Pipeable, pipeArguments } from "../Pipeable.ts"
import type { PlatformError } from "../PlatformError.ts"
import { hasProperty } from "../Predicate.ts"
import { redact } from "../Redactable.ts"
import type * as Schema from "../Schema.ts"
import type { ParseOptions } from "../SchemaAST.ts"
import * as Stream from "../Stream.ts"
import type { Mutable } from "../Types.ts"
import * as Cookies from "./Cookies.ts"
import * as Headers from "./Headers.ts"
import * as Body from "./HttpBody.ts"
import * as HttpClientError from "./HttpClientError.ts"
import * as HttpClientRequest from "./HttpClientRequest.ts"
import * as HttpClientResponse from "./HttpClientResponse.ts"
import * as HttpIncomingMessage from "./HttpIncomingMessage.ts"
import type { HttpPlatform } from "./HttpPlatform.ts"
import * as headersInternal from "./internal/headers.ts"
import * as bodyInternal from "./internal/httpBody.ts"
import * as Template from "./Template.ts"
import * as UrlParams from "./UrlParams.ts"

const TypeId = "~effect/http/HttpServerResponse"

/**
 * Server-side HTTP response model.
 *
 * **Details**
 *
 * A response contains a status, optional status text, headers, cookies, and an
 * HTTP body that can later be converted to platform-specific response types.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface HttpServerResponse extends Inspectable.Inspectable, Pipeable, ErrorReporter.Reportable {
  readonly [TypeId]: typeof TypeId
  readonly status: number
  readonly statusText?: string | undefined
  readonly headers: Headers.Headers
  readonly cookies: Cookies.Cookies
  readonly body: Body.HttpBody
}

/**
 * Common options accepted by HTTP server response constructors.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface Options {
  readonly status?: number | undefined
  readonly statusText?: string | undefined
  readonly headers?: Headers.Input | undefined
  readonly cookies?: Cookies.Cookies | undefined
  readonly contentType?: string | undefined
  readonly contentLength?: number | undefined
}

/**
 * Option variants used by response constructors with different body metadata
 * rules.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Options {
  /**
   * Response options for constructors whose body determines its own content type
   * and content length.
   *
   * @stability unstable
   * @category options
   * @since 4.0.0
   */
  export interface WithContent extends Omit<Options, "contentType" | "contentLength"> {}

  /**
   * Response options for constructors that allow overriding the content type while
   * deriving the content length from the body.
   *
   * @stability unstable
   * @category options
   * @since 4.0.0
   */
  export interface WithContentType extends Omit<Options, "contentLength"> {}
}

/**
 * Returns `true` when the supplied value is an `HttpServerResponse`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isHttpServerResponse = (u: unknown): u is HttpServerResponse => hasProperty(u, TypeId)

/**
 * Creates an empty HTTP response.
 *
 * **Details**
 *
 * The default status is `204`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const empty = (
  options?: Options.WithContent | undefined
): HttpServerResponse =>
  makeResponse({
    status: options?.status ?? 204,
    statusText: options?.statusText,
    headers: options?.headers ? Headers.fromInput(options.headers) : undefined,
    cookies: options?.cookies
  })

/**
 * Creates a redirect response with a `Location` header.
 *
 * **Details**
 *
 * The default status is `302`; custom headers are merged with the generated
 * `Location` header.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const redirect = (
  location: string | URL,
  options?: Options.WithContent | undefined
): HttpServerResponse => {
  const headers = Headers.fromRecordUnsafe({ location: location.toString() })
  return makeResponse({
    status: options?.status ?? 302,
    statusText: options?.statusText,
    headers: options?.headers
      ? Headers.merge(headers, Headers.fromInput(options.headers))
      : headers,
    cookies: options?.cookies ?? Cookies.empty
  })
}

/**
 * Creates an HTTP response whose body is a `Uint8Array`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const uint8Array = (
  body: Uint8Array,
  options?: Options.WithContentType
): HttpServerResponse => {
  const headers = options?.headers
    ? Headers.fromInput(options.headers)
    : Headers.empty
  return makeResponse({
    status: options?.status ?? 200,
    statusText: options?.statusText,
    headers,
    cookies: options?.cookies ?? Cookies.empty,
    body: Body.uint8Array(body, getContentType(options, headers))
  })
}

const getContentType = (
  options: Options | undefined,
  headers: Headers.Headers
): string | undefined => {
  if (options?.contentType) {
    return options.contentType
  } else if (options?.headers) {
    return headers["content-type"]
  }
}

/**
 * Creates an HTTP response whose body is a string.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const text = (
  body: string,
  options?: Options.WithContentType
): HttpServerResponse => {
  const headers = options?.headers
    ? Headers.fromInput(options.headers)
    : Headers.empty
  return makeResponse({
    status: options?.status ?? 200,
    statusText: options?.statusText,
    headers,
    cookies: options?.cookies ?? Cookies.empty,
    body: Body.text(body, getContentType(options, headers))
  })
}

/**
 * Creates an HTML response with the `text/html` content type.
 *
 * **Details**
 *
 * Passing a string returns a response directly. Using it as a template tag returns
 * an effect so interpolated values can be rendered with their required services
 * and errors.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const html: {
  <A extends ReadonlyArray<Template.Interpolated>>(
    strings: TemplateStringsArray,
    ...args: A
  ): Effect.Effect<
    HttpServerResponse,
    Template.Interpolated.Error<A[number]>,
    Template.Interpolated.Context<A[number]>
  >
  (html: string): HttpServerResponse
} = (
  strings: TemplateStringsArray | string,
  ...args: ReadonlyArray<Template.Interpolated>
) => {
  if (typeof strings === "string") {
    return text(strings, { contentType: "text/html" })
  }

  return Effect.map(Template.make(strings, ...args), (_) => text(_, { contentType: "text/html" })) as any
}

/**
 * Creates a streaming HTML response from a template.
 *
 * **Details**
 *
 * The template is encoded as a byte stream and can use streaming interpolated
 * values from the current context.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const htmlStream = <
  A extends ReadonlyArray<Template.InterpolatedWithStream>
>(
  strings: TemplateStringsArray,
  ...args: A
): Effect.Effect<
  HttpServerResponse,
  never,
  Template.Interpolated.Context<A[number]>
> =>
  Effect.map(
    Effect.context<Template.Interpolated.Context<A[number]>>(),
    (context) =>
      stream(
        Stream.provideContext(
          Stream.encodeText(Template.stream(strings, ...args)),
          context
        ),
        { contentType: "text/html" }
      )
  )

/**
 * Creates a JSON HTTP response.
 *
 * **Details**
 *
 * The body is serialized with `JSON.stringify`; serialization errors are captured
 * as `HttpBodyError` failures.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const json = (
  body: unknown,
  options?: Options.WithContentType | undefined
): Effect.Effect<HttpServerResponse, Body.HttpBodyError> => {
  const headers = options?.headers ? Headers.fromInput(options.headers) : Headers.empty
  return Effect.map(Body.json(body, getContentType(options, headers)), (body) =>
    makeResponse({
      status: options?.status ?? 200,
      statusText: options?.statusText,
      headers,
      cookies: options?.cookies,
      body
    }))
}

/**
 * Creates a JSON response constructor backed by a schema encoder.
 *
 * **Details**
 *
 * The returned function encodes the value with the supplied schema before
 * serializing it as JSON, and can fail with `HttpBodyError` if schema encoding or
 * JSON serialization fails.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const schemaJson = <A, RE>(
  schema: Schema.ConstraintCodec<A, unknown, unknown, RE>,
  options?: ParseOptions | undefined
) => {
  const encode = Body.jsonSchema(schema, options)
  return (
    body: A,
    options?: Options.WithContentType | undefined
  ): Effect.Effect<HttpServerResponse, Body.HttpBodyError, RE> => {
    const headers = options?.headers ? Headers.fromInput(options.headers) : Headers.empty
    return Effect.map(encode(body, getContentType(options, headers)), (body) =>
      makeResponse({
        status: options?.status ?? 200,
        statusText: options?.statusText,
        headers,
        cookies: options?.cookies,
        body
      }))
  }
}

/**
 * Creates a JSON HTTP response synchronously.
 *
 * **When to use**
 *
 * Use when the response body is known to be JSON-serializable and you need a
 * synchronous `HttpServerResponse`.
 *
 * **Gotchas**
 *
 * Unlike `json`, serialization errors from `JSON.stringify` are not captured in
 * `Effect`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const jsonUnsafe = (
  body: unknown,
  options?: Options.WithContentType | undefined
): HttpServerResponse => {
  const headers = options?.headers ? Headers.fromInput(options.headers) : Headers.empty
  return makeResponse({
    status: options?.status ?? 200,
    statusText: options?.statusText,
    headers,
    cookies: options?.cookies,
    body: Body.jsonUnsafe(body, getContentType(options, headers))
  })
}

/**
 * Creates a response from URL parameters using the
 * `application/x-www-form-urlencoded` content type by default.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const urlParams = (
  body: UrlParams.Input,
  options?: Options.WithContentType | undefined
): HttpServerResponse => {
  const headers = options?.headers ? Headers.fromInput(options.headers) : Headers.empty
  return makeResponse({
    status: options?.status ?? 200,
    statusText: options?.statusText,
    headers,
    cookies: options?.cookies,
    body: Body.text(
      UrlParams.toString(UrlParams.fromInput(body)),
      getContentType(options, headers) ?? "application/x-www-form-urlencoded"
    )
  })
}

/**
 * Creates a response with a raw body value.
 *
 * **When to use**
 *
 * Use when you want to pass through a body value already understood by the
 * underlying runtime, such as a Web `Response`, `Blob`, or `ReadableStream`,
 * for later platform conversion.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const raw = (
  body: unknown,
  options?: Options | undefined
): HttpServerResponse =>
  makeResponse({
    status: options?.status ?? 200,
    statusText: options?.statusText,
    headers: options?.headers && Headers.fromInput(options.headers),
    cookies: options?.cookies,
    body: Body.raw(body, {
      contentType: options?.contentType,
      contentLength: options?.contentLength
    })
  })

/**
 * Creates a response whose body is a Web `FormData` value.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const formData = (
  body: FormData,
  options?: Options.WithContent | undefined
): HttpServerResponse =>
  makeResponse({
    status: options?.status ?? 200,
    statusText: options?.statusText,
    headers: options?.headers && Headers.fromInput(options.headers),
    cookies: options?.cookies,
    body: Body.formData(body)
  })

/**
 * Creates a streaming response from a stream of byte chunks.
 *
 * **Details**
 *
 * Optional response metadata can supply the status, headers, content type, and
 * content length.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const stream = <E>(
  body: Stream.Stream<Uint8Array, E>,
  options?: Options | undefined
): HttpServerResponse => {
  const headers = options?.headers
    ? Headers.fromInput(options.headers)
    : Headers.empty
  return makeResponse({
    status: options?.status ?? 200,
    statusText: options?.statusText,
    headers,
    cookies: options?.cookies,
    body: Body.stream(
      body,
      getContentType(options, headers),
      options?.contentLength
    )
  })
}

const HttpPlatformKey = Context.Service<
  HttpPlatform,
  HttpPlatform["Service"]
>("effect/http/HttpPlatform" satisfies typeof HttpPlatform.key)

/**
 * Creates a streamed file response for a file system path.
 *
 * **Details**
 *
 * The effect requires `HttpPlatform`, can fail with a platform error, and supports
 * options for status, headers, content type, offset, and byte range.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const file = (
  path: string,
  options?:
    | (Options.WithContentType & {
      readonly bytesToRead?: ByteSize.Input | undefined
      readonly chunkSize?: number | undefined
      readonly offset?: ByteSize.Input | undefined
    })
    | undefined
): Effect.Effect<HttpServerResponse, PlatformError, HttpPlatform> =>
  Effect.flatMap(HttpPlatformKey, (platform) => platform.fileResponse(path, options))

/**
 * Creates a streamed file response for a Web `File`-like value.
 *
 * **Details**
 *
 * The effect requires `HttpPlatform` and supports options for status, headers,
 * content type, offset, and byte range.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fileWeb = (
  file: Body.HttpBody.FileLike,
  options?:
    | (Options.WithContentType & {
      readonly bytesToRead?: number | undefined
      readonly chunkSize?: number | undefined
      readonly offset?: number | undefined
    })
    | undefined
): Effect.Effect<HttpServerResponse, never, HttpPlatform> =>
  Effect.flatMap(HttpPlatformKey, (platform) => platform.fileWebResponse(file, options))

/**
 * Returns a response with the specified header set to the supplied value.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const setHeader: {
  (
    key: string,
    value: string
  ): (self: HttpServerResponse) => HttpServerResponse
  (self: HttpServerResponse, key: string, value: string): HttpServerResponse
} = dual(
  3,
  (self: HttpServerResponse, key: string, value: string): HttpServerResponse =>
    makeResponse(self, Headers.set(self.headers, key, value))
)

/**
 * Returns a response with the specified header removed.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const removeHeader: {
  (key: string): (self: HttpServerResponse) => HttpServerResponse
  (self: HttpServerResponse, key: string): HttpServerResponse
} = dual(
  2,
  (self: HttpServerResponse, key: string): HttpServerResponse =>
    makeResponse({
      ...self,
      headers: Headers.remove(self.headers, key)
    })
)

/**
 * Returns a response with all supplied headers set on the existing header map.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const setHeaders: {
  (input: Headers.Input): (self: HttpServerResponse) => HttpServerResponse
  (self: HttpServerResponse, input: Headers.Input): HttpServerResponse
} = dual(
  2,
  (self: HttpServerResponse, input: Headers.Input): HttpServerResponse =>
    makeResponse(self, Headers.setAll(self.headers, input))
)

/**
 * Returns a response with the cookie of the specified name removed.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const removeCookie: {
  (name: string): (self: HttpServerResponse) => HttpServerResponse
  (self: HttpServerResponse, name: string): HttpServerResponse
} = dual(
  2,
  (self: HttpServerResponse, name: string): HttpServerResponse =>
    makeResponse({
      ...self,
      cookies: Cookies.remove(self.cookies, name)
    })
)

/**
 * Returns a response with its cookie collection replaced by the supplied cookies.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const replaceCookies: {
  (cookies: Cookies.Cookies): (self: HttpServerResponse) => HttpServerResponse
  (self: HttpServerResponse, cookies: Cookies.Cookies): HttpServerResponse
} = dual(
  2,
  (self: HttpServerResponse, cookies: Cookies.Cookies): HttpServerResponse => makeResponse({ ...self, cookies })
)

/**
 * Sets a cookie on the response.
 *
 * **Details**
 *
 * The effect fails with `CookiesError` if the cookie name, value, or options are
 * invalid.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const setCookie: {
  (
    name: string,
    value: string,
    options?: Cookies.Cookie["options"]
  ): (
    self: HttpServerResponse
  ) => Effect.Effect<HttpServerResponse, Cookies.CookiesError>
  (
    self: HttpServerResponse,
    name: string,
    value: string,
    options?: Cookies.Cookie["options"]
  ): Effect.Effect<HttpServerResponse, Cookies.CookiesError>
} = dual(
  (args) => isHttpServerResponse(args[0]),
  (
    self: HttpServerResponse,
    name: string,
    value: string,
    options?: Cookies.Cookie["options"]
  ): Effect.Effect<HttpServerResponse, Cookies.CookiesError> =>
    Effect.map(
      Effect.fromResult(Cookies.set(self.cookies, name, value, options)),
      (cookies) =>
        makeResponse({
          ...self,
          cookies
        })
    )
)

/**
 * Sets an expired cookie on an `HttpServerResponse`.
 *
 * **Details**
 *
 * Returns an effect because cookie encoding can fail. The original response is not
 * mutated; the effect succeeds with a response containing the updated cookie set.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const expireCookie: {
  (
    name: string,
    options?: Omit<NonNullable<Cookies.Cookie["options"]>, "expires" | "maxAge">
  ): (
    self: HttpServerResponse
  ) => Effect.Effect<HttpServerResponse, Cookies.CookiesError>
  (
    self: HttpServerResponse,
    name: string,
    options?: Omit<NonNullable<Cookies.Cookie["options"]>, "expires" | "maxAge">
  ): Effect.Effect<HttpServerResponse, Cookies.CookiesError>
} = dual(
  (args) => isHttpServerResponse(args[0]),
  (
    self: HttpServerResponse,
    name: string,
    options?: Omit<NonNullable<Cookies.Cookie["options"]>, "expires" | "maxAge">
  ): Effect.Effect<HttpServerResponse, Cookies.CookiesError> =>
    Effect.map(
      Effect.fromResult(Cookies.expireCookie(self.cookies, name, options)),
      (cookies) =>
        makeResponse({
          ...self,
          cookies
        })
    )
)

/**
 * Sets a cookie on an `HttpServerResponse`, throwing if the cookie cannot be
 * encoded.
 *
 * **When to use**
 *
 * Use when you need to set one trusted cookie and want encoding failures to
 * throw instead of being represented as `CookiesError` failures.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const setCookieUnsafe: {
  (
    name: string,
    value: string,
    options?: Cookies.Cookie["options"]
  ): (self: HttpServerResponse) => HttpServerResponse
  (
    self: HttpServerResponse,
    name: string,
    value: string,
    options?: Cookies.Cookie["options"]
  ): HttpServerResponse
} = dual(
  (args) => isHttpServerResponse(args[0]),
  (
    self: HttpServerResponse,
    name: string,
    value: string,
    options?: Cookies.Cookie["options"]
  ): HttpServerResponse =>
    makeResponse({
      ...self,
      cookies: Cookies.setUnsafe(self.cookies, name, value, options)
    })
)

/**
 * Sets an expired cookie on an `HttpServerResponse`, throwing if the expiration cookie
 * cannot be encoded.
 *
 * **When to use**
 *
 * Use when you need to expire one trusted cookie and want encoding failures to
 * throw instead of being represented as `CookiesError` failures.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const expireCookieUnsafe: {
  (
    name: string,
    options?: Omit<NonNullable<Cookies.Cookie["options"]>, "expires" | "maxAge">
  ): (self: HttpServerResponse) => HttpServerResponse
  (
    self: HttpServerResponse,
    name: string,
    options?: Omit<NonNullable<Cookies.Cookie["options"]>, "expires" | "maxAge">
  ): HttpServerResponse
} = dual(
  (args) => isHttpServerResponse(args[0]),
  (
    self: HttpServerResponse,
    name: string,
    options?: Omit<NonNullable<Cookies.Cookie["options"]>, "expires" | "maxAge">
  ): HttpServerResponse =>
    makeResponse({
      ...self,
      cookies: Cookies.expireCookieUnsafe(self.cookies, name, options)
    })
)

/**
 * Updates the cookies attached to an `HttpServerResponse` using the supplied
 * function.
 *
 * **Details**
 *
 * The original response is not mutated; a new response is returned with the
 * callback result as its cookie collection.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const updateCookies: {
  (
    f: (cookies: Cookies.Cookies) => Cookies.Cookies
  ): (self: HttpServerResponse) => HttpServerResponse
  (
    self: HttpServerResponse,
    f: (cookies: Cookies.Cookies) => Cookies.Cookies
  ): HttpServerResponse
} = dual(
  2,
  (
    self: HttpServerResponse,
    f: (cookies: Cookies.Cookies) => Cookies.Cookies
  ): HttpServerResponse =>
    makeResponse({
      ...self,
      cookies: f(self.cookies)
    })
)

/**
 * Merges additional cookies into the cookies attached to an
 * `HttpServerResponse`.
 *
 * **Details**
 *
 * The original response is not mutated; a new response is returned with the merged
 * cookie collection.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const mergeCookies: {
  (cookies: Cookies.Cookies): (self: HttpServerResponse) => HttpServerResponse
  (self: HttpServerResponse, cookies: Cookies.Cookies): HttpServerResponse
} = dual(
  2,
  (self: HttpServerResponse, cookies: Cookies.Cookies): HttpServerResponse =>
    makeResponse({ ...self, cookies: Cookies.merge(self.cookies, cookies) })
)

/**
 * Sets multiple cookies on an `HttpServerResponse`.
 *
 * **Details**
 *
 * Each input entry contains a cookie name, value, and optional cookie options. The
 * returned effect fails with `CookiesError` if any cookie cannot be encoded.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const setCookies: {
  (
    cookies: Iterable<
      readonly [
        name: string,
        value: string,
        options?: Cookies.Cookie["options"]
      ]
    >
  ): (
    self: HttpServerResponse
  ) => Effect.Effect<HttpServerResponse, Cookies.CookiesError, never>
  (
    self: HttpServerResponse,
    cookies: Iterable<
      readonly [
        name: string,
        value: string,
        options?: Cookies.Cookie["options"]
      ]
    >
  ): Effect.Effect<HttpServerResponse, Cookies.CookiesError, never>
} = dual(
  2,
  (
    self: HttpServerResponse,
    cookies: Iterable<
      readonly [
        name: string,
        value: string,
        options?: Cookies.Cookie["options"]
      ]
    >
  ): Effect.Effect<HttpServerResponse, Cookies.CookiesError> =>
    Effect.map(Effect.fromResult(Cookies.setAll(self.cookies, cookies)), (cookies) =>
      makeResponse({
        ...self,
        cookies
      }))
)

/**
 * Sets multiple cookies on an `HttpServerResponse`, throwing if any cookie cannot
 * be encoded.
 *
 * **When to use**
 *
 * Use when you need to set multiple trusted cookies and want encoding failures
 * to throw instead of being represented as `CookiesError` failures.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const setCookiesUnsafe: {
  (
    cookies: Iterable<
      readonly [
        name: string,
        value: string,
        options?: Cookies.Cookie["options"]
      ]
    >
  ): (self: HttpServerResponse) => HttpServerResponse
  (
    self: HttpServerResponse,
    cookies: Iterable<
      readonly [
        name: string,
        value: string,
        options?: Cookies.Cookie["options"]
      ]
    >
  ): HttpServerResponse
} = dual(
  2,
  (
    self: HttpServerResponse,
    cookies: Iterable<
      readonly [
        name: string,
        value: string,
        options?: Cookies.Cookie["options"]
      ]
    >
  ): HttpServerResponse =>
    makeResponse({
      ...self,
      cookies: Cookies.setAllUnsafe(self.cookies, cookies)
    })
)

/**
 * Replaces the body of an `HttpServerResponse`.
 *
 * **Details**
 *
 * When the body carries a content type or content length, the returned response
 * includes the corresponding headers.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const setBody: {
  (body: Body.HttpBody): (self: HttpServerResponse) => HttpServerResponse
  (self: HttpServerResponse, body: Body.HttpBody): HttpServerResponse
} = dual(
  2,
  (self: HttpServerResponse, body: Body.HttpBody): HttpServerResponse =>
    makeResponse({ ...self, body }, bodyInternal.updateHeaders(self.headers, body))
)

/**
 * Replaces the body without updating headers. Use when content metadata is unchanged.
 *
 * @internal
 */
export const setBodyKeepHeaders = (self: HttpServerResponse, body: Body.HttpBody): HttpServerResponse => {
  const response = Object.create(Proto) as Mutable<HttpServerResponse>
  response.status = self.status
  response.statusText = self.statusText
  response.headers = self.headers
  response.cookies = self.cookies
  response.body = body
  return response
}

/**
 * Sets the HTTP status code of an `HttpServerResponse`.
 *
 * **Details**
 *
 * When `statusText` is omitted, the existing status text is preserved.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const setStatus: {
  (
    status: number,
    statusText?: string | undefined
  ): (self: HttpServerResponse) => HttpServerResponse
  (
    self: HttpServerResponse,
    status: number,
    statusText?: string | undefined
  ): HttpServerResponse
} = dual(
  (args) => isHttpServerResponse(args[0]),
  (
    self: HttpServerResponse,
    status: number,
    statusText?: string | undefined
  ): HttpServerResponse =>
    makeResponse({
      ...self,
      status,
      statusText: statusText ?? self.statusText
    })
)

/**
 * Returns whether a response must omit its body because its status is 204, 205,
 * or 304, or `withoutBody` is true.
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const omitsBody = (response: HttpServerResponse, withoutBody = false): boolean =>
  withoutBody || response.status === 204 || response.status === 205 || response.status === 304

/**
 * Converts an `HttpServerResponse` to a Web `Response`.
 *
 * **Details**
 *
 * Cookies are appended as `Set-Cookie` headers. Stream bodies are converted using
 * the supplied context.
 *
 * Bodies are omitted for statuses 204, 205, and 304, or when `withoutBody` is true
 * (for example, for HEAD responses). Omitted raw `ReadableStream` bodies are
 * cancelled without awaiting completion, and cancellation errors are ignored.
 *
 * A raw `Response` body is returned as-is after the outer headers are merged
 * into it: outer headers replace native ones, and cookies are appended. When
 * its body is omitted, the bodyless `Response` keeps those merged headers and
 * uses the outer status for 204, 205 and 304, or the raw `Response` status
 * otherwise.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toWeb = (
  response: HttpServerResponse,
  options?: {
    readonly withoutBody?: boolean | undefined
    readonly context?: Context.Context<never> | undefined
  }
): Response => {
  const headers = new globalThis.Headers(response.headers)
  if (!Cookies.isEmpty(response.cookies)) {
    const toAdd = Cookies.toSetCookieHeaders(response.cookies)
    for (const header of toAdd) {
      headers.append("set-cookie", header)
    }
  }
  const body = response.body
  const outerOmitsBody = omitsBody(response)
  const withoutBody = outerOmitsBody || options?.withoutBody === true
  if (body._tag === "Raw" && body.body instanceof Response) {
    const raw = body.body
    for (const [key, value] of headers as any) {
      if (key === "set-cookie") {
        raw.headers.append(key, value)
      } else {
        raw.headers.set(key, value)
      }
    }
    if (!withoutBody) {
      return raw
    }
    // A bodyless outer status is what the caller chose to send; otherwise the
    // body is only omitted for HEAD and the raw Response describes the resource.
    const source = outerOmitsBody ? response : raw
    return new Response(undefined, {
      status: source.status,
      statusText: source.statusText as string,
      headers: raw.headers
    })
  }
  if (withoutBody) {
    if (body._tag === "Raw" && isReadableStream(body.body)) {
      body.body.cancel().catch(constVoid)
    }
    return new Response(undefined, {
      status: response.status,
      statusText: response.statusText as string,
      headers
    })
  }
  switch (body._tag) {
    case "Empty": {
      return new Response(undefined, {
        status: response.status,
        statusText: response.statusText as string,
        headers
      })
    }
    case "Uint8Array": {
      return new Response(body.text ?? body.body as any, {
        status: response.status,
        statusText: response.statusText!,
        headers
      })
    }
    case "Raw": {
      return new Response(body.body as any, {
        status: response.status,
        statusText: response.statusText!,
        headers
      })
    }
    case "FormData": {
      return new Response(body.formData as any, {
        status: response.status,
        statusText: response.statusText!,
        headers
      })
    }
    case "Stream": {
      return new Response(
        Stream.toReadableStreamWith(
          body.stream,
          options?.context ?? Context.empty()
        ),
        {
          status: response.status,
          statusText: response.statusText!,
          headers
        }
      )
    }
  }
}

/**
 * Wraps an `HttpServerResponse` as an `HttpClientResponse`, using the optional
 * request for metadata and decode errors. Without a request, `url` is empty.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toClientResponse = (
  response: HttpServerResponse,
  options?: {
    readonly request?: HttpClientRequest.HttpClientRequest | undefined
  }
): HttpClientResponse.HttpClientResponse =>
  new ServerHttpClientResponse(
    options?.request ?? HttpClientRequest.empty,
    response
  )

class ServerHttpClientResponse extends Inspectable.Class implements HttpClientResponse.HttpClientResponse, Pipeable {
  readonly [HttpIncomingMessage.TypeId]: typeof HttpIncomingMessage.TypeId
  readonly [HttpClientResponse.TypeId]: typeof HttpClientResponse.TypeId

  readonly request: HttpClientRequest.HttpClientRequest
  private readonly response: HttpServerResponse

  constructor(
    request: HttpClientRequest.HttpClientRequest,
    response: HttpServerResponse
  ) {
    super()
    this.request = request
    this.response = response
    this[HttpIncomingMessage.TypeId] = HttpIncomingMessage.TypeId
    this[HttpClientResponse.TypeId] = HttpClientResponse.TypeId
  }

  toJSON(): unknown {
    return HttpIncomingMessage.inspect(this, {
      _id: "HttpClientResponse",
      request: this.request.toJSON(),
      status: this.status
    })
  }

  get status(): number {
    return this.response.status
  }

  get url(): string {
    if (this.request === HttpClientRequest.empty) return ""
    const url = HttpClientRequest.toUrl(this.request)
    if (Option.isNone(url)) return ""
    url.value.hash = ""
    return url.value.href
  }

  private cachedHeaders?: Headers.Headers
  get headers(): Headers.Headers {
    return this.cachedHeaders ??= this.response.body._tag === "FormData"
      ? Headers.merge(this.response.headers, Headers.fromInput(this.getFormDataResponse().headers))
      : this.response.headers
  }

  get cookies(): Cookies.Cookies {
    return this.response.cookies
  }

  get remoteAddress(): Option.Option<string> {
    return Option.none()
  }

  get stream(): Stream.Stream<Uint8Array, HttpClientError.HttpClientError> {
    const body = this.response.body
    switch (body._tag) {
      case "Empty": {
        return Stream.empty
      }
      case "Stream": {
        return Stream.mapError(body.stream, (cause) => this.decodeError(cause))
      }
      case "Uint8Array": {
        return Stream.succeed(body.body)
      }
      case "Raw": {
        const rawBody = body.body
        if (rawBody instanceof Response) {
          return rawBody.body
            ? Stream.fromReadableStream({
              evaluate: () => rawBody.body!,
              onError: (cause) => this.decodeError(cause)
            })
            : Stream.empty
        }
        if (isReadableStream(rawBody)) {
          return Stream.fromReadableStream({
            evaluate: () => rawBody,
            onError: (cause) => this.decodeError(cause)
          })
        }
        if (rawBody instanceof Blob) {
          return Stream.fromReadableStream({
            evaluate: () => rawBody.stream(),
            onError: (cause) => this.decodeError(cause)
          })
        }
        return Stream.unwrap(Effect.map(this.bytes, Stream.succeed))
      }
      case "FormData": {
        const response = this.getFormDataResponse()
        return Stream.fromReadableStream({
          evaluate: () => response.body!,
          onError: (cause) => this.decodeError(cause)
        })
      }
    }
  }

  get json(): Effect.Effect<Schema.Json, HttpClientError.HttpClientError> {
    return Effect.flatMap(this.text, (text) =>
      Effect.try({
        try: () => text === "" ? null : JSON.parse(text),
        catch: (cause) =>
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.DecodeError({
              request: this.request,
              response: this,
              cause
            })
          })
      }))
  }

  private get bytes(): Effect.Effect<Uint8Array, HttpClientError.HttpClientError> {
    const body = this.response.body
    switch (body._tag) {
      case "Empty": {
        return Effect.succeed(new Uint8Array(0))
      }
      case "Uint8Array": {
        return Effect.succeed(body.body)
      }
      case "Stream": {
        return Stream.mkUint8Array(this.stream)
      }
      case "Raw": {
        const rawBody = body.body
        if (rawBody instanceof Response) {
          return Effect.tryPromise({
            try: () => rawBody.clone().arrayBuffer().then((buffer) => new Uint8Array(buffer)),
            catch: (cause) => this.decodeError(cause)
          })
        }
        return Effect.tryPromise({
          try: () => new Response(rawBody as any).arrayBuffer().then((buffer) => new Uint8Array(buffer)),
          catch: (cause) => this.decodeError(cause)
        })
      }
      case "FormData": {
        return Effect.tryPromise({
          try: () => new Response(body.formData).arrayBuffer().then((buffer) => new Uint8Array(buffer)),
          catch: (cause) => this.decodeError(cause)
        })
      }
    }
  }

  get text(): Effect.Effect<string, HttpClientError.HttpClientError> {
    return Effect.map(this.bytes, (bytes) => textDecoder.decode(bytes))
  }

  get urlParamsBody(): Effect.Effect<UrlParams.UrlParams, HttpClientError.HttpClientError> {
    return Effect.flatMap(this.text, (_) =>
      Effect.try({
        try: () => UrlParams.fromInput(new URLSearchParams(_)),
        catch: (cause) =>
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.DecodeError({
              request: this.request,
              response: this,
              cause
            })
          })
      }))
  }

  get formData(): Effect.Effect<FormData, HttpClientError.HttpClientError> {
    const body = this.response.body
    if (body._tag === "FormData") {
      return Effect.succeed(body.formData)
    }
    return Effect.contextWith((context: Context.Context<never>) => {
      const readableStream = Stream.toReadableStreamWith(this.stream, context)
      return Effect.tryPromise({
        try: () => new Response(readableStream, { headers: this.headers }).formData(),
        catch: (cause) => this.decodeError(cause)
      })
    })
  }

  get arrayBuffer(): Effect.Effect<ArrayBuffer, HttpClientError.HttpClientError> {
    return Effect.map(
      this.bytes,
      // Copy this view because Buffer views may share a larger ArrayBuffer.
      (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    )
  }

  private decodeError(cause: unknown): HttpClientError.HttpClientError {
    return new HttpClientError.HttpClientError({
      reason: new HttpClientError.DecodeError({
        request: this.request,
        response: this,
        cause
      })
    })
  }

  private formDataResponse?: Response
  private getFormDataResponse(): Response {
    return this.formDataResponse ??= new Response((this.response.body as Body.FormData).formData)
  }

  pipe() {
    return pipeArguments(this, arguments)
  }
}

const textDecoder = new TextDecoder()

/**
 * Converts an `HttpClientResponse` to an `HttpServerResponse`.
 *
 * **Details**
 *
 * The response body is streamed from the client response. `Set-Cookie` headers are
 * removed from the header map and represented in the response cookie collection.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const fromClientResponse = (
  response: HttpClientResponse.HttpClientResponse
): HttpServerResponse => {
  const headers = Headers.remove(response.headers, "set-cookie")
  return makeResponse({
    status: response.status,
    headers,
    cookies: response.cookies,
    body: Body.stream(
      Stream.catchIf(response.stream, isEmptyBodyError, () => Stream.empty),
      Option.getOrUndefined(Headers.get(headers, "content-type")),
      bodyInternal.parseContentLength(headers["content-length"])
    )
  })
}

const isReadableStream = (u: unknown): u is ReadableStream<Uint8Array> =>
  typeof ReadableStream !== "undefined" && u instanceof ReadableStream

const isEmptyBodyError = (
  error: HttpClientError.HttpClientError
): error is HttpClientError.HttpClientError =>
  HttpClientError.isHttpClientError(error) && error.reason._tag === "EmptyBodyError"

const Proto: Omit<
  HttpServerResponse,
  "status" | "statusText" | "headers" | "cookies" | "body"
> = {
  ...PipeInspectableProto,
  [TypeId]: TypeId,
  [ErrorReporter.ignore]: true,
  toJSON(this: HttpServerResponse) {
    return {
      _id: "HttpServerResponse",
      status: this.status,
      statusText: this.statusText,
      headers: redact(this.headers),
      cookies: this.cookies.toJSON(),
      body: this.body.toJSON()
    }
  }
}

const makeResponse = (options: {
  readonly status: number
  readonly statusText?: string | undefined
  readonly headers?: Headers.Headers | undefined
  readonly cookies?: Cookies.Cookies | undefined
  readonly body?: Body.HttpBody | undefined
}, ownedHeaders?: Headers.Headers) => {
  // ownedHeaders is a freshly created map that nothing else references, so it
  // can be completed in place instead of copied. It supersedes options.headers,
  // and explicit content headers in it take precedence over body-derived ones.
  const self = Object.create(Proto) as Mutable<HttpServerResponse>
  self.status = options.status
  self.statusText = options.statusText
  self.cookies = options.cookies ?? Cookies.empty
  self.body = options.body ?? Body.empty
  if (
    self.body._tag !== "Empty" &&
    (self.body.contentType || self.body.contentLength !== undefined)
  ) {
    const owned = ownedHeaders !== undefined
    const newHeaders = owned
      ? ownedHeaders as any
      : options.headers === undefined || options.headers === Headers.empty
      ? headersInternal.emptyMutableUnsafe() as any
      : Headers.fromRecordUnsafe({ ...options.headers }) as any
    if (self.body.contentType && (!owned || newHeaders["content-type"] === undefined)) {
      newHeaders["content-type"] = self.body.contentType
    }
    if (self.body.contentLength !== undefined && (!owned || newHeaders["content-length"] === undefined)) {
      newHeaders["content-length"] = self.body.contentLength.toString()
    }
    self.headers = newHeaders
  } else {
    self.headers = ownedHeaders ?? options.headers ?? Headers.empty
  }
  return self
}

/**
 * Converts a Web `Response` to an `HttpServerResponse`.
 *
 * **Details**
 *
 * `Set-Cookie` headers are parsed into the response cookie collection and removed
 * from the header map. A present Web body is exposed as a stream body.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const fromWeb = (response: Response): HttpServerResponse => {
  const headers = new globalThis.Headers(response.headers)
  const setCookieHeaders = headers.getSetCookie()
  headers.delete("set-cookie")
  let self = empty({
    status: response.status,
    statusText: response.statusText,
    headers: headers as any,
    cookies: Cookies.fromSetCookie(setCookieHeaders)
  })
  if (response.body) {
    const contentType = response.headers.get("content-type")
    self = setBody(
      self,
      Body.stream(
        Stream.fromReadableStream({
          evaluate: () => response.body!,
          onError: (e) => e
        }),
        contentType ?? undefined,
        bodyInternal.parseContentLength(response.headers.get("content-length"))
      )
    )
  }
  return self
}
