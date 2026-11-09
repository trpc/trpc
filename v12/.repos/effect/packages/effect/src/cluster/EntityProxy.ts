/**
 * Derives RPC and HTTP API surfaces from clustered entities.
 *
 * The generated APIs let callers use ordinary RPC clients or HTTP routes while
 * the cluster runtime still locates and delivers messages to the entity
 * instance identified by `entityId`. Each generated operation keeps the
 * original payload and success schema, adds cluster client errors, and creates
 * a discard variant for fire-and-forget delivery.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as HttpApiEndpoint from "../http-api/HttpApiEndpoint.ts"
import * as HttpApiGroup from "../http-api/HttpApiGroup.ts"
import * as Rpc from "../rpc/Rpc.ts"
import * as RpcGroup from "../rpc/RpcGroup.ts"
import * as Schema from "../Schema.ts"
import { AlreadyProcessingMessage, EntityNotAssignedToRunner, MailboxFull, PersistenceError } from "./ClusterError.ts"
import type * as Entity from "./Entity.ts"
import type { EntityId } from "./EntityId.ts"

const clientErrors = [
  MailboxFull,
  AlreadyProcessingMessage,
  PersistenceError
] as const

const requestErrors = [
  ...clientErrors,
  EntityNotAssignedToRunner
] as const

/**
 * Derives an `RpcGroup` from an `Entity`.
 *
 * **Example** (Deriving RPC endpoints from an entity)
 *
 * ```ts import.meta.vitest
 * import { Layer, Schema } from "effect"
 * import { ClusterSchema, Entity, EntityProxy, EntityProxyServer } from "effect/cluster"
 * import { Rpc, RpcServer } from "effect/rpc"
 *
 * export const Counter = Entity.make("Counter", [
 *   Rpc.make("Increment", {
 *     payload: { id: Schema.String, amount: Schema.Number },
 *     primaryKey: ({ id }) => id,
 *     success: Schema.Number
 *   })
 * ]).annotateRpcs(ClusterSchema.Persisted, true)
 *
 * // Use EntityProxy.toRpcGroup to create a `RpcGroup` from the Counter entity
 * export class MyRpcs extends EntityProxy.toRpcGroup(Counter) {}
 *
 * // Use EntityProxyServer.layerRpcHandlers to create a layer that implements
 * // the rpc handlers
 * const RpcServerLayer = RpcServer.layer(MyRpcs).pipe(
 *   Layer.provide(EntityProxyServer.layerRpcHandlers(Counter))
 * )
 * const result = [MyRpcs.requests.size, Layer.isLayer(RpcServerLayer)] // => [2, true]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const toRpcGroup = <Type extends string, Rpcs extends Rpc.Any>(
  entity: Entity.Entity<Type, Rpcs>
): RpcGroup.RpcGroup<ConvertRpcs<Rpcs, Type>> => {
  const rpcs: Array<Rpc.Any> = []
  for (const parentRpc_ of entity.protocol.requests.values()) {
    const parentRpc = parentRpc_ as any as Rpc.AnyWithProps
    const payloadSchema = Schema.Struct({
      entityId: Schema.String,
      payload: parentRpc.payloadSchema
    })
    const rpc = Rpc.make(`${entity.type}.${parentRpc._tag}`, {
      payload: payloadSchema,
      error: Schema.Union([parentRpc.errorSchema, ...requestErrors]),
      success: parentRpc.successSchema
    }).annotateMerge(parentRpc.annotations)
    const rpcDiscard = Rpc.make(`${entity.type}.${parentRpc._tag}Discard`, {
      payload: payloadSchema,
      error: Schema.Union(clientErrors)
    }).annotateMerge(parentRpc.annotations)
    rpcs.push(rpc, rpcDiscard)
  }
  return RpcGroup.make(...rpcs) as any as RpcGroup.RpcGroup<ConvertRpcs<Rpcs, Type>>
}

/**
 * Type-level conversion used by `toRpcGroup`.
 *
 * **Details**
 *
 * For each entity RPC, this creates a prefixed request RPC and a discard RPC
 * whose payload includes `entityId`, and whose errors include cluster client
 * errors.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export type ConvertRpcs<Rpcs extends Rpc.Any, Prefix extends string> = Rpcs extends Rpc.Rpc<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ?
    | Rpc.Rpc<
      `${Prefix}.${_Tag}`,
      Schema.Struct<{
        entityId: typeof Schema.String
        payload: _Payload
      }>,
      _Success,
      Schema.Codec<
        _Error["Type"] | MailboxFull | AlreadyProcessingMessage | PersistenceError | EntityNotAssignedToRunner,
        | _Error["Encoded"]
        | typeof MailboxFull["Encoded"]
        | typeof AlreadyProcessingMessage["Encoded"]
        | typeof PersistenceError["Encoded"]
        | typeof EntityNotAssignedToRunner["Encoded"],
        _Error["DecodingServices"],
        _Error["EncodingServices"]
      >
    >
    | Rpc.Rpc<
      `${Prefix}.${_Tag}Discard`,
      Schema.Struct<{
        entityId: typeof Schema.String
        payload: _Payload
      }>,
      typeof Schema.Void,
      Schema.Union<[
        typeof MailboxFull,
        typeof AlreadyProcessingMessage,
        typeof PersistenceError
      ]>
    >
  : never

const entityIdPath = {
  entityId: Schema.String
}

/**
 * Derives an `HttpApiGroup` from an `Entity`.
 *
 * **Example** (Deriving HTTP API endpoints from an entity)
 *
 * ```ts import.meta.vitest
 * import { Layer, Schema } from "effect"
 * import { ClusterSchema, Entity, EntityProxy, EntityProxyServer } from "effect/cluster"
 * import { HttpApi, HttpApiBuilder } from "effect/http-api"
 * import { Rpc } from "effect/rpc"
 *
 * export const Counter = Entity.make("Counter", [
 *   Rpc.make("Increment", {
 *     payload: { id: Schema.String, amount: Schema.Number },
 *     primaryKey: ({ id }) => id,
 *     success: Schema.Number
 *   })
 * ]).annotateRpcs(ClusterSchema.Persisted, true)
 *
 * // Use EntityProxy.toHttpApiGroup to create a `HttpApiGroup` from the
 * // Counter entity
 * export class MyApi extends HttpApi.make("api")
 *   .add(
 *     EntityProxy.toHttpApiGroup("counter", Counter)
 *       .prefix("/counter")
 *   )
 * {}
 *
 * // Use EntityProxyServer.layerHttpApi to create a layer that implements
 * // the handlers for the HttpApiGroup
 * const ApiLayer = HttpApiBuilder.layer(MyApi).pipe(
 *   Layer.provide(EntityProxyServer.layerHttpApi(MyApi, "counter", Counter))
 * )
 * const result = [Object.keys(MyApi.groups.counter.endpoints).length, Layer.isLayer(ApiLayer)] // => [2, true]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const toHttpApiGroup = <const Name extends string, Type extends string, Rpcs extends Rpc.Any>(
  name: Name,
  entity: Entity.Entity<Type, Rpcs>
): HttpApiGroup.HttpApiGroup<Name, ConvertHttpApi<Rpcs>> => {
  let group = HttpApiGroup.make(name)
  for (const parentRpc_ of entity.protocol.requests.values()) {
    const parentRpc = parentRpc_ as any as Rpc.AnyWithProps
    const endpoint = HttpApiEndpoint.post(parentRpc._tag, `/${tagToPath(parentRpc._tag)}/:entityId`, {
      params: entityIdPath,
      payload: parentRpc.payloadSchema,
      success: parentRpc.successSchema,
      error: [parentRpc.errorSchema, ...requestErrors]
    }).annotateMerge(parentRpc.annotations)
    const endpointDiscard = HttpApiEndpoint.post(
      `${parentRpc._tag}Discard`,
      `/${tagToPath(parentRpc._tag)}/:entityId/discard`,
      {
        params: entityIdPath,
        payload: parentRpc.payloadSchema,
        error: clientErrors
      }
    ).annotateMerge(parentRpc.annotations)

    group = group.add(endpoint).add(endpointDiscard) as any
  }
  return group as any as HttpApiGroup.HttpApiGroup<Name, ConvertHttpApi<Rpcs>>
}

// TODO: type level equivalent
const tagToPath = (tag: string): string =>
  tag
    // .replace(/[^a-zA-Z0-9]+/g, "-") // Replace non-alphanumeric characters with hyphen
    // .replace(/([a-z])([A-Z])/g, "$1-$2") // Insert hyphen before uppercase letters
    .toLowerCase()

/**
 * Type-level conversion used by `toHttpApiGroup`.
 *
 * **Details**
 *
 * For each entity RPC, this creates a POST endpoint at `/<tag>/:entityId` and a
 * discard endpoint at `/<tag>/:entityId/discard`, including cluster client
 * errors.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export type ConvertHttpApi<Rpcs extends Rpc.Any> = Rpcs extends Rpc.Rpc<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware,
  infer _Requires
> ?
    | HttpApiEndpoint.HttpApiEndpoint<
      _Tag,
      "POST",
      `/${Lowercase<_Tag>}/:entityId`,
      Schema.Struct<{ entityId: typeof EntityId }>,
      never,
      _Payload,
      never,
      _Success,
      | _Error
      | typeof MailboxFull
      | typeof AlreadyProcessingMessage
      | typeof PersistenceError
      | typeof EntityNotAssignedToRunner
    >
    | HttpApiEndpoint.HttpApiEndpoint<
      `${_Tag}Discard`,
      "POST",
      `/${Lowercase<_Tag>}/:entityId/discard`,
      Schema.Struct<{ entityId: typeof EntityId }>,
      never,
      _Payload,
      never,
      Schema.Void,
      typeof MailboxFull | typeof AlreadyProcessingMessage | typeof PersistenceError
    >
  : never
