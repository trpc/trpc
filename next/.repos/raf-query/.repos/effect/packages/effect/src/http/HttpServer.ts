/**
 * Service for serving Effect HTTP responses on a concrete HTTP server.
 *
 * Platform adapters provide `HttpServer`, and routers or applications consume
 * it to run an `HttpServerResponse` effect for each incoming request. The
 * service exposes the listening address, while this module also includes helpers
 * for address formatting, server logging, and clients that target the current
 * server in tests.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as FileSystem from "../FileSystem.ts"
import { dual } from "../Function.ts"
import * as Layer from "../Layer.ts"
import * as NetAddress from "../net/NetAddress.ts"
import * as Path from "../Path.ts"
import type * as Scope from "../Scope.ts"
import * as Etag from "./Etag.ts"
import * as HttpClient from "./HttpClient.ts"
import * as ClientRequest from "./HttpClientRequest.ts"
import type * as Middleware from "./HttpMiddleware.ts"
import * as HttpPlatform from "./HttpPlatform.ts"
import type { HttpServerRequest } from "./HttpServerRequest.ts"
import type { HttpServerResponse } from "./HttpServerResponse.ts"

/**
 * Service tag for an HTTP server runtime.
 *
 * **Details**
 *
 * The service can serve an HTTP response effect and exposes the address where the
 * server is listening.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class HttpServer extends Context.Service<HttpServer, {
  readonly serve: {
    <E, R>(effect: Effect.Effect<HttpServerResponse, E, R>): Effect.Effect<
      void,
      never,
      Exclude<R, HttpServerRequest> | Scope.Scope
    >
    <E, R, App extends Effect.Effect<HttpServerResponse, any, any>>(
      effect: Effect.Effect<HttpServerResponse, E, R>,
      middleware: Middleware.HttpMiddleware.Applied<App, E, R>
    ): Effect.Effect<
      void,
      never,
      Exclude<R, HttpServerRequest> | Scope.Scope
    >
  }

  readonly address: NetAddress.SocketAddress
}>()("effect/http/HttpServer") {}

/**
 * Constructs an `HttpServer` service from a serving implementation and listening
 * address.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (
  options: {
    readonly serve: (
      httpEffect: Effect.Effect<HttpServerResponse, unknown, HttpServerRequest | Scope.Scope>,
      middleware?: Middleware.HttpMiddleware
    ) => Effect.Effect<void, never, Scope.Scope>
    readonly address: NetAddress.SocketAddress
  }
): HttpServer["Service"] => options

/**
 * Creates a layer that starts serving an HTTP response effect with the current
 * `HttpServer`.
 *
 * **Details**
 *
 * The request service is supplied by the server for each request; the returned
 * layer still requires the server, a scope, and any non-request dependencies of
 * the response effect or middleware.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const serve: {
  (): <E, R>(
    effect: Effect.Effect<HttpServerResponse, E, R>
  ) => Layer.Layer<never, never, HttpServer | Exclude<R, HttpServerRequest | Scope.Scope>>
  <E, R, App extends Effect.Effect<HttpServerResponse, any, any>>(
    middleware: Middleware.HttpMiddleware.Applied<App, E, R>
  ): (
    effect: Effect.Effect<HttpServerResponse, E, R>
  ) => Layer.Layer<
    never,
    never,
    HttpServer | Exclude<Effect.Services<App>, HttpServerRequest | Scope.Scope>
  >
  <E, R>(
    effect: Effect.Effect<HttpServerResponse, E, R>
  ): Layer.Layer<never, never, HttpServer | Exclude<R, HttpServerRequest | Scope.Scope>>
  <E, R, App extends Effect.Effect<HttpServerResponse, any, any>>(
    effect: Effect.Effect<HttpServerResponse, E, R>,
    middleware: Middleware.HttpMiddleware.Applied<App, E, R>
  ): Layer.Layer<
    never,
    never,
    HttpServer | Exclude<Effect.Services<App>, HttpServerRequest | Scope.Scope>
  >
} = dual((args) => Effect.isEffect(args[0]), <E, R, App extends Effect.Effect<HttpServerResponse, any, any>>(
  effect: Effect.Effect<HttpServerResponse, E, R>,
  middleware?: Middleware.HttpMiddleware.Applied<App, E, R>
): Layer.Layer<
  never,
  never,
  HttpServer | Exclude<Effect.Services<App>, HttpServerRequest | Scope.Scope>
> =>
  Layer.effectDiscard(
    HttpServer.use((server) => server.serve(effect, middleware!))
  ) as any)

/**
 * Effect that starts serving an HTTP response effect with the current
 * `HttpServer`.
 *
 * **Details**
 *
 * The request service is supplied by the server for each request; the effect
 * requires a scope and any non-request dependencies of the response effect or
 * middleware.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const serveEffect: {
  (): <E, R>(
    effect: Effect.Effect<HttpServerResponse, E, R>
  ) => Effect.Effect<void, never, Scope.Scope | HttpServer | Exclude<R, HttpServerRequest>>
  <E, R, App extends Effect.Effect<HttpServerResponse, any, any>>(
    middleware: Middleware.HttpMiddleware.Applied<App, E, R>
  ): (
    effect: Effect.Effect<HttpServerResponse, E, R>
  ) => Effect.Effect<
    void,
    never,
    Scope.Scope | HttpServer | Exclude<Effect.Services<App>, HttpServerRequest>
  >
  <E, R>(
    effect: Effect.Effect<HttpServerResponse, E, R>
  ): Effect.Effect<void, never, Scope.Scope | HttpServer | Exclude<R, HttpServerRequest>>
  <E, R, App extends Effect.Effect<HttpServerResponse, any, any>>(
    effect: Effect.Effect<HttpServerResponse, E, R>,
    middleware: Middleware.HttpMiddleware.Applied<App, E, R>
  ): Effect.Effect<
    void,
    never,
    Scope.Scope | HttpServer | Exclude<Effect.Services<App>, HttpServerRequest>
  >
} = dual((args) => Effect.isEffect(args[0]), <E, R, App extends Effect.Effect<HttpServerResponse, any, any>>(
  effect: Effect.Effect<HttpServerResponse, E, R>,
  middleware?: Middleware.HttpMiddleware.Applied<App, E, R>
): Effect.Effect<
  void,
  never,
  Scope.Scope | HttpServer | Exclude<Effect.Services<App>, HttpServerRequest>
> => HttpServer.use((server) => server.serve(effect, middleware!)) as any)

/**
 * Formats a server address as a display string using {@link NetAddress.formatUrlUnsafe}.
 *
 * **Gotchas**
 *
 * Throws a `NetAddressError` when URL conversion fails, including for scoped
 * IPv6 addresses. Unix socket paths are displayed with a `unix://` prefix.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const formatAddress: (address: NetAddress.SocketAddress) => string = NetAddress.formatUrlUnsafe

/**
 * Reads the current server address, formats it with `formatAddress`, and passes
 * the formatted address to the supplied effectful function.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const addressFormattedWith = <A, E, R>(
  f: (address: string) => Effect.Effect<A, E, R>
): Effect.Effect<A, E, HttpServer | R> =>
  Effect.flatMap(
    HttpServer,
    (server) => f(formatAddress(server.address))
  )

/**
 * Logs the formatted address of the current HTTP server.
 *
 * @stability unstable
 * @category logging
 * @since 4.0.0
 */
export const logAddress: Effect.Effect<void, never, HttpServer> = addressFormattedWith((_) =>
  Effect.log(`Listening on ${_}`)
)

/**
 * Adds address logging to a layer that provides an `HttpServer`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const withLogAddress = <A, E, R>(
  layer: Layer.Layer<A, E, R>
): Layer.Layer<A, E, R | Exclude<HttpServer, A>> =>
  Layer.effectDiscard(logAddress).pipe(
    Layer.provideMerge(layer)
  )

/**
 * Builds an `HttpClient` that sends requests to the current test HTTP server.
 *
 * **Details**
 *
 * For internet servers, requests are prefixed with the server URL and unspecified
 * addresses are replaced by IPv4 loopback, including dual-stack `::` listeners.
 *
 * **Gotchas**
 *
 * Unix socket addresses and scoped IPv6 addresses are not supported.
 *
 * @stability unstable
 * @category testing
 * @since 4.0.0
 */
export const makeTestClient: Effect.Effect<
  HttpClient.HttpClient,
  never,
  HttpServer | HttpClient.HttpClient
> = Effect.gen(function*() {
  const server = yield* HttpServer
  const client = yield* HttpClient.HttpClient
  const address = server.address
  if (NetAddress.isUnixPathAddress(address)) {
    return yield* Effect.die(new Error("HttpServer.layerTestClient: UnixPathAddress not supported"))
  }
  const url = yield* Effect.fromResult(NetAddress.toUrl(address)).pipe(Effect.orDie)
  if (NetAddress.isUnspecified(address.address)) {
    url.hostname = NetAddress.formatIp(NetAddress.ipv4Loopback)
  }
  return HttpClient.mapRequest(client, ClientRequest.prependUrl(url.origin))
})

/**
 * Layer that provides the test `HttpClient` created by `makeTestClient`.
 *
 * @stability unstable
 * @category testing
 * @since 4.0.0
 */
export const layerTestClient: Layer.Layer<
  HttpClient.HttpClient,
  never,
  HttpServer | HttpClient.HttpClient
> = Layer.effect(HttpClient.HttpClient)(makeTestClient)

/**
 * Layer that provides the platform services commonly needed by HTTP
 * server tests.
 *
 * **Details**
 *
 * It includes `HttpPlatform`, `Path`, a weak ETag generator, and a no-op
 * `FileSystem`.
 *
 * @stability unstable
 * @category testing
 * @since 4.0.0
 */
export const layerServices: Layer.Layer<
  | Path.Path
  | HttpPlatform.HttpPlatform
  | FileSystem.FileSystem
  | Etag.Generator
> = Layer.mergeAll(
  HttpPlatform.layer,
  Path.layer,
  Etag.layerWeak
).pipe(
  Layer.provideMerge(FileSystem.layerNoop({}))
)
