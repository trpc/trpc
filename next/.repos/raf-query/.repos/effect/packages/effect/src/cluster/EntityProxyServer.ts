/**
 * Serves the proxy APIs generated from clustered entities.
 *
 * Proxy handlers read the target `entityId`, call the entity client, and
 * forward the payload to the matching entity RPC method. This module provides
 * handlers for HTTP API groups created by `EntityProxy.toHttpApiGroup` and RPC
 * handler services for RPC groups created by `EntityProxy.toRpcGroup`. Both
 * normal requests and discard requests are forwarded to the underlying entity
 * client.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import type * as HttpApi from "../http-api/HttpApi.ts"
import * as HttpApiBuilder from "../http-api/HttpApiBuilder.ts"
import type * as HttpApiGroup from "../http-api/HttpApiGroup.ts"
import * as Layer from "../Layer.ts"
import type * as Rpc from "../rpc/Rpc.ts"
import type * as Entity from "./Entity.ts"
import type { Sharding } from "./Sharding.ts"

/**
 * Creates HTTP API handlers for an entity proxy group.
 *
 * **Details**
 *
 * Each generated endpoint reads the `entityId` path parameter and forwards the
 * request payload to the corresponding entity client method, including discard
 * endpoints.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerHttpApi = <
  ApiId extends string,
  Groups extends HttpApiGroup.Constraint,
  Identifier extends HttpApiGroup.Identifier<Groups>,
  Type extends string,
  Rpcs extends Rpc.Any
>(
  api: HttpApi.HttpApi<ApiId, Groups>,
  identifier: Identifier,
  entity: Entity.Entity<Type, Rpcs>
): Layer.Layer<
  HttpApiGroup.Service<ApiId, Identifier>,
  never,
  Sharding | Rpc.ServicesServer<Rpcs> | Rpc.ServicesClient<Rpcs>
> =>
  HttpApiBuilder.group(
    api,
    identifier,
    Effect.fnUntraced(function*(handlers: any) {
      const client = yield* entity.client
      for (const parentRpc of entity.protocol.requests.values()) {
        handlers = handlers
          .handle(
            parentRpc._tag,
            ({ params, payload }: { params: { entityId: string }; payload: any }) =>
              (client(params.entityId) as any as Record<string, (p: any) => Effect.Effect<any>>)[parentRpc._tag](
                payload
              ).pipe(
                Effect.tapDefect(Effect.logError),
                Effect.annotateLogs({
                  module: "EntityProxyServer",
                  entity: entity.type,
                  entityId: params.entityId,
                  method: parentRpc._tag
                })
              )
          )
          .handle(
            `${parentRpc._tag}Discard`,
            ({ params, payload }: { params: { entityId: string }; payload: any }) =>
              (client(params.entityId) as any as Record<string, (p: any, o: {}) => Effect.Effect<any>>)[parentRpc._tag](
                payload,
                { discard: true }
              ).pipe(
                Effect.tapDefect(Effect.logError),
                Effect.annotateLogs({
                  module: "EntityProxyServer",
                  entity: entity.type,
                  entityId: params.entityId,
                  method: `${parentRpc._tag}Discard`
                })
              )
          )
      }
      return handlers as HttpApiBuilder.Handlers<never>
    })
  )

/**
 * Creates RPC handlers for the group produced by `EntityProxy.toRpcGroup`.
 *
 * **Details**
 *
 * The handlers forward each prefixed proxy RPC to the target entity client using
 * the `entityId` embedded in the proxy payload.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerRpcHandlers = <
  const Type extends string,
  Rpcs extends Rpc.Any
>(
  entity: Entity.Entity<Type, Rpcs>
): Layer.Layer<RpcHandlers<Rpcs, Type>, never, Sharding | Rpc.ServicesServer<Rpcs> | Rpc.ServicesClient<Rpcs>> =>
  Layer.effectContext(Effect.gen(function*() {
    const context = yield* Effect.context<never>()
    const client = yield* entity.client
    const handlers = new Map<string, Rpc.Handler<string>>()
    for (const parentRpc_ of entity.protocol.requests.values()) {
      const parentRpc = parentRpc_ as any as Rpc.AnyWithProps
      const tag = `${entity.type}.${parentRpc._tag}` as const
      const key = `effect/rpc/Rpc/${tag}`
      handlers.set(key, {
        context,
        tag,
        handler: ({ entityId, payload }: any) => (client(entityId) as any)[parentRpc._tag](payload) as any
      } as any)
      handlers.set(`${key}Discard`, {
        context,
        tag,
        handler: ({ entityId, payload }: any) =>
          (client(entityId) as any)[parentRpc._tag](payload, { discard: true }) as any
      } as any)
    }
    return Context.makeUnsafe(handlers)
  }))

/**
 * Union of RPC handler services required to serve the proxy RPCs for an entity.
 *
 * **Details**
 *
 * Includes both the normal prefixed RPC handler and its discard variant.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export type RpcHandlers<Rpcs extends Rpc.Any, Prefix extends string> = Rpcs extends Rpc.Rpc<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ? Rpc.Handler<`${Prefix}.${_Tag}`> | Rpc.Handler<`${Prefix}.${_Tag}Discard`>
  : never
