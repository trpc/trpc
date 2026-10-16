/**
 * Native Deno HTTP and WebSocket layers for Effect Cluster runners.
 *
 * `layerHttpServer` provides the Deno HTTP server used by cluster runners. The
 * main `layer` builds a sharding layer for HTTP or WebSocket transport,
 * choosing serialization, runner health checks, runner storage, message
 * storage, and optional client-only mode from the supplied options.
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
import { layerK8sHttpClient } from "./DenoClusterSocket.ts"
import * as DenoCrypto from "./DenoCrypto.ts"
import * as DenoHttpClient from "./DenoHttpClient.ts"
import * as DenoHttpServer from "./DenoHttpServer.ts"
import type { DenoServices } from "./DenoServices.ts"
import * as DenoSocket from "./DenoSocket.ts"

export {
  /**
   * Layer that provides a Kubernetes HTTP client for runner health checks.
   *
   * @category re-exports
   * @since 4.0.0
   */
  layerK8sHttpClient
}

/**
 * Layer that provides a native Deno HTTP server for cluster runners.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerHttpServer: Layer.Layer<
  | HttpPlatform
  | Etag.Generator
  | DenoServices
  | HttpServer,
  ServeError,
  ShardingConfig.ShardingConfig
> = Effect.gen(function*() {
  const config = yield* ShardingConfig.ShardingConfig
  const listenAddress = Option.orElse(config.runnerListenAddress, () => config.runnerAddress)
  if (Option.isNone(listenAddress)) {
    return yield* Effect.die("DenoClusterHttp.layerHttpServer: ShardingConfig.runnerAddress is None")
  }
  return DenoHttpServer.layer({
    hostname: listenAddress.value.host,
    port: listenAddress.value.port,
    onListen: () => {}
  })
}).pipe(Layer.unwrap)

/**
 * Creates Deno cluster layers for HTTP or WebSocket transport, configuring
 * serialization, storage, runner health, and optional client-only mode.
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
    ? options.transport === "http"
      ? Layer.provide(HttpRunner.layerHttpClientOnly, DenoHttpClient.layer)
      : Layer.provide(HttpRunner.layerWebsocketClientOnly, DenoSocket.layerWebSocketConstructor)
    : options.transport === "http"
    ? Layer.provide(HttpRunner.layerHttp, [layerHttpServer, DenoHttpClient.layer])
    : Layer.provide(HttpRunner.layerWebsocket, [layerHttpServer, DenoSocket.layerWebSocketConstructor])

  const runnerHealth: Layer.Layer<any, any, any> = options.clientOnly
    ? Layer.empty as any
    : options.runnerHealth === "k8s"
    ? RunnerHealth.layerK8s(options.runnerHealthK8s).pipe(
      Layer.provide(layerK8sHttpClient)
    )
    : RunnerHealth.layerPing.pipe(
      Layer.provide(Runners.layerRpc),
      Layer.provide(
        options.transport === "http"
          ? HttpRunner.layerClientProtocolHttpDefault.pipe(Layer.provide(DenoHttpClient.layer))
          : HttpRunner.layerClientProtocolWebsocketDefault.pipe(Layer.provide(DenoSocket.layerWebSocketConstructor))
      )
    )

  return layer.pipe(
    Layer.provide(runnerHealth),
    Layer.provideMerge(
      options.storage === "local"
        ? MessageStorage.layerNoop
        : options.storage === "byo"
        ? Layer.empty
        : Layer.orDie(SqlMessageStorage.layer).pipe(Layer.provide(DenoCrypto.layer))
    ),
    Layer.provide(
      options.storage === "local"
        ? RunnerStorage.layerMemory
        : options.storage === "byo"
        ? Layer.empty
        : Layer.orDie(SqlRunnerStorage.layer)
    ),
    Layer.provide(ShardingConfig.layerFromEnv(options.shardingConfig)),
    Layer.provide(
      options.serialization === "ndjson"
        ? RpcSerialization.layerNdjsonWith({ maxBufferSize: options.serializationMaxBufferSize })
        : RpcSerialization.layerSchemaBinary({ maxFrameSize: options.serializationMaxBufferSize })
    )
  ) as any
}
