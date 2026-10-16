/**
 * Node.js socket layers for Effect Cluster runners.
 *
 * The main `layer` builds a sharding layer for socket transport, choosing
 * serialization, runner health checks, runner storage, message storage, and
 * optional client-only mode from the supplied options. This module also
 * re-exports the shared socket client and server protocol layers, and provides
 * Kubernetes-aware Undici dispatcher and HTTP client layers for runner health
 * checks.
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
import type { ConfigError } from "effect/Config"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as RpcSerialization from "effect/rpc/RpcSerialization"
import type * as SocketServer from "effect/socket/SocketServer"
import type { SqlClient } from "effect/sql/SqlClient"
import * as NodeCrypto from "./NodeCrypto.ts"
import * as NodeFileSystem from "./NodeFileSystem.ts"
import * as NodeHttpClient from "./NodeHttpClient.ts"

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
   * Provides the socket server used by Node cluster runners through the shared
   * socket server implementation.
   *
   * @category re-exports
   * @since 4.0.0
   */
  layerSocketServer
}

/**
 * Builds the Node cluster socket sharding layer, configuring RPC
 * serialization, message storage, runner health checks, and optional
 * client-only mode.
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
    ConfigError,
    "local" extends Storage ? never
      : "byo" extends Storage ? (MessageStorage.MessageStorage | RunnerStorage.RunnerStorage)
      : SqlClient
  > :
  Layer.Layer<
    Sharding | Runners.Runners | ("byo" extends Storage ? never : MessageStorage.MessageStorage),
    SocketServer.SocketServerError | ConfigError,
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
      Layer.provide(layerK8sHttpClient)
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
        ? RpcSerialization.layerNdjsonWith({ maxBufferSize: options?.serializationMaxBufferSize })
        : RpcSerialization.layerSchemaBinary({
          maxFrameSize: options?.serializationMaxBufferSize
        })
    )
  ) as any
}

/**
 * Provides an Undici dispatcher for Kubernetes API calls, using the service
 * account CA certificate when it is available and falling back to the default
 * dispatcher otherwise.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerDispatcherK8s: Layer.Layer<NodeHttpClient.Dispatcher> = Layer.effect(NodeHttpClient.Dispatcher)(
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const caCertOption = yield* fs.readFileString("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt").pipe(
      Effect.option
    )
    if (caCertOption._tag === "Some") {
      const Undici = yield* Effect.promise(() => import("./Undici.ts"))
      return yield* Effect.acquireRelease(
        Effect.sync(() =>
          new Undici.Agent({
            connect: {
              ca: caCertOption.value
            }
          })
        ),
        (agent) => Effect.promise(() => agent.destroy())
      )
    }

    return yield* NodeHttpClient.makeDispatcher
  })
).pipe(
  Layer.provide(NodeFileSystem.layer)
)

/**
 * Provides a `K8sHttpClient` backed by the Undici HTTP client and the
 * Kubernetes-aware dispatcher.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerK8sHttpClient: Layer.Layer<K8sHttpClient.K8sHttpClient> = K8sHttpClient.layer.pipe(
  Layer.provide(Layer.fresh(NodeHttpClient.layerUndiciNoDispatcher)),
  Layer.provide(layerDispatcherK8s),
  Layer.provide(NodeFileSystem.layer)
)
