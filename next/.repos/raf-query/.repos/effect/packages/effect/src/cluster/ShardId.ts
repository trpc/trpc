/**
 * The `ShardId` module models the address of a shard inside an Effect Cluster
 * shard group. A shard id is made from a string `group` and numeric `id`, and
 * the module gives that pair stable equality, hashing, primary-key behavior,
 * schema support, and conversion to and from the `group:id` string form used by
 * routing and storage boundaries.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Equal from "../Equal.ts"
import * as Hash from "../Hash.ts"
import { hasProperty } from "../Predicate.ts"
import * as PrimaryKey from "../PrimaryKey.ts"
import * as S from "../Schema.ts"
import * as SchemaGetter from "../SchemaGetter.ts"

const TypeId = "~effect/cluster/ShardId"

/**
 * Identifier for a shard within a shard group, with equality, hashing, and primary
 * key behavior based on the `group:id` string form.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ShardId extends Equal.Equal, Hash.Hash, PrimaryKey.PrimaryKey {
  readonly [TypeId]: typeof TypeId
  readonly group: string
  readonly id: number
}

/**
 * Returns `true` when the value carries the `ShardId` runtime marker.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isShardId = (u: unknown): u is ShardId => hasProperty(u, TypeId)

/**
 * Schema for shard identifiers encoded as `{ group, id }` objects and decoded
 * via `make`.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ShardId = S.declare(isShardId, {
  toCodecJson: () =>
    S.link<ShardId>()(
      S.Struct({
        group: S.String,
        id: S.Int
      }),
      {
        decode: SchemaGetter.transform(({ group, id }) => make(group, id)),
        encode: SchemaGetter.passthrough()
      }
    )
})

/**
 * Creates or reuses the cached `ShardId` for the specified shard group and numeric
 * id.
 *
 * **When to use**
 *
 * Use to create a `ShardId` when the shard group and numeric id are already
 * known, such as after a routing decision or after decoding stored shard-id
 * parts.
 *
 * **Details**
 *
 * Repeated calls with the same `group` and `id` return the same cached
 * `ShardId` instance. The returned value stores those fields, compares by
 * `group` and `id`, formats as `group:id`, and uses that string form for
 * hashing and primary keys.
 *
 * **Gotchas**
 *
 * `make` does not compute a shard from an entity id or check whether the shard
 * belongs to the current sharding configuration. Pass the shard group and
 * numeric id produced by the routing or storage layer.
 *
 * @see {@link toString} for formatting an existing shard id as `group:id`
 * @see {@link fromString} for constructing a cached shard id from the `group:id` string form
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (group: string, id: number): ShardId => {
  const key = `${group}:${id}`
  let shardId = shardIdCache.get(key)
  if (!shardId) {
    shardId = makeProto(group, id)
    shardIdCache.set(key, shardId)
  }
  return shardId
}

const shardIdCache = new Map<string, ShardId>()

const makeProto = (group: string, id: number): ShardId => {
  const self = Object.create(ShardIdProto)
  self.group = group
  self.id = id
  return self
}

const ShardIdProto = {
  [TypeId]: TypeId,
  [Equal.symbol](this: ShardId, that: ShardId): boolean {
    return this.group === that.group && this.id === that.id
  },
  [Hash.symbol](this: ShardId): number {
    return Hash.string(this.toString())
  },
  [PrimaryKey.symbol](this: ShardId): string {
    return this.toString()
  },
  toString(this: ShardId): string {
    return `${this.group}:${this.id}`
  }
}

/**
 * Formats a shard identifier as `group:id`.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toString = (shardId: {
  readonly group: string
  readonly id: number
}): string => {
  return `${shardId.group}:${shardId.id}`
}
/**
 * Parses a `group:id` string into plain shard id parts.
 *
 * **Details**
 *
 * Throws an `Error` when the string has no colon separator or the id segment is
 * not numeric.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export function fromStringEncoded(s: string): {
  readonly group: string
  readonly id: number
} {
  const index = s.lastIndexOf(":")
  if (index === -1) {
    throw new Error(`Invalid ShardId format`)
  }
  const group = s.substring(0, index)
  const id = Number(s.substring(index + 1))
  if (isNaN(id)) {
    throw new Error(`ShardId id must be a number`)
  }
  return { group, id }
}

/**
 * Parses a `group:id` string into a cached `ShardId`.
 *
 * **Details**
 *
 * Throws an `Error` when the string has no colon separator or the id segment is
 * not numeric.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export function fromString(s: string): ShardId {
  const encoded = fromStringEncoded(s)
  return make(encoded.group, encoded.id)
}
