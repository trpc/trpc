/**
 * Bun socket layers for Effect Cluster runners.
 *
 * The main `layer` builds a sharding layer for socket transport, choosing
 * serialization, runner health checks, runner storage, message storage, and
 * optional client-only mode from the supplied options. This module also
 * re-exports the shared socket client and server protocol layers and provides
 * `layerK8sHttpClient` for Kubernetes runner health checks.
 *
 * @since 4.0.0
 */
import { layerClientProtocol, layerSocketServer } from "@effect/platform-node-shared/NodeClusterSocket"
import * as K8sHttpClient from "effect/cluster/K8sHttpClient"
import * as MessageStorage from "effect/cluster/MessageStorage"
import * as RunnerHealth from "effect/cluster/RunnerHealth"
import * as Runners from "effect/cluster/Runners"
import * as RunnerStorage from "effect/cluster/RunnerStorage"
import type { Sharding } from "effect/cluster/Sharding"
import * as ShardingConfig from "effect/cluster/ShardingConfig"
import * as SocketRunner from "effect/cluster/SocketRunner"
import * as SqlMessageStorage from "effect/cluster/SqlMessageStorage"
import * as SqlRunnerStorage from "effect/cluster/SqlRunnerStorage"
import type * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Layer from "effect/Layer"
import * as RpcSerialization from "effect/rpc/RpcSerialization"
import type * as SocketServer from "effect/socket/SocketServer"
import type { SqlClient } from "effect/sql/SqlClient"
import * as BunCrypto from "./BunCrypto.ts"
import * as BunFileSystem from "./BunFileSystem.ts"

export {
  /**
   * Provides the cluster `RpcClientProtocol` using the shared socket client
   * implementation.
   *
   * @category re-exports
   * @since 4.0.0
   */
  layerClientProtocol,
  /**
   * Provides the socket server used by Bun cluster runners through the shared
   * socket server implementation.
   *
   * @category re-exports
   * @since 4.0.0
   */
  layerSocketServer
}

/**
 * Creates Bun socket cluster layers, configuring serialization, storage, runner health, and optional client-only mode.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer = <
  const ClientOnly extends boolean = false,
  const Storage extends "local" | "sql" | "byo" = never
>(
  options?: {
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
  }
): ClientOnly extends true ? Layer.Layer<
    Sharding | Runners.Runners | ("byo" extends Storage ? never : MessageStorage.MessageStorage),
    Config.ConfigError,
    "local" extends Storage ? never
      : "byo" extends Storage ? (MessageStorage.MessageStorage | RunnerStorage.RunnerStorage)
      : SqlClient
  > :
  Layer.Layer<
    Sharding | Runners.Runners | ("byo" extends Storage ? never : MessageStorage.MessageStorage),
    SocketServer.SocketServerError | Config.ConfigError,
    "local" extends Storage ? never
      : "byo" extends Storage ? (MessageStorage.MessageStorage | RunnerStorage.RunnerStorage)
      : SqlClient
  > =>
{
  const layer: Layer.Layer<any, any, any> = options?.clientOnly
    // client only
    ? Layer.provide(SocketRunner.layerClientOnly, layerClientProtocol)
    // with server
    : Layer.provide(SocketRunner.layer, [layerSocketServer, layerClientProtocol])

  const runnerHealth: Layer.Layer<any, any, any> = options?.clientOnly
    ? Layer.empty as any
    : options?.runnerHealth === "k8s"
    ? RunnerHealth.layerK8s(options.runnerHealthK8s).pipe(
      Layer.provide([BunFileSystem.layer, layerK8sHttpClient])
    )
    : RunnerHealth.layerPing.pipe(
      Layer.provide(Runners.layerRpc),
      Layer.provide(layerClientProtocol)
    )

  return layer.pipe(
    Layer.provide(runnerHealth),
    Layer.provideMerge(
      options?.storage === "local"
        ? MessageStorage.layerNoop
        : options?.storage === "byo"
        ? Layer.empty
        : Layer.orDie(SqlMessageStorage.layer).pipe(Layer.provide(BunCrypto.layer))
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
        ? RpcSerialization.layerNdjsonWith({ maxBufferSize: options?.serializationMaxBufferSize })
        : RpcSerialization.layerSchemaBinary({
          maxFrameSize: options?.serializationMaxBufferSize
        })
    )
  ) as any
}

/**
 * Layer that provides `K8sHttpClient`, using the Kubernetes service-account CA certificate when it is available.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerK8sHttpClient: Layer.Layer<K8sHttpClient.K8sHttpClient> = K8sHttpClient.layer.pipe(
  Layer.provide(Layer.unwrap(Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const caCertOption = yield* fs.readFile("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt").pipe(
      Effect.option
    )
    if (caCertOption._tag === "None") {
      return FetchHttpClient.layer
    }

    return Layer.fresh(FetchHttpClient.layer).pipe(
      Layer.provide(Layer.succeed(FetchHttpClient.RequestInit, {
        tls: {
          ca: caCertOption.value
        }
      } as any))
    )
  }))),
  Layer.provide(BunFileSystem.layer)
)
