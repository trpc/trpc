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
import * as ByteSize from "../ByteSize.ts"
import * as Cause from "../Cause.ts"
import { Clock } from "../Clock.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import type * as Fiber from "../Fiber.ts"
import { constant, constFalse } from "../Function.ts"
import * as internalEffect from "../internal/effect.ts"
import { getStackTraceLimit, setStackTraceLimit } from "../internal/stackTraceLimit.ts"
import * as Layer from "../Layer.ts"
import * as IpNetwork from "../net/IpNetwork.ts"
import * as NetAddress from "../net/NetAddress.ts"
import * as Option from "../Option.ts"
import type { Predicate } from "../Predicate.ts"
import type { ReadonlyRecord } from "../Record.ts"
import * as Result from "../Result.ts"
import { nativeTracer, ParentSpan, Tracer } from "../Tracer.ts"
import * as Headers from "./Headers.ts"
import { hasBody } from "./HttpMethod.ts"
import type { CompressionAlgorithm } from "./HttpPlatform.ts"
import { HttpPlatform } from "./HttpPlatform.ts"
import { causeResponseStripped, ClientAbort, HttpServerError, ResponseError } from "./HttpServerError.ts"
import { HttpServerRequest } from "./HttpServerRequest.ts"
import * as Request from "./HttpServerRequest.ts"
import * as Response from "./HttpServerResponse.ts"
import type { HttpServerResponse } from "./HttpServerResponse.ts"
import * as TraceContext from "./HttpTraceContext.ts"
import * as compressionInternal from "./internal/compression.ts"
import * as decompressionInternal from "./internal/decompression.ts"
import * as bodyInternal from "./internal/httpBody.ts"
import { appendPreResponseHandlerUnsafe, CurrentRequestState } from "./internal/requestState.ts"
import * as tracing from "./internal/tracing.ts"
import * as internalUrlParams from "./internal/urlParams.ts"
import * as UrlParams from "./UrlParams.ts"

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
 * **Gotchas**
 *
 * TypeScript cannot infer the `app` parameter of an `Effect.fn` or
 * `Effect.fnUntraced` generator passed directly to `make`, so `app` becomes
 * `any` and the middleware loses the app's error and service types. Prefer an
 * arrow function, as in the first example. To use `Effect.fn`, declare `E`
 * and `R` type parameters and annotate `app` with them.
 *
 * **Example** (Defining middleware)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { HttpMiddleware, HttpServerResponse } from "effect/http"
 *
 * const withHeader = HttpMiddleware.make((app) =>
 *   Effect.gen(function*() {
 *     const response = yield* app
 *     return HttpServerResponse.setHeader(response, "x-service", "example")
 *   })
 * )
 *
 * const app: Effect.Effect<HttpServerResponse.HttpServerResponse, "Unauthorized"> =
 *   Effect.fail("Unauthorized")
 *
 * // Effect<HttpServerResponse, "Unauthorized", HttpServerRequest>
 * const withHeaderApp = withHeader(app)
 * ```
 *
 * **Example** (Defining middleware with Effect.fn)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { HttpMiddleware, HttpServerResponse } from "effect/http"
 *
 * const withHeader = HttpMiddleware.make(
 *   Effect.fn("withHeader")(function*<E, R>(
 *     app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
 *   ) {
 *     const response = yield* app
 *     return HttpServerResponse.setHeader(response, "x-service", "example")
 *   })
 * )
 *
 * const app: Effect.Effect<HttpServerResponse.HttpServerResponse, "Unauthorized"> =
 *   Effect.fail("Unauthorized")
 *
 * // Effect<HttpServerResponse, "Unauthorized", never>
 * const withHeaderApp = withHeader(app)
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = <M extends HttpMiddleware>(middleware: M): M => middleware

/**
 * Runs an effect with HTTP response logging disabled for the current server request.
 *
 * @stability unstable
 * @category logging
 * @since 4.0.0
 */
export const withLoggerDisabled = <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R | HttpServerRequest> =>
  Effect.withFiber((fiber) => {
    const state = Context.getOrUndefined(fiber.context, CurrentRequestState)
    if (state !== undefined) state.loggerDisabled = true
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
 * **Details**
 *
 * Defaults to the request method unchanged.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const SpanNameGenerator = Context.Reference<(request: HttpServerRequest) => string>(
  "@effect/platform/HttpMiddleware/SpanNameGenerator",
  { defaultValue: () => (request) => request.method }
)

/**
 * Context reference for filtering request and response headers added to server spans.
 *
 * **Details**
 *
 * Header capture is opt-in: the default filter records no headers. Captured
 * headers listed in `Headers.CurrentRedactedNames` are recorded as `<redacted>`.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const TracerHeaderFilter = Context.Reference<
  (headerName: string, phase: "request" | "response") => boolean
>("effect/http/HttpMiddleware/TracerHeaderFilter", {
  defaultValue: () => constFalse
})

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
    const state = Context.getOrUndefined(fiber.context, CurrentRequestState)
    const path = internalUrlParams.stripSearchAndHash(request.url)
    return Effect.withLogSpan(
      Effect.flatMap(Effect.exit(httpApp), (exit) => {
        if (state?.loggerDisabled) {
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

// OpenTelemetry requires failed server spans for 5xx responses.
const responseSpanExit = (
  fiber: Fiber.Fiber<unknown, unknown>,
  request: HttpServerRequest,
  response: HttpServerResponse
): Exit.Exit<HttpServerResponse, HttpServerError> => {
  if (!(response.status >= 500 && response.status < 600)) {
    return Exit.succeed(response)
  }
  // The message is path-only, but exporters can still read `error.request.url`
  // after the request-scoped redacted names are gone.
  const url = UrlParams.redactUrl(request.url, fiber.getRef(UrlParams.CurrentRedactedNames))
  if (url !== request.url) {
    request = request.modify({ url })
  }
  const stackTraceLimit = getStackTraceLimit()
  setStackTraceLimit(0)
  try {
    return Exit.fail(new HttpServerError({ reason: new ResponseError({ request, response }) }))
  } finally {
    setStackTraceLimit(stackTraceLimit)
  }
}

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
        span.end(endTime, responseSpanExit(fiber, request, exit.value))
        return undefined
      }
      const redactedHeaderNames = fiber.getRef(Headers.CurrentRedactedNames)
      const headerFilter = fiber.getRef(TracerHeaderFilter)
      // Complete the span before the request fiber exits so shutdown can flush it.
      let response: HttpServerResponse
      let spanExit: Exit.Exit<HttpServerResponse, unknown>
      if (Exit.isFailure(exit)) {
        const [failureResponse, cause] = causeResponseStripped(exit.cause)
        response = failureResponse
        // OpenTelemetry only treats 5xx responses as server span errors; interrupts still fail the span.
        spanExit = Option.isSome(cause) && (response.status >= 500 || Cause.hasInterrupts(cause.value))
          ? Exit.failCause(cause.value)
          : responseSpanExit(fiber, request, response)
      } else {
        response = exit.value
        spanExit = responseSpanExit(fiber, request, response)
      }
      if (span.sampled) {
        span.attribute("http.request.method", request.method)
        const url = Request.toURL(request)
        if (Option.isSome(url)) {
          tracing.addUrlAttributes(span, url.value, fiber.getRef(UrlParams.CurrentRedactedNames))
        }
        if (request.headers["user-agent"] !== undefined) {
          span.attribute("user_agent.original", request.headers["user-agent"])
        }
        tracing.addHeaderAttributes(span, "request", request.headers, headerFilter, redactedHeaderNames)
        if (Option.isSome(request.remoteAddress)) {
          span.attribute("client.address", request.remoteAddress.value)
        }
        span.attribute("http.response.status_code", response.status)
        tracing.addHeaderAttributes(span, "response", response.headers, headerFilter, redactedHeaderNames)
      }
      span.end(endTime, spanExit)
      return undefined
    })
    return httpApp
  })
)

/**
 * Options for `xForwardedHeaders`.
 *
 * **Details**
 *
 * `trustedProxies` is a list of networks or a predicate that decides whether an
 * address belongs to a proxy you operate. IPv4-mapped IPv6 addresses are
 * converted to IPv4 before matching.
 *
 * @stability unstable
 * @category proxying
 * @since 4.0.0
 */
export interface TrustedProxyOptions {
  readonly trustedProxies: ReadonlyArray<IpNetwork.IpNetwork> | Predicate<NetAddress.IpAddress>
}

/**
 * Creates middleware that applies `X-Forwarded-For`, `X-Forwarded-Host`, and
 * `X-Forwarded-Proto` sent by trusted proxies.
 *
 * **When to use**
 *
 * Use when the app runs behind proxies that append to `X-Forwarded-For`, such
 * as most load balancers and TLS terminators.
 *
 * **Details**
 *
 * Headers are ignored unless the original transport peer
 * (`request.peerAddress`) is trusted. `X-Forwarded-For` is then walked from
 * the right, skipping trusted proxies. The first untrusted address becomes
 * `remoteAddress`. When every address is trusted, the leftmost one is used. An
 * entry that is not an IP address, such as `unknown`, stops the walk and
 * leaves the request unchanged.
 *
 * `X-Forwarded-Host` and `X-Forwarded-Proto` are only used when they list one
 * value per `X-Forwarded-For` entry; the value at the selected position
 * replaces the `host` header and sets `protocol` (`http` or `https`), which
 * `HttpServerRequest.toURL` uses. Otherwise the transport values are kept.
 *
 * `request.peerAddress` keeps the transport peer after `remoteAddress` is
 * replaced.
 *
 * **Example** (Reading the client address behind a load balancer)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option } from "effect"
 * import { HttpMiddleware, HttpServerRequest, HttpServerResponse } from "effect/http"
 * import { IpNetwork } from "effect/net"
 *
 * const app = HttpServerRequest.HttpServerRequest.use((request) =>
 *   Effect.succeed(HttpServerResponse.text(Option.getOrElse(request.remoteAddress, () => "unknown")))
 * ).pipe(
 *   HttpMiddleware.xForwardedHeaders({
 *     trustedProxies: [IpNetwork.fromStringUnsafe("10.0.0.0/8")]
 *   })
 * )
 *
 * // The load balancer at 10.0.0.1 appended the client address to a spoofed entry
 * const request = HttpServerRequest.fromWeb(
 *   new Request("http://app.test/", { headers: { "x-forwarded-for": "6.6.6.6, 198.51.100.7" } })
 * ).modify({ remoteAddress: Option.some("10.0.0.1") })
 *
 * const response = await Effect.runPromise(
 *   Effect.provideService(app, HttpServerRequest.HttpServerRequest, request)
 * )
 * await HttpServerResponse.toWeb(response).text() // => "198.51.100.7"
 * ```
 *
 * @stability unstable
 * @category proxying
 * @since 4.0.0
 */
export const xForwardedHeaders = (options: TrustedProxyOptions): <E, R>(
  httpApp: Effect.Effect<HttpServerResponse, E, HttpServerRequest | R>
) => Effect.Effect<HttpServerResponse, E, HttpServerRequest | R> => {
  const { trustedProxies } = options
  const isTrusted: Predicate<NetAddress.IpAddress> = typeof trustedProxies === "function"
    ? trustedProxies
    : (address) => trustedProxies.some((network) => IpNetwork.contains(network, address))
  return make((httpApp) =>
    Effect.updateService(httpApp, HttpServerRequest, (request) => applyXForwarded(request, isTrusted))
  )
}

const applyXForwarded = (request: HttpServerRequest, isTrusted: Predicate<NetAddress.IpAddress>): HttpServerRequest => {
  const peer = parseForwardedAddress(Option.getOrUndefined(request.peerAddress))
  if (peer === undefined || !isTrusted(peer)) return request
  const addresses = splitList(request.headers["x-forwarded-for"])
  if (addresses === undefined) return request
  for (let index = addresses.length - 1; index >= 0; index--) {
    const address = parseForwardedAddress(addresses[index])
    if (address === undefined) return request
    if (index > 0 && isTrusted(address)) continue
    const host = alignedValue(request.headers["x-forwarded-host"], addresses.length, index)
    const protocol = alignedValue(request.headers["x-forwarded-proto"], addresses.length, index)?.toLowerCase()
    return request.modify({
      remoteAddress: Option.some(NetAddress.formatIp(address)),
      peerAddress: request.peerAddress,
      ...(host !== undefined && isValidHost(host) ? { headers: Headers.set(request.headers, "host", host) } : {}),
      ...(protocol === "http" || protocol === "https" ? { protocol } : {})
    })
  }
  return request
}

const splitList = (value: string | undefined): Array<string> | undefined => value?.split(",").map((_) => _.trim())

// Host and proto lists are only associated with a hop when they have one value
// per `X-Forwarded-For` entry.
const alignedValue = (header: string | undefined, length: number, index: number): string | undefined => {
  const values = splitList(header)
  return values?.length === length ? values[index] : undefined
}

const parseForwardedAddress = (input: string | undefined): NetAddress.IpAddress | undefined => {
  if (input === undefined) return undefined
  const ip = NetAddress.ipFromString(input.startsWith("[") && input.endsWith("]") ? input.slice(1, -1) : input)
  if (Result.isSuccess(ip)) return NetAddress.toCanonical(ip.success)
  const inet = NetAddress.inetAddressFromString(input)
  return Result.isSuccess(inet) ? NetAddress.toCanonical(inet.success.address) : undefined
}

const hostShape = /^(?:\[[0-9a-f:.]+\]|[a-z0-9._-]+)(?::\d{1,5})?$/i

// The shape check rules out paths, userinfo and lists; the URL parser rejects
// invalid IP literals and out-of-range ports, matching what `toURL` accepts.
const isValidHost = (host: string): boolean => hostShape.test(host) && URL.canParse(`http://${host}`)

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
      appendPreResponseHandlerUnsafe(fiber.context, preResponseHandler)
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
      const compression = Context.getUnsafe(fiber.context, HttpPlatform).compression
      appendPreResponseHandlerUnsafe(fiber.context, (request, response) =>
        transform(compression, request.headers["accept-encoding"], response))
      return httpApp
    })
}

/**
 * Middleware that decompresses request bodies sent with a `Content-Encoding`
 * of `gzip` or `deflate`.
 *
 * **Details**
 *
 * The request service is replaced with a view whose body accessors (`stream`,
 * `text`, `json`, `arrayBuffer`, `urlParamsBody`, `multipart`) yield the
 * decompressed body, and whose headers no longer include `Content-Encoding`
 * or `Content-Length`. Decompression is lazy and only happens when the body
 * is read. Stacked codings such as `deflate, gzip` are undone in reverse
 * order, and `identity` members are ignored.
 *
 * Requests whose `Content-Encoding` includes any other coding are rejected
 * with `415 Unsupported Media Type` and `Accept-Encoding: gzip, deflate`,
 * without running the app. Malformed compressed data fails the body read
 * with a `RequestParseError`, or a `MultipartError` with reason `Parse` when
 * reading multipart data.
 *
 * The decompressed size is limited to `maxDecompressedSize`, falling back to
 * the `MaxBodySize` reference and then to 10 MiB. Exceeding it fails the body
 * read with a `RequestParseError`, or a `MultipartError` with reason
 * `BodyTooLarge` when reading multipart data. The limit applies to every body
 * accessor, including `stream`.
 *
 * Decompression uses the global `DecompressionStream`. `deflate` means the
 * zlib format (RFC 1950); raw deflate data is rejected.
 *
 * **Gotchas**
 *
 * `request.source` is still the original, compressed request.
 * `HttpServerRequest.toWeb` returns that compressed request only when the
 * source is a Web `Request`. On other platforms, such as Node, it builds a new
 * `Request` from the decompressed body and the stripped headers.
 *
 * @stability unstable
 * @category compression
 * @since 4.0.0
 */
export const decompression = (
  options?: {
    /**
     * Maximum number of decompressed body bytes. Defaults to the
     * `MaxBodySize` reference, or 10 MiB when that is unset.
     */
    readonly maxDecompressedSize?: ByteSize.Input | undefined
  } | undefined
): <E, R>(
  httpApp: Effect.Effect<HttpServerResponse, E, R>
) => Effect.Effect<HttpServerResponse, E, R | HttpServerRequest> => {
  const maxDecompressedSize = options?.maxDecompressedSize === undefined
    ? undefined
    : ByteSize.fromInputUnsafe(options.maxDecompressedSize)
  return <E, R>(
    httpApp: Effect.Effect<HttpServerResponse, E, R>
  ): Effect.Effect<HttpServerResponse, E, R | HttpServerRequest> =>
    Effect.withFiber((fiber) => {
      const request = Context.getUnsafe(fiber.context, HttpServerRequest)
      const contentEncoding = request.headers["content-encoding"]
      if (contentEncoding === undefined || !hasBody(request.method)) {
        return httpApp
      }
      const codings = decompressionInternal.parseContentEncoding(contentEncoding)
      if (codings === undefined) {
        return Effect.succeed(Response.empty({
          status: 415,
          headers: { "accept-encoding": "gzip, deflate" }
        }))
      }
      if (codings.length === 0) {
        return httpApp
      }
      return Effect.provideService(
        httpApp,
        HttpServerRequest,
        new decompressionInternal.DecompressedRequest(request, codings, maxDecompressedSize)
      )
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
