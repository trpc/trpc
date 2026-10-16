/**
 * The `SingletonAddress` module models the runtime address assigned to a cluster
 * singleton registration. The address pairs the singleton `name` with the
 * `ShardId` selected from that name and its shard group, giving sharding one
 * stable value for registration events, equality, hashing, and local singleton
 * fiber tracking.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Equal from "../Equal.ts"
import * as Hash from "../Hash.ts"
import * as Schema from "../Schema.ts"
import { ShardId } from "./ShardId.ts"

const TypeId = "~effect/cluster/SingletonAddress"

/**
 * Represents the unique address of an singleton within the cluster.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class SingletonAddress extends Schema.Class<SingletonAddress>(TypeId)({
  shardId: ShardId,
  name: Schema.String
}) {
  /**
   * Marks this value as a cluster singleton address for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [TypeId] = TypeId;
  /**
   * Computes a structural hash from the singleton name and shard id.
   *
   * @stability unstable
   * @since 4.0.0
   */
  [Hash.symbol]() {
    return Hash.string(`${this.name}:${this.shardId.toString()}`)
  }
  /**
   * Compares singleton addresses by name and shard id.
   *
   * @stability unstable
   * @since 4.0.0
   */
  [Equal.symbol](that: SingletonAddress): boolean {
    return this.name === that.name && Equal.equals(this.shardId, that.shardId)
  }
}
