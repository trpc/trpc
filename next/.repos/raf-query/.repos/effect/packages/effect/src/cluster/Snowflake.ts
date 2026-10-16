/**
 * Creates compact, sortable identifiers for cluster messages and runtime
 * events.
 *
 * A snowflake id is a branded `bigint` built from a millisecond timestamp, a
 * machine id, and a sequence number for that machine. The parts make generated
 * ids sortable by time while still being unique for a runner. This module
 * includes schemas for bigint and string encodings, helpers for creating and
 * reading ids, and a `Clock`-backed generator service for cluster runtime use.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as Brand from "../Brand.ts"
import { Clock } from "../Clock.ts"
import * as Context from "../Context.ts"
import * as DateTime from "../DateTime.ts"
import * as Effect from "../Effect.ts"
import { identity } from "../Function.ts"
import * as Layer from "../Layer.ts"
import * as Schema from "../Schema.ts"
import * as SchemaTransformation from "../SchemaTransformation.ts"
import type { MachineId } from "./MachineId.ts"

/**
 * Runtime brand identifier for cluster snowflake ids.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId = "~effect/cluster/Snowflake"

/**
 * Type-level representation of the cluster snowflake brand identifier.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = typeof TypeId

/**
 * Branded bigint identifier composed from a timestamp, machine id, and per-machine
 * sequence number.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Snowflake = Brand.Branded<bigint, TypeId>

/**
 * Constructs a branded cluster snowflake id from a bigint or bigint-compatible
 * string.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Snowflake = (input: string | number | bigint): Snowflake =>
  typeof input === "bigint" ? input as Snowflake : BigInt(input) as Snowflake

/**
 * Namespace containing support types for snowflake parts and generators.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Snowflake {
  /**
   * Decoded components of a snowflake id: Unix timestamp milliseconds, machine id,
   * and sequence number.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface Parts {
    readonly timestamp: number
    readonly machineId: MachineId
    readonly sequence: number
  }

  /**
   * Stateful generator for runner-local snowflake ids, exposing an unsafe
   * synchronous `nextUnsafe` operation and an effectful machine id setter.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface Generator {
    readonly nextUnsafe: () => Snowflake
    readonly setMachineId: (machineId: MachineId) => Effect.Effect<void>
  }
}

/**
 * Schema type for snowflake ids represented as branded bigints.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export interface SnowflakeFromBigInt extends Schema.brand<Schema.BigInt, TypeId> {}

/**
 * Schema for snowflake ids represented as branded bigints.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const SnowflakeFromBigInt: SnowflakeFromBigInt = Schema.BigInt.pipe(Schema.brand(TypeId))

/**
 * Schema type for snowflake ids decoded from strings into branded bigints.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export interface SnowflakeFromString extends Schema.decodeTo<SnowflakeFromBigInt, Schema.String> {}

/**
 * Schema that decodes snowflake ids from strings into branded bigints and encodes
 * them back to strings.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const SnowflakeFromString: SnowflakeFromString = Schema.String.pipe(
  Schema.decodeTo(SnowflakeFromBigInt, SchemaTransformation.bigintFromString)
)

/**
 * Defines the custom snowflake epoch in Unix milliseconds.
 *
 * @stability unstable
 * @category constants
 * @since 4.0.0
 */
export const constEpochMillis: number = Date.UTC(2025, 0, 1)

const sinceUnixEpoch = constEpochMillis - Date.UTC(1970, 0, 1)
const constBigInt12 = BigInt(12)
const constBigInt22 = BigInt(22)
const constBigInt1024 = BigInt(1024)
const constBigInt4096 = BigInt(4096)

/**
 * Creates a branded snowflake id from a timestamp, machine id, and sequence number,
 * using the custom snowflake epoch and 10-bit machine id and 12-bit sequence
 * fields.
 *
 * **When to use**
 *
 * Use to pack known timestamp, machine id, and sequence parts into a branded
 * snowflake id.
 *
 * **Gotchas**
 *
 * Machine id values are encoded modulo 1024, and sequence values modulo 4096;
 * values outside those ranges wrap instead of being rejected.
 *
 * @see {@link toParts} for the inverse operation that decodes a snowflake id into timestamp, machine id, and sequence parts
 * @see {@link makeGenerator} for generating ids with Clock-backed timestamp and sequence management
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (options: {
  readonly machineId: MachineId
  readonly sequence: number
  readonly timestamp: number
}): Snowflake =>
  (BigInt(options.timestamp - constEpochMillis) << constBigInt22
    | (BigInt(options.machineId % 1024) << constBigInt12)
    | BigInt(options.sequence % 4096)) as Snowflake

/**
 * Extracts the Unix timestamp in milliseconds from a snowflake id.
 *
 * @stability unstable
 * @category getters
 * @since 4.0.0
 */
export const timestamp = (snowflake: Snowflake): number => Number(snowflake >> constBigInt22) + sinceUnixEpoch

/**
 * Extracts the timestamp from a snowflake id as a `DateTime.Utc`.
 *
 * @stability unstable
 * @category getters
 * @since 4.0.0
 */
export const dateTime = (snowflake: Snowflake): DateTime.Utc => DateTime.makeUnsafe(timestamp(snowflake))

/**
 * Extracts the machine id component from a snowflake id.
 *
 * @stability unstable
 * @category getters
 * @since 4.0.0
 */
export const machineId = (snowflake: Snowflake): MachineId =>
  Number((snowflake >> constBigInt12) % constBigInt1024) as MachineId

/**
 * Extracts the per-machine sequence component from a snowflake id.
 *
 * @stability unstable
 * @category getters
 * @since 4.0.0
 */
export const sequence = (snowflake: Snowflake): number => Number(snowflake % constBigInt4096)

/**
 * Decomposes a snowflake id into its timestamp, machine id, and sequence parts.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toParts = (snowflake: Snowflake): Snowflake.Parts => ({
  timestamp: timestamp(snowflake),
  machineId: machineId(snowflake),
  sequence: sequence(snowflake)
})

/**
 * Creates a stateful snowflake generator using `Clock`.
 *
 * **Details**
 *
 * The generator starts with a random machine id, never moves generated timestamps
 * backward, resets the sequence each millisecond, and advances the timestamp when
 * more than 4096 ids are requested in the same millisecond.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeGenerator: Effect.Effect<Snowflake.Generator> = Effect.gen(function*() {
  let machineId = Math.floor(Math.random() * 1024) as MachineId
  const clock = yield* Clock

  let sequence = 0
  let sequenceAt = Math.floor(clock.currentTimeMillisUnsafe())

  return identity<Snowflake.Generator>({
    setMachineId: (newMachineId) =>
      Effect.sync(() => {
        machineId = newMachineId
      }),
    nextUnsafe() {
      let now = Math.floor(clock.currentTimeMillisUnsafe())

      // account for clock drift, only allow time to move forward
      if (now < sequenceAt) {
        now = sequenceAt
      } else if (now > sequenceAt) {
        // reset sequence if we're in a new millisecond
        sequence = 0
        sequenceAt = now
      } else if (sequence >= 4096) {
        // if we've hit the max sequence for this millisecond, go to the next
        // millisecond
        sequenceAt++
        sequence = 0
      }

      return make({
        machineId,
        sequence: sequence++,
        timestamp: sequenceAt
      })
    }
  })
})

/**
 * Context service for a stateful snowflake id generator.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Generator extends Context.Service<
  Generator,
  Snowflake.Generator
>()("effect/cluster/Snowflake/Generator") {}

/**
 * Layer that provides the default snowflake `Generator` service.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerGenerator: Layer.Layer<Generator> = Layer.effect(Generator)(makeGenerator)
