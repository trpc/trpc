/**
 * Network addresses for locating cluster runners. A `RunnerAddress` stores the
 * host and port for a runner and provides schema support, structural equality,
 * hashing, Node.js inspection, and a stable primary key formatted from the host
 * and port.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Equal from "../Equal.ts"
import * as Hash from "../Hash.ts"
import { NodeInspectSymbol } from "../Inspectable.ts"
import * as PrimaryKey from "../PrimaryKey.ts"
import * as Schema from "../Schema.ts"

const TypeId = "~effect/cluster/RunnerAddress"

/**
 * Represents the network address of a cluster runner, identified by host and
 * port.
 *
 * **When to use**
 *
 * Use to represent the host and port that identify a runner in cluster routing,
 * registration, and health checks.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class RunnerAddress extends Schema.Class<RunnerAddress>(TypeId)({
  host: Schema.String,
  port: Schema.Int
}) {
  /**
   * Marks this value as a cluster runner address for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [TypeId] = TypeId;

  /**
   * Compares runner addresses by host and port.
   *
   * @stability unstable
   * @since 4.0.0
   */
  [Equal.symbol](that: RunnerAddress): boolean {
    return this.host === that.host && this.port === that.port
  }

  /**
   * Computes a structural hash from the host and port.
   *
   * @stability unstable
   * @since 4.0.0
   */
  [Hash.symbol]() {
    return Hash.string(`${this.host}:${this.port}`)
  }

  /**
   * Stable primary key used to identify the runner address.
   *
   * @stability unstable
   * @since 4.0.0
   */
  [PrimaryKey.symbol](): string {
    return `${this.host}:${this.port}`
  }

  /**
   * Formats the runner address with its host and port.
   *
   * @stability unstable
   * @since 4.0.0
   */
  override toString(): string {
    return `RunnerAddress(${this.host}:${this.port})`
  }

  /**
   * Formats the runner address for Node.js inspection.
   *
   * @stability unstable
   * @since 4.0.0
   */
  [NodeInspectSymbol](): string {
    return this.toString()
  }
}

/**
 * Constructs a `RunnerAddress` from a host and port.
 *
 * **When to use**
 *
 * Use to create the stable network identity for a cluster runner when
 * configuring sharding, registering runner metadata, or targeting a runner by
 * host and port.
 *
 * **Details**
 *
 * The returned `RunnerAddress` stores the supplied `host` and `port`. Equality,
 * hashing, and the primary key use both fields, with the primary key formatted
 * as `host:port`.
 *
 * **Gotchas**
 *
 * `make` does not normalize the host. Pass the host string exactly as the
 * cluster routing and storage layers should identify it.
 *
 * @see {@link RunnerAddress} for the constructed address type and its equality, hashing, primary-key, and formatting behavior
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (host: string, port: number): RunnerAddress =>
  new RunnerAddress({ host, port }, { disableChecks: true })
