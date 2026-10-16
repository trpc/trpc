/**
 * In-memory test harness for RPC groups.
 *
 * `RpcTest` connects a generated client directly to `RpcServer` handlers for
 * the same `RpcGroup`. It uses the no-serialization path, so requests,
 * responses, stream chunks, acknowledgements, interrupts, headers, and
 * middleware metadata travel through the normal client/server machinery without
 * opening HTTP, socket, worker, or serializer infrastructure.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Effect from "../Effect.ts"
import type * as Scope from "../Scope.ts"
import type * as Rpc from "./Rpc.ts"
import * as RpcClient from "./RpcClient.ts"
import type * as RpcGroup from "./RpcGroup.ts"
import * as RpcServer from "./RpcServer.ts"

/**
 * Creates an in-memory RPC client for a group, backed by the group's handlers
 * from the environment and using the no-serialization test transport.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeClient: <Rpcs extends Rpc.Any, const Flatten extends boolean = false>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options?: {
    readonly flatten?: Flatten | undefined
  }
) => Effect.Effect<
  Flatten extends true ? RpcClient.RpcClient.Flat<Rpcs> : RpcClient.RpcClient<Rpcs>,
  never,
  Scope.Scope | Rpc.ToHandler<Rpcs> | Rpc.Middleware<Rpcs> | Rpc.MiddlewareClient<Rpcs>
> = Effect.fnUntraced(function*<Rpcs extends Rpc.Any, const Flatten extends boolean = false>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options?: {
    readonly flatten?: Flatten | undefined
  }
) {
  // oxlint-disable-next-line prefer-const
  let client!: Effect.Success<ReturnType<typeof RpcClient.makeNoSerialization<Rpcs, never, Flatten>>>
  const server = yield* RpcServer.makeNoSerialization(group, {
    onFromServer(response) {
      return client.write(response)
    }
  })
  client = yield* RpcClient.makeNoSerialization(group, {
    supportsAck: true,
    flatten: options?.flatten,
    onFromClient({ message }) {
      return server.write(0, message)
    }
  })
  return client.client
})
