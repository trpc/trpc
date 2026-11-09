/**
 * Branded integer identifiers for cluster runners. A `MachineId` marks the
 * machine component used by cluster services, especially snowflake id
 * generation, while keeping the value distinct from an ordinary `number` in
 * TypeScript APIs.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Schema from "../Schema.ts"

/**
 * Schema for branded integer machine identifiers used by the cluster.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const MachineId = Schema.Int.pipe(
  Schema.brand("~effect/cluster/MachineId"),
  Schema.annotate({
    toFormatter: () => (machineId: string) => `MachineId(${machineId})`
  })
)

/**
 * Branded integer type representing a cluster machine ID.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type MachineId = typeof MachineId.Type

/**
 * Brands a number as a `MachineId`.
 *
 * **When to use**
 *
 * Use to turn a trusted numeric machine id into the branded type when
 * implementing runner storage adapters or configuring snowflake generation.
 *
 * **Details**
 *
 * The branded value is the original number at runtime.
 *
 * **Gotchas**
 *
 * `make` does not validate integer input or enforce the snowflake machine-id
 * range. Snowflake ids encode the machine component modulo 1024.
 *
 * @see {@link MachineId} for the schema that validates branded integer machine identifiers
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (id: number): MachineId => id as MachineId
