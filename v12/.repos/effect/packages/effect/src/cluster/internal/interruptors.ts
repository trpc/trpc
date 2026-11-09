import * as Effect from "../../Effect.ts"
import type { EntityAddress } from "../EntityAddress.ts"
import type { ShardId } from "../ShardId.ts"

const counts = new Map<string, number>()

const acquire = (key: string) => {
  counts.set(key, (counts.get(key) ?? 0) + 1)
}

const release = (key: string) => {
  const n = counts.get(key)
  if (n === undefined) return
  if (n <= 1) counts.delete(key)
  else counts.set(key, n - 1)
}

const around = <A, E, R>(key: string, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.suspend(() => {
    acquire(key)
    return Effect.ensuring(effect, Effect.sync(() => release(key)))
  })

const entityKey = (address: EntityAddress): string =>
  `entity:${address.entityType}:${address.entityId}:${address.shardId.toString()}`

const shardKey = (shardId: ShardId): string => `shard:${shardId.toString()}`

const entityTypeKey = (entityType: string): string => `type:${entityType}`

/**
 * @internal
 */
export const acquireEntity = (address: EntityAddress): void => acquire(entityKey(address))

/**
 * @internal
 */
export const releaseEntity = (address: EntityAddress): void => release(entityKey(address))

/**
 * @internal
 */
export const acquireEntityType = (entityType: string): void => acquire(entityTypeKey(entityType))

/**
 * @internal
 */
export const releaseEntityType = (entityType: string): void => release(entityTypeKey(entityType))

/**
 * @internal
 */
export const aroundEntity = <A, E, R>(
  address: EntityAddress,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> => around(entityKey(address), effect)

/**
 * @internal
 */
export const aroundShard = <A, E, R>(
  shardId: ShardId,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> => around(shardKey(shardId), effect)

/**
 * @internal
 */
export const aroundEntityType = <A, E, R>(
  entityType: string,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> => around(entityTypeKey(entityType), effect)

/**
 * @internal
 */
export const isActive = (address: EntityAddress): boolean =>
  counts.has(entityKey(address)) ||
  counts.has(shardKey(address.shardId)) ||
  counts.has(entityTypeKey(address.entityType))

/**
 * @internal
 */
export const isShardActive = (shardId: ShardId): boolean => counts.has(shardKey(shardId))
