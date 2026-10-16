/**
 * Represents immutable spans of time.
 *
 * A `Duration` can be finite, positive infinity, or negative infinity. It is
 * the standard representation for delays, timeouts, intervals, and
 * time-to-live values across Effect APIs. This module includes constructors
 * from common input shapes, unit conversions, comparisons, arithmetic,
 * formatting, and reusable reducer or combiner helpers.
 *
 * @since 2.0.0
 */
import * as Combiner from "./Combiner.ts"
import * as Equal from "./Equal.ts"
import type * as Equ from "./Equivalence.ts"
import { dual, identity } from "./Function.ts"
import * as Hash from "./Hash.ts"
import type * as Inspectable from "./Inspectable.ts"
import { NodeInspectSymbol } from "./Inspectable.ts"
import * as Option from "./Option.ts"
import * as order from "./Order.ts"
import type { Pipeable } from "./Pipeable.ts"
import { pipeArguments } from "./Pipeable.ts"
import { hasProperty, isNumber } from "./Predicate.ts"
import * as Reducer from "./Reducer.ts"

const TypeId = "~effect/Duration"

const bigint0 = BigInt(0)
const bigint1 = BigInt(1)
const bigint2 = BigInt(2)
const bigint10 = BigInt(10)
const bigint24 = BigInt(24)
const bigint60 = BigInt(60)
const bigint1e3 = BigInt(1_000)
const bigint1e6 = BigInt(1_000_000)
const bigint1e9 = BigInt(1_000_000_000)

const roundTiesAwayFromZero = (input: number): bigint =>
  BigInt(input < 0 ? Math.ceil(input - 0.5) : Math.floor(input + 0.5))

const roundMillisToNanos = (millis: number): bigint => roundTiesAwayFromZero(millis * 1_000_000)

const parseNanos = (input: string, scale: bigint): bigint => {
  const decimalIndex = input.indexOf(".")
  if (decimalIndex === -1) return BigInt(input) * scale

  const isNegative = input[0] === "-"
  const fractional = input.slice(decimalIndex + 1)
  const fractionalScale = bigint10 ** BigInt(fractional.length)
  const scaled = (
    BigInt(input.slice(isNegative ? 1 : 0, decimalIndex)) * fractionalScale + BigInt(fractional)
  ) * scale
  const rounded = scaled / fractionalScale +
    (scaled % fractionalScale * bigint2 >= fractionalScale ? bigint1 : bigint0)
  return isNegative ? -rounded : rounded
}

const nanosToHrTime = (nanos: bigint): [seconds: number, nanos: number] => {
  const sign = nanos < bigint0 ? -bigint1 : bigint1
  const absolute = nanos < bigint0 ? -nanos : nanos
  return [
    Number(sign * (absolute / bigint1e9)),
    Number(sign * (absolute % bigint1e9))
  ]
}

/**
 * Represents a span of time with high precision, supporting operations from
 * nanoseconds to weeks.
 *
 * **When to use**
 *
 * Use to model elapsed time, delays, timeouts, schedule intervals, and cache
 * TTLs as immutable duration values.
 *
 * @see {@link Input} for values accepted by APIs that decode duration-like
 * inputs
 * @see {@link DurationValue} for the tagged representation exposed by the
 * `value` field
 *
 * @category models
 * @since 2.0.0
 */
export interface Duration extends Equal.Equal, Pipeable, Inspectable.Inspectable {
  readonly [TypeId]: typeof TypeId
  readonly value: DurationValue
}

/**
 * Tagged representation of a `Duration` value.
 *
 * **When to use**
 *
 * Use when modeling or inspecting the exact tagged representation stored in a
 * `Duration`, including finite millisecond or nanosecond values and infinite
 * sentinels.
 *
 * **Details**
 *
 * A duration is represented as milliseconds, nanoseconds, positive infinity,
 * or negative infinity.
 *
 * @see {@link Duration} for the public type whose `value` field contains this
 * representation
 * @see {@link match} for pattern matching without reading `value` directly
 *
 * @category models
 * @since 2.0.0
 */
export type DurationValue =
  | { _tag: "Millis"; millis: number }
  | { _tag: "Nanos"; nanos: bigint }
  | { _tag: "Infinity" }
  | { _tag: "NegativeInfinity" }

/**
 * Valid time units that can be used in duration string representations.
 *
 * **When to use**
 *
 * Use when typing the unit portion of duration string inputs accepted by
 * `Duration.Input`.
 *
 * @see {@link Input} for the full duration input union
 *
 * @category models
 * @since 2.0.0
 */
export type Unit =
  | "nano"
  | "nanos"
  | "micro"
  | "micros"
  | "milli"
  | "millis"
  | "second"
  | "seconds"
  | "minute"
  | "minutes"
  | "hour"
  | "hours"
  | "day"
  | "days"
  | "week"
  | "weeks"

/**
 * Valid input types that can be converted to a Duration.
 *
 * **When to use**
 *
 * Use when an API should accept any value that Effect can convert into a
 * `Duration`, including existing durations, millisecond numbers, nanosecond
 * bigints, high-resolution tuples, duration strings, infinity strings, or
 * duration objects.
 *
 * **Details**
 *
 * String inputs accept values like `"10 seconds"`, `"500 millis"`,
 * `"Infinity"`, and `"-Infinity"`. Finite fractional values that are
 * normalized to nanoseconds are rounded to the nearest nanosecond, with ties
 * away from zero.
 *
 * @see {@link fromInput} for safe conversion to `Option`
 * @see {@link fromInputUnsafe} for throwing conversion
 * @see {@link DurationObject} for object-shaped duration input
 * @see {@link Unit} for supported string units
 *
 * @category models
 * @since 4.0.0
 */
export type Input =
  | Duration
  | number // millis
  | bigint // nanos
  | readonly [seconds: number, nanos: number]
  | `${number} ${Unit}`
  | "Infinity"
  | "-Infinity"
  | DurationObject

/**
 * An object with optional duration components that can be combined to create
 * a Duration. All fields are optional and additive.
 *
 * **Details**
 *
 * Compatible with Temporal.Duration-like objects.
 *
 * **Example** (Combining duration object fields)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.fromInputUnsafe({ seconds: 30 }) // => Duration.seconds(30)
 * Duration.fromInputUnsafe({ days: 1 }) // => Duration.days(1)
 * Duration.fromInputUnsafe({ seconds: 1, nanoseconds: 500 }) // => Duration.nanos(1_000_000_500n)
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export interface DurationObject {
  readonly weeks?: number | undefined
  readonly days?: number | undefined
  readonly hours?: number | undefined
  readonly minutes?: number | undefined
  readonly seconds?: number | undefined
  readonly milliseconds?: number | undefined
  readonly microseconds?: number | undefined
  readonly nanoseconds?: number | undefined
}

const DURATION_REGEXP = /^(-?\d+(?:\.\d+)?)\s+(nanos?|micros?|millis?|seconds?|minutes?|hours?|days?|weeks?)$/

/**
 * Decodes a `Duration.Input` into a `Duration`.
 *
 * **When to use**
 *
 * Use when the input has already been validated or comes from a trusted source
 * and throwing is acceptable for invalid duration syntax.
 *
 * **Gotchas**
 *
 * If the input is not a valid `Duration.Input`, it throws an error.
 *
 * **Example** (Decoding duration inputs)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.fromInputUnsafe(1000) // => Duration.millis(1000)
 * Duration.fromInputUnsafe("5 seconds") // => Duration.seconds(5)
 * Duration.fromInputUnsafe("Infinity") // => Duration.infinity
 * Duration.fromInputUnsafe([2, 500_000_000]) // => Duration.nanos(2_500_000_000n)
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromInputUnsafe = (input: Input): Duration => {
  switch (typeof input) {
    case "number":
      return millis(input)
    case "bigint":
      return nanos(input)
    case "string": {
      if (input === "Infinity") {
        return infinity
      }
      if (input === "-Infinity") {
        return negativeInfinity
      }
      const match = DURATION_REGEXP.exec(input)
      if (!match) break
      const [_, valueStr, unit] = match
      if (unit === "nano" || unit === "nanos") {
        return nanos(parseNanos(valueStr, bigint1))
      }
      if (unit === "micro" || unit === "micros") {
        return nanos(parseNanos(valueStr, bigint1e3))
      }
      const value = Number(valueStr)
      switch (unit) {
        case "milli":
        case "millis":
          return millis(value)
        case "second":
        case "seconds":
          return seconds(value)
        case "minute":
        case "minutes":
          return minutes(value)
        case "hour":
        case "hours":
          return hours(value)
        case "day":
        case "days":
          return days(value)
        case "week":
        case "weeks":
          return weeks(value)
      }
      break
    }
    case "object": {
      if (input === null) break
      if (TypeId in input) return input as Duration
      if (Array.isArray(input)) {
        if (input.length !== 2 || !input.every(isNumber)) {
          return invalid(input)
        }
        if (Number.isNaN(input[0]) || Number.isNaN(input[1])) {
          return zero
        }
        if (input[0] === -Infinity || input[1] === -Infinity) {
          return negativeInfinity
        }
        if (input[0] === Infinity || input[1] === Infinity) {
          return infinity
        }
        return make(roundTiesAwayFromZero(input[0] * 1_000_000_000 + input[1]))
      }
      const obj = input as DurationObject
      let millis = 0
      // we can use truthy checks here, because 0 can be ignored
      if (obj.weeks) millis += obj.weeks * 604_800_000
      if (obj.days) millis += obj.days * 86_400_000
      if (obj.hours) millis += obj.hours * 3_600_000
      if (obj.minutes) millis += obj.minutes * 60_000
      if (obj.seconds) millis += obj.seconds * 1_000
      if (obj.milliseconds) millis += obj.milliseconds
      if (!obj.microseconds && !obj.nanoseconds) return make(millis)
      return make(roundTiesAwayFromZero(
        millis * 1_000_000 + (obj.microseconds ?? 0) * 1_000 + (obj.nanoseconds ?? 0)
      ))
    }
  }
  return invalid(input)
}

const invalid = (input: unknown): never => {
  throw new Error(`Invalid Input: ${input}`)
}

/**
 * Decodes a `Input` value into a `Duration` safely, returning
 * `Option.none()` if decoding fails.
 *
 * **Example** (Safely decoding duration inputs)
 *
 * ```ts import.meta.vitest
 * import { Duration, Option } from "effect"
 *
 * Duration.fromInput(1000) // => Option.some(Duration.seconds(1))
 * Duration.fromInput("invalid" as any) // => Option.none()
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromInput: (u: Input) => Option.Option<Duration> = Option.liftThrowable(
  fromInputUnsafe
)

const zeroDurationValue: DurationValue = { _tag: "Millis", millis: 0 }
const infinityDurationValue: DurationValue = { _tag: "Infinity" }
const negativeInfinityDurationValue: DurationValue = { _tag: "NegativeInfinity" }

const DurationProto: Omit<Duration, "value"> = {
  [TypeId]: TypeId,
  [Hash.symbol](this: Duration) {
    // Hash equal finite durations using the same canonical nanoseconds
    // representation used by `equals`.
    switch (this.value._tag) {
      case "Millis": {
        const nanos = this.value.millis * 1_000_000
        return Number.isFinite(nanos) ? Hash.hash(roundTiesAwayFromZero(nanos)) : Hash.number(this.value.millis)
      }
      case "Nanos":
        return Hash.hash(this.value.nanos)
      default:
        return Hash.structure(this.value)
    }
  },
  [Equal.symbol](this: Duration, that: unknown): boolean {
    return isDuration(that) && equals(this, that)
  },
  toString(this: Duration) {
    switch (this.value._tag) {
      case "Infinity":
        return "Infinity"
      case "NegativeInfinity":
        return "-Infinity"
      case "Nanos":
        return `${this.value.nanos} nanos`
      case "Millis":
        return `${this.value.millis} millis`
    }
  },
  toJSON(this: Duration) {
    switch (this.value._tag) {
      case "Millis":
        return { _id: "Duration", _tag: "Millis", millis: this.value.millis }
      case "Nanos":
        return { _id: "Duration", _tag: "Nanos", nanos: String(this.value.nanos) }
      case "Infinity":
        return { _id: "Duration", _tag: "Infinity" }
      case "NegativeInfinity":
        return { _id: "Duration", _tag: "NegativeInfinity" }
    }
  },
  [NodeInspectSymbol]() {
    return this.toJSON()
  },
  pipe() {
    return pipeArguments(this, arguments)
  }
} as const

const make = (input: number | bigint): Duration => {
  const duration = Object.create(DurationProto)
  if (typeof input === "number") {
    if (isNaN(input) || input === 0 || Object.is(input, -0)) {
      duration.value = zeroDurationValue
    } else if (!Number.isFinite(input)) {
      duration.value = input > 0 ? infinityDurationValue : negativeInfinityDurationValue
    } else if (!Number.isInteger(input)) {
      duration.value = { _tag: "Nanos", nanos: roundMillisToNanos(input) }
    } else {
      duration.value = { _tag: "Millis", millis: input }
    }
  } else if (input === bigint0) {
    duration.value = zeroDurationValue
  } else {
    duration.value = { _tag: "Nanos", nanos: input }
  }
  return duration
}

/**
 * Checks whether a value is a Duration.
 *
 * **Example** (Checking for durations)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.isDuration(Duration.seconds(1)) // => true
 * Duration.isDuration(1000) // => false
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const isDuration = (u: unknown): u is Duration => hasProperty(u, TypeId)

/**
 * Checks whether a Duration is finite (not infinite).
 *
 * **Example** (Checking finite durations)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.isFinite(Duration.seconds(5)) // => true
 * Duration.isFinite(Duration.infinity) // => false
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const isFinite = (self: Duration): boolean =>
  self.value._tag !== "Infinity" && self.value._tag !== "NegativeInfinity"

/**
 * Checks whether a Duration is zero.
 *
 * **Example** (Checking for zero durations)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.isZero(Duration.zero) // => true
 * Duration.isZero(Duration.seconds(1)) // => false
 * ```
 *
 * @category predicates
 * @since 3.5.0
 */
export const isZero = (self: Duration): boolean => {
  switch (self.value._tag) {
    case "Millis":
      return self.value.millis === 0
    case "Nanos":
      return self.value.nanos === bigint0
    case "Infinity":
    case "NegativeInfinity":
      return false
  }
}

/**
 * Returns `true` if the duration is negative (strictly less than zero).
 *
 * **Example** (Checking for negative durations)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.isNegative(Duration.seconds(-5)) // => true
 * Duration.isNegative(Duration.zero) // => false
 * Duration.isNegative(Duration.negativeInfinity) // => true
 * ```
 *
 * @category predicates
 * @since 4.0.0
 */
export const isNegative = (self: Duration): boolean => {
  switch (self.value._tag) {
    case "Millis":
      return self.value.millis < 0
    case "Nanos":
      return self.value.nanos < bigint0
    case "NegativeInfinity":
      return true
    case "Infinity":
      return false
  }
}

/**
 * Returns `true` if the duration is positive (strictly greater than zero).
 *
 * **Example** (Checking for positive durations)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.isPositive(Duration.seconds(5)) // => true
 * Duration.isPositive(Duration.zero) // => false
 * Duration.isPositive(Duration.infinity) // => true
 * ```
 *
 * @category predicates
 * @since 4.0.0
 */
export const isPositive = (self: Duration): boolean => {
  switch (self.value._tag) {
    case "Millis":
      return self.value.millis > 0
    case "Nanos":
      return self.value.nanos > bigint0
    case "Infinity":
      return true
    case "NegativeInfinity":
      return false
  }
}

/**
 * Returns the absolute value of the duration.
 *
 * **Example** (Taking absolute duration values)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.abs(Duration.seconds(-5)) // => Duration.seconds(5)
 * Duration.abs(Duration.negativeInfinity) // => Duration.infinity
 * ```
 *
 * @category math
 * @since 4.0.0
 */
export const abs = (self: Duration): Duration => {
  switch (self.value._tag) {
    case "Infinity":
    case "NegativeInfinity":
      return infinity
    case "Millis":
      return self.value.millis < 0 ? make(-self.value.millis) : self
    case "Nanos":
      return self.value.nanos < bigint0 ? make(-self.value.nanos) : self
  }
}

/**
 * Returns the negated duration.
 *
 * **Example** (Negating durations)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.negate(Duration.seconds(5)) // => Duration.seconds(-5)
 * Duration.negate(Duration.infinity) // => Duration.negativeInfinity
 * ```
 *
 * @category math
 * @since 4.0.0
 */
export const negate = (self: Duration): Duration => {
  switch (self.value._tag) {
    case "Infinity":
      return negativeInfinity
    case "NegativeInfinity":
      return infinity
    case "Millis":
      return self.value.millis === 0 ? self : make(-self.value.millis)
    case "Nanos":
      return self.value.nanos === bigint0 ? self : make(-self.value.nanos)
  }
}

/**
 * A Duration representing zero time.
 *
 * **Example** (Referencing the zero duration)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.toMillis(Duration.zero) // => 0
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const zero: Duration = make(0)

/**
 * A Duration representing infinite time.
 *
 * **Example** (Referencing infinite duration)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.toMillis(Duration.infinity) // => Infinity
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const infinity: Duration = make(Infinity)

/**
 * A Duration representing negative infinite time.
 *
 * **Example** (Referencing negative infinite duration)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.toMillis(Duration.negativeInfinity) // => -Infinity
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const negativeInfinity: Duration = make(-Infinity)

/**
 * Creates a Duration from nanoseconds.
 *
 * **Example** (Creating durations from nanoseconds)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.nanos(500_000_000n) // => Duration.nanos(500_000_000n)
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const nanos = (nanos: bigint): Duration => make(nanos)

/**
 * Creates a Duration from microseconds.
 *
 * **Example** (Creating durations from microseconds)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.micros(500_000n) // => Duration.nanos(500_000_000n)
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const micros = (micros: bigint): Duration => make(micros * bigint1e3)

/**
 * Creates a Duration from milliseconds.
 *
 * **Example** (Creating durations from milliseconds)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.toMillis(Duration.millis(1000)) // => 1000
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const millis = (millis: number): Duration => make(millis)

/**
 * Creates a Duration from seconds.
 *
 * **Example** (Creating durations from seconds)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.toMillis(Duration.seconds(30)) // => 30_000
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const seconds = (seconds: number): Duration => make(seconds * 1000)

/**
 * Creates a Duration from minutes.
 *
 * **Example** (Creating durations from minutes)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.toMillis(Duration.minutes(5)) // => 300_000
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const minutes = (minutes: number): Duration => make(minutes * 60_000)

/**
 * Creates a Duration from hours.
 *
 * **Example** (Creating durations from hours)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.toMillis(Duration.hours(2)) // => 7_200_000
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const hours = (hours: number): Duration => make(hours * 3_600_000)

/**
 * Creates a Duration from days.
 *
 * **Example** (Creating durations from days)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.toMillis(Duration.days(1)) // => 86_400_000
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const days = (days: number): Duration => make(days * 86_400_000)

/**
 * Creates a Duration from weeks.
 *
 * **Example** (Creating durations from weeks)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.toMillis(Duration.weeks(1)) // => 604_800_000
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const weeks = (weeks: number): Duration => make(weeks * 604_800_000)

/**
 * Converts a Duration to milliseconds.
 *
 * **Example** (Converting durations to milliseconds)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.toMillis(Duration.seconds(5)) // => 5000
 * Duration.toMillis(Duration.minutes(2)) // => 120_000
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const toMillis = (self: Input): number =>
  match(fromInputUnsafe(self), {
    onMillis: identity,
    onNanos: (nanos) => Number(nanos) / 1_000_000,
    onInfinity: () => Infinity,
    onNegativeInfinity: () => -Infinity
  })

/**
 * Converts a Duration to seconds.
 *
 * **Example** (Converting durations to seconds)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.toSeconds(Duration.millis(5000)) // => 5
 * Duration.toSeconds(Duration.minutes(2)) // => 120
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const toSeconds = (self: Input): number =>
  match(fromInputUnsafe(self), {
    onMillis: (millis) => millis / 1_000,
    onNanos: (nanos) => Number(nanos) / 1_000_000_000,
    onInfinity: () => Infinity,
    onNegativeInfinity: () => -Infinity
  })

/**
 * Converts a Duration to minutes.
 *
 * **Example** (Converting durations to minutes)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.toMinutes(Duration.seconds(120)) // => 2
 * Duration.toMinutes(Duration.hours(1)) // => 60
 * ```
 *
 * @category getters
 * @since 3.8.0
 */
export const toMinutes = (self: Input): number =>
  match(fromInputUnsafe(self), {
    onMillis: (millis) => millis / 60_000,
    onNanos: (nanos) => Number(nanos) / 60_000_000_000,
    onInfinity: () => Infinity,
    onNegativeInfinity: () => -Infinity
  })

/**
 * Converts a Duration to hours.
 *
 * **Example** (Converting durations to hours)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.toHours(Duration.minutes(120)) // => 2
 * Duration.toHours(Duration.days(1)) // => 24
 * ```
 *
 * @category getters
 * @since 3.8.0
 */
export const toHours = (self: Input): number =>
  match(fromInputUnsafe(self), {
    onMillis: (millis) => millis / 3_600_000,
    onNanos: (nanos) => Number(nanos) / 3_600_000_000_000,
    onInfinity: () => Infinity,
    onNegativeInfinity: () => -Infinity
  })

/**
 * Converts a Duration to days.
 *
 * **Example** (Converting durations to days)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.toDays(Duration.hours(48)) // => 2
 * Duration.toDays(Duration.weeks(1)) // => 7
 * ```
 *
 * @category getters
 * @since 3.8.0
 */
export const toDays = (self: Input): number =>
  match(fromInputUnsafe(self), {
    onMillis: (millis) => millis / 86_400_000,
    onNanos: (nanos) => Number(nanos) / 86_400_000_000_000,
    onInfinity: () => Infinity,
    onNegativeInfinity: () => -Infinity
  })

/**
 * Converts a Duration to weeks.
 *
 * **Example** (Converting durations to weeks)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.toWeeks(Duration.days(14)) // => 2
 * Duration.toWeeks(Duration.days(7)) // => 1
 * ```
 *
 * @category getters
 * @since 3.8.0
 */
export const toWeeks = (self: Input): number =>
  match(fromInputUnsafe(self), {
    onMillis: (millis) => millis / 604_800_000,
    onNanos: (nanos) => Number(nanos) / 604_800_000_000_000,
    onInfinity: () => Infinity,
    onNegativeInfinity: () => -Infinity
  })

/**
 * Gets the duration in nanoseconds as a bigint.
 *
 * **When to use**
 *
 * Use when the duration is known to be finite and you need the nanosecond value
 * as a `bigint`.
 *
 * **Details**
 *
 * Millisecond-backed fractional durations are rounded to the nearest
 * nanosecond, with ties away from zero.
 *
 * **Gotchas**
 *
 * If the duration is infinite, it throws an error.
 *
 * **Example** (Reading nanoseconds unsafely)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.toNanosUnsafe(Duration.seconds(2)) // => 2_000_000_000n
 *
 * // Duration.toNanosUnsafe(Duration.infinity)
 * // throws Error: "Cannot convert infinite duration to nanos"
 * ```
 *
 * @category getters
 * @since 4.0.0
 */
export const toNanosUnsafe = (input: Input): bigint => {
  const self = fromInputUnsafe(input)
  switch (self.value._tag) {
    case "Infinity":
    case "NegativeInfinity":
      throw new Error("Cannot convert infinite duration to nanos")
    case "Nanos":
      return self.value.nanos
    case "Millis":
      return roundMillisToNanos(self.value.millis)
  }
}

/**
 * Gets the duration in nanoseconds safely as an `Option<bigint>`.
 *
 * **Details**
 *
 * If the duration is infinite, returns `Option.none()`.
 *
 * **Example** (Safely reading nanoseconds)
 *
 * ```ts import.meta.vitest
 * import { Duration, Option } from "effect"
 *
 * Duration.toNanos(Duration.seconds(1)) // => Option.some(1_000_000_000n)
 * Duration.toNanos(Duration.infinity) // => Option.none()
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const toNanos: (self: Input) => Option.Option<bigint> = Option.liftThrowable(toNanosUnsafe)

/**
 * Converts a Duration to high-resolution time format [seconds, nanoseconds].
 *
 * **Example** (Converting durations to high-resolution time)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.toHrTime(Duration.millis(1500)) // => [1, 500_000_000]
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const toHrTime = (input: Input): [seconds: number, nanos: number] => {
  const self = fromInputUnsafe(input)
  switch (self.value._tag) {
    case "Infinity":
      return [Infinity, 0]
    case "NegativeInfinity":
      return [-Infinity, 0]
    case "Nanos":
      return nanosToHrTime(self.value.nanos)
    case "Millis":
      return nanosToHrTime(roundMillisToNanos(self.value.millis))
  }
}

/**
 * Pattern matches on the representation of a `Duration`.
 *
 * **Details**
 *
 * Provide handlers for millisecond-backed values, nanosecond-backed values,
 * and positive infinity. Use `onNegativeInfinity` to handle negative infinity
 * separately; otherwise negative infinity is handled by `onInfinity`.
 *
 * **Example** (Pattern matching on duration representations)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.match(Duration.seconds(5), {
 *   onMillis: (millis) => `${millis} milliseconds`,
 *   onNanos: (nanos) => `${nanos} nanoseconds`,
 *   onInfinity: () => "infinite"
 * }) // => "5000 milliseconds"
 * ```
 *
 * @category pattern matching
 * @since 2.0.0
 */
export const match: {
  <A, B, C, D = C>(
    options: {
      readonly onMillis: (millis: number) => A
      readonly onNanos: (nanos: bigint) => B
      readonly onInfinity: () => C
      readonly onNegativeInfinity?: () => D
    }
  ): (self: Duration) => A | B | C | D
  <A, B, C, D = C>(
    self: Duration,
    options: {
      readonly onMillis: (millis: number) => A
      readonly onNanos: (nanos: bigint) => B
      readonly onInfinity: () => C
      readonly onNegativeInfinity?: () => D
    }
  ): A | B | C | D
} = dual(2, <A, B, C, D = C>(
  self: Duration,
  options: {
    readonly onMillis: (millis: number) => A
    readonly onNanos: (nanos: bigint) => B
    readonly onInfinity: () => C
    readonly onNegativeInfinity?: () => D
  }
): A | B | C | D => {
  switch (self.value._tag) {
    case "Millis":
      return options.onMillis(self.value.millis)
    case "Nanos":
      return options.onNanos(self.value.nanos)
    case "Infinity":
      return options.onInfinity()
    case "NegativeInfinity":
      return (options.onNegativeInfinity ?? options.onInfinity as unknown as () => D)()
  }
})

/**
 * Pattern matches on two `Duration`s, providing handlers that receive both values.
 *
 * **Example** (Pattern matching on duration pairs)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.matchPair(Duration.seconds(3), Duration.seconds(2), {
 *   onMillis: (a, b) => a + b,
 *   onNanos: (a, b) => Number(a + b),
 *   onInfinity: () => Infinity
 * }) // => 5000
 * ```
 *
 * @category pattern matching
 * @since 4.0.0
 */
export const matchPair: {
  <A, B, C>(
    that: Duration,
    options: {
      readonly onMillis: (self: number, that: number) => A
      readonly onNanos: (self: bigint, that: bigint) => B
      readonly onInfinity: (self: Duration, that: Duration) => C
    }
  ): (self: Duration) => A | B | C
  <A, B, C>(
    self: Duration,
    that: Duration,
    options: {
      readonly onMillis: (self: number, that: number) => A
      readonly onNanos: (self: bigint, that: bigint) => B
      readonly onInfinity: (self: Duration, that: Duration) => C
    }
  ): A | B | C
} = dual(3, <A, B, C>(
  self: Duration,
  that: Duration,
  options: {
    readonly onMillis: (self: number, that: number) => A
    readonly onNanos: (self: bigint, that: bigint) => B
    readonly onInfinity: (self: Duration, that: Duration) => C
  }
): A | B | C => {
  if (
    self.value._tag === "Infinity" || self.value._tag === "NegativeInfinity" ||
    that.value._tag === "Infinity" || that.value._tag === "NegativeInfinity"
  ) return options.onInfinity(self, that)
  if (self.value._tag === "Millis") {
    return that.value._tag === "Millis"
      ? options.onMillis(self.value.millis, that.value.millis)
      : options.onNanos(toNanosUnsafe(self), that.value.nanos)
  } else {
    return options.onNanos(self.value.nanos, toNanosUnsafe(that))
  }
})

/**
 * Provides an `Order` instance for comparing `Duration` values.
 *
 * **Details**
 *
 * `NegativeInfinity` < any finite value < `Infinity`.
 *
 * **Example** (Sorting durations)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * const durations = [
 *   Duration.seconds(3),
 *   Duration.seconds(1),
 *   Duration.seconds(2)
 * ]
 * durations.sort((a, b) => Duration.Order(a, b)).map(Duration.toSeconds) // => [1, 2, 3]
 * ```
 *
 * @category instances
 * @since 2.0.0
 */
export const Order: order.Order<Duration> = order.make((self, that) =>
  matchPair(self, that, {
    onMillis: (self, that) => (self < that ? -1 : self > that ? 1 : 0),
    onNanos: (self, that) => (self < that ? -1 : self > that ? 1 : 0),
    onInfinity: (self, that) => {
      if (self.value._tag === that.value._tag) return 0
      if (self.value._tag === "Infinity") return 1
      if (self.value._tag === "NegativeInfinity") return -1
      // self is finite
      if (that.value._tag === "Infinity") return -1
      // that is NegativeInfinity
      return 1
    }
  })
)

/**
 * Returns `true` if a `Duration` is greater than or equal to `minimum` and
 * less than or equal to `maximum`, according to `Duration.Order`.
 *
 * **When to use**
 *
 * Use to test whether a duration is inside an inclusive range.
 *
 * **Details**
 *
 * Both bounds are inclusive and compared with `Duration.Order`.
 *
 * **Gotchas**
 *
 * The bounds are not normalized. If `minimum` is greater than `maximum`, the
 * predicate returns `false` for every duration.
 *
 * **Example** (Checking duration ranges)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.between(Duration.seconds(3), {
 *   minimum: Duration.seconds(2),
 *   maximum: Duration.seconds(5)
 * }) // => true
 * ```
 *
 * @see {@link clamp} for constraining a duration to a range
 * @see {@link isGreaterThanOrEqualTo} for checking only the lower bound
 * @see {@link isLessThanOrEqualTo} for checking only the upper bound
 *
 * @category predicates
 * @since 2.0.0
 */
export const between: {
  (options: { minimum: Duration; maximum: Duration }): (self: Duration) => boolean
  (self: Duration, options: { minimum: Duration; maximum: Duration }): boolean
} = order.isBetween(Order)

/**
 * Provides an `Equivalence` instance for comparing `Duration` values.
 *
 * **Example** (Comparing durations for equivalence)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.Equivalence(Duration.seconds(5), Duration.millis(5000)) // => true
 * ```
 *
 * @category instances
 * @since 2.0.0
 */
export const Equivalence: Equ.Equivalence<Duration> = (self, that) =>
  matchPair(self, that, {
    onMillis: (self, that) => self === that,
    onNanos: (self, that) => self === that,
    onInfinity: (self, that) => self.value._tag === that.value._tag
  })

/**
 * Returns the smaller of two Durations.
 *
 * **Example** (Selecting the shorter duration)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.min(Duration.seconds(5), Duration.seconds(3)) // => Duration.seconds(3)
 * ```
 *
 * @category ordering
 * @since 2.0.0
 */
export const min: {
  (that: Duration): (self: Duration) => Duration
  (self: Duration, that: Duration): Duration
} = order.min(Order)

/**
 * Returns the larger of two Durations.
 *
 * **Example** (Selecting the longer duration)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.max(Duration.seconds(5), Duration.seconds(3)) // => Duration.seconds(5)
 * ```
 *
 * @category ordering
 * @since 2.0.0
 */
export const max: {
  (that: Duration): (self: Duration) => Duration
  (self: Duration, that: Duration): Duration
} = order.max(Order)

/**
 * Returns a `Duration` constrained between a minimum and maximum value.
 *
 * **Example** (Clamping durations to a range)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.clamp(Duration.seconds(10), {
 *   minimum: Duration.seconds(2),
 *   maximum: Duration.seconds(5)
 * }) // => Duration.seconds(5)
 * ```
 *
 * @category ordering
 * @since 2.0.0
 */
export const clamp: {
  (options: { minimum: Duration; maximum: Duration }): (self: Duration) => Duration
  (self: Duration, options: { minimum: Duration; maximum: Duration }): Duration
} = order.clamp(Order)

/**
 * Divides a `Duration` by a finite, non-zero number safely.
 *
 * **Details**
 *
 * Returns `Option.none()` for zero, negative zero, or non-finite divisors. For
 * nanosecond-backed durations, also returns `Option.none()` when the divisor
 * cannot be converted to a `bigint`, such as a fractional divisor.
 *
 * **Example** (Safely dividing durations)
 *
 * ```ts import.meta.vitest
 * import { Duration, Option } from "effect"
 *
 * Duration.divide(Duration.seconds(10), 2) // => Option.some(Duration.seconds(5))
 * Duration.divide(Duration.seconds(10), 0) // => Option.none()
 * ```
 *
 * @category math
 * @since 2.4.19
 */
export const divide: {
  (by: number): (self: Duration) => Option.Option<Duration>
  (self: Duration, by: number): Option.Option<Duration>
} = dual(
  2,
  (self: Duration, by: number): Option.Option<Duration> => {
    if (!Number.isFinite(by)) return Option.none()
    if (by === 0 || Object.is(by, -0)) return Option.none()
    return match(self, {
      onMillis: (millis) => Option.some(make(millis / by)),
      onNanos: (nanos) => {
        try {
          return Option.some(make(nanos / BigInt(by)))
        } catch {
          return Option.none()
        }
      },
      onInfinity: () => Option.some(by > 0 ? infinity : negativeInfinity),
      onNegativeInfinity: () => Option.some(by > 0 ? negativeInfinity : infinity)
    })
  }
)

/**
 * Divides a `Duration` by a number using fallback rules instead of returning
 * an `Option`.
 *
 * **When to use**
 *
 * Use when dividing a `Duration` should return `Duration.zero` or signed
 * infinity for invalid cases instead of forcing callers to handle `Option.none`.
 *
 * **Details**
 *
 * Non-finite divisors return `Duration.zero`. Division by positive or negative
 * zero can produce signed infinity for non-zero finite durations, while zero
 * or infinite durations divided by zero produce `Duration.zero`.
 * Nanosecond-backed durations return `Duration.zero` when the divisor cannot
 * be converted to a `bigint`.
 *
 * **Example** (Dividing durations unsafely)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.divideUnsafe(Duration.seconds(10), 2) // => Duration.seconds(5)
 * Duration.divideUnsafe(Duration.seconds(10), 0) // => Duration.infinity
 * ```
 *
 * @category math
 * @since 4.0.0
 */
export const divideUnsafe: {
  (by: number): (self: Duration) => Duration
  (self: Duration, by: number): Duration
} = dual(
  2,
  (self: Duration, by: number): Duration => {
    if (!Number.isFinite(by)) return zero
    return match(self, {
      onMillis: (millis) => make(millis / by),
      onNanos: (nanos) => {
        if (Object.is(by, 0) || Object.is(by, -0)) {
          if (nanos === bigint0) return zero
          // match IEEE 754: same sign → +infinity, different sign → -infinity
          const positiveNanos = nanos > bigint0
          const positiveZero = Object.is(by, 0)
          return (positiveNanos === positiveZero) ? infinity : negativeInfinity
        }
        try {
          return make(nanos / BigInt(by))
        } catch {
          return zero
        }
      },
      onInfinity: () => by > 0 ? infinity : by < 0 ? negativeInfinity : zero,
      onNegativeInfinity: () => by > 0 ? negativeInfinity : by < 0 ? infinity : zero
    })
  }
)

/**
 * Returns a `Duration` multiplied by a number.
 *
 * **Details**
 *
 * For nanosecond-backed durations, the multiplier must be convertible to a
 * `bigint`; fractional or non-finite multipliers can throw. Infinite
 * durations return positive infinity, negative infinity, or zero depending on
 * the multiplier sign.
 *
 * **Example** (Multiplying durations)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.times(Duration.seconds(5), 2) // => Duration.seconds(10)
 * ```
 *
 * @category math
 * @since 2.0.0
 */
export const times: {
  (times: number): (self: Duration) => Duration
  (self: Duration, times: number): Duration
} = dual(
  2,
  (self: Duration, times: number): Duration =>
    match(self, {
      onMillis: (millis) => make(millis * times),
      onNanos: (nanos) => make(nanos * BigInt(times)),
      onInfinity: () => times > 0 ? infinity : times < 0 ? negativeInfinity : zero,
      onNegativeInfinity: () => times > 0 ? negativeInfinity : times < 0 ? infinity : zero
    })
)

/**
 * Subtracts one Duration from another. The result can be negative.
 *
 * **Details**
 *
 * Infinity subtraction follows signed-infinity arithmetic. Subtracting the
 * same infinity from itself returns zero. Positive infinity minus negative
 * infinity or any finite duration remains positive infinity. Negative infinity
 * minus positive infinity or any finite duration remains negative infinity.
 * Finite durations minus positive infinity produce negative infinity, and
 * finite durations minus negative infinity produce positive infinity.
 *
 * **Example** (Subtracting durations)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.subtract(Duration.seconds(10), Duration.seconds(3)) // => Duration.seconds(7)
 * ```
 *
 * @category math
 * @since 2.0.0
 */
export const subtract: {
  (that: Duration): (self: Duration) => Duration
  (self: Duration, that: Duration): Duration
} = dual(
  2,
  (self: Duration, that: Duration): Duration =>
    matchPair(self, that, {
      onMillis: (self, that) => make(self - that),
      onNanos: (self, that) => make(self - that),
      onInfinity: (self, that) => {
        const s = self.value._tag
        const t = that.value._tag
        if (s === "Infinity") return t === "Infinity" ? zero : infinity
        if (s === "NegativeInfinity") return t === "NegativeInfinity" ? zero : negativeInfinity
        return t === "Infinity" ? negativeInfinity : infinity
      }
    })
)

/**
 * Adds two Durations together.
 *
 * **Details**
 *
 * Infinity addition follows these rules:
 *
 * - infinity + infinity = infinity
 * - infinity + negativeInfinity = zero
 * - infinity + finite = infinity
 * - negativeInfinity + negativeInfinity = negativeInfinity
 * - negativeInfinity + finite = negativeInfinity
 *
 * **Example** (Adding durations)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.sum(Duration.seconds(5), Duration.seconds(3)) // => Duration.seconds(8)
 * ```
 *
 * @category math
 * @since 2.0.0
 */
export const sum: {
  (that: Duration): (self: Duration) => Duration
  (self: Duration, that: Duration): Duration
} = dual(
  2,
  (self: Duration, that: Duration): Duration =>
    matchPair(self, that, {
      onMillis: (self, that) => make(self + that),
      onNanos: (self, that) => make(self + that),
      onInfinity: (self, that) => {
        const s = self.value._tag
        const t = that.value._tag
        if (s === "Infinity" && t === "NegativeInfinity") return zero
        if (s === "NegativeInfinity" && t === "Infinity") return zero
        if (s === "Infinity" || t === "Infinity") return infinity
        if (s === "NegativeInfinity" || t === "NegativeInfinity") return negativeInfinity
        // unreachable, but satisfy TS
        return zero
      }
    })
)

/**
 * Checks whether the first Duration is less than the second.
 *
 * **Example** (Comparing durations with less than)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.isLessThan(Duration.seconds(3), Duration.seconds(5)) // => true
 * ```
 *
 * @category predicates
 * @since 4.0.0
 */
export const isLessThan: {
  (that: Duration): (self: Duration) => boolean
  (self: Duration, that: Duration): boolean
} = order.isLessThan(Order)

/**
 * Checks whether the first Duration is less than or equal to the second.
 *
 * **Example** (Comparing durations with less than or equal)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.isLessThanOrEqualTo(
 *   Duration.seconds(5),
 *   Duration.seconds(5)
 * ) // => true
 * ```
 *
 * @category predicates
 * @since 4.0.0
 */
export const isLessThanOrEqualTo: {
  (that: Duration): (self: Duration) => boolean
  (self: Duration, that: Duration): boolean
} = order.isLessThanOrEqualTo(Order)

/**
 * Checks whether the first Duration is greater than the second.
 *
 * **Example** (Comparing durations with greater than)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.isGreaterThan(Duration.seconds(5), Duration.seconds(3)) // => true
 * ```
 *
 * @category predicates
 * @since 4.0.0
 */
export const isGreaterThan: {
  (that: Duration): (self: Duration) => boolean
  (self: Duration, that: Duration): boolean
} = order.isGreaterThan(Order)

/**
 * Checks whether the first Duration is greater than or equal to the second.
 *
 * **Example** (Comparing durations with greater than or equal)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.isGreaterThanOrEqualTo(
 *   Duration.seconds(5),
 *   Duration.seconds(5)
 * ) // => true
 * ```
 *
 * @category predicates
 * @since 4.0.0
 */
export const isGreaterThanOrEqualTo: {
  (that: Duration): (self: Duration) => boolean
  (self: Duration, that: Duration): boolean
} = order.isGreaterThanOrEqualTo(Order)

/**
 * Checks whether two Durations are equal.
 *
 * **Example** (Checking duration equality)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.equals(Duration.seconds(5), Duration.millis(5000)) // => true
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const equals: {
  (that: Duration): (self: Duration) => boolean
  (self: Duration, that: Duration): boolean
} = dual(2, (self: Duration, that: Duration): boolean => Equivalence(self, that))

/**
 * Decomposes a `Duration` into normalized signed components.
 *
 * **Details**
 *
 * Finite durations are returned as `{ days, hours, minutes, seconds, millis,
 * nanos }`. Infinite durations return every component as `Infinity` or
 * `-Infinity`.
 *
 * **Example** (Decomposing durations into parts)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * // Create a complex duration by adding multiple parts
 * const duration = Duration.sum(
 *   Duration.sum(
 *     Duration.sum(Duration.days(1), Duration.hours(2)),
 *     Duration.sum(Duration.minutes(30), Duration.seconds(45))
 *   ),
 *   Duration.millis(123)
 * )
 * Duration.parts(duration) // => ({ days: 1, hours: 2, minutes: 30, seconds: 45, millis: 123, nanos: 0 })
 *
 * const complex = Duration.sum(Duration.hours(25), Duration.minutes(90))
 * Duration.parts(complex) // => ({ days: 1, hours: 2, minutes: 30, seconds: 0, millis: 0, nanos: 0 })
 * ```
 *
 * @category converting
 * @since 3.8.0
 */
export const parts = (self: Duration): {
  days: number
  hours: number
  minutes: number
  seconds: number
  millis: number
  nanos: number
} => {
  if (self.value._tag === "Infinity") {
    return {
      days: Infinity,
      hours: Infinity,
      minutes: Infinity,
      seconds: Infinity,
      millis: Infinity,
      nanos: Infinity
    }
  }
  if (self.value._tag === "NegativeInfinity") {
    return {
      days: -Infinity,
      hours: -Infinity,
      minutes: -Infinity,
      seconds: -Infinity,
      millis: -Infinity,
      nanos: -Infinity
    }
  }

  const n = toNanosUnsafe(self)
  const neg = n < bigint0
  const a = neg ? -n : n
  const ms = a / bigint1e6
  const sec = ms / bigint1e3
  const min = sec / bigint60
  const hr = min / bigint60
  const d = hr / bigint24
  const sign = neg ? -1 : 1

  return {
    days: sign * Number(d),
    hours: sign * Number(hr % bigint24),
    minutes: sign * Number(min % bigint60),
    seconds: sign * Number(sec % bigint60),
    millis: sign * Number(ms % bigint1e3),
    nanos: sign * Number(a % bigint1e6)
  }
}

/**
 * Converts a `Duration` to a human readable string.
 *
 * **Example** (Formatting durations)
 *
 * ```ts import.meta.vitest
 * import { Duration } from "effect"
 *
 * Duration.format(Duration.millis(1000)) // => "1s"
 * Duration.format(Duration.millis(1001)) // => "1s 1ms"
 * ```
 *
 * @category converting
 * @since 2.0.0
 */
export const format = (self: Duration): string => {
  if (self.value._tag === "Infinity") {
    return "Infinity"
  }
  if (self.value._tag === "NegativeInfinity") {
    return "-Infinity"
  }
  if (isZero(self)) {
    return "0"
  }
  if (isNegative(self)) {
    return "-" + format(abs(self))
  }

  const fragments = parts(self)
  const pieces = []
  if (fragments.days !== 0) {
    pieces.push(`${fragments.days}d`)
  }

  if (fragments.hours !== 0) {
    pieces.push(`${fragments.hours}h`)
  }

  if (fragments.minutes !== 0) {
    pieces.push(`${fragments.minutes}m`)
  }

  if (fragments.seconds !== 0) {
    pieces.push(`${fragments.seconds}s`)
  }

  if (fragments.millis !== 0) {
    pieces.push(`${fragments.millis}ms`)
  }

  if (fragments.nanos !== 0) {
    pieces.push(`${fragments.nanos}ns`)
  }

  return pieces.join(" ")
}

/**
 * Reducer for summing `Duration`s.
 *
 * **When to use**
 *
 * Use to sum many `Duration` values through APIs that consume a `Reducer`.
 *
 * **Details**
 *
 * `ReducerSum` uses `sum` and starts from `zero`, so `combineAll([])` returns
 * `zero`.
 *
 * @see {@link sum} for adding two duration values directly
 * @see {@link CombinerMax} for keeping the longest duration instead of summing
 * @see {@link CombinerMin} for keeping the shortest duration instead of summing
 *
 * @category math
 * @since 4.0.0
 */
export const ReducerSum: Reducer.Reducer<Duration> = Reducer.make(sum, zero)

/**
 * Combiner that returns the maximum `Duration`.
 *
 * **When to use**
 *
 * Use to keep the longest `Duration` when an API consumes a `Combiner`.
 *
 * @see {@link CombinerMin} for keeping the shortest `Duration`
 * @see {@link max} for comparing two `Duration` values directly
 *
 * @category math
 * @since 4.0.0
 */
export const CombinerMax: Combiner.Combiner<Duration> = Combiner.max(Order)

/**
 * Combiner that returns the minimum `Duration`.
 *
 * **When to use**
 *
 * Use to keep the shortest `Duration` through APIs that consume a `Combiner`.
 *
 * @see {@link CombinerMax} for keeping the longest `Duration`
 * @see {@link min} for comparing two `Duration` values directly
 *
 * @category math
 * @since 4.0.0
 */
export const CombinerMin: Combiner.Combiner<Duration> = Combiner.min(Order)
