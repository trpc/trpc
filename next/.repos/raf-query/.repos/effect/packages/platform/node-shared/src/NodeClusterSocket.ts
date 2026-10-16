/**
 * Node TCP socket transport for Effect Cluster runner-to-runner RPC.
 *
 * This module provides the shared Node layers used by socket-based cluster
 * transports. `layerClientProtocol` opens TCP sockets to peer runner addresses
 * and wraps them in the current RPC serialization protocol. `layerSocketServer`
 * exposes the socket server that receives incoming runner RPC traffic.
 *
 * @since 4.0.0
 */
import * as Runners from "effect/cluster/Runners"
import * as ShardingConfig from "effect/cluster/ShardingConfig"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as RpcClient from "effect/rpc/RpcClient"
import * as RpcSerialization from "effect/rpc/RpcSerialization"
import { Socket } from "effect/socket/Socket"
import type * as SocketServer from "effect/socket/SocketServer"
import * as NodeSocket from "./NodeSocket.ts"
import * as NodeSocketServer from "./NodeSocketServer.ts"

/**
 * Provides the cluster `RpcClientProtocol` by opening TCP sockets to runner
 * addresses and using the current RPC serialization service.
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
        const socket = yield* NodeSocket.makeNet({
          openTimeout: 1000,
          timeout: 5500,
          host: address.host,
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
  return NodeSocketServer.layer(listenAddress.value)
}).pipe(Layer.unwrap)
