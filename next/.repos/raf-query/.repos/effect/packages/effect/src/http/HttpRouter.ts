/**
 * Builds server-side routers for Effect HTTP applications.
 *
 * `HttpRouter` collects routes and middleware while an application layer is
 * being built. Once the router is complete, it handles each
 * `HttpServerRequest` by finding a matching route and producing an
 * `HttpServerResponse`. The module also includes helpers for route definitions,
 * prefixes, parameters, request decoding, CORS, and running the router.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import { compose, dual, identity } from "../Function.ts"
import { fiberEnterInterruptibleUnsafe } from "../internal/effect.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import type { ReadonlyRecord } from "../Record.ts"
import * as Schema from "../Schema.ts"
import type { ParseOptions } from "../SchemaAST.ts"
import * as Scope from "../Scope.ts"
import * as Tracer from "../Tracer.ts"
import type * as Types from "../Types.ts"
import * as FindMyWay from "./FindMyWay.ts"
import * as HttpEffect from "./HttpEffect.ts"
import * as HttpIncomingMessage from "./HttpIncomingMessage.ts"
import type * as HttpMethod from "./HttpMethod.ts"
import * as HttpMiddleware from "./HttpMiddleware.ts"
import * as HttpServer from "./HttpServer.ts"
import * as HttpServerError from "./HttpServerError.ts"
import * as HttpServerRequest from "./HttpServerRequest.ts"
import * as HttpServerResponse from "./HttpServerResponse.ts"

const TypeId = "~effect/http/HttpRouter"

/**
 * Defines the service interface for registering HTTP routes and middleware.
 *
 * **Details**
 *
 * An `HttpRouter` can add routes, apply path prefixes, install global middleware,
 * and expose the registered routes as an Effect that handles the current server
 * request.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export interface HttpRouter {
  readonly [TypeId]: typeof TypeId

  readonly prefixed: (prefix: string) => HttpRouter

  readonly add: <E = never, R = never>(
    method: "*" | "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "QUERY",
    path: PathInput,
    handler:
      | HttpServerResponse.HttpServerResponse
      | Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
      | ((request: HttpServerRequest.HttpServerRequest) => Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>),
    options?: { readonly uninterruptible?: boolean | undefined } | undefined
  ) => Effect.Effect<
    void,
    never,
    Request.From<"Requires", Exclude<R, Provided>> | Request.From<"Error", E>
  >

  readonly addAll: <const Routes extends ReadonlyArray<Route<any, any>>>(
    routes: Routes
  ) => Effect.Effect<
    void,
    never,
    | Request.From<"Requires", Exclude<Route.Context<Routes[number]>, Provided>>
    | Request.From<"Error", Route.Error<Routes[number]>>
  >

  readonly addGlobalMiddleware: <E, R>(
    middleware:
      & ((
        effect: Effect.Effect<HttpServerResponse.HttpServerResponse, Types.unhandled>
      ) => Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>)
      & (Types.unhandled extends E ? unknown : "You cannot handle any errors")
  ) => Effect.Effect<
    void,
    never,
    | Request.From<"GlobalRequires", Exclude<R, GlobalProvided>>
    | Request.From<"GlobalError", Exclude<E, Types.unhandled>>
  >

  // @effect-diagnostics-next-line lazyEffect:off
  readonly asHttpEffect: () => Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    unknown,
    HttpServerRequest.HttpServerRequest | Scope.Scope
  >
}

/**
 * Service tag for the HTTP router used while constructing an HTTP application.
 * Route and middleware layers require this service to register themselves with
 * the router.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const HttpRouter: Context.Service<HttpRouter, HttpRouter> = Context.Service<HttpRouter>(
  "effect/http/HttpRouter"
)

/**
 * Constructs an empty `HttpRouter` service.
 *
 * **Details**
 *
 * The returned router accepts route and middleware registrations and later routes
 * the current `HttpServerRequest` to the matching `HttpServerResponse`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.gen(function*() {
  const router = FindMyWay.make<Route<any, never>>(yield* RouterConfig)
  const middleware = new Set<middleware.Fn>()

  const addAll = <const Routes extends ReadonlyArray<Route<any, any>>>(
    routes: Routes
  ): Effect.Effect<
    void,
    never,
    | Request.From<"Requires", Exclude<Route.Context<Routes[number]>, Provided>>
    | Request.From<"Error", Route.Error<Routes[number]>>
  > =>
    Effect.contextWith((context: Context.Context<never>) => {
      const middleware = getMiddleware(context)
      const applyMiddleware = (effect: Effect.Effect<HttpServerResponse.HttpServerResponse>) => {
        for (let i = 0; i < middleware.length; i++) {
          effect = middleware[i](effect)
        }
        return effect
      }
      for (let i = 0; i < routes.length; i++) {
        const route = middleware.length === 0 ? routes[i] : makeRoute({
          ...routes[i],
          handler: applyMiddleware(routes[i].handler as Effect.Effect<HttpServerResponse.HttpServerResponse>)
        })
        if (route.method === "*") {
          if (route.path.endsWith("/*")) {
            router.all(route.path, route as any)
            router.all(route.path.slice(0, -2) as any, route as any)
          } else {
            router.all(route.path, route as any)
          }
        } else {
          if (route.path.endsWith("/*")) {
            router.on(route.method, route.path, route as any)
            router.on(route.method, route.path.slice(0, -2) as any, route as any)
          } else {
            router.on(route.method, route.path, route as any)
          }
        }
      }
      return Effect.void
    })

  return HttpRouter.of({
    [TypeId]: TypeId,
    prefixed(this: HttpRouter, prefix: string) {
      prefix = removeTrailingSlash(prefix as PathInput)
      return HttpRouter.of({
        ...this,
        prefixed: (newPrefix: string) => this.prefixed(prefixPath(newPrefix, prefix)),
        addAll: (routes) => addAll(routes.map(prefixRoute(prefix))) as any,
        add: (method, path, handler, options) =>
          addAll([
            makeRoute({
              method,
              path: prefixPath(path, prefix) as PathInput,
              handler: HttpServerResponse.isHttpServerResponse(handler) ?
                Effect.succeed(handler) :
                Effect.isEffect(handler)
                ? handler
                : Effect.flatMap(HttpServerRequest.HttpServerRequest, handler),
              uninterruptible: options?.uninterruptible ?? false,
              prefix
            })
          ])
      })
    },
    addAll,
    add: (method, path, handler, options) => addAll([route(method, path, handler, options)]),
    addGlobalMiddleware: (middleware_) =>
      Effect.sync(() => {
        middleware.add(middleware_ as any)
      }),
    asHttpEffect() {
      let handler = Effect.withFiber<HttpServerResponse.HttpServerResponse, unknown>((fiber) => {
        let context = fiber.context
        const request = Context.getUnsafe(context, HttpServerRequest.HttpServerRequest)
        let result = router.find(request.method, request.url)
        if (result === undefined && request.method === "HEAD") {
          result = router.find("GET", request.url)
        }
        if (result === undefined) {
          return Effect.fail(
            new HttpServerError.HttpServerError({
              reason: new HttpServerError.RouteNotFound({ request })
            })
          )
        }
        const route = result.handler
        if (Option.isSome(route.prefix)) {
          context = Context.add(
            context,
            HttpServerRequest.HttpServerRequest,
            sliceRequestUrl(request, route.prefix.value)
          )
        }
        context = Context.add(context, HttpServerRequest.ParsedSearchParams, result.searchParams)
        context = Context.add(context, RouteContext, {
          route,
          params: result.params
        })

        if (fiber.getRef(Tracer.Tracer) !== Tracer.nativeTracer) {
          const span = Context.getOrUndefined(context, Tracer.ParentSpan)
          if (span !== undefined && span._tag === "Span" && span.sampled) {
            span.attribute("http.route", route.path)
          }
        }
        // The enclosing request restores the fiber context on exit.
        fiber.setContext(context)
        if (!route.uninterruptible) {
          const interrupted = fiberEnterInterruptibleUnsafe(fiber)
          if (interrupted !== undefined) return interrupted
        }
        return route.handler as Effect.Effect<
          HttpServerResponse.HttpServerResponse,
          unknown
        >
      })
      if (middleware.size === 0) return handler
      for (const fn of Arr.reverse(middleware)) {
        handler = fn(handler as any)
      }
      return handler
    }
  })
})

function sliceRequestUrl(request: HttpServerRequest.HttpServerRequest, prefix: string) {
  const prefexLen = prefix.length
  return request.modify({ url: request.url.length <= prefexLen ? "/" : request.url.slice(prefexLen) })
}

/**
 * Context reference for low-level router configuration.
 *
 * **Details**
 *
 * The value is passed to the route matcher when an `HttpRouter` is created and
 * defaults to an empty configuration.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const RouterConfig = Context.Reference<Partial<FindMyWay.RouterConfig>>(
  "effect/http/HttpRouter/RouterConfig",
  { defaultValue: () => ({}) }
)

/**
 * Service for the matched HTTP route in the current request.
 *
 * **When to use**
 *
 * Use to read captured path parameters and route metadata while handling a
 * request matched by the router.
 *
 * **Details**
 *
 * It provides the route definition and the path parameters captured by the route
 * matcher.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class RouteContext extends Context.Service<RouteContext, {
  readonly params: Readonly<Record<string, string | undefined>>
  readonly route: Route<unknown, unknown>
}>()("effect/http/HttpRouter/RouteContext") {}

/**
 * Effect that returns the path parameters captured for the current matched route.
 *
 * @stability unstable
 * @category getters
 * @since 4.0.0
 */
export const params: Effect.Effect<
  ReadonlyRecord<string, string | undefined>,
  never,
  RouteContext
> = Effect.withFiberSucceed((fiber) =>
  Context.getUnsafe(fiber.context as Context.Context<RouteContext>, RouteContext).params
)

/**
 * Decodes a schema from the current request and its JSON body.
 *
 * **Details**
 *
 * The input passed to the schema includes the request method, URL, headers,
 * cookies, path parameters, search parameters, and parsed JSON body. The effect
 * fails if the body cannot be parsed or the schema decode fails.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const schemaJson = <
  A,
  I extends Partial<{
    readonly method: HttpMethod.HttpMethod
    readonly url: string
    readonly cookies: Readonly<Record<string, string | undefined>>
    readonly headers: Readonly<Record<string, string | undefined>>
    readonly pathParams: Readonly<Record<string, string | undefined>>
    readonly searchParams: Readonly<Record<string, string | ReadonlyArray<string> | undefined>>
    readonly body: any
  }>,
  RD
>(
  schema: Schema.ConstraintCodec<A, I, RD, unknown>,
  options?: (ParseOptions & HttpIncomingMessage.JsonOptions) | undefined
): Effect.Effect<
  A,
  HttpServerError.HttpServerError | Schema.SchemaError,
  HttpServerRequest.HttpServerRequest | HttpServerRequest.ParsedSearchParams | RouteContext | RD
> => {
  const parse = Schema.decodeUnknownEffect(schema)
  const parseBody = HttpIncomingMessage.schemaBodyJson(Schema.Unknown, options)
  return Effect.contextWith(
    (
      context: Context.Context<
        HttpServerRequest.HttpServerRequest | HttpServerRequest.ParsedSearchParams | RouteContext
      >
    ) => {
      const request = Context.get(context, HttpServerRequest.HttpServerRequest)
      const searchParams = Context.get(context, HttpServerRequest.ParsedSearchParams)
      const routeContext = Context.get(context, RouteContext)
      return Effect.flatMap(parseBody(request), (body) =>
        parse({
          method: request.method,
          url: request.url,
          headers: request.headers,
          cookies: request.cookies,
          pathParams: routeContext.params,
          searchParams,
          body
        }, options))
    }
  )
}

/**
 * Decodes a schema from the current request without reading the request body.
 *
 * **Details**
 *
 * The input passed to the schema includes the request method, URL, headers,
 * cookies, path parameters, and search parameters.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const schemaNoBody = <
  A,
  I extends Partial<{
    readonly method: HttpMethod.HttpMethod
    readonly url: string
    readonly cookies: Readonly<Record<string, string | undefined>>
    readonly headers: Readonly<Record<string, string | undefined>>
    readonly pathParams: Readonly<Record<string, string | undefined>>
    readonly searchParams: Readonly<Record<string, string | ReadonlyArray<string> | undefined>>
  }>,
  RD
>(
  schema: Schema.ConstraintCodec<A, I, RD, unknown>,
  options?: ParseOptions | undefined
): Effect.Effect<
  A,
  Schema.SchemaError,
  HttpServerRequest.HttpServerRequest | HttpServerRequest.ParsedSearchParams | RouteContext | RD
> => {
  const parse = Schema.decodeUnknownEffect(schema)
  return Effect.contextWith(
    (
      context: Context.Context<
        HttpServerRequest.HttpServerRequest | HttpServerRequest.ParsedSearchParams | RouteContext
      >
    ) => {
      const request = Context.get(context, HttpServerRequest.HttpServerRequest)
      const searchParams = Context.get(context, HttpServerRequest.ParsedSearchParams)
      const routeContext = Context.get(context, RouteContext)
      return parse({
        method: request.method,
        url: request.url,
        headers: request.headers,
        cookies: request.cookies,
        pathParams: routeContext.params,
        searchParams
      }, options)
    }
  )
}

/**
 * Decodes a schema from the current route path parameters and search parameters.
 *
 * **Details**
 *
 * When the same key appears in both sources, the path parameter value is used.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const schemaParams = <A, I extends Readonly<Record<string, string | ReadonlyArray<string> | undefined>>, RD>(
  schema: Schema.ConstraintCodec<A, I, RD, unknown>,
  options?: ParseOptions | undefined
): Effect.Effect<A, Schema.SchemaError, HttpServerRequest.ParsedSearchParams | RouteContext | RD> => {
  const parse = Schema.decodeUnknownEffect(schema)
  return Effect.contextWith((context: Context.Context<HttpServerRequest.ParsedSearchParams | RouteContext>) => {
    const searchParams = Context.get(context, HttpServerRequest.ParsedSearchParams)
    const routeContext = Context.get(context, RouteContext)
    return parse({ ...searchParams, ...routeContext.params }, options)
  })
}

/**
 * Decodes a schema from the path parameters captured for the current matched
 * route.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const schemaPathParams = <A, I extends Readonly<Record<string, string | undefined>>, RD>(
  schema: Schema.ConstraintCodec<A, I, RD, unknown>,
  options?: ParseOptions | undefined
): Effect.Effect<A, Schema.SchemaError, RouteContext | RD> => {
  const parse = Schema.decodeUnknownEffect(schema)
  return Effect.flatMap(params, (_) => parse(_, options))
}

/**
 * Creates a layer that accesses the current `HttpRouter` service and runs the
 * supplied effect.
 *
 * **When to use**
 *
 * Use when you need to register routes or middleware with the router during layer
 * construction.
 *
 * **Example** (Registering routes during layer construction)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { HttpRouter, HttpServerResponse } from "effect/http"
 *
 * const Routes = HttpRouter.use((router) =>
 *   router.add("GET", "/health", HttpServerResponse.text("ready"))
 * )
 *
 * const program = Effect.acquireUseRelease(
 *   Effect.sync(() => HttpRouter.toWebHandler(Routes, { disableLogger: true })),
 *   ({ handler }) =>
 *     Effect.gen(function*() {
 *       const response = yield* Effect.promise(() => handler(new Request("http://localhost/health")))
 *       const body = yield* Effect.promise(() => response.text())
 *       return body
 *     }),
 *   ({ dispose }) => Effect.promise(dispose)
 * )
 *
 * await Effect.runPromise(program) // => "ready"
 * ```
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const use = <A, E, R>(
  f: (router: HttpRouter) => Effect.Effect<A, E, R>
): Layer.Layer<never, E, HttpRouter | Exclude<R, Scope.Scope>> => Layer.effectDiscard(Effect.flatMap(HttpRouter, f))

/**
 * Create a layer that adds a single route to the HTTP router.
 *
 * **Example** (Adding a GET route)
 *
 * ```ts import.meta.vitest
 * import { Layer } from "effect"
 * import { HttpRouter, HttpServerResponse } from "effect/http"
 *
 * const Route = HttpRouter.add(
 *   "GET",
 *   "/hello",
 *   HttpServerResponse.text("Hello, World!")
 * )
 * Layer.isLayer(Route) // => true
 * ```
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const add = <E = never, R = never>(
  method: "*" | "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "QUERY",
  path: PathInput,
  handler:
    | HttpServerResponse.HttpServerResponse
    | Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
    | ((request: HttpServerRequest.HttpServerRequest) => Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>),
  options?: {
    readonly uninterruptible?: boolean | undefined
  }
): Layer.Layer<never, never, HttpRouter | Request.From<"Requires", Exclude<R, Provided>> | Request.From<"Error", E>> =>
  use((router) => router.add(method, path, handler, options))

/**
 * Create a layer that adds multiple routes to the HTTP router.
 *
 * **Example** (Adding multiple routes)
 *
 * ```ts import.meta.vitest
 * import { Layer } from "effect"
 * import { HttpRouter, HttpServerResponse } from "effect/http"
 *
 * const Routes = HttpRouter.addAll([
 *   HttpRouter.route(
 *     "GET",
 *     "/hello",
 *     HttpServerResponse.text("Hello, World!")
 *   )
 * ])
 * Layer.isLayer(Routes) // => true
 * ```
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const addAll = <Routes extends ReadonlyArray<Route<any, any>>, EX = never, RX = never>(
  routes: Routes | Effect.Effect<Routes, EX, RX>,
  options?: {
    readonly prefix?: string | undefined
  }
): Layer.Layer<
  never,
  EX,
  | HttpRouter
  | Exclude<RX, Scope.Scope>
  | Request.From<"Requires", Exclude<Route.Context<Routes[number]>, Provided>>
  | Request.From<"Error", Route.Error<Routes[number]>>
> =>
  Layer.effectDiscard(Effect.gen(function*() {
    const toAdd = Effect.isEffect(routes) ? yield* routes : routes
    let router = yield* HttpRouter
    if (options?.prefix) {
      router = router.prefixed(options.prefix)
    }
    yield* router.addAll(toAdd)
  }))

/**
 * Layer that provides a newly constructed `HttpRouter`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<HttpRouter> = Layer.effect(HttpRouter)(make)

/**
 * Builds an application layer with a router and returns the router as an HTTP
 * handler effect.
 *
 * **Details**
 *
 * The returned effect handles the current `HttpServerRequest` in the current
 * `Scope`; route request markers are converted into the ordinary requirements of
 * the returned handler.
 *
 * **Gotchas**
 *
 * The layer is built with a forked `MemoMap`, so calling `toHttpEffect` twice
 * will build the same layer twice.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toHttpEffect = <A, E, R>(
  appLayer: Layer.Layer<A, E, R>
): Effect.Effect<
  Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    Request.Only<"Error", R> | Request.Only<"GlobalError", R> | HttpServerError.HttpServerError,
    Scope.Scope | HttpServerRequest.HttpServerRequest | Request.Only<"Requires", R> | Request.Only<"GlobalRequires", R>
  >,
  Request.Without<E>,
  Exclude<Request.Without<R>, HttpRouter> | Scope.Scope
> =>
  Effect.contextWith((context) => {
    const scope = Context.get(context, Scope.Scope)
    const memoMap = Layer.CurrentMemoMap.forkOrCreate(context)
    return Effect.map(Layer.buildWithMemoMap(Layer.provideMerge(appLayer, layer), memoMap, scope), (context) => {
      const router = Context.get(context, HttpRouter)
      return router.asHttpEffect()
    })
  }) as any

const RouteTypeId = "~effect/http/HttpRouter/Route"

/**
 * Description of a registered HTTP route.
 *
 * **Details**
 *
 * A route pairs an HTTP method and path pattern with a response handler, plus
 * metadata used for prefix handling and interruptibility.
 *
 * @stability unstable
 * @category routes
 * @since 4.0.0
 */
export interface Route<E = never, R = never> {
  readonly [RouteTypeId]: typeof RouteTypeId
  readonly method: HttpMethod.HttpMethod | "*"
  readonly path: PathInput
  readonly handler: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
  readonly uninterruptible: boolean
  readonly prefix: Option.Option<string>
}

/**
 * Helper types for extracting the error and context types carried by `Route`
 * values.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Route {
  /**
   * Extracts the error type produced by a `Route` handler.
   *
   * @stability unstable
   * @category routes
   * @since 4.0.0
   */
  export type Error<R extends Route<any, any>> = R extends Route<infer E, infer _R> ? E : never

  /**
   * Extracts the context requirements of a `Route` handler.
   *
   * @stability unstable
   * @category routes
   * @since 4.0.0
   */
  export type Context<T extends Route<any, any>> = T extends Route<infer _E, infer R> ? R : never
}

const makeRoute = <E, R>(options: {
  readonly method: HttpMethod.HttpMethod | "*"
  readonly path: PathInput
  readonly handler: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
  readonly uninterruptible?: boolean | undefined
  readonly prefix?: Option.Option<string> | string | undefined
}): Route<E, Exclude<R, Provided>> => (({
  ...options,
  uninterruptible: options.uninterruptible ?? false,
  prefix: typeof options.prefix === "string" ? Option.some(options.prefix) : options.prefix ?? Option.none(),
  [RouteTypeId]: RouteTypeId
}) as Route<E, Exclude<R, Provided>>)

/**
 * Constructs a `Route` from an HTTP method, path, and handler.
 *
 * **Details**
 *
 * The handler may be a static response, an effect that produces a response, or a
 * function from the current request to a response effect. Set `uninterruptible` to
 * prevent the route handler from being made interruptible while it runs.
 *
 * @stability unstable
 * @category routes
 * @since 4.0.0
 */
export const route = <E = never, R = never>(
  method: "*" | HttpMethod.HttpMethod,
  path: PathInput,
  handler:
    | HttpServerResponse.HttpServerResponse
    | Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
    | ((request: HttpServerRequest.HttpServerRequest) => Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>),
  options?: {
    readonly uninterruptible?: boolean | undefined
  }
): Route<E, Exclude<R, Provided>> =>
  makeRoute({
    ...options,
    method,
    path,
    handler: HttpServerResponse.isHttpServerResponse(handler) ?
      Effect.succeed(handler) :
      Effect.isEffect(handler)
      ? handler
      : Effect.flatMap(HttpServerRequest.HttpServerRequest, handler),
    uninterruptible: options?.uninterruptible ?? false
  })

/**
 * Path pattern accepted by the router. Routes must use an absolute path
 * beginning with `/` or the wildcard `*`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type PathInput = `/${string}` | "*"

const removeTrailingSlash = (
  path: PathInput
): PathInput => (path.endsWith("/") ? path.slice(0, -1) : path) as any

/**
 * Adds a path prefix to a route path.
 *
 * **Details**
 *
 * Trailing slashes are removed from the prefix; `/` becomes the prefix itself and
 * `*` becomes a wildcard route under the prefix.
 *
 * @stability unstable
 * @category transforming
 * @since 4.0.0
 */
export const prefixPath: {
  (prefix: string): (self: string) => string
  (self: string, prefix: string): string
} = dual(2, (self: string, prefix: string) => {
  prefix = removeTrailingSlash(prefix as PathInput)
  if (self === "*") return `${prefix}/*`
  else if (self === "/") return prefix
  return prefix + self
})

/**
 * Returns a copy of a route with its path prefixed.
 *
 * **Details**
 *
 * The prefix is also tracked on the route so that, when the route handles a
 * request, the matched prefix can be removed from the request URL seen by the
 * handler.
 *
 * @stability unstable
 * @category routes
 * @since 4.0.0
 */
export const prefixRoute: {
  (prefix: string): <E, R>(self: Route<E, R>) => Route<E, R>
  <E, R>(self: Route<E, R>, prefix: string): Route<E, R>
} = dual(2, <E, R>(self: Route<E, R>, prefix: string): Route<E, R> =>
  makeRoute({
    ...self,
    path: prefixPath(self.path, prefix) as PathInput,
    prefix: Option.match(self.prefix, {
      onNone: () => removeTrailingSlash(prefix as PathInput),
      onSome: (existingPrefix) => prefixPath(existingPrefix, prefix) as string
    })
  }))

/**
 * Represents a request-level dependency, that needs to be provided by
 * middleware.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export interface Request<Kind extends string, T> {
  readonly _: unique symbol
  readonly kind: Kind
  readonly type: T
}

/**
 * Helper types for request-level dependency markers used by router layers and
 * middleware.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Request {
  /**
   * Wraps a type in a request-level marker of the supplied kind.
   *
   * @stability unstable
   * @category utility types
   * @since 4.0.0
   */
  export type From<Kind extends string, R> = R extends infer T ? Request<Kind, T> : never

  /**
   * Extracts the payload types from request-level markers that have the supplied
   * kind.
   *
   * @stability unstable
   * @category utility types
   * @since 4.0.0
   */
  export type Only<Kind extends string, A> = A extends Request<Kind, infer T> ? T : never

  /**
   * Removes request-level markers from a union, leaving only ordinary requirement
   * or error types.
   *
   * @stability unstable
   * @category utility types
   * @since 4.0.0
   */
  export type Without<A> = A extends Request<infer _Kind, infer _> ? never : A
}

/**
 * Services provided by the HTTP router, which are available in the
 * request context.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Provided =
  | HttpServerRequest.HttpServerRequest
  | Scope.Scope
  | HttpServerRequest.ParsedSearchParams
  | RouteContext

/**
 * Services provided to global middleware.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type GlobalProvided =
  | HttpServerRequest.HttpServerRequest
  | Scope.Scope

const MiddlewareTypeId = "~effect/http/HttpRouter/Middleware"

/**
 * Composable descriptor for route-scoped HTTP router middleware.
 *
 * **Details**
 *
 * Its `layer` can be provided to route layers, and `combine` composes middleware
 * while tracking provided services, handled errors, and remaining requirements at
 * the type level.
 *
 * @stability unstable
 * @category middleware
 * @since 4.0.0
 */
export interface Middleware<
  Config extends {
    provides: any
    handles: any
    error: any
    requires: any
    layerError: any
    layerRequires: any
  }
> {
  readonly [MiddlewareTypeId]: Config

  readonly layer: [Config["requires"]] extends [never] ? Layer.Layer<
      | Request.From<"Requires", Config["provides"]>
      | Request.From<"Error", Config["handles"]>,
      Config["layerError"],
      | Config["layerRequires"]
      | Request.From<"Requires", Config["requires"]>
      | Request.From<"Error", Config["error"]>
    >
    : "Need to .combine(middleware) that satisfy the missing request dependencies"

  readonly combine: <
    Config2 extends {
      provides: any
      handles: any
      error: any
      requires: any
      layerError: any
      layerRequires: any
    }
  >(other: Middleware<Config2>) => Middleware<{
    provides: Config2["provides"] | Config["provides"]
    handles: Config2["handles"] | Config["handles"]
    error: Config2["error"] | Exclude<Config["error"], Config2["handles"]>
    requires: Exclude<Config["requires"], Config2["provides"]> | Config2["requires"]
    layerError: Config["layerError"] | Config2["layerError"]
    layerRequires: Config["layerRequires"] | Config2["layerRequires"]
  }>
}

/**
 * Create a middleware layer that can be used to modify requests and responses.
 *
 * **Details**
 *
 * By default, the middleware only affects the routes that it is provided to.
 *
 * If you want to create a middleware that applies globally to all routes, pass
 * the `global` option as `true`.
 *
 * **Example** (Applying route and global middleware)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer } from "effect"
 * import { HttpRouter, HttpServerResponse } from "effect/http"
 *
 * const RouteMiddleware = HttpRouter.middleware((httpEffect) =>
 *   Effect.map(httpEffect, HttpServerResponse.setHeader("x-route", "route"))
 * ).layer
 *
 * const GlobalMiddleware = HttpRouter.middleware(
 *   (httpEffect) => Effect.map(httpEffect, HttpServerResponse.setHeader("x-global", "global")),
 *   { global: true }
 * )
 *
 * const Routes = HttpRouter.add("GET", "/hello", HttpServerResponse.text("Hello")).pipe(
 *   Layer.provide(RouteMiddleware)
 * )
 * const App = Layer.mergeAll(Routes, GlobalMiddleware)
 *
 * const program = Effect.acquireUseRelease(
 *   Effect.sync(() => HttpRouter.toWebHandler(App, { disableLogger: true })),
 *   ({ handler }) =>
 *     Effect.gen(function*() {
 *       const response = yield* Effect.promise(() => handler(new Request("http://localhost/hello")))
 *       return [response.headers.get("x-route"), response.headers.get("x-global")]
 *     }),
 *   ({ dispose }) => Effect.promise(dispose)
 * )
 *
 * await Effect.runPromise(program) // => ["route", "global"]
 * ```
 *
 * @stability unstable
 * @category middleware
 * @since 4.0.0
 */
export const middleware:
  & middleware.Make<never, never>
  & (<
    Config extends {
      provides?: any
      handles?: any
    } = {}
  >() => middleware.Make<
    Config extends { provides: infer R } ? R : never,
    Config extends { handles: infer E } ? E : never
  >) = function() {
    if (arguments.length === 0) {
      return makeMiddleware as any
    }
    return makeMiddleware(arguments[0], arguments[1]) as any
  }

const makeMiddleware = (middleware: any, options?: {
  readonly global?: boolean | undefined
}) =>
  options?.global ?
    Layer.effectDiscard(Effect.gen(function*() {
      const router = yield* HttpRouter
      const fn = Effect.isEffect(middleware) ? yield* middleware : middleware
      yield* router.addGlobalMiddleware(fn)
    }))
    : new MiddlewareImpl(
      Effect.isEffect(middleware) ?
        Layer.effectContext(Effect.map(middleware, (fn) => Context.makeUnsafe(new Map([[fnContextKey, fn]])))) :
        Layer.succeedContext(Context.makeUnsafe(new Map([[fnContextKey, middleware]]))) as any
    )

let middlewareId = 0
const fnContextKey = "effect/http/HttpRouter/MiddlewareFn"

class MiddlewareImpl<
  Config extends {
    provides: any
    handles: any
    error: any
    requires: any
    layerError: any
    layerRequires: any
  }
> implements Middleware<Config> {
  readonly [MiddlewareTypeId]: Config = {} as any

  readonly layerFn: Layer.Layer<never>
  readonly dependencies?: Layer.Layer<any, any, any> | undefined

  constructor(
    layerFn: Layer.Layer<never>,
    dependencies?: Layer.Layer<any, any, any>
  ) {
    this.layerFn = layerFn
    this.dependencies = dependencies
    const contextKey = `effect/http/HttpRouter/Middleware-${++middlewareId}` as const
    this.layer = Layer.effectContext(Effect.gen({ self: this }, function*() {
      const context = yield* Effect.context<Scope.Scope>()
      const stack = [Context.getOrUndefinedUnsafe(context, fnContextKey)]
      if (this.dependencies) {
        const memoMap = yield* Layer.CurrentMemoMap
        const scope = Context.get(context, Scope.Scope)
        const depsContext = yield* Layer.buildWithMemoMap(this.dependencies, memoMap, scope)
        stack.push(...getMiddleware(depsContext))
      }
      return Context.makeUnsafe<never>(new Map([[contextKey, stack]]))
    })).pipe(Layer.provide(this.layerFn))
  }

  layer: any

  combine<
    Config2 extends {
      provides: any
      handles: any
      error: any
      requires: any
      layerError: any
      layerRequires: any
    }
  >(other: Middleware<Config2>): Middleware<any> {
    return new MiddlewareImpl(
      this.layerFn,
      this.dependencies ? Layer.provideMerge(this.dependencies, other.layer as any) : other.layer as any
    ) as any
  }
}

const middlewareCache = new WeakMap<Context.Context<never>, any>()
const getMiddleware = (context: Context.Context<never>): Array<middleware.Fn> => {
  let arr = middlewareCache.get(context)
  if (arr) return arr
  const topLevel = Arr.empty<Array<middleware.Fn>>()
  let maxLength = 0
  for (const [key, value] of context.mapUnsafe) {
    if (key.startsWith("effect/http/HttpRouter/Middleware-")) {
      topLevel.push(value)
      if (value.length > maxLength) {
        maxLength = value.length
      }
    }
  }
  if (topLevel.length === 0) {
    arr = []
  } else {
    const middleware = new Set<middleware.Fn>()
    for (let i = maxLength - 1; i >= 0; i--) {
      for (const arr of topLevel) {
        if (i < arr.length) {
          middleware.add(arr[i])
        }
      }
    }
    arr = Arr.fromIterable(middleware).reverse()
  }
  middlewareCache.set(context, arr)
  return arr
}

/**
 * Types used by the `middleware` constructor.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace middleware {
  /**
   * Overloaded constructor type for router middleware.
   *
   * **Details**
   *
   * It builds either a route-scoped `Middleware` or, when `global` is `true`, a
   * layer that installs middleware for all routes. The type tracks provided
   * services, handled errors, middleware failures, and remaining requirements.
   *
   * @stability unstable
   * @category middleware
   * @since 4.0.0
   */
  export type Make<Provides = never, Handles = never> = {
    <E, R, EX, RX, const Global extends boolean = false>(
      middleware: Effect.Effect<
        (
          effect: Effect.Effect<
            HttpServerResponse.HttpServerResponse,
            Types.NoInfer<Handles | Types.unhandled>,
            Types.NoInfer<Provides>
          >
        ) =>
          & Effect.Effect<
            HttpServerResponse.HttpServerResponse,
            E,
            R
          >
          & (Types.unhandled extends E ? unknown : "You must only handle the configured errors"),
        EX,
        RX
      >,
      options?: {
        readonly global?: Global | undefined
      }
    ): Global extends true ? Layer.Layer<
        | Request.From<"Requires", Provides>
        | Request.From<"Error", Handles>
        | Request.From<"GlobalRequires", Provides>
        | Request.From<"GlobalError", Handles>,
        EX,
        | HttpRouter
        | Exclude<RX, Scope.Scope>
        | Request.From<"GlobalRequires", Exclude<R, GlobalProvided>>
        | Request.From<"GlobalError", Exclude<E, Types.unhandled>>
      > :
      Middleware<{
        provides: Provides
        handles: Handles
        error: Exclude<E, Types.unhandled>
        requires: Exclude<R, Provided>
        layerError: EX
        layerRequires: Exclude<RX, Scope.Scope>
      }>
    <E, R, const Global extends boolean = false>(
      middleware:
        & ((
          effect: Effect.Effect<
            HttpServerResponse.HttpServerResponse,
            Types.NoInfer<Handles | Types.unhandled>,
            Types.NoInfer<Provides>
          >
        ) => Effect.Effect<
          HttpServerResponse.HttpServerResponse,
          E,
          R
        >)
        & (Types.unhandled extends E ? unknown : "You must only handle the configured errors"),
      options?: {
        readonly global?: Global | undefined
      }
    ): Global extends true ? Layer.Layer<
        | Request.From<"Requires", Provides>
        | Request.From<"Error", Handles>
        | Request.From<"GlobalRequires", Provides>
        | Request.From<"GlobalError", Handles>,
        never,
        | HttpRouter
        | Request.From<"GlobalRequires", Exclude<R, GlobalProvided>>
        | Request.From<"GlobalError", Exclude<E, Types.unhandled>>
      > :
      Middleware<{
        provides: Provides
        handles: Handles
        error: Exclude<E, Types.unhandled>
        requires: Exclude<R, Provided>
        layerError: never
        layerRequires: never
      }>
  }

  /**
   * Function that transforms an HTTP response effect into another HTTP response
   * effect.
   *
   * @stability unstable
   * @category middleware
   * @since 4.0.0
   */
  export type Fn = (
    effect: Effect.Effect<HttpServerResponse.HttpServerResponse>
  ) => Effect.Effect<HttpServerResponse.HttpServerResponse>
}

/**
 * Middleware that applies CORS headers to the HTTP response.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const cors = (
  options?: {
    readonly allowedOrigins?: ReadonlyArray<string> | undefined
    readonly allowedMethods?: ReadonlyArray<string> | undefined
    readonly allowedHeaders?: ReadonlyArray<string> | undefined
    readonly exposedHeaders?: ReadonlyArray<string> | undefined
    readonly maxAge?: number | undefined
    readonly credentials?: boolean | undefined
  } | undefined
): Layer.Layer<never, never, HttpRouter> => middleware(HttpMiddleware.cors(options), { global: true })

/**
 * Middleware that disables the logger for some routes.
 *
 * **Example** (Disabling route logging)
 *
 * ```ts import.meta.vitest
 * import { Layer } from "effect"
 * import { HttpRouter, HttpServerResponse } from "effect/http"
 *
 * const Route = HttpRouter.add(
 *   "GET",
 *   "/hello",
 *   HttpServerResponse.text("Hello, World!")
 * ).pipe(
 *   // disable the logger for this route
 *   Layer.provide(HttpRouter.disableLogger)
 * )
 * Layer.isLayer(Route) // => true
 * ```
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const disableLogger: Layer.Layer<never> = middleware(HttpMiddleware.withLoggerDisabled).layer

/**
 * Provides request-level dependencies to some routes.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const provideRequest =
  <A2, E2, R2>(layer: Layer.Layer<A2, E2, R2>) =>
  <A, E, R>(self: Layer.Layer<A, E, R>): Layer.Layer<
    A,
    E | E2,
    R2 | Exclude<R, Request.From<"Requires", A2>>
  > =>
    Layer.provide(
      self,
      middleware<{ provides: A2 }>()(Effect.gen(function*() {
        const services = yield* Layer.build(layer as Layer.Layer<A2>)
        return (effect) =>
          Effect.provideContext(effect, services) as Effect.Effect<
            HttpServerResponse.HttpServerResponse,
            Types.unhandled
          >
      })).layer
    )

/**
 * Runs the provided application layer as an HTTP server.
 *
 * **Details**
 *
 * Layers first built inside the app are private to this server. Provide
 * services that must be shared with sibling layers outside `serve`.
 *
 * **Gotchas**
 *
 * The layer is built with a forked `MemoMap`, so calling `serve` twice will
 * build the same layer twice.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const serve = <A, E, R, HE, HR = Request.Only<"Requires", R> | Request.Only<"GlobalRequires", R>>(
  appLayer: Layer.Layer<A, E, R>,
  options?: {
    readonly routerConfig?: Partial<FindMyWay.RouterConfig> | undefined
    readonly disableLogger?: boolean | undefined
    readonly disableListenLog?: boolean
    /**
     * Middleware to apply to the HTTP server.
     *
     * **Gotchas**
     *
     * This middleware is applied to the entire HTTP server chain, including the
     * sending of the response. Changes to the response are not reflected in the
     * final response sent to the client. Use `HttpRouter.middleware` when
     * middleware must modify the response.
     */
    readonly middleware?: (
      effect: Effect.Effect<
        HttpServerResponse.HttpServerResponse,
        Request.Only<"Error", R> | Request.Only<"GlobalError", R> | HttpServerError.HttpServerError,
        | Scope.Scope
        | HttpServerRequest.HttpServerRequest
        | Request.Only<"Requires", R>
        | Request.Only<"GlobalRequires", R>
      >
    ) => Effect.Effect<HttpServerResponse.HttpServerResponse, HE, HR>
  }
): Layer.Layer<
  A,
  Request.Without<E>,
  HttpServer.HttpServer | Exclude<Request.Without<R> | Exclude<HR, GlobalProvided>, HttpRouter>
> => {
  let middleware: any = options?.middleware
  if (options?.disableLogger !== true) {
    middleware = middleware ? compose(middleware, HttpMiddleware.logger) : HttpMiddleware.logger
  }
  const layerWithRouter = Layer.provideMerge(
    appLayer,
    options?.routerConfig
      ? Layer.provide(layer, Layer.succeed(RouterConfig)(options.routerConfig))
      : layer
  )
  return Effect.contextWith((context) => {
    const memoMap = Layer.CurrentMemoMap.forkOrCreate(context)
    return Layer.buildWithMemoMap(layerWithRouter, memoMap, Context.get(context, Scope.Scope))
  }).pipe(
    Effect.map((context) => {
      const router = Context.get(context, HttpRouter)
      const handler = router.asHttpEffect()
      return Layer.merge(
        middleware ? HttpServer.serve(handler, middleware) : HttpServer.serve(handler),
        Layer.succeedContext(context)
      )
    }),
    Layer.unwrap,
    options?.disableListenLog ? identity : HttpServer.withLogAddress
  ) as any
}

/**
 * Builds a Fetch-compatible request handler from an HTTP router application
 * layer.
 *
 * **Details**
 *
 * The result contains a `handler` function that converts Web `Request` values to
 * Web `Response` values and a `dispose` function for releasing the layer
 * resources. The layer is built immediately, so the cost is paid when the
 * handler is created rather than on the first request. A layer that performs
 * asynchronous work while building may still be in progress when the first
 * request arrives, in which case that request waits for the build to finish.
 * If the build fails, every request rejects with the build error.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toWebHandler = <
  A,
  E,
  R extends
    | HttpRouter
    | Request<"Requires", any>
    | Request<"GlobalRequires", any>
    | Request<"Error", any>
    | Request<"GlobalError", any>,
  HE,
  HR = Exclude<Request.Only<"Requires", R> | Request.Only<"GlobalRequires", R>, A>,
  ReqR = Exclude<HR, A | Scope.Scope | HttpServerRequest.HttpServerRequest>
>(
  appLayer: Layer.Layer<A, E, R>,
  options?: {
    readonly memoMap?: Layer.MemoMap | undefined
    readonly routerConfig?: Partial<FindMyWay.RouterConfig> | undefined
    readonly disableLogger?: boolean | undefined
    /**
     * Middleware to apply to the HTTP server.
     *
     * **Gotchas**
     *
     * This middleware is applied to the entire HTTP server chain, including the
     * sending of the response. Changes to the response are not reflected in the
     * final response sent to the client. Use `HttpRouter.middleware` when
     * middleware must modify the response.
     */
    readonly middleware?: (
      effect: Effect.Effect<
        HttpServerResponse.HttpServerResponse,
        Request.Only<"Error", R> | Request.Only<"GlobalError", R> | HttpServerError.HttpServerError,
        | Scope.Scope
        | HttpServerRequest.HttpServerRequest
        | Request.Only<"Requires", R>
        | Request.Only<"GlobalRequires", R>
      >
    ) => Effect.Effect<HttpServerResponse.HttpServerResponse, HE, HR | GlobalProvided>
  }
): {
  readonly handler: [ReqR] extends [never]
    ? ((request: globalThis.Request, context?: Context.Context<never> | undefined) => Promise<Response>)
    : ((
      request: globalThis.Request,
      context: Context.Context<ReqR>
    ) => Promise<Response>)
  readonly dispose: () => Promise<void>
} => {
  let middleware: any = options?.middleware
  if (options?.disableLogger !== true) {
    middleware = middleware ? compose(middleware, HttpMiddleware.logger) : HttpMiddleware.logger
  }
  const RouterLayer = options?.routerConfig
    ? Layer.provide(layer, Layer.succeed(RouterConfig)(options.routerConfig))
    : layer
  return HttpEffect.toWebHandlerLayerWith(
    Layer.provideMerge(appLayer, RouterLayer) as Layer.Layer<A | HttpRouter, E>,
    {
      toHandler: (s) => Effect.succeed(Context.get(s, HttpRouter).asHttpEffect()),
      middleware,
      memoMap: options?.memoMap
    }
  )
}
