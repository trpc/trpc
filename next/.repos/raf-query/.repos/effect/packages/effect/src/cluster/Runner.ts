/**
 * Cluster runner metadata for processes that can host entity shards.
 *
 * A `Runner` combines the stable `RunnerAddress` used to contact a process, the
 * shard groups that process participates in, and the relative weight used when
 * the sharding service distributes shards across healthy runners.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Equal from "../Equal.ts"
import * as Hash from "../Hash.ts"
import { NodeInspectSymbol } from "../Inspectable.ts"
import * as Schema from "../Schema.ts"
import { RunnerAddress } from "./RunnerAddress.ts"

const TypeId = "~effect/cluster/Runner"

/**
 * Represents a cluster runner that can host entities.
 *
 * **Details**
 *
 * Each runner has a unique network `address`, the shard `groups` it participates
 * in, and a relative `weight` used when assigning shards across runners.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class Runner extends Schema.Class<Runner>(TypeId)({
  address: RunnerAddress,
  groups: Schema.Array(Schema.String),
  weight: Schema.Finite
}) {
  /**
   * Formatter for rendering runner values consistently.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static format = Schema.toFormatter(this)

  /**
   * Marks this value as a cluster runner for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [TypeId] = TypeId

  /**
   * Decodes a runner from its JSON string representation.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static readonly decodeSync = Schema.decodeSync(Schema.fromJsonString(Runner))

  /**
   * Encodes a runner to its JSON string representation.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static readonly encodeSync = Schema.encodeSync(Schema.fromJsonString(Runner))

  /**
   * Formats this runner as a string.
   *
   * @stability unstable
   * @since 4.0.0
   */
  override toString(): string {
    return Runner.format(this)
  }

  /**
   * Formats this runner for Node.js inspection.
   *
   * @stability unstable
   * @since 4.0.0
   */
  [NodeInspectSymbol](): string {
    return this.toString()
  }

  /**
   * Compares runners by address and shard-assignment weight.
   *
   * @stability unstable
   * @since 4.0.0
   */
  [Equal.symbol](that: Runner): boolean {
    return this.address[Equal.symbol](that.address) && this.weight === that.weight
  }

  /**
   * Computes a structural hash from the runner address and shard-assignment weight.
   *
   * @stability unstable
   * @since 4.0.0
   */
  [Hash.symbol](): number {
    return Hash.string(`${this.address.toString()}:${this.weight}`)
  }
}

/**
 * Constructs a `Runner` from its network address, shard groups, and relative
 * shard-assignment weight.
 *
 * **When to use**
 *
 * Use to build runner metadata from an existing `RunnerAddress`, shard groups,
 * and relative weight when registering or exchanging a cluster runner.
 *
 * **Details**
 *
 * The `groups` array lists the shard groups the runner can host. During shard
 * assignment, the runner's address is added to each group's hash ring with
 * `weight` as its relative weight.
 *
 * **Gotchas**
 *
 * This helper constructs the value without runtime schema validation, so only
 * pass trusted `RunnerAddress`, `groups`, and `weight` values.
 *
 * @see {@link Runner} for the value created by this helper
 * @see {@link RunnerAddress} for the network address accepted in `props.address`
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (props: {
  readonly address: RunnerAddress
  readonly groups: ReadonlyArray<string>
  readonly weight: number
}): Runner => new Runner(props, { disableChecks: true })
