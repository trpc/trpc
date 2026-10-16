/**
 * Wraps HTTP server apps with request and response behavior.
 *
 * A middleware is a function from one HTTP server app effect to another. The app
 * runs with the current `HttpServerRequest` in its context, so middleware can
 * inspect or rewrite the request, provide request-scoped services, attach hooks
 * before the response is sent, or observe the app exit. This module includes
 * middleware for response logging, server tracing, forwarded proxy headers,
 * parsed search parameters, and CORS response headers.
 *
 * @stability unstable
 * @since 4.0.0
 */
import { Clock } from "../Clock.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import type * as Fiber from "../Fiber.ts"
import { constant, constFalse } from "../Function.ts"
import * as internalEffect from "../internal/effect.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import type { Predicate } from "../Predicate.ts"
import type { ReadonlyRecord } from "../Record.ts"
import { nativeTracer, ParentSpan, Tracer } from "../Tracer.ts"
import * as Headers from "./Headers.ts"
import type { CompressionAlgorithm } from "./HttpPlatform.ts"
import { HttpPlatform } from "./HttpPlatform.ts"
import { causeResponseStripped, ClientAbort } from "./HttpServerError.ts"
import { HttpServerRequest } from "./HttpServerRequest.ts"
import * as Request from "./HttpServerRequest.ts"
import * as Response from "./HttpServerResponse.ts"
import type { HttpServerResponse } from "./HttpServerResponse.ts"
import * as TraceContext from "./HttpTraceContext.ts"
import * as compressionInternal from "./internal/compression.ts"
import * as bodyInternal from "./internal/httpBody.ts"
import { appendPreResponseHandlerUnsafe } from "./internal/preResponseHandler.ts"

/**
 * Middleware that transforms an HTTP server app effect into another HTTP server app effect.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface HttpMiddleware {
  <E, R>(self: Effect.Effect<HttpServerResponse, E, R | HttpServerRequest>): Effect.Effect<HttpServerResponse, any, any>
}

/**
 * Namespace containing types associated with `HttpMiddleware`.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace HttpMiddleware {
  /**
   * Callable type representing middleware already specialized to a particular transformed app type.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface Applied<A extends Effect.Effect<HttpServerResponse, any, any>, E, R> {
    (self: Effect.Effect<HttpServerResponse, E, R>): A
  }
}

/**
 * Defines an `HttpMiddleware` while preserving its precise type.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = <M extends HttpMiddleware>(middleware: M): M => middleware

const loggerDisabledRequests = new WeakSet<object>()

const stripSearchAndHash = (url: string): string => {
  const queryIndex = url.indexOf("?")
  const hashIndex = url.indexOf("#")

  if (queryIndex === -1) {
    return hashIndex === -1 ? url : url.slice(0, hashIndex)
  }
  if (hashIndex === -1) {
    return url.slice(0, queryIndex)
  }
  return url.slice(0, Math.min(queryIndex, hashIndex))
}

/**
 * Runs an effect with HTTP response logging disabled for the current server request.
 *
 * @stability unstable
 * @category logging
 * @since 4.0.0
 */
export const withLoggerDisabled = <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R | HttpServerRequest> =>
  Effect.withFiber((fiber) => {
    const request = Context.getUnsafe(fiber.context, HttpServerRequest)
    loggerDisabledRequests.add(request.source)
    return self
  })

/**
 * Context reference for a predicate that disables server-side tracing for matching requests.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const TracerDisabledWhen = Context.Reference<Predicate<HttpServerRequest>>(
  "effect/http/HttpMiddleware/TracerDisabledWhen",
  { defaultValue: () => constFalse }
)

/**
 * Creates a layer that disables server-side tracing for requests whose URL exactly matches one of the supplied URLs.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerTracerDisabledForUrls = (
  urls: ReadonlyArray<string>
): Layer.Layer<never> => Layer.succeed(TracerDisabledWhen)((req) => urls.includes(req.url))

/**
 * Context reference for generating server span names from HTTP server requests.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const SpanNameGenerator = Context.Reference<(request: HttpServerRequest) => string>(
  "@effect/platform/HttpMiddleware/SpanNameGenerator",
  { defaultValue: () => (request) => `http.server ${request.method}` }
)

/**
 * Middleware that logs sent HTTP responses with request method, request URL, and response status annotations.
 *
 * @stability unstable
 * @category logging
 * @since 4.0.0
 */
export const logger: <E, R>(
  httpApp: Effect.Effect<HttpServerResponse, E, HttpServerRequest | R>
) => Effect.Effect<HttpServerResponse, E, HttpServerRequest | R> = make((httpApp) =>
  Effect.withFiber((fiber) => {
    const request = Context.getUnsafe(fiber.context, HttpServerRequest)
    const path = stripSearchAndHash(request.url)
    return Effect.withLogSpan(
      Effect.flatMap(Effect.exit(httpApp), (exit) => {
        if (loggerDisabledRequests.has(request.source)) {
          return exit
        } else if (exit._tag === "Failure") {
          const [response, cause] = causeResponseStripped(exit.cause)
          const message = Option.isSome(cause) &&
              !cause.value.reasons.every((reason) =>
                reason._tag === "Interrupt" && reason.annotations.has(ClientAbort.key)
              )
            ? cause.value
            : "Sent HTTP response"
          return Effect.andThen(
            Effect.annotateLogs(Effect.log(message), {
              "http.method": request.method,
              "http.url": path,
              "http.status": response.status
            }),
            exit
          )
        }
        return Effect.andThen(
          Effect.annotateLogs(Effect.log("Sent HTTP response"), {
            "http.method": request.method,
            "http.url": path,
            "http.status": exit.value.status
          }),
          exit
        )
      }),
      "http.span"
    )
  })
)

/**
 * @internal
 */
export const isTracerDisabledUnsafe = (
  fiber: Fiber.Fiber<unknown, unknown>,
  request: HttpServerRequest
): boolean => !fiber.cache.tracerEnabled || fiber.getRef(TracerDisabledWhen)(request)

/**
 * Middleware that creates a server trace span for each request and records request and response HTTP attributes.
 *
 * @stability unstable
 * @category tracing
 * @since 4.0.0
 */
export const tracer: <E, R>(
  httpApp: Effect.Effect<HttpServerResponse, E, HttpServerRequest | R>
) => Effect.Effect<HttpServerResponse, E, HttpServerRequest | R> = make((httpApp) =>
  Effect.withFiber((fiber) => {
    const request = Context.getUnsafe(fiber.context, HttpServerRequest)
    if (isTracerDisabledUnsafe(fiber, request)) {
      return httpApp
    }
    const nameGenerator = fiber.getRef(SpanNameGenerator)
    const span = internalEffect.makeSpanUnsafe(fiber, nameGenerator(request), {
      parent: Option.getOrUndefined(TraceContext.fromHeaders(request.headers)),
      kind: "server"
    })
    const prevServices = fiber.context
    fiber.setContext(Context.add(fiber.context, ParentSpan, span))
    internalEffect.onExitUnsafe<HttpServerResponse, unknown>(fiber, (exit) => {
      fiber.setContext(prevServices)
      const endTime = fiber.getRef(Clock).currentTimeNanosUnsafe()
      if (Exit.isSuccess(exit) && (!span.sampled || fiber.getRef(Tracer) === nativeTracer)) {
        span.end(endTime, exit)
        return undefined
      }
      const redactedHeaderNames = fiber.getRef(Headers.CurrentRedactedNames)
      fiber.currentDispatcher.scheduleTask(() => {
        let response: HttpServerResponse
        let spanExit = exit
        if (Exit.isFailure(exit)) {
          const [failureResponse, cause] = causeResponseStripped(exit.cause)
          response = failureResponse
          spanExit = Option.isSome(cause) ? Exit.failCause(cause.value) : Exit.succeed(response)
        } else {
          response = exit.value
        }
        if (span.sampled) {
          span.attribute("http.request.method", request.method)
          if (request.url.startsWith("/")) {
            const host = request.headers.host ?? "localhost"
            const protocol = request.headers["x-forwarded-proto"] === "https" ? "https" : "http"
            span.attribute("url.full", `${protocol}://${host}${request.url}`)
            const queryIndex = request.url.indexOf("?")
            if (queryIndex === -1) {
              span.attribute("url.path", request.url)
            } else {
              span.attribute("url.path", request.url.slice(0, queryIndex))
              if (queryIndex < request.url.length - 1) {
                span.attribute("url.query", request.url.slice(queryIndex + 1))
              }
            }
            span.attribute("url.scheme", protocol)
          } else {
            const url = Request.toURL(request)
            if (Option.isSome(url)) {
              if (url.value.username !== "" || url.value.password !== "") {
                url.value.username = "REDACTED"
                url.value.password = "REDACTED"
              }
              span.attribute("url.full", url.value.toString())
              span.attribute("url.path", url.value.pathname)
              const query = url.value.search.slice(1)
              if (query !== "") {
                span.attribute("url.query", query)
              }
              span.attribute("url.scheme", url.value.protocol.slice(0, -1))
            }
          }
          if (request.headers["user-agent"] !== undefined) {
            span.attribute("user_agent.original", request.headers["user-agent"])
          }
          for (const name in request.headers) {
            span.attribute(
              `http.request.header.${name}`,
              Headers.isRedactedName(name, redactedHeaderNames) ? "<redacted>" : request.headers[name]
            )
          }
          if (Option.isSome(request.remoteAddress)) {
            span.attribute("client.address", request.remoteAddress.value)
          }
          span.attribute("http.response.status_code", response.status)
          for (const name in response.headers) {
            span.attribute(
              `http.response.header.${name}`,
              Headers.isRedactedName(name, redactedHeaderNames) ? "<redacted>" : response.headers[name]
            )
          }
        }
        span.end(endTime, spanExit)
      }, 0)
      return undefined
    })
    return httpApp
  })
)

/**
 * Middleware that trusts `X-Forwarded-Host` and `X-Forwarded-For`, updating the request host header and remote address.
 *
 * @stability unstable
 * @category proxying
 * @since 4.0.0
 */
export const xForwardedHeaders = make((httpApp) =>
  Effect.updateService(httpApp, HttpServerRequest, (request) =>
    request.headers["x-forwarded-host"]
      ? request.modify({
        headers: Headers.set(
          request.headers,
          "host",
          request.headers["x-forwarded-host"]
        ),
        remoteAddress: Option.fromNullishOr(request.headers["x-forwarded-for"]?.split(",")[0].trim())
      })
      : request)
)

/**
 * Middleware that parses the current request URL's search parameters and provides them as `ParsedSearchParams`.
 *
 * @stability unstable
 * @category parsing
 * @since 4.0.0
 */
export const searchParamsParser = <E, R>(
  httpApp: Effect.Effect<HttpServerResponse, E, R>
): Effect.Effect<Response.HttpServerResponse, E, HttpServerRequest | Exclude<R, Request.ParsedSearchParams>> =>
  Effect.withFiber((fiber) => {
    const services = fiber.context
    const request = Context.getUnsafe(services, HttpServerRequest)
    const params = Request.searchParamsFromURL(new URL(request.originalUrl))
    return Effect.provideService(
      httpApp,
      Request.ParsedSearchParams,
      params
    ) as any
  })

/**
 * Middleware that handles CORS preflight requests and adds configured CORS headers to HTTP responses.
 *
 * @stability unstable
 * @category middleware
 * @since 4.0.0
 */
export const cors = (options?: {
  readonly allowedOrigins?: ReadonlyArray<string> | Predicate<string> | undefined
  readonly allowedMethods?: ReadonlyArray<string> | undefined
  readonly allowedHeaders?: ReadonlyArray<string> | undefined
  readonly exposedHeaders?: ReadonlyArray<string> | undefined
  readonly maxAge?: number | undefined
  readonly credentials?: boolean | undefined
}): <E, R>(
  httpApp: Effect.Effect<HttpServerResponse, E, R>
) => Effect.Effect<HttpServerResponse, E, R | HttpServerRequest> => {
  const opts = {
    allowedOrigins: options?.allowedOrigins ?? [],
    allowedMethods: options?.allowedMethods ?? ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
    allowedHeaders: options?.allowedHeaders ?? [],
    exposedHeaders: options?.exposedHeaders ?? [],
    credentials: options?.credentials ?? false,
    maxAge: options?.maxAge
  }

  const isAllowedOrigin = typeof opts.allowedOrigins === "function"
    ? opts.allowedOrigins
    : (origin: string) => (opts.allowedOrigins as ReadonlyArray<string>).includes(origin)

  const allowOrigin = typeof opts.allowedOrigins === "function" || opts.allowedOrigins.length > 1
    ? ((originHeader: string): ReadonlyRecord<string, string> => {
      if (!isAllowedOrigin(originHeader)) return { vary: "Origin" }
      return {
        "access-control-allow-origin": originHeader,
        vary: "Origin"
      }
    })
    : opts.allowedOrigins.length === 0
    ? constant({
      "access-control-allow-origin": "*"
    })
    : constant({
      "access-control-allow-origin": opts.allowedOrigins[0],
      vary: "Origin"
    })

  const allowMethods = opts.allowedMethods.length > 0
    ? { "access-control-allow-methods": opts.allowedMethods.join(", ") }
    : undefined

  const allowCredentials = opts.credentials
    ? { "access-control-allow-credentials": "true" }
    : undefined

  const allowHeaders = (
    accessControlRequestHeaders: string | undefined
  ): ReadonlyRecord<string, string> | undefined => {
    if (opts.allowedHeaders.length === 0 && accessControlRequestHeaders) {
      return {
        vary: "Access-Control-Request-Headers",
        "access-control-allow-headers": accessControlRequestHeaders
      }
    }

    if (opts.allowedHeaders) {
      return {
        "access-control-allow-headers": opts.allowedHeaders.join(",")
      }
    }

    return undefined
  }

  const exposeHeaders = opts.exposedHeaders.length > 0
    ? { "access-control-expose-headers": opts.exposedHeaders.join(",") }
    : undefined

  const maxAge = opts.maxAge
    ? { "access-control-max-age": opts.maxAge.toString() }
    : undefined

  const headersFromRequest = (request: HttpServerRequest) => {
    const origin = request.headers["origin"]
    return Headers.fromRecordUnsafe({
      ...allowOrigin(origin),
      ...allowCredentials,
      ...exposeHeaders
    })
  }

  const headersFromRequestOptions = (request: HttpServerRequest) => {
    const origin = request.headers["origin"]
    const accessControlRequestHeaders = request.headers["access-control-request-headers"]
    const headers = Headers.fromRecordUnsafe({
      ...allowOrigin(origin),
      ...allowCredentials,
      ...exposeHeaders,
      ...allowMethods,
      ...maxAge
    })
    const accessControlHeaders = allowHeaders(accessControlRequestHeaders)
    if (accessControlHeaders === undefined) return headers
    const vary = accessControlHeaders["vary"]
    return Headers.setAll(
      headers,
      vary === undefined
        ? accessControlHeaders
        : {
          ...accessControlHeaders,
          vary: compressionInternal.varyWith(headers, vary)
        }
    )
  }

  const preResponseHandler = (request: HttpServerRequest, response: HttpServerResponse) => {
    const headers = headersFromRequest(request)
    return Effect.succeed(Response.setHeaders(
      response,
      headers["vary"] === undefined
        ? headers
        : Headers.set(headers, "vary", compressionInternal.varyWith(response.headers, "Origin"))
    ))
  }

  return <E, R>(
    httpApp: Effect.Effect<HttpServerResponse, E, R>
  ): Effect.Effect<HttpServerResponse, E, R | HttpServerRequest> =>
    Effect.withFiber((fiber) => {
      const request = Context.getUnsafe(fiber.context, HttpServerRequest)
      if (request.method === "OPTIONS") {
        return Effect.succeed(Response.empty({
          status: 204,
          headers: headersFromRequestOptions(request)
        }))
      }
      appendPreResponseHandlerUnsafe(request, preResponseHandler)
      return httpApp
    })
}

/**
 * Middleware that compresses HTTP response bodies based on the request's
 * `Accept-Encoding` header.
 *
 * **Details**
 *
 * Content negotiation follows RFC 9110: the first algorithm in server
 * preference order that the client accepts with a positive q-value and the
 * platform supports is used. When no algorithm is acceptable the response is
 * sent uncompressed.
 *
 * The body transform is performed by the `HttpPlatform` service.
 *
 * Responses are skipped when the status is 1xx, 204, 206, or 304, when a
 * `Content-Encoding` is already present, when `Cache-Control: no-transform`
 * is set, when the content type is absent or not compressible, when a known
 * body length is below `minSize`, or when the body is empty or `FormData`. A
 * response carrying `Content-Encoding: identity` opts out of compression and
 * has the header stripped before sending.
 *
 * `Vary: Accept-Encoding` is set on every response that was eligible by
 * status and content type, including ones skipped by negotiation or
 * `minSize`.
 *
 * Do not combine this middleware with Deno's automatic response compression.
 * On edge runtimes that already apply automatic compression, the middleware
 * is unnecessary. Platforms backed by Web `CompressionStream` also cannot
 * explicitly flush each input chunk, so incremental delivery depends on the
 * runtime's implementation.
 *
 * **Gotchas**
 *
 * Compression can expose secrets through BREACH-style attacks when one
 * response contains both secret data and attacker-controlled input and an
 * attacker can observe the compressed response length. For affected routes,
 * disable compression with `Content-Encoding: identity` or
 * `Cache-Control: no-transform`, or use `compressible` to restrict which
 * response content types can be compressed.
 *
 * @stability unstable
 * @category compression
 * @since 4.0.0
 */
export const compression = (
  options?: {
    /**
     * Server preference order. Negotiation picks the first accepted algorithm
     * supported by the platform. Defaults to `["br", "gzip", "deflate"]`;
     * `zstd` must be explicitly opted into.
     */
    readonly algorithms?: ReadonlyArray<CompressionAlgorithm> | undefined
    /**
     * Minimum body size in bytes when the length is known. Unknown-length bodies
     * are always compressed. Defaults to `1024`.
     */
    readonly minSize?: number | undefined
    /** Replaces the default content-type predicate. */
    readonly compressible?: ((contentType: string) => boolean) | undefined
    /** Per-algorithm levels. Platforms without a level knob ignore them. */
    readonly levels?: {
      readonly gzip?: number | undefined
      readonly deflate?: number | undefined
      readonly br?: number | undefined
      readonly zstd?: number | undefined
    } | undefined
  } | undefined
): <E, R>(
  httpApp: Effect.Effect<HttpServerResponse, E, R>
) => Effect.Effect<HttpServerResponse, E, R | HttpServerRequest | HttpPlatform> => {
  const preferred = options?.algorithms ?? defaultAlgorithms
  const minSize = options?.minSize ?? 1024
  const compressible = options?.compressible ?? compressionInternal.defaultCompressible
  const levels = { ...defaultLevels, ...options?.levels }
  const levelOptions: Record<CompressionAlgorithm, { readonly level: number | undefined }> = {
    gzip: { level: levels.gzip },
    deflate: { level: levels.deflate },
    br: { level: levels.br },
    zstd: { level: levels.zstd }
  }
  const transform = (
    compression: HttpPlatform["Service"]["compression"],
    acceptEncoding: string | undefined,
    response: HttpServerResponse
  ): Effect.Effect<HttpServerResponse> => {
    if (
      response.status < 200 ||
      response.status === 204 ||
      response.status === 206 ||
      response.status === 304
    ) {
      return Effect.succeed(response)
    }
    const currentEncoding = response.headers["content-encoding"]
    if (currentEncoding !== undefined) {
      return Effect.succeed(
        currentEncoding.trim().toLowerCase() === "identity"
          ? Response.removeHeader(response, "content-encoding")
          : response
      )
    }
    const body = response.body
    if (body._tag === "Empty" || body._tag === "FormData") {
      return Effect.succeed(response)
    }
    const cacheControl = response.headers["cache-control"]
    if (cacheControl !== undefined && noTransformRegex.test(cacheControl)) {
      return Effect.succeed(response)
    }
    const contentType = response.headers["content-type"] ?? body.contentType
    if (contentType === undefined || !compressible(contentType)) {
      return Effect.succeed(response)
    }
    const algorithm = compressionInternal.negotiate(acceptEncoding, preferred, compression.algorithms)
    if (algorithm === undefined) {
      return Effect.succeed(withVary(response))
    }
    const contentLength = body.contentLength ?? bodyInternal.parseContentLength(response.headers["content-length"])
    if (contentLength !== undefined && contentLength < minSize) {
      return Effect.succeed(withVary(response))
    }
    return compression.compressResponse(response, algorithm, levelOptions[algorithm])
  }
  return <E, R>(
    httpApp: Effect.Effect<HttpServerResponse, E, R>
  ): Effect.Effect<HttpServerResponse, E, R | HttpServerRequest | HttpPlatform> =>
    Effect.withFiber((fiber) => {
      const request = Context.getUnsafe(fiber.context, HttpServerRequest)
      const compression = Context.getUnsafe(fiber.context, HttpPlatform).compression
      appendPreResponseHandlerUnsafe(request, (request, response) =>
        transform(compression, request.headers["accept-encoding"], response))
      return httpApp
    })
}

const withVary = (response: HttpServerResponse): HttpServerResponse => {
  const vary = compressionInternal.varyWith(response.headers, "Accept-Encoding")
  return Response.setHeader(response, "vary", vary)
}

const defaultAlgorithms: ReadonlyArray<CompressionAlgorithm> = ["br", "gzip", "deflate"]

const defaultLevels = {
  gzip: 6,
  deflate: 6,
  br: 4,
  zstd: 3
} as const

const noTransformRegex = /(?:^|[\s,])no-transform(?:$|[\s,;])/i
