/**
 * Provides the service used to run outgoing HTTP requests.
 *
 * `HttpClient` executes immutable `HttpClientRequest` values and returns
 * `HttpClientResponse` values. Keeping HTTP behind this service lets programs,
 * tests, and generated API clients use the same request model without depending
 * on one concrete platform transport. This module includes request accessors,
 * constructors and layers, request and response transformations, status
 * filtering, retries, rate limiting, cookies, redirect handling, scoped request
 * abortion, and tracing support.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { NonEmptyReadonlyArray } from "../Array.ts"
import * as Cause from "../Cause.ts"
import { Clock } from "../Clock.ts"
import * as Context from "../Context.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as Fiber from "../Fiber.ts"
import { constant, constFalse, constTrue, dual, flow, identity } from "../Function.ts"
import * as Inspectable from "../Inspectable.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import type * as RateLimiter from "../persistence/RateLimiter.ts"
import { type Pipeable, pipeArguments } from "../Pipeable.ts"
import * as Predicate from "../Predicate.ts"
import * as Ref from "../Ref.ts"
import * as Result from "../Result.ts"
import * as Schedule from "../Schedule.ts"
import type * as Scope from "../Scope.ts"
import * as Stream from "../Stream.ts"
import * as Tracer from "../Tracer.ts"
import type { EqualsWith, ExcludeTag, ExtractTag, NoExcessProperties, NoInfer, Tags } from "../Types.ts"
import * as Cookies from "./Cookies.ts"
import * as Headers from "./Headers.ts"
import * as HttpBody from "./HttpBody.ts"
import * as Error from "./HttpClientError.ts"
import * as HttpClientRequest from "./HttpClientRequest.ts"
import * as HttpClientResponse from "./HttpClientResponse.ts"
import * as HttpIncomingMessage from "./HttpIncomingMessage.ts"
import * as HttpMethod from "./HttpMethod.ts"
import * as TraceContext from "./HttpTraceContext.ts"
import * as Url from "./Url.ts"

const TypeId = "~effect/http/HttpClient"

/**
 * Returns `true` if the provided value is an `HttpClient`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isHttpClient = (u: unknown): u is HttpClient => Predicate.hasProperty(u, TypeId)

/**
 * HTTP client whose requests produce `HttpClientResponse` values and can fail with `HttpClientError`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface HttpClient extends HttpClient.With<Error.HttpClientError> {}

/**
 * Namespace containing type-level members associated with `HttpClient`.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace HttpClient {
  /**
   * Parameterized HTTP client that may fail with `E` and require environment `R`.
   *
   * **Details**
   *
   * It exposes preprocessing, postprocessing, direct request execution, and method-specific helpers.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface With<E, R = never> extends Pipeable, Inspectable.Inspectable {
    readonly [TypeId]: typeof TypeId
    readonly preprocess: Preprocess<E, R>
    readonly postprocess: Postprocess<E, R>
    readonly execute: (
      request: HttpClientRequest.HttpClientRequest
    ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E, R>

    readonly get: (
      url: string | URL,
      options?: HttpClientRequest.Options.NoUrl
    ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E, R>
    readonly query: (
      url: string | URL,
      options?: HttpClientRequest.Options.NoUrl
    ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E, R>
    readonly head: (
      url: string | URL,
      options?: HttpClientRequest.Options.NoUrl
    ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E, R>
    readonly post: (
      url: string | URL,
      options?: HttpClientRequest.Options.NoUrl
    ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E, R>
    readonly patch: (
      url: string | URL,
      options?: HttpClientRequest.Options.NoUrl
    ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E, R>
    readonly put: (
      url: string | URL,
      options?: HttpClientRequest.Options.NoUrl
    ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E, R>
    readonly del: (
      url: string | URL,
      options?: HttpClientRequest.Options.NoUrl
    ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E, R>
    readonly options: (
      url: string | URL,
      options?: HttpClientRequest.Options.NoUrl
    ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E, R>
  }

  /**
   * Effectful transformation applied to a request before the client executes it.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type Preprocess<E, R> = (
    request: HttpClientRequest.HttpClientRequest
  ) => Effect.Effect<HttpClientRequest.HttpClientRequest, E, R>

  /**
   * Function that turns a preprocessed request effect into the response effect executed by the client.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type Postprocess<E = never, R = never> = (
    request: Effect.Effect<HttpClientRequest.HttpClientRequest, E, R>
  ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E, R>
}

/**
 * Service tag for the default outgoing HTTP client service.
 *
 * **When to use**
 *
 * Use to provide the default outgoing HTTP client service used by request
 * accessors such as `execute`, `get`, and `post`.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const HttpClient: Context.Service<HttpClient, HttpClient> = Context.Service<HttpClient, HttpClient>(
  "effect/HttpClient"
)

const accessor = (method: keyof HttpClient) => (...args: Array<any>): Effect.Effect<any, any, any> =>
  Effect.flatMap(
    HttpClient,
    (client) => (client as any)[method](...args)
  )

/**
 * Executes a prebuilt `HttpClientRequest` using the `HttpClient` service from the environment.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const execute: (
  request: HttpClientRequest.HttpClientRequest
) => Effect.Effect<HttpClientResponse.HttpClientResponse, Error.HttpClientError, HttpClient> = accessor("execute")

/**
 * Executes a `GET` request using the `HttpClient` service from the environment.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const get: (url: string | URL, options?: HttpClientRequest.Options.NoUrl | undefined) => Effect.Effect<
  HttpClientResponse.HttpClientResponse,
  Error.HttpClientError,
  HttpClient
> = accessor("get")

/**
 * Executes a `QUERY` request using the `HttpClient` service from the environment.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const query: (url: string | URL, options?: HttpClientRequest.Options.NoUrl | undefined) => Effect.Effect<
  HttpClientResponse.HttpClientResponse,
  Error.HttpClientError,
  HttpClient
> = accessor("query")

/**
 * Executes a `HEAD` request using the `HttpClient` service from the environment.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const head: (url: string | URL, options?: HttpClientRequest.Options.NoUrl | undefined) => Effect.Effect<
  HttpClientResponse.HttpClientResponse,
  Error.HttpClientError,
  HttpClient
> = accessor("head")

/**
 * Executes a `POST` request using the `HttpClient` service from the environment.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const post: (url: string | URL, options?: HttpClientRequest.Options.NoUrl | undefined) => Effect.Effect<
  HttpClientResponse.HttpClientResponse,
  Error.HttpClientError,
  HttpClient
> = accessor("post")

/**
 * Executes a `PATCH` request using the `HttpClient` service from the environment.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const patch: (url: string | URL, options?: HttpClientRequest.Options.NoUrl | undefined) => Effect.Effect<
  HttpClientResponse.HttpClientResponse,
  Error.HttpClientError,
  HttpClient
> = accessor("patch")

/**
 * Executes a `PUT` request using the `HttpClient` service from the environment.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const put: (url: string | URL, options?: HttpClientRequest.Options.NoUrl | undefined) => Effect.Effect<
  HttpClientResponse.HttpClientResponse,
  Error.HttpClientError,
  HttpClient
> = accessor("put")

/**
 * Executes a `DELETE` request using the `HttpClient` service from the environment.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const del: (url: string | URL, options?: HttpClientRequest.Options.NoUrl | undefined) => Effect.Effect<
  HttpClientResponse.HttpClientResponse,
  Error.HttpClientError,
  HttpClient
> = accessor("del")

/**
 * Executes an `OPTIONS` request using the `HttpClient` service from the environment.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const options: (url: string | URL, options?: HttpClientRequest.Options.NoUrl | undefined) => Effect.Effect<
  HttpClientResponse.HttpClientResponse,
  Error.HttpClientError,
  HttpClient
> = accessor("options")

/**
 * Transforms a client by wrapping the response effect for each request.
 *
 * **Details**
 *
 * The transformation receives both the response effect and the original request, allowing it to change success, error, and environment behavior.
 *
 * @stability unstable
 * @category mapping
 * @since 4.0.0
 */
export const transform: {
  <E, R, E1, R1>(
    f: (
      effect: Effect.Effect<HttpClientResponse.HttpClientResponse, E, R>,
      request: HttpClientRequest.HttpClientRequest
    ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E1, R1>
  ): (self: HttpClient.With<E, R>) => HttpClient.With<E | E1, R | R1>
  <E, R, E1, R1>(
    self: HttpClient.With<E, R>,
    f: (
      effect: Effect.Effect<HttpClientResponse.HttpClientResponse, E, R>,
      request: HttpClientRequest.HttpClientRequest
    ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E1, R1>
  ): HttpClient.With<E | E1, R | R1>
} = dual(2, <E, R, E1, R1>(
  self: HttpClient.With<E, R>,
  f: (
    effect: Effect.Effect<HttpClientResponse.HttpClientResponse, E, R>,
    request: HttpClientRequest.HttpClientRequest
  ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E1, R1>
): HttpClient.With<E | E1, R | R1> =>
  makeWith(
    Effect.flatMap((request) => f(self.postprocess(Effect.succeed(request)), request)),
    self.preprocess
  ))

/**
 * Transforms a client by applying an effectful transformation to each response effect.
 *
 * @stability unstable
 * @category mapping
 * @since 4.0.0
 */
export const transformResponse: {
  <E, R, E1, R1>(
    f: (
      effect: Effect.Effect<HttpClientResponse.HttpClientResponse, E, R>
    ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E1, R1>
  ): (self: HttpClient.With<E, R>) => HttpClient.With<E1, R1>
  <E, R, E1, R1>(
    self: HttpClient.With<E, R>,
    f: (
      effect: Effect.Effect<HttpClientResponse.HttpClientResponse, E, R>
    ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E1, R1>
  ): HttpClient.With<E1, R1>
} = dual(2, <E, R, E1, R1>(
  self: HttpClient.With<E, R>,
  f: (
    effect: Effect.Effect<HttpClientResponse.HttpClientResponse, E, R>
  ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E1, R1>
): HttpClient.With<E1, R1> => makeWith((request) => f(self.postprocess(request)), self.preprocess))

const catch_: {
  <E, E2, R2>(
    f: (e: E) => Effect.Effect<HttpClientResponse.HttpClientResponse, E2, R2>
  ): <R>(self: HttpClient.With<E, R>) => HttpClient.With<E2, R2 | R>
  <E, R, E2, R2>(
    self: HttpClient.With<E, R>,
    f: (e: E) => Effect.Effect<HttpClientResponse.HttpClientResponse, E2, R2>
  ): HttpClient.With<E2, R | R2>
} = dual(
  2,
  <E, R, E2, R2>(
    self: HttpClient.With<E, R>,
    f: (e: E) => Effect.Effect<HttpClientResponse.HttpClientResponse, E2, R2>
  ): HttpClient.With<E2, R | R2> => transformResponse(self, Effect.catch(f))
)

/**
 * @stability unstable
 */
export {
  /**
   * Handles all client failures with an effectful recovery function and returns a transformed client.
   *
   * @stability unstable
   * @category error handling
   * @since 4.0.0
   */
  catch_ as catch
}

/**
 * Handles client failures with one or more matching `_tag` values and returns a transformed client.
 *
 * @stability unstable
 * @category error handling
 * @since 4.0.0
 */
export const catchTag: {
  <K extends Tags<E> | NonEmptyReadonlyArray<Tags<E>>, E, E1, R1>(
    tag: K,
    f: (
      e: ExtractTag<NoInfer<E>, K extends NonEmptyReadonlyArray<string> ? K[number] : K>
    ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E1, R1>
  ): <R>(
    self: HttpClient.With<E, R>
  ) => HttpClient.With<E1 | ExcludeTag<E, K extends NonEmptyReadonlyArray<string> ? K[number] : K>, R1 | R>
  <R, E, K extends Tags<E> | NonEmptyReadonlyArray<Tags<E>>, R1, E1>(
    self: HttpClient.With<E, R>,
    tag: K,
    f: (
      e: ExtractTag<E, K extends NonEmptyReadonlyArray<string> ? K[number] : K>
    ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E1, R1>
  ): HttpClient.With<E1 | ExcludeTag<E, K extends NonEmptyReadonlyArray<string> ? K[number] : K>, R1 | R>
} = dual(
  3,
  <R, E, K extends Tags<E> | NonEmptyReadonlyArray<Tags<E>>, R1, E1>(
    self: HttpClient.With<E, R>,
    tag: K,
    f: (
      e: ExtractTag<E, K extends NonEmptyReadonlyArray<string> ? K[number] : K>
    ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E1, R1>
  ): HttpClient.With<E1 | ExcludeTag<E, K extends NonEmptyReadonlyArray<string> ? K[number] : K>, R1 | R> =>
    transformResponse(
      self,
      (effect) =>
        Effect.catchTag<HttpClientResponse.HttpClientResponse, E, R, K, R1, E1, HttpClientResponse.HttpClientResponse>(
          effect,
          tag,
          f
        )
    )
)

/**
 * Handles client failures by matching their `_tag` values against a case map.
 *
 * @stability unstable
 * @category error handling
 * @since 4.0.0
 */
export const catchTags: {
  <
    E,
    Cases extends
      & {
        [K in Extract<E, { _tag: string }>["_tag"]]+?: (
          error: Extract<E, { _tag: K }>
        ) => Effect.Effect<HttpClientResponse.HttpClientResponse, any, any>
      }
      & (unknown extends E ? {} : { [K in Exclude<keyof Cases, Extract<E, { _tag: string }>["_tag"]>]: never })
  >(
    cases: Cases
  ): <R>(
    self: HttpClient.With<E, R>
  ) => HttpClient.With<
    | Exclude<E, { _tag: keyof Cases }>
    | {
      [K in keyof Cases]: Cases[K] extends (...args: Array<any>) => Effect.Effect<any, infer E, any> ? E : never
    }[keyof Cases],
    | R
    | {
      [K in keyof Cases]: Cases[K] extends (...args: Array<any>) => Effect.Effect<any, any, infer R> ? R : never
    }[keyof Cases]
  >
  <
    E extends { _tag: string },
    R,
    Cases extends
      & {
        [K in Extract<E, { _tag: string }>["_tag"]]+?: (
          error: Extract<E, { _tag: K }>
        ) => Effect.Effect<HttpClientResponse.HttpClientResponse, any, any>
      }
      & (unknown extends E ? {} : { [K in Exclude<keyof Cases, Extract<E, { _tag: string }>["_tag"]>]: never })
  >(
    self: HttpClient.With<E, R>,
    cases: Cases
  ): HttpClient.With<
    | Exclude<E, { _tag: keyof Cases }>
    | {
      [K in keyof Cases]: Cases[K] extends (...args: Array<any>) => Effect.Effect<any, infer E, any> ? E : never
    }[keyof Cases],
    | R
    | {
      [K in keyof Cases]: Cases[K] extends (...args: Array<any>) => Effect.Effect<any, any, infer R> ? R : never
    }[keyof Cases]
  >
} = dual(
  2,
  <
    E extends { _tag: string },
    R,
    Cases extends
      & {
        [K in Extract<E, { _tag: string }>["_tag"]]+?: (
          error: Extract<E, { _tag: K }>
        ) => Effect.Effect<HttpClientResponse.HttpClientResponse, any, any>
      }
      & (unknown extends E ? {}
        : {
          [
            K in Exclude<
              keyof Cases,
              Extract<E, { _tag: string }>["_tag"]
            >
          ]: never
        })
  >(
    self: HttpClient.With<E, R>,
    cases: Cases
  ): HttpClient.With<
    | Exclude<E, { _tag: keyof Cases }>
    | {
      [K in keyof Cases]: Cases[K] extends (
        ...args: Array<any>
      ) => Effect.Effect<any, infer E, any> ? E
        : never
    }[keyof Cases],
    | R
    | {
      [K in keyof Cases]: Cases[K] extends (
        ...args: Array<any>
      ) => Effect.Effect<any, any, infer R> ? R
        : never
    }[keyof Cases]
  > => transformResponse(self, Effect.catchTags(cases) as any)
)

/**
 * Filters the result of a response, or runs an alternative effect if the predicate fails.
 *
 * @stability unstable
 * @category filtering
 * @since 4.0.0
 */
export const filterOrElse: {
  <B extends HttpClientResponse.HttpClientResponse, E2, R2>(
    refinement: Predicate.Refinement<NoInfer<HttpClientResponse.HttpClientResponse>, B>,
    orElse: (
      response: EqualsWith<
        HttpClientResponse.HttpClientResponse,
        B,
        NoInfer<HttpClientResponse.HttpClientResponse>,
        Exclude<NoInfer<HttpClientResponse.HttpClientResponse>, B>
      >
    ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E2, R2>
  ): <E, R>(self: HttpClient.With<E, R>) => HttpClient.With<E2 | E, R2 | R>
  <E2, R2>(
    predicate: Predicate.Predicate<NoInfer<HttpClientResponse.HttpClientResponse>>,
    orElse: (
      response: NoInfer<HttpClientResponse.HttpClientResponse>
    ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E2, R2>
  ): <E, R>(self: HttpClient.With<E, R>) => HttpClient.With<E2 | E, R2 | R>
  <E, R, B extends HttpClientResponse.HttpClientResponse, E2, R2>(
    self: HttpClient.With<E, R>,
    refinement: Predicate.Refinement<HttpClientResponse.HttpClientResponse, B>,
    orElse: (
      response: EqualsWith<
        HttpClientResponse.HttpClientResponse,
        B,
        HttpClientResponse.HttpClientResponse,
        Exclude<HttpClientResponse.HttpClientResponse, B>
      >
    ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E2, R2>
  ): HttpClient.With<E2 | E, R2 | R>
  <E, R, E2, R2>(
    self: HttpClient.With<E, R>,
    predicate: Predicate.Predicate<HttpClientResponse.HttpClientResponse>,
    orElse: (
      response: HttpClientResponse.HttpClientResponse
    ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E2, R2>
  ): HttpClient.With<E2 | E, R2 | R>
} = dual(3, (self, f, orElse) => transformResponse(self, Effect.filterOrElse(f, orElse)))

/**
 * Filters successful responses, or fails with the error produced by `orFailWith` when the predicate does not match.
 *
 * @stability unstable
 * @category filtering
 * @since 4.0.0
 */
export const filterOrFail: {
  <B extends HttpClientResponse.HttpClientResponse, E2>(
    refinement: Predicate.Refinement<NoInfer<HttpClientResponse.HttpClientResponse>, B>,
    orFailWith: (response: NoInfer<HttpClientResponse.HttpClientResponse>) => E2
  ): <E, R>(self: HttpClient.With<E, R>) => HttpClient.With<E2 | E, R>
  <E2>(
    predicate: Predicate.Predicate<NoInfer<HttpClientResponse.HttpClientResponse>>,
    orFailWith: (response: NoInfer<HttpClientResponse.HttpClientResponse>) => E2
  ): <E, R>(self: HttpClient.With<E, R>) => HttpClient.With<E2 | E, R>
  <E, R, B extends HttpClientResponse.HttpClientResponse, E2>(
    self: HttpClient.With<E, R>,
    refinement: Predicate.Refinement<NoInfer<HttpClientResponse.HttpClientResponse>, B>,
    orFailWith: (response: NoInfer<HttpClientResponse.HttpClientResponse>) => E2
  ): HttpClient.With<E2 | E, R>
  <E, R, E2>(
    self: HttpClient.With<E, R>,
    predicate: Predicate.Predicate<NoInfer<HttpClientResponse.HttpClientResponse>>,
    orFailWith: (response: NoInfer<HttpClientResponse.HttpClientResponse>) => E2
  ): HttpClient.With<E2 | E, R>
} = dual(3, (self, f, orFailWith) => transformResponse(self, Effect.filterOrFail(f, orFailWith)))

/**
 * Filters responses by HTTP status code.
 *
 * @stability unstable
 * @category filtering
 * @since 4.0.0
 */
export const filterStatus: {
  (f: (status: number) => boolean): <E, R>(self: HttpClient.With<E, R>) => HttpClient.With<E | Error.HttpClientError, R>
  <E, R>(self: HttpClient.With<E, R>, f: (status: number) => boolean): HttpClient.With<E | Error.HttpClientError, R>
} = dual(
  2,
  <E, R>(self: HttpClient.With<E, R>, f: (status: number) => boolean): HttpClient.With<E | Error.HttpClientError, R> =>
    transformResponse(self, Effect.flatMap(HttpClientResponse.filterStatus(f)))
)

/**
 * Filters responses that return a 2xx status code.
 *
 * @stability unstable
 * @category filtering
 * @since 4.0.0
 */
export const filterStatusOk: <E, R>(self: HttpClient.With<E, R>) => HttpClient.With<E | Error.HttpClientError, R> =
  transformResponse(Effect.flatMap(HttpClientResponse.filterStatusOk))

/**
 * Constructs an `HttpClient.With` from a preprocessing function and a postprocessing function.
 *
 * **Details**
 *
 * `execute` applies preprocessing to the request and then passes the resulting request effect to postprocessing.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeWith = <E2, R2, E, R>(
  postprocess: (
    request: Effect.Effect<HttpClientRequest.HttpClientRequest, E2, R2>
  ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E, R>,
  preprocess: HttpClient.Preprocess<E2, R2>
): HttpClient.With<E, R> => {
  const self = Object.create(Proto)
  self.preprocess = preprocess
  self.postprocess = postprocess
  self.execute = function(request: HttpClientRequest.HttpClientRequest) {
    return postprocess(preprocess(request))
  }
  return self
}

const Proto = {
  [TypeId]: TypeId,
  pipe() {
    return pipeArguments(this, arguments)
  },
  ...Inspectable.BaseProto,
  toJSON() {
    return {
      _id: "effect/HttpClient"
    }
  },
  ...Object.fromEntries(
    HttpMethod.allShort.map((
      [fullMethod, method]
    ) => [method, function(this: HttpClient, url: string | URL, options?: HttpClientRequest.Options.NoUrl) {
      return this.execute(HttpClientRequest.make(fullMethod)(url, options))
    }])
  )
}

/**
 * Constructs an `HttpClient` from a low-level request runner.
 *
 * **Details**
 *
 * The runner receives the request, resolved URL, abort signal, and current fiber. The client wrapper handles URL construction failures, tracing and propagation, header redaction, and aborting non-scoped requests on interruption.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (
  f: (
    request: HttpClientRequest.HttpClientRequest,
    url: URL,
    signal: AbortSignal,
    fiber: Fiber.Fiber<HttpClientResponse.HttpClientResponse, Error.HttpClientError>
  ) => Effect.Effect<HttpClientResponse.HttpClientResponse, Error.HttpClientError>
): HttpClient =>
  makeWith((effect) =>
    Effect.flatMap(effect, (request) =>
      Effect.withFiber((fiber) => {
        const scopedController = scopedRequests.get(request)
        const controller = scopedController ?? new AbortController()
        const urlResult = Url.make(request.url, request.urlParams, Option.getOrUndefined(request.hash))
        if (Result.isFailure(urlResult)) {
          return Effect.fail(
            new Error.HttpClientError({
              reason: new Error.InvalidUrlError({
                request,
                cause: urlResult.failure
              })
            })
          )
        }
        const url = urlResult.success
        const tracerDisabled = fiber.getRef(Tracer.DisablePropagation) ||
          fiber.getRef(TracerDisabledWhen)(request)
        if (tracerDisabled) {
          const effect = f(request, url, controller.signal, fiber as any)
          if (scopedController) return effect
          return Effect.uninterruptibleMask((restore) =>
            Effect.matchCauseEffect(restore(effect), {
              onSuccess(response) {
                responseRegistry.register(response, controller)
                return Effect.succeed(new InterruptibleResponse(response, controller))
              },
              onFailure(cause) {
                if (Cause.hasInterrupts(cause)) {
                  controller.abort()
                }
                return Effect.failCause(cause)
              }
            })
          )
        }
        return Effect.useSpan(
          fiber.getRef(SpanNameGenerator)(request),
          { kind: "client" },
          (span) => {
            span.attribute("http.request.method", request.method)
            span.attribute("server.address", url.origin)
            if (url.port !== "") {
              span.attribute("server.port", +url.port)
            }
            span.attribute("url.full", url.toString())
            span.attribute("url.path", url.pathname)
            span.attribute("url.scheme", url.protocol.slice(0, -1))
            const query = url.search.slice(1)
            if (query !== "") {
              span.attribute("url.query", query)
            }
            const redactedHeaderNames = fiber.getRef(Headers.CurrentRedactedNames)
            const headerFilter = fiber.getRef(TracerHeaderFilter)
            for (const name in request.headers) {
              if (!headerFilter(name, "request")) continue
              span.attribute(
                `http.request.header.${name}`,
                Headers.isRedactedName(name, redactedHeaderNames) ? "<redacted>" : request.headers[name]
              )
            }
            request = fiber.getRef(TracerPropagationEnabled)
              ? HttpClientRequest.setHeaders(request, TraceContext.toHeaders(span))
              : request
            return Effect.uninterruptibleMask((restore) =>
              restore(f(request, url, controller.signal, fiber as any)).pipe(
                Effect.withParentSpan(span, { captureStackTrace: false }),
                Effect.matchCauseEffect({
                  onSuccess: (response) => {
                    span.attribute("http.response.status_code", response.status)
                    for (const name in response.headers) {
                      if (!headerFilter(name, "response")) continue
                      span.attribute(
                        `http.response.header.${name}`,
                        Headers.isRedactedName(name, redactedHeaderNames) ? "<redacted>" : response.headers[name]
                      )
                    }

                    if (scopedController) return Effect.succeed(response)
                    responseRegistry.register(response, controller)
                    return Effect.succeed(new InterruptibleResponse(response, controller))
                  },
                  onFailure(cause) {
                    if (!scopedController && Cause.hasInterrupts(cause)) {
                      controller.abort()
                    }
                    return Effect.failCause(cause)
                  }
                })
              )
            )
          }
        )
      })), Effect.succeed as HttpClient.Preprocess<never, never>)

/**
 * Appends a transformation of the request object before sending it.
 *
 * @stability unstable
 * @category mapping
 * @since 4.0.0
 */
export const mapRequest: {
  (
    f: (a: HttpClientRequest.HttpClientRequest) => HttpClientRequest.HttpClientRequest
  ): <E, R>(self: HttpClient.With<E, R>) => HttpClient.With<E, R>
  <E, R>(
    self: HttpClient.With<E, R>,
    f: (a: HttpClientRequest.HttpClientRequest) => HttpClientRequest.HttpClientRequest
  ): HttpClient.With<E, R>
} = dual(
  2,
  <E, R>(
    self: HttpClient.With<E, R>,
    f: (a: HttpClientRequest.HttpClientRequest) => HttpClientRequest.HttpClientRequest
  ): HttpClient.With<E, R> => makeWith(self.postprocess, (request) => Effect.map(self.preprocess(request), f))
)

/**
 * Appends an effectful transformation of the request object before sending it.
 *
 * @stability unstable
 * @category mapping
 * @since 4.0.0
 */
export const mapRequestEffect: {
  <E2, R2>(
    f: (a: HttpClientRequest.HttpClientRequest) => Effect.Effect<HttpClientRequest.HttpClientRequest, E2, R2>
  ): <E, R>(self: HttpClient.With<E, R>) => HttpClient.With<E | E2, R | R2>
  <E, R, E2, R2>(
    self: HttpClient.With<E, R>,
    f: (a: HttpClientRequest.HttpClientRequest) => Effect.Effect<HttpClientRequest.HttpClientRequest, E2, R2>
  ): HttpClient.With<E | E2, R | R2>
} = dual(
  2,
  <E, R, E2, R2>(
    self: HttpClient.With<E, R>,
    f: (a: HttpClientRequest.HttpClientRequest) => Effect.Effect<HttpClientRequest.HttpClientRequest, E2, R2>
  ): HttpClient.With<E | E2, R | R2> =>
    makeWith(self.postprocess as any, (request) => Effect.flatMap(self.preprocess(request), f))
)

/**
 * Prepends a transformation of the request object before sending it.
 *
 * @stability unstable
 * @category mapping
 * @since 4.0.0
 */
export const mapRequestInput: {
  (
    f: (a: HttpClientRequest.HttpClientRequest) => HttpClientRequest.HttpClientRequest
  ): <E, R>(self: HttpClient.With<E, R>) => HttpClient.With<E, R>
  <E, R>(
    self: HttpClient.With<E, R>,
    f: (a: HttpClientRequest.HttpClientRequest) => HttpClientRequest.HttpClientRequest
  ): HttpClient.With<E, R>
} = dual(
  2,
  <E, R>(
    self: HttpClient.With<E, R>,
    f: (a: HttpClientRequest.HttpClientRequest) => HttpClientRequest.HttpClientRequest
  ): HttpClient.With<E, R> => makeWith(self.postprocess, (request) => self.preprocess(f(request)))
)

/**
 * Prepends an effectful transformation of the request object before sending it.
 *
 * @stability unstable
 * @category mapping
 * @since 4.0.0
 */
export const mapRequestInputEffect: {
  <E2, R2>(
    f: (a: HttpClientRequest.HttpClientRequest) => Effect.Effect<HttpClientRequest.HttpClientRequest, E2, R2>
  ): <E, R>(self: HttpClient.With<E, R>) => HttpClient.With<E | E2, R | R2>
  <E, R, E2, R2>(
    self: HttpClient.With<E, R>,
    f: (a: HttpClientRequest.HttpClientRequest) => Effect.Effect<HttpClientRequest.HttpClientRequest, E2, R2>
  ): HttpClient.With<E | E2, R | R2>
} = dual(
  2,
  <E, R, E2, R2>(
    self: HttpClient.With<E, R>,
    f: (a: HttpClientRequest.HttpClientRequest) => Effect.Effect<HttpClientRequest.HttpClientRequest, E2, R2>
  ): HttpClient.With<E | E2, R | R2> =>
    makeWith(self.postprocess as any, (request) => Effect.flatMap(f(request), self.preprocess))
)

/**
 * Namespace containing type-level helpers for retrying HTTP clients.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Retry {
  /**
   * Computes the client type returned by `retry` for a given set of retry options.
   *
   * **Details**
   *
   * The result includes errors and requirements introduced by schedules and effectful retry predicates.
   *
   * @stability unstable
   * @category error handling
   * @since 4.0.0
   */
  export type Return<R, E, O extends NoExcessProperties<Effect.Retry.Options<E>, O>> = HttpClient.With<
    | (O extends { schedule: Schedule.Schedule<infer _O, infer _I, infer _E, infer _R> } ? E | _E
      : O extends { times: number } ? E
      : O extends { until: Predicate.Refinement<E, infer E2> } ? E2
      : E)
    | (O extends { while: (...args: Array<any>) => Effect.Effect<infer _A, infer E, infer _R> } ? E : never)
    | (O extends { until: (...args: Array<any>) => Effect.Effect<infer _A, infer E, infer _R> } ? E : never),
    | R
    | (O extends { schedule: Schedule.Schedule<infer _O, infer _I, infer _E, infer R> } ? R : never)
    | (O extends { while: (...args: Array<any>) => Effect.Effect<infer _A, infer _E, infer R> } ? R : never)
    | (O extends { until: (...args: Array<any>) => Effect.Effect<infer _A, infer _E, infer R> } ? R : never)
  > extends infer Z ? Z : never
}

/**
 * Retries the request based on a provided schedule or policy.
 *
 * @stability unstable
 * @category error handling
 * @since 4.0.0
 */
export const retry: {
  <E, O extends NoExcessProperties<Effect.Retry.Options<E>, O>>(
    options: O
  ): <R>(self: HttpClient.With<E, R>) => Retry.Return<R, E, O>
  <B, E, ES, R1>(
    policy: Schedule.Schedule<B, NoInfer<E>, ES, R1>
  ): <R>(self: HttpClient.With<E, R>) => HttpClient.With<E | ES, R1 | R>
  <E, R, O extends NoExcessProperties<Effect.Retry.Options<E>, O>>(
    self: HttpClient.With<E, R>,
    options: O
  ): Retry.Return<R, E, O>
  <E, R, B, ES, R1>(
    self: HttpClient.With<E, R>,
    policy: Schedule.Schedule<B, E, ES, R1>
  ): HttpClient.With<E | ES, R1 | R>
} = dual(
  2,
  <E extends E0, E0, ES, R, R1, B>(
    self: HttpClient.With<E, R>,
    policy: Schedule.Schedule<B, E0, ES, R1>
  ): HttpClient.With<E | ES, R | R1> => transformResponse(self, Effect.retry(policy))
)

/**
 * Retries common transient errors, such as rate limiting, timeouts or network issues.
 *
 * **When to use**
 *
 * Use to focus on retrying errors, transient responses, or both.
 *
 * **Details**
 *
 * Specifying a `while` predicate allows you to consider other errors as
 * transient, and is ignored in "response-only" mode.
 *
 * @stability unstable
 * @category error handling
 * @since 4.0.0
 */
export const retryTransient: {
  <
    E,
    B = never,
    ES = never,
    R1 = never,
    const RetryOn extends "errors-only" | "response-only" | "errors-and-responses" =
      | "errors-only"
      | "response-only"
      | "errors-and-responses",
    Input = RetryOn extends "errors-only" ? E
      : RetryOn extends "response-only" ? HttpClientResponse.HttpClientResponse
      : HttpClientResponse.HttpClientResponse | E
  >(
    options: {
      readonly retryOn?: RetryOn | undefined
      readonly while?: Predicate.Predicate<NoInfer<E | ES>>
      readonly schedule?: Schedule.Schedule<B, NoInfer<Input>, ES, R1>
      readonly times?: number
    }
  ): <R>(self: HttpClient.With<E, R>) => HttpClient.With<E | ES, R1 | R>
  <
    E,
    R,
    B = never,
    ES = never,
    R1 = never,
    const RetryOn extends "errors-only" | "response-only" | "errors-and-responses" =
      | "errors-only"
      | "response-only"
      | "errors-and-responses",
    Input = RetryOn extends "errors-only" ? E
      : RetryOn extends "response-only" ? HttpClientResponse.HttpClientResponse
      : HttpClientResponse.HttpClientResponse | E
  >(
    self: HttpClient.With<E, R>,
    options: {
      readonly retryOn?: RetryOn | undefined
      readonly while?: Predicate.Predicate<NoInfer<E | ES>>
      readonly schedule?: Schedule.Schedule<B, NoInfer<Input>, ES, R1>
      readonly times?: number
    }
  ): HttpClient.With<E | ES, R1 | R>
  <B, E, ES = never, R1 = never>(
    options: Schedule.Schedule<B, NoInfer<HttpClientResponse.HttpClientResponse | E>, ES, R1>
  ): <R>(self: HttpClient.With<E, R>) => HttpClient.With<E | ES, R1 | R>
  <E, R, B, ES = never, R1 = never>(
    self: HttpClient.With<E, R>,
    options: Schedule.Schedule<B, NoInfer<HttpClientResponse.HttpClientResponse | E>, ES, R1>
  ): HttpClient.With<E | ES, R1 | R>
} = dual(
  2,
  <
    E,
    R,
    B,
    ES = never,
    R1 = never
  >(
    self: HttpClient.With<E, R>,
    options: {
      readonly retryOn?: "errors-only" | "response-only" | "errors-and-responses" | undefined
      readonly while?: Predicate.Predicate<E | ES>
      readonly schedule?: Schedule.Schedule<B, any, ES, R1>
      readonly times?: number
    } | Schedule.Schedule<B, any, ES, R1>
  ): HttpClient.With<E | ES, R1 | R> => {
    const isOnlySchedule = Schedule.isSchedule(options)
    const retryOn = isOnlySchedule ? "errors-and-responses" : options.retryOn ?? "errors-and-responses"
    const schedule = isOnlySchedule ? options : options.schedule
    const passthroughSchedule = schedule && Schedule.passthrough(schedule)
    const times = isOnlySchedule ? undefined : options.times
    return transformResponse(
      self,
      flow(
        retryOn === "errors-only" ? identity : Effect.repeat({
          schedule: passthroughSchedule!,
          times,
          while: isTransientResponse
        }),
        retryOn === "response-only" ? identity : Effect.retry({
          while: isOnlySchedule || options.while === undefined
            ? isTransientError
            : Predicate.or(isTransientError, options.while),
          schedule,
          times
        })
      )
    )
  }
)

/**
 * Namespace containing configuration types for `withRateLimiter`.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace WithRateLimiter {
  /**
   * Options used to configure `withRateLimiter`.
   *
   * **Details**
   *
   * They define the backing limiter, initial limit window, keying strategy,
   * algorithm, token cost, retry count, and response header inspection.
   *
   * @stability unstable
   * @category rate limiting
   * @since 4.0.0
   */
  export interface Options {
    /**
     * The `RateLimiter` service to use for rate limiting.
     */
    readonly limiter: RateLimiter.RateLimiter
    /**
     * The initial rate limit window duration.
     */
    readonly window: Duration.Input
    /**
     * The initial maximum number of allowed requests in the window.
     */
    readonly limit: number
    /**
     * The key to identify the rate limit. Requests with the same key will share
     * the same rate limit. This can be used to implement per-user or
     * per-endpoint rate limits.
     */
    readonly key: string | ((request: HttpClientRequest.HttpClientRequest) => string)
    /**
     * Defaults to `"fixed-window"`.
     */
    readonly algorithm?: "fixed-window" | "token-bucket" | undefined
    /**
     * Defaults to `1`.
     */
    readonly tokens?: number | ((request: HttpClientRequest.HttpClientRequest) => number) | undefined
    /**
     * The maximum number of automatic retries after an HTTP `429` response.
     * Use a non-negative integer. Defaults to an unlimited number of retries.
     * Set to `0` to disable automatic retries.
     */
    readonly times?: number | undefined
    /**
     * Overrides the response header names used for rate limit inspection.
     * Header names are matched case-insensitively. An omitted field continues
     * using the built-in names, while a configured field replaces them for
     * that value. Header value formats are unchanged.
     */
    readonly responseHeaders?: {
      /**
       * Header containing the maximum number of requests in a window.
       */
      readonly limit?: string | undefined
      /**
       * Header containing the number of requests remaining in a window.
       */
      readonly remaining?: string | undefined
      /**
       * Header containing the rate limit reset time.
       */
      readonly reset?: string | undefined
      /**
       * Header containing the number of seconds until the rate limit resets.
       */
      readonly resetAfter?: string | undefined
      /**
       * Header containing the retry delay for an HTTP `429` response.
       */
      readonly retryAfter?: string | undefined
    } | undefined
    /**
     * Disables automatic limit updates, `Retry-After` delays, and adaptive
     * feedback from response headers. This does not disable automatic HTTP
     * `429` retries. Set `times` to `0` to disable them.
     */
    readonly disableResponseInspection?: boolean | undefined
    /**
     * Disables adaptive learning from `Retry-After` responses. Response
     * inspection and direct `Retry-After` delays remain enabled.
     */
    readonly disableAdaptiveLearning?: boolean | undefined
  }
}

/**
 * Applies request rate limiting using the `RateLimiter` service.
 *
 * **Details**
 *
 * It can update limits by inspecting common rate limit response headers and
 * automatically retries HTTP `429` responses (or `HttpClientError` values
 * wrapping a `429` response) by forcing the retry back through the limiter.
 *
 * **Gotchas**
 *
 * Automatic HTTP `429` retries are unlimited unless `times` is specified.
 * Disabling response inspection does not disable retries; set `times` to `0`
 * to return or fail with the first `429`.
 *
 * @stability unstable
 * @category rate limiting
 * @since 4.0.0
 */
export const withRateLimiter: {
  (options: WithRateLimiter.Options): <E, R>(
    self: HttpClient.With<E, R>
  ) => HttpClient.With<E | RateLimiter.RateLimiterError, R>
  <E, R>(
    self: HttpClient.With<E, R>,
    options: WithRateLimiter.Options
  ): HttpClient.With<E | RateLimiter.RateLimiterError, R>
} = dual(2, <E, R>(
  self: HttpClient.With<E, R>,
  options: WithRateLimiter.Options
): HttpClient.With<E | RateLimiter.RateLimiterError, R> => {
  const initialState: RateLimiterState = {
    initial: true,
    limit: options.limit,
    window: Duration.max(Duration.fromInputUnsafe(options.window), Duration.millis(1))
  }
  const states = new Map<string, RateLimiterState>()

  const keyOption = options.key
  const resolveKey: (request: HttpClientRequest.HttpClientRequest) => string = typeof keyOption === "function"
    ? keyOption
    : constant(keyOption)
  const tokensOption = options.tokens
  const resolveTokens: (request: HttpClientRequest.HttpClientRequest) => number = typeof tokensOption === "function"
    ? tokensOption
    : constant(tokensOption ?? 1)
  const adaptiveLearningEnabled = !options.disableAdaptiveLearning
  const headerNames = resolveRateLimiterHeaderNames(options.responseHeaders)

  const getState = (key: string): RateLimiterState => {
    const current = states.get(key)
    if (current !== undefined) {
      return current
    }
    states.set(key, initialState)
    return initialState
  }

  const onResponse = options.disableResponseInspection
    ? undefined
    : (clock: Clock, key: string, headers: Headers.Headers, tokens: number) => {
      const current = getState(key)
      const next = parseRateLimiterState(current, clock, headers, tokens, headerNames)
      if (next.limit !== current.limit || !Duration.equals(next.window, current.window)) {
        states.set(key, next)
      }
    }

  return transform(self, function loop(effect, request, retries = 0): Effect.Effect<
    HttpClientResponse.HttpClientResponse,
    E | RateLimiter.RateLimiterError,
    R
  > {
    const fiber = Fiber.getCurrent()!
    const clock = fiber.getRef(Clock)
    const key = resolveKey(request)
    const tokens = Math.max(resolveTokens(request), 1)
    const current = getState(key)
    const canRetry = options.times === undefined || retries < options.times
    function retry(retryAfter: Duration.Duration | undefined) {
      return retryAfter
        ? Effect.flatMap(Effect.sleep(retryAfter), () => loop(effect, request, retries + 1))
        : loop(effect, request, retries + 1)
    }
    const inspectResponse = (
      response: HttpClientResponse.HttpClientResponse,
      adaptive: RateLimiter.AdaptiveConsumeResult | undefined
    ) => {
      onResponse?.(clock, key, response.headers, tokens)
      if (options.disableResponseInspection || response.status !== 429) {
        return Effect.succeed<Duration.Duration | undefined>(undefined)
      }
      const retryAfter = parseRetryAfter(clock, getHeader(response.headers, ...headerNames.retryAfter))
      if (retryAfter === undefined) {
        return Effect.succeed<Duration.Duration | undefined>(undefined)
      }
      const delay = parseRateLimitWindow(clock, response.headers, headerNames) ?? retryAfter
      if (adaptive === undefined) {
        return Effect.succeed<Duration.Duration | undefined>(delay)
      }
      return Effect.as(
        options.limiter.adaptiveFeedback({
          key,
          epoch: adaptive.epoch,
          tokens,
          status: response.status,
          retryAfter: delay
        }),
        delay
      )
    }
    return Effect.flatMap(
      options.limiter.consume({
        algorithm: options.algorithm,
        onExceeded: "delay",
        key,
        limit: current.limit,
        window: current.window,
        tokens
      }),
      ({ delay }) => {
        const runAdaptive = (): Effect.Effect<
          HttpClientResponse.HttpClientResponse,
          E | RateLimiter.RateLimiterError,
          R
        > => {
          const runRequest = (adaptive: RateLimiter.AdaptiveConsumeResult | undefined) => {
            const request = Effect.matchEffect(effect, {
              onSuccess(response) {
                return Effect.flatMap(inspectResponse(response, adaptive), (retryAfter) => {
                  if (response.status !== 429 || !canRetry) return Effect.succeed(response)
                  return retry(retryAfter)
                })
              },
              onFailure(error) {
                if (isTooManyRequestsHttpClientError(error)) {
                  return Effect.flatMap(
                    inspectResponse(error.reason.response, adaptive),
                    (retryAfter) => canRetry ? retry(retryAfter) : Effect.fail(error)
                  )
                }
                return Effect.fail(error)
              }
            })
            return adaptive === undefined || Duration.isZero(adaptive.delay)
              ? request
              : Effect.delay(request, adaptive.delay)
          }
          if (!adaptiveLearningEnabled) {
            return runRequest(undefined)
          }
          return Effect.flatMap(
            options.limiter.adaptiveConsume({
              key,
              tokens,
              fallbackLimit: current.limit,
              fallbackWindow: current.window
            }),
            (adaptive) => {
              if (!Duration.isZero(adaptive.delay) && adaptive.phase === "cooldown") {
                return Effect.flatMap(Effect.sleep(adaptive.delay), runAdaptive)
              }
              return runRequest(adaptive)
            }
          )
        }
        return Duration.isZero(delay) ? runAdaptive() : Effect.flatMap(Effect.sleep(delay), runAdaptive)
      }
    )
  })
})

interface RateLimiterHeaderNames {
  readonly limit: ReadonlyArray<string>
  readonly remaining: ReadonlyArray<string>
  readonly reset: ReadonlyArray<string>
  readonly resetAfter: ReadonlyArray<string>
  readonly retryAfter: ReadonlyArray<string>
}

const resolveRateLimiterHeaderNames = (
  responseHeaders: WithRateLimiter.Options["responseHeaders"]
): RateLimiterHeaderNames => ({
  limit: responseHeaders?.limit === undefined
    ? ["ratelimit-limit", "x-ratelimit-limit"]
    : [responseHeaders.limit.toLowerCase()],
  remaining: responseHeaders?.remaining === undefined
    ? ["ratelimit-remaining", "x-ratelimit-remaining"]
    : [responseHeaders.remaining.toLowerCase()],
  reset: responseHeaders?.reset === undefined
    ? ["ratelimit-reset", "x-ratelimit-reset"]
    : [responseHeaders.reset.toLowerCase()],
  resetAfter: responseHeaders?.resetAfter === undefined
    ? ["ratelimit-reset-after", "x-ratelimit-reset-after"]
    : [responseHeaders.resetAfter.toLowerCase()],
  retryAfter: responseHeaders?.retryAfter === undefined
    ? ["retry-after"]
    : [responseHeaders.retryAfter.toLowerCase()]
})

interface RateLimiterState {
  readonly limit: number
  readonly window: Duration.Duration
  readonly initial: boolean
}

const parseRateLimiterState = (
  state: RateLimiterState,
  clock: Clock,
  headers: Headers.Headers,
  tokens: number,
  headerNames: RateLimiterHeaderNames
): RateLimiterState => {
  const limit = parseRateLimitLimit(state, headers, tokens, headerNames) ?? state.limit
  const window = parseRateLimitWindow(clock, headers, headerNames) ?? state.window
  if (limit === state.limit && Duration.equals(window, state.window)) {
    return state
  }
  return { limit, window, initial: false }
}

const parseRateLimitLimit = (
  state: RateLimiterState,
  headers: Headers.Headers,
  tokens: number,
  headerNames: RateLimiterHeaderNames
): number | undefined => {
  const raw = getHeader(headers, ...headerNames.limit)
  const value = parseNumberHeader(raw)
  if (value !== undefined && value > 0) {
    return value
  }
  const remaining = parseRateLimitRemaining(headers, headerNames)
  if (remaining === undefined) {
    return undefined
  }
  return state.initial ? remaining + tokens : Math.max(remaining + tokens, state.limit)
}

const parseRateLimitRemaining = (
  headers: Headers.Headers,
  headerNames: RateLimiterHeaderNames
): number | undefined => {
  const raw = getHeader(headers, ...headerNames.remaining)
  const value = parseNumberHeader(raw)
  return value !== undefined && value >= 0 ? value : undefined
}

const parseRateLimitWindow = (
  clock: Clock,
  headers: Headers.Headers,
  headerNames: RateLimiterHeaderNames
): Duration.Duration | undefined => {
  const resetAfter = parseResetAfter(getHeader(headers, ...headerNames.resetAfter))
  if (resetAfter !== undefined) {
    return resetAfter
  }
  return parseResetHeader(clock, getHeader(headers, ...headerNames.reset))
}

const parseRetryAfter = (
  clock: Clock,
  value: string | undefined
): Duration.Duration | undefined => {
  if (value === undefined) {
    return undefined
  }
  const numeric = parseNumberHeader(value)
  if (numeric !== undefined) {
    return Duration.max(Duration.seconds(numeric), Duration.millis(1))
  }
  const parsedDate = Date.parse(value)
  if (Number.isNaN(parsedDate)) {
    return undefined
  }
  const millis = parsedDate - clock.currentTimeMillisUnsafe()
  if (millis <= 0) {
    return Duration.millis(1)
  }
  return Duration.millis(millis)
}

const parseResetAfter = (value: string | undefined): Duration.Duration | undefined => {
  const numeric = parseNumberHeader(value)
  if (numeric === undefined || numeric <= 0) {
    return undefined
  }
  return Duration.max(Duration.seconds(numeric), Duration.millis(1))
}

const parseResetHeader = (
  clock: Clock,
  value: string | undefined
): Duration.Duration | undefined => {
  const numeric = parseNumberHeader(value)
  if (numeric === undefined || numeric <= 0) {
    return undefined
  }
  const nowMillis = clock.currentTimeMillisUnsafe()
  if (numeric > 1_000_000_000_000) {
    return Duration.millis(Math.max(numeric - nowMillis, 1))
  }
  if (numeric > 1_000_000_000) {
    return Duration.millis(Math.max((numeric * 1_000) - nowMillis, 1))
  }
  return Duration.max(Duration.seconds(numeric), Duration.millis(1))
}

const parseNumberHeader = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined
  }
  const match = /-?\d+(?:\.\d+)?/.exec(value)
  if (match === null) {
    return undefined
  }
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : undefined
}

const getHeader = (headers: Headers.Headers, ...keys: Array<string>): string | undefined => {
  for (let i = 0; i < keys.length; i++) {
    const value = headers[keys[i]]
    if (value !== undefined) {
      return value
    }
  }
  return undefined
}

/**
 * Performs an additional effect after a successful request.
 *
 * @stability unstable
 * @category sequencing
 * @since 4.0.0
 */
export const tap: {
  <_, E2, R2>(
    f: (response: HttpClientResponse.HttpClientResponse) => Effect.Effect<_, E2, R2>
  ): <E, R>(self: HttpClient.With<E, R>) => HttpClient.With<E | E2, R | R2>
  <E, R, _, E2, R2>(
    self: HttpClient.With<E, R>,
    f: (response: HttpClientResponse.HttpClientResponse) => Effect.Effect<_, E2, R2>
  ): HttpClient.With<E | E2, R | R2>
} = dual(
  2,
  <E, R, _, E2, R2>(
    self: HttpClient.With<E, R>,
    f: (response: HttpClientResponse.HttpClientResponse) => Effect.Effect<_, E2, R2>
  ): HttpClient.With<E | E2, R | R2> => transformResponse(self, Effect.tap(f))
)

/**
 * Performs an additional effect after an unsuccessful request.
 *
 * @stability unstable
 * @category sequencing
 * @since 4.0.0
 */
export const tapError: {
  <_, E, E2, R2>(
    f: (e: NoInfer<E>) => Effect.Effect<_, E2, R2>
  ): <R>(self: HttpClient.With<E, R>) => HttpClient.With<E | E2, R | R2>
  <E, R, _, E2, R2>(
    self: HttpClient.With<E, R>,
    f: (e: NoInfer<E>) => Effect.Effect<_, E2, R2>
  ): HttpClient.With<E | E2, R | R2>
} = dual(
  2,
  <E, R, _, E2, R2>(
    self: HttpClient.With<E, R>,
    f: (e: NoInfer<E>) => Effect.Effect<_, E2, R2>
  ): HttpClient.With<E | E2, R | R2> => transformResponse(self, Effect.tapError(f))
)

/**
 * Performs an additional effect on the request before sending it.
 *
 * @stability unstable
 * @category sequencing
 * @since 4.0.0
 */
export const tapRequest: {
  <_, E2, R2>(
    f: (a: HttpClientRequest.HttpClientRequest) => Effect.Effect<_, E2, R2>
  ): <E, R>(self: HttpClient.With<E, R>) => HttpClient.With<E | E2, R | R2>
  <E, R, _, E2, R2>(
    self: HttpClient.With<E, R>,
    f: (a: HttpClientRequest.HttpClientRequest) => Effect.Effect<_, E2, R2>
  ): HttpClient.With<E | E2, R | R2>
} = dual(
  2,
  <E, R, _, E2, R2>(
    self: HttpClient.With<E, R>,
    f: (a: HttpClientRequest.HttpClientRequest) => Effect.Effect<_, E2, R2>
  ): HttpClient.With<E | E2, R | R2> =>
    makeWith(self.postprocess as any, (request) => Effect.tap(self.preprocess(request), f))
)

/**
 * Adds a `Ref` of cookies to the client for handling cookies across requests.
 *
 * **When to use**
 *
 * Use to add shared cookie storage to a client so response cookies are retained
 * and sent by later requests.
 *
 * @stability unstable
 * @category cookies
 * @since 4.0.0
 */
export const withCookiesRef: {
  (ref: Ref.Ref<Cookies.Cookies>): <E, R>(self: HttpClient.With<E, R>) => HttpClient.With<E, R>
  <E, R>(self: HttpClient.With<E, R>, ref: Ref.Ref<Cookies.Cookies>): HttpClient.With<E, R>
} = dual(
  2,
  <E, R>(
    self: HttpClient.With<E, R>,
    ref: Ref.Ref<Cookies.Cookies>
  ): HttpClient.With<E, R> =>
    makeWith(
      (request: Effect.Effect<HttpClientRequest.HttpClientRequest, E, R>) =>
        Effect.tap(
          self.postprocess(request),
          (response) => Ref.update(ref, (cookies) => Cookies.merge(cookies, response.cookies))
        ),
      (request) =>
        Effect.flatMap(self.preprocess(request), (request) =>
          Effect.map(
            Ref.get(ref),
            (cookies) =>
              Cookies.isEmpty(cookies)
                ? request
                : HttpClientRequest.setHeader(request, "cookie", Cookies.toCookieHeader(cookies))
          ))
    )
)

/**
 * Attaches the lifetime of the `HttpClientRequest` to a `Scope`.
 *
 * @stability unstable
 * @category resource management
 * @since 4.0.0
 */
export const withScope = <E, R>(
  self: HttpClient.With<E, R>
): HttpClient.With<E, R | Scope.Scope> =>
  transform(
    self,
    (effect, request) => {
      const controller = new AbortController()
      scopedRequests.set(request, controller)
      return Effect.andThen(
        Effect.addFinalizer(() => Effect.sync(() => controller.abort())),
        effect
      )
    }
  )

/**
 * Enables following HTTP redirects up to a specified number of times.
 *
 * @stability unstable
 * @category redirects
 * @since 4.0.0
 */
export const followRedirects: {
  (maxRedirects?: number | undefined): <E, R>(self: HttpClient.With<E, R>) => HttpClient.With<E, R>
  <E, R>(self: HttpClient.With<E, R>, maxRedirects?: number | undefined): HttpClient.With<E, R>
} = dual((args) => isHttpClient(args[0]), <E, R>(
  self: HttpClient.With<E, R>,
  maxRedirects?: number | undefined
): HttpClient.With<E, R> =>
  makeWith(
    (request) => {
      const loop = (
        request: Effect.Effect<HttpClientRequest.HttpClientRequest, E, R>,
        redirects: number
      ): Effect.Effect<HttpClientResponse.HttpClientResponse, E, R> =>
        Effect.suspend(() => {
          let currentRequest: HttpClientRequest.HttpClientRequest | undefined
          return Effect.flatMap(
            self.postprocess(Effect.map(request, (request) => {
              currentRequest = request
              return request
            })),
            (response) => {
              if (
                response.status < 300 || response.status >= 400 || !response.headers.location ||
                redirects >= (maxRedirects ?? 10)
              ) {
                return Effect.succeed(response)
              }
              const url = new URL(response.headers.location, response.request.url)
              const request = currentRequest ?? response.request
              let nextRequest = request
              if (
                ((response.status === 301 || response.status === 302) && request.method === "POST") ||
                (response.status === 303 && request.method !== "GET" && request.method !== "HEAD")
              ) {
                nextRequest = HttpClientRequest.setMethod(nextRequest, "GET")
                nextRequest = HttpClientRequest.setBody(nextRequest, HttpBody.empty)
              }
              if (url.origin !== new URL(response.request.url).origin) {
                nextRequest = HttpClientRequest.removeHeader(nextRequest, "authorization")
                nextRequest = HttpClientRequest.removeHeader(nextRequest, "proxy-authorization")
                nextRequest = HttpClientRequest.removeHeader(nextRequest, "cookie")
              }
              return loop(Effect.succeed(HttpClientRequest.setUrl(nextRequest, url)), redirects + 1)
            }
          )
        })
      return loop(request, 0)
    },
    self.preprocess
  ))

/**
 * Context reference for a predicate that disables client-side tracing for matching outgoing requests.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const TracerDisabledWhen = Context.Reference<
  Predicate.Predicate<HttpClientRequest.HttpClientRequest>
>("effect/http/HttpClient/TracerDisabledWhen", {
  defaultValue: () => constFalse
})

/**
 * Context reference for filtering request and response headers added to client spans.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const TracerHeaderFilter = Context.Reference<
  (headerName: string, phase: "request" | "response") => boolean
>("effect/http/HttpClient/TracerHeaderFilter", {
  defaultValue: () => constTrue
})

/**
 * Context reference that controls whether outgoing client spans are propagated to request headers.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const TracerPropagationEnabled = Context.Reference<boolean>("effect/http/HttpClient/TracerPropagationEnabled", {
  defaultValue: constTrue
})

/**
 * Context reference for generating the span name used for outgoing client request spans.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const SpanNameGenerator = Context.Reference<
  (request: HttpClientRequest.HttpClientRequest) => string
>("effect/http/HttpClient/SpanNameGenerator", {
  defaultValue: () => (request) => `http.client ${request.method}`
})

/**
 * Creates an `HttpClient` layer and merges the layer construction context into client response effects.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerMergedContext = <E, R>(
  effect: Effect.Effect<HttpClient, E, R>
): Layer.Layer<HttpClient, E, R> =>
  Layer.effect(HttpClient)(
    Effect.contextWith((context: Context.Context<never>) =>
      Effect.map(effect, (client) =>
        transformResponse(
          client,
          Effect.updateContext((input: Context.Context<never>) => Context.merge(context, input))
        ))
    )
  )

// -----------------------------------------------------------------------------
// internal
// -----------------------------------------------------------------------------

const responseRegistry = (() => {
  if ("FinalizationRegistry" in globalThis && globalThis.FinalizationRegistry) {
    const registry = new FinalizationRegistry((controller: AbortController) => {
      controller.abort()
    })
    return {
      register(response: HttpClientResponse.HttpClientResponse, controller: AbortController) {
        registry.register(response, controller, response)
      },
      unregister(response: HttpClientResponse.HttpClientResponse) {
        registry.unregister(response)
      }
    }
  }

  const timers = new Map<HttpClientResponse.HttpClientResponse, any>()
  return {
    register(response: HttpClientResponse.HttpClientResponse, controller: AbortController) {
      timers.set(response, setTimeout(() => controller.abort(), 5000))
    },
    unregister(response: HttpClientResponse.HttpClientResponse) {
      const timer = timers.get(response)
      if (timer === undefined) return
      clearTimeout(timer)
      timers.delete(response)
    }
  }
})()

const scopedRequests = new WeakMap<HttpClientRequest.HttpClientRequest, AbortController>()

class InterruptibleResponse implements HttpClientResponse.HttpClientResponse, Pipeable {
  readonly original: HttpClientResponse.HttpClientResponse
  readonly controller: AbortController

  constructor(
    original: HttpClientResponse.HttpClientResponse,
    controller: AbortController
  ) {
    this.original = original
    this.controller = controller
  }

  readonly [HttpClientResponse.TypeId] = HttpClientResponse.TypeId
  readonly [HttpIncomingMessage.TypeId] = HttpIncomingMessage.TypeId

  private applyInterrupt<A, E, R>(effect: Effect.Effect<A, E, R>) {
    return Effect.suspend(() => {
      responseRegistry.unregister(this.original)
      return Effect.onInterrupt(
        effect,
        () =>
          Effect.sync(() => {
            this.controller.abort()
          })
      )
    })
  }

  get request() {
    return this.original.request
  }

  get url() {
    return this.original.url
  }

  get status() {
    return this.original.status
  }

  get headers() {
    return this.original.headers
  }

  get cookies() {
    return this.original.cookies
  }

  get remoteAddress() {
    return this.original.remoteAddress
  }

  get formData() {
    return this.applyInterrupt(this.original.formData)
  }

  get text() {
    return this.applyInterrupt(this.original.text)
  }

  get json() {
    return this.applyInterrupt(this.original.json)
  }

  get urlParamsBody() {
    return this.applyInterrupt(this.original.urlParamsBody)
  }

  get arrayBuffer() {
    return this.applyInterrupt(this.original.arrayBuffer)
  }

  get stream() {
    return Stream.suspend(() => {
      responseRegistry.unregister(this.original)
      return Stream.ensuring(
        this.original.stream,
        Effect.sync(() => {
          this.controller.abort()
        })
      )
    })
  }

  toJSON() {
    return this.original.toJSON()
  }

  [Inspectable.NodeInspectSymbol]() {
    return this.original[Inspectable.NodeInspectSymbol]()
  }

  pipe() {
    return pipeArguments(this, arguments)
  }
}

const isTransientError = (error: unknown) => Cause.isTimeoutError(error) || isTransientHttpError(error)

const isTransientHttpError = (error: unknown) =>
  Error.isHttpClientError(error) &&
  (error.reason._tag === "TransportError" ||
    (error.reason._tag === "StatusCodeError" && isTransientResponse(error.reason.response)))

const isTooManyRequestsHttpClientError = (
  error: unknown
): error is Error.HttpClientError & { readonly reason: Error.StatusCodeError } =>
  Error.isHttpClientError(error) && error.reason._tag === "StatusCodeError" && error.reason.response.status === 429

const isTransientResponse = (response: HttpClientResponse.HttpClientResponse) =>
  response.status === 408 ||
  response.status === 429 ||
  response.status === 500 ||
  response.status === 502 ||
  response.status === 503 ||
  response.status === 504
