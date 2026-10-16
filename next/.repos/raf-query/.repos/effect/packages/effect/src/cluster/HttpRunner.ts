/**
 * Connects cluster runner RPCs to HTTP and WebSocket transports.
 *
 * Runner nodes communicate through the `Runners.Rpcs` protocol. This module
 * provides client protocol layers for dialing runner addresses over HTTP or
 * WebSocket, HTTP effects that serve runner RPC handlers, route layers for
 * installing runner endpoints into an `HttpRouter`, and ready-made layers for
 * HTTP or WebSocket runner communication.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Effect from "../Effect.ts"
import * as HttpClient from "../http/HttpClient.ts"
import * as HttpClientRequest from "../http/HttpClientRequest.ts"
import * as HttpRouter from "../http/HttpRouter.ts"
import type * as HttpServer from "../http/HttpServer.ts"
import type { HttpServerRequest } from "../http/HttpServerRequest.ts"
import type { HttpServerResponse } from "../http/HttpServerResponse.ts"
import * as Layer from "../Layer.ts"
import * as NetAddress from "../net/NetAddress.ts"
import * as RpcClient from "../rpc/RpcClient.ts"
import * as RpcSerialization from "../rpc/RpcSerialization.ts"
import * as RpcServer from "../rpc/RpcServer.ts"
import type { Scope } from "../Scope.ts"
import * as Socket from "../socket/Socket.ts"
import type { MessageStorage } from "./MessageStorage.ts"
import type { RunnerHealth } from "./RunnerHealth.ts"
import * as Runners from "./Runners.ts"
import { RpcClientProtocol } from "./Runners.ts"
import * as RunnerServer from "./RunnerServer.ts"
import type { RunnerStorage } from "./RunnerStorage.ts"
import * as Sharding from "./Sharding.ts"
import type * as ShardingConfig from "./ShardingConfig.ts"

/**
 * Provides a runner RPC client protocol that connects to runner addresses over
 * HTTP.
 *
 * **Details**
 *
 * The configured path is appended to each runner address, and `https` switches
 * the generated URL from `http` to `https`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerClientProtocolHttp = (options: {
  readonly path: string
  readonly https?: boolean | undefined
}): Layer.Layer<
  RpcClientProtocol,
  never,
  RpcSerialization.RpcSerialization | HttpClient.HttpClient
> =>
  Layer.effect(RpcClientProtocol)(
    Effect.gen(function*() {
      const serialization = yield* RpcSerialization.RpcSerialization
      const client = yield* HttpClient.HttpClient
      const https = options.https ?? false
      const path = options.path.startsWith("/") ? options.path : `/${options.path}`
      return {
        codecFor: serialization.codecFor,
        make: (address) => {
          const clientWithUrl = HttpClient.mapRequest(
            client,
            HttpClientRequest.prependUrl(
              `http${https ? "s" : ""}://${NetAddress.formatUrlHostString(address.host)}:${address.port}${path}`
            )
          )
          return RpcClient.makeProtocolHttp(clientWithUrl).pipe(
            Effect.provideService(RpcSerialization.RpcSerialization, serialization)
          )
        }
      }
    })
  )

/**
 * Default HTTP runner client protocol layer using path `/`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerClientProtocolHttpDefault: Layer.Layer<
  Runners.RpcClientProtocol,
  never,
  RpcSerialization.RpcSerialization | HttpClient.HttpClient
> = layerClientProtocolHttp({ path: "/" })

/**
 * Provides a runner RPC client protocol that connects to runner addresses over
 * WebSocket.
 *
 * **Details**
 *
 * The configured path is appended to each runner address, and `https` switches
 * the generated URL from `ws` to `wss`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerClientProtocolWebsocket = (options: {
  readonly path: string
  readonly https?: boolean | undefined
}): Layer.Layer<
  RpcClientProtocol,
  never,
  RpcSerialization.RpcSerialization | Socket.WebSocketConstructor
> =>
  Layer.effect(RpcClientProtocol)(
    Effect.gen(function*() {
      const serialization = yield* RpcSerialization.RpcSerialization
      const https = options.https ?? false
      const path = options.path.startsWith("/") ? options.path : `/${options.path}`
      const constructor = yield* Socket.WebSocketConstructor
      return {
        codecFor: serialization.codecFor,
        make: Effect.fnUntraced(function*(address) {
          const socket = yield* Socket.makeWebSocket(
            `ws${https ? "s" : ""}://${NetAddress.formatUrlHostString(address.host)}:${address.port}${path}`
          ).pipe(
            Effect.provideService(Socket.WebSocketConstructor, constructor)
          )
          return yield* RpcClient.makeProtocolSocket().pipe(
            Effect.provideService(Socket.Socket, socket),
            Effect.provideService(RpcSerialization.RpcSerialization, serialization)
          )
        })
      }
    })
  )

/**
 * Default WebSocket runner client protocol layer using path `/`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerClientProtocolWebsocketDefault: Layer.Layer<
  Runners.RpcClientProtocol,
  never,
  RpcSerialization.RpcSerialization | Socket.WebSocketConstructor
> = layerClientProtocolWebsocket({ path: "/" })

/**
 * Builds an HTTP effect that serves runner RPCs over the HTTP protocol.
 *
 * **Details**
 *
 * The returned effect is produced from `RunnerServer.layerHandlers` and the
 * cluster runner RPC group.
 *
 * @stability unstable
 * @category running
 * @since 4.0.0
 */
export const toHttpEffect: Effect.Effect<
  Effect.Effect<HttpServerResponse, never, Scope | HttpServerRequest>,
  never,
  Scope | RpcSerialization.RpcSerialization | Sharding.Sharding | MessageStorage
> = Effect.gen(function*() {
  const { httpEffect, protocol } = yield* RpcServer.makeProtocolWithHttpEffect()
  const handlers = yield* Layer.build(RunnerServer.layerHandlers).pipe(
    Effect.provideService(RpcServer.Protocol, protocol)
  )
  yield* RpcServer.make(Runners.Rpcs, {
    spanPrefix: "RunnerServer",
    disableTracing: true,
    disableFatalDefects: true
  }).pipe(
    Effect.provideContext(handlers),
    Effect.provideService(RpcServer.Protocol, protocol),
    Effect.forkScoped
  )
  return httpEffect
})

/**
 * Builds an HTTP effect that serves runner RPCs over WebSocket.
 *
 * **Details**
 *
 * The returned effect is produced from `RunnerServer.layerHandlers` and the
 * cluster runner RPC group.
 *
 * @stability unstable
 * @category running
 * @since 4.0.0
 */
export const toHttpEffectWebsocket: Effect.Effect<
  Effect.Effect<HttpServerResponse, never, Scope | HttpServerRequest>,
  never,
  Scope | RpcSerialization.RpcSerialization | Sharding.Sharding | MessageStorage
> = Effect.gen(function*() {
  const { httpEffect, protocol } = yield* RpcServer.makeProtocolWithHttpEffectWebsocket
  const handlers = yield* Layer.build(RunnerServer.layerHandlers).pipe(
    Effect.provideService(RpcServer.Protocol, protocol)
  )
  yield* RpcServer.make(Runners.Rpcs, {
    spanPrefix: "RunnerServer",
    disableTracing: true,
    disableFatalDefects: true
  }).pipe(
    Effect.provideContext(handlers),
    Effect.provideService(RpcServer.Protocol, protocol),
    Effect.forkScoped
  )
  return httpEffect
})

/**
 * Layer that provides `Sharding` and `Runners` using the configured runner RPC
 * client protocol and storage services.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerClient: Layer.Layer<
  Sharding.Sharding | Runners.Runners,
  never,
  ShardingConfig.ShardingConfig | Runners.RpcClientProtocol | MessageStorage | RunnerStorage | RunnerHealth
> = Sharding.layer.pipe(
  Layer.provideMerge(Runners.layerRpc)
)

/**
 * Layer that adds HTTP runner routes to the provided `HttpRouter`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerHttpOptions = (options: {
  readonly path: HttpRouter.PathInput
}): Layer.Layer<
  Sharding.Sharding | Runners.Runners,
  never,
  | RunnerStorage
  | RunnerHealth
  | RpcSerialization.RpcSerialization
  | MessageStorage
  | ShardingConfig.ShardingConfig
  | Runners.RpcClientProtocol
  | HttpRouter.HttpRouter
> =>
  RunnerServer.layerWithClients.pipe(
    Layer.provide(RpcServer.layerProtocolHttp(options))
  )

/**
 * Layer that adds WebSocket runner routes to the provided `HttpRouter`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerWebsocketOptions = (options: {
  readonly path: HttpRouter.PathInput
}): Layer.Layer<
  Sharding.Sharding | Runners.Runners,
  never,
  | ShardingConfig.ShardingConfig
  | Runners.RpcClientProtocol
  | MessageStorage
  | RunnerStorage
  | RunnerHealth
  | RpcSerialization.RpcSerialization
  | HttpRouter.HttpRouter
> =>
  RunnerServer.layerWithClients.pipe(
    Layer.provide(RpcServer.layerProtocolWebsocket(options))
  )

/**
 * Layer that serves runner routes at `/` and configures HTTP runner clients.
 *
 * **Details**
 *
 * It serves runner routes at `/` and configures runner clients to communicate
 * over HTTP.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerHttp: Layer.Layer<
  Sharding.Sharding | Runners.Runners,
  never,
  | RpcSerialization.RpcSerialization
  | ShardingConfig.ShardingConfig
  | HttpClient.HttpClient
  | HttpServer.HttpServer
  | MessageStorage
  | RunnerStorage
  | RunnerHealth
> = HttpRouter.serve(layerHttpOptions({ path: "/" })).pipe(
  Layer.provide(layerClientProtocolHttpDefault)
)

/**
 * Provides a client-only HTTP runner layer.
 *
 * **When to use**
 *
 * Use to provide runner clients over HTTP from a process that should not serve
 * runner routes.
 *
 * **Details**
 *
 * It configures runner clients to communicate over HTTP without serving runner
 * HTTP routes.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerHttpClientOnly: Layer.Layer<
  Sharding.Sharding | Runners.Runners,
  never,
  | RpcSerialization.RpcSerialization
  | ShardingConfig.ShardingConfig
  | HttpClient.HttpClient
  | MessageStorage
  | RunnerStorage
> = RunnerServer.layerClientOnly.pipe(
  Layer.provide(layerClientProtocolHttpDefault)
)

/**
 * Layer that serves runner routes at `/` and configures WebSocket runner clients.
 *
 * **Details**
 *
 * It serves runner routes at `/` and configures runner clients to communicate
 * over WebSocket.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerWebsocket: Layer.Layer<
  Sharding.Sharding | Runners.Runners,
  never,
  | RpcSerialization.RpcSerialization
  | ShardingConfig.ShardingConfig
  | Socket.WebSocketConstructor
  | HttpServer.HttpServer
  | MessageStorage
  | RunnerStorage
  | RunnerHealth
> = HttpRouter.serve(layerWebsocketOptions({ path: "/" })).pipe(
  Layer.provide(layerClientProtocolWebsocketDefault)
)

/**
 * Provides a client-only WebSocket runner layer.
 *
 * **When to use**
 *
 * Use to provide runner clients over WebSocket from a process that should not
 * serve runner routes.
 *
 * **Details**
 *
 * It configures runner clients to communicate over WebSocket without serving
 * runner WebSocket routes.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerWebsocketClientOnly: Layer.Layer<
  Sharding.Sharding | Runners.Runners,
  never,
  | ShardingConfig.ShardingConfig
  | MessageStorage
  | RunnerStorage
  | RpcSerialization.RpcSerialization
  | Socket.WebSocketConstructor
> = RunnerServer.layerClientOnly.pipe(
  Layer.provide(layerClientProtocolWebsocketDefault)
)
