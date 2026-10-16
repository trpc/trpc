/**
 * Node.js HTTP and WebSocket layers for Effect Cluster runners.
 *
 * The main `layer` builds a sharding layer for HTTP or WebSocket transport,
 * choosing serialization, runner health checks, runner storage, message
 * storage, and optional client-only mode from the supplied options.
 * `layerHttpServer` provides the Node HTTP server used by cluster runners, and
 * this module re-exports the Kubernetes HTTP client layer used by runner health
 * checks.
 *
 * @since 4.0.0
 */
import * as HttpRunner from "effect/cluster/HttpRunner"
import * as MessageStorage from "effect/cluster/MessageStorage"
import * as RunnerHealth from "effect/cluster/RunnerHealth"
import * as Runners from "effect/cluster/Runners"
import * as RunnerStorage from "effect/cluster/RunnerStorage"
import type { Sharding } from "effect/cluster/Sharding"
import * as ShardingConfig from "effect/cluster/ShardingConfig"
import * as SqlMessageStorage from "effect/cluster/SqlMessageStorage"
import * as SqlRunnerStorage from "effect/cluster/SqlRunnerStorage"
import type * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import type * as Etag from "effect/http/Etag"
import type { HttpPlatform } from "effect/http/HttpPlatform"
import type { HttpServer } from "effect/http/HttpServer"
import type { ServeError } from "effect/http/HttpServerError"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as RpcSerialization from "effect/rpc/RpcSerialization"
import type { SqlClient } from "effect/sql/SqlClient"
import { createServer } from "node:http"
import { layerK8sHttpClient } from "./NodeClusterSocket.ts"
import * as NodeCrypto from "./NodeCrypto.ts"
import * as NodeHttpClient from "./NodeHttpClient.ts"
import * as NodeHttpServer from "./NodeHttpServer.ts"
import type { NodeServices } from "./NodeServices.ts"
import * as NodeSocket from "./NodeSocket.ts"

export {
  /**
   * Provides the Kubernetes HTTP client layer used by Kubernetes runner health checks.
   *
   * @category re-exports
   * @since 4.0.0
   */
  layerK8sHttpClient
} from "./NodeClusterSocket.ts"

/**
 * Builds the Node cluster HTTP/WebSocket sharding layer, configuring runner
 * transport, RPC serialization, message storage, runner health checks, and
 * optional client-only mode.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer = <
  const ClientOnly extends boolean = false,
  const Storage extends "local" | "sql" | "byo" = never
>(options: {
  readonly transport: "http" | "websocket"
  readonly serialization?: "binary" | "ndjson" | undefined
  readonly serializationMaxBufferSize?: number | "unbounded" | undefined
  readonly clientOnly?: ClientOnly | undefined
  readonly storage?: Storage | undefined
  readonly runnerHealth?: "ping" | "k8s" | undefined
  readonly runnerHealthK8s?: {
    readonly namespace?: string | undefined
    readonly labelSelector?: string | undefined
  } | undefined
  readonly shardingConfig?: Partial<ShardingConfig.ShardingConfig["Service"]> | undefined
}): ClientOnly extends true ? Layer.Layer<
    Sharding | Runners.Runners | ("byo" extends Storage ? never : MessageStorage.MessageStorage),
    Config.ConfigError,
    "local" extends Storage ? never
      : "byo" extends Storage ? (MessageStorage.MessageStorage | RunnerStorage.RunnerStorage)
      : SqlClient
  > :
  Layer.Layer<
    Sharding | Runners.Runners | ("byo" extends Storage ? never : MessageStorage.MessageStorage),
    ServeError | Config.ConfigError,
    "local" extends Storage ? never
      : "byo" extends Storage ? (MessageStorage.MessageStorage | RunnerStorage.RunnerStorage)
      : SqlClient
  > =>
{
  const layer: Layer.Layer<any, any, any> = options.clientOnly
    // client only
    ? options.transport === "http"
      ? Layer.provide(HttpRunner.layerHttpClientOnly, NodeHttpClient.layerUndici)
      : Layer.provide(HttpRunner.layerWebsocketClientOnly, NodeSocket.layerWebSocketConstructor)
    // with server
    : options.transport === "http"
    ? Layer.provide(HttpRunner.layerHttp, [layerHttpServer, NodeHttpClient.layerUndici])
    : Layer.provide(HttpRunner.layerWebsocket, [layerHttpServer, NodeSocket.layerWebSocketConstructor])

  const runnerHealth: Layer.Layer<any, any, any> = options?.clientOnly
    ? Layer.empty as any
    : options?.runnerHealth === "k8s"
    ? RunnerHealth.layerK8s(options.runnerHealthK8s).pipe(
      Layer.provide(layerK8sHttpClient)
    )
    : RunnerHealth.layerPing.pipe(
      Layer.provide(Runners.layerRpc),
      Layer.provide(
        options.transport === "http"
          ? HttpRunner.layerClientProtocolHttpDefault.pipe(Layer.provide(NodeHttpClient.layerUndici))
          : HttpRunner.layerClientProtocolWebsocketDefault.pipe(Layer.provide(NodeSocket.layerWebSocketConstructor))
      )
    )

  return layer.pipe(
    Layer.provide(runnerHealth),
    Layer.provideMerge(
      options?.storage === "local"
        ? MessageStorage.layerNoop
        : options?.storage === "byo"
        ? Layer.empty
        : Layer.orDie(SqlMessageStorage.layer).pipe(Layer.provide(NodeCrypto.layer))
    ),
    Layer.provide(
      options?.storage === "local"
        ? RunnerStorage.layerMemory
        : options?.storage === "byo"
        ? Layer.empty
        : Layer.orDie(SqlRunnerStorage.layer)
    ),
    Layer.provide(ShardingConfig.layerFromEnv(options?.shardingConfig)),
    Layer.provide(
      options?.serialization === "ndjson"
        ? RpcSerialization.layerNdjsonWith({ maxBufferSize: options.serializationMaxBufferSize })
        : RpcSerialization.layerSchemaBinary({ maxFrameSize: options.serializationMaxBufferSize })
    )
  ) as any
}

/**
 * Provides the HTTP server and Node HTTP services used by cluster runners,
 * listening on `ShardingConfig.runnerListenAddress` or `runnerAddress`.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerHttpServer: Layer.Layer<
  | HttpPlatform
  | Etag.Generator
  | NodeServices
  | HttpServer,
  ServeError,
  ShardingConfig.ShardingConfig
> = Effect.gen(function*() {
  const config = yield* ShardingConfig.ShardingConfig
  const listenAddress = Option.orElse(config.runnerListenAddress, () => config.runnerAddress)
  if (Option.isNone(listenAddress)) {
    return yield* Effect.die("NodeClusterHttp.layerHttpServer: ShardingConfig.runnerAddress is None")
  }
  return NodeHttpServer.layer(createServer, listenAddress.value)
}).pipe(Layer.unwrap)
