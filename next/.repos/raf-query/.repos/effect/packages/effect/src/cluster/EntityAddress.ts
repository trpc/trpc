/**
 * The `EntityAddress` module defines the value used to locate an entity within
 * a cluster. An address combines the entity type, entity id, and shard id so
 * messages, persisted envelopes, workflow executions, and entity managers can
 * agree on the same routing target.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Equal from "../Equal.ts"
import * as Hash from "../Hash.ts"
import * as Schema from "../Schema.ts"
import { EntityId } from "./EntityId.ts"
import { EntityType } from "./EntityType.ts"
import { ShardId } from "./ShardId.ts"

const TypeId = "~effect/cluster/EntityAddress"

/**
 * Represents the unique address of an entity within the cluster.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class EntityAddress extends Schema.Class<EntityAddress>(TypeId)({
  shardId: ShardId,
  entityType: EntityType,
  entityId: EntityId
}) {
  /**
   * Marks this value as a cluster entity address for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [TypeId] = TypeId

  /**
   * Formats the entity type, entity id, and shard id as a readable address.
   *
   * @stability unstable
   * @since 4.0.0
   */
  override toString() {
    return `EntityAddress(${this.entityType.toString()}, ${this.entityId.toString()}, ${this.shardId.toString()})`
  }

  /**
   * Compares entity addresses by entity type, entity id, and shard id.
   *
   * @stability unstable
   * @since 4.0.0
   */
  [Equal.symbol](that: EntityAddress): boolean {
    return this.entityType === that.entityType && this.entityId === that.entityId &&
      Equal.equals(this.shardId, that.shardId)
  }

  /**
   * Computes a structural hash from the entity type, entity id, and shard id.
   *
   * @stability unstable
   * @since 4.0.0
   */
  [Hash.symbol]() {
    return Hash.string(`${this.entityType}:${this.entityId}:${this.shardId.toString()}`)
  }
}
/**
 * Constructs an `EntityAddress` from a shard ID, entity type, and entity ID.
 *
 * **When to use**
 *
 * Use to create the routing target for a known entity type and entity id after
 * resolving that id to the `ShardId` assigned by the entity's shard group.
 *
 * **Details**
 *
 * The returned `EntityAddress` stores the supplied `shardId`, `entityType`, and
 * `entityId`. Equality and hashing include all three fields.
 *
 * **Gotchas**
 *
 * `make` does not choose the shard for an entity. Use the same shard group
 * logic as the entity definition; a different `shardId` makes a different
 * address even when the entity type and entity id match.
 *
 * @see {@link EntityAddress} for the equality, hashing, and string formatting behavior of constructed addresses
 * @see {@link ShardId} for the shard identifier included in the address
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (options: {
  readonly shardId: ShardId
  readonly entityType: EntityType
  readonly entityId: EntityId
}): EntityAddress => new EntityAddress(options, { disableChecks: true })
