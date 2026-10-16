/**
 * Native Deno socket layers for Effect Cluster runners.
 *
 * The main `layer` builds a sharding layer for socket transport, choosing
 * serialization, runner health checks, runner storage, message storage, and
 * optional client-only mode from the supplied options. Unlike Node sockets,
 * Deno connections have no native idle-timeout option, so peer connections use
 * only the one-second open timeout.
 *
 * @since 4.0.0
 */
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
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as RpcClient from "effect/rpc/RpcClient"
import * as RpcSerialization from "effect/rpc/RpcSerialization"
import { Socket } from "effect/socket/Socket"
import type * as SocketServer from "effect/socket/SocketServer"
import type { SqlClient } from "effect/sql/SqlClient"
import * as DenoCrypto from "./DenoCrypto.ts"
import * as DenoFileSystem from "./DenoFileSystem.ts"
import * as DenoHttpClient from "./DenoHttpClient.ts"
import * as DenoSocket from "./DenoSocket.ts"
import * as DenoSocketServer from "./DenoSocketServer.ts"

/**
 * Provides the cluster `RpcClientProtocol` using native Deno TCP sockets.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerClientProtocol: Layer.Layer<
  Runners.RpcClientProtocol,
  never,
  RpcSerialization.RpcSerialization
> = Layer.effect(Runners.RpcClientProtocol)(
  Effect.gen(function*() {
    const serialization = yield* RpcSerialization.RpcSerialization
    return {
      codecFor: serialization.codecFor,
      make: Effect.fnUntraced(function*(address) {
        const socket = yield* DenoSocket.makeTcp({
          openTimeout: 1000,
          hostname: address.host,
          port: address.port
        })
        return yield* RpcClient.makeProtocolSocket().pipe(
          Effect.provideService(Socket, socket),
          Effect.provideService(RpcSerialization.RpcSerialization, serialization)
        )
      }, Effect.orDie)
    }
  })
)

/**
 * Provides the socket server used by cluster runners, listening on
 * `ShardingConfig.runnerListenAddress` or `runnerAddress`.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerSocketServer: Layer.Layer<
  SocketServer.SocketServer,
  SocketServer.SocketServerError,
  ShardingConfig.ShardingConfig
> = Effect.gen(function*() {
  const config = yield* ShardingConfig.ShardingConfig
  const listenAddress = Option.orElse(config.runnerListenAddress, () => config.runnerAddress)
  if (Option.isNone(listenAddress)) {
    return yield* Effect.die("layerSocketServer: ShardingConfig.runnerListenAddress is None")
  }
  return DenoSocketServer.layer({
    host: listenAddress.value.host,
    port: listenAddress.value.port
  })
}).pipe(Layer.unwrap)

/**
 * Creates Deno socket cluster layers, configuring serialization, storage,
 * runner health, and optional client-only mode.
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
    ? Layer.provide(SocketRunner.layerClientOnly, layerClientProtocol)
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
        : Layer.orDie(SqlMessageStorage.layer).pipe(Layer.provide(DenoCrypto.layer))
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
 * Layer that provides `K8sHttpClient`, using a scoped native Deno HTTP client
 * with the Kubernetes service-account CA certificate when it is available.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerK8sHttpClient: Layer.Layer<K8sHttpClient.K8sHttpClient> = K8sHttpClient.layer.pipe(
  Layer.provide(
    Layer.fresh(DenoHttpClient.layer).pipe(
      Layer.provide(Layer.effect(
        DenoHttpClient.Fetch,
        Effect.gen(function*() {
          const fs = yield* FileSystem.FileSystem
          const caCertOption = yield* fs.readFileString("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt").pipe(
            Effect.option
          )
          if (Option.isNone(caCertOption)) {
            return globalThis.fetch
          }

          const client = yield* Effect.acquireRelease(
            Effect.sync(() => Deno.createHttpClient({ caCerts: [caCertOption.value] })),
            (client) => Effect.sync(() => client.close())
          )
          return ((input, init) => globalThis.fetch(input, { ...init, client } as any)) as typeof globalThis.fetch
        })
      ))
    )
  ),
  Layer.provide(DenoFileSystem.layer)
)
