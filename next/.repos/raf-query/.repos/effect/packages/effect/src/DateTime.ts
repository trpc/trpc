/**
 * Works with absolute instants, UTC date-times, zoned date-times, and time
 * zones.
 *
 * A `DateTime` always represents an absolute point in time with epoch
 * milliseconds. It may also carry a `TimeZone` for calendar parts, formatting,
 * and zone-aware transformations. This module includes constructors, time-zone
 * helpers, comparisons, date arithmetic, current-time effects, and formatting
 * functions.
 *
 * @since 3.6.0
 */
import type { IllegalArgumentError } from "./Cause.ts"
import * as Context from "./Context.ts"
import type * as Duration from "./Duration.ts"
import * as Effect from "./Effect.ts"
import type * as Equ from "./Equivalence.ts"
import { dual, flow, type LazyArg } from "./Function.ts"
import type { Inspectable } from "./Inspectable.ts"
import * as Internal from "./internal/dateTime.ts"
import { provideService } from "./internal/effect.ts"
import * as Layer from "./Layer.ts"
import type * as Option from "./Option.ts"
import type * as order from "./Order.ts"
import type { Pipeable } from "./Pipeable.ts"

const TypeId = Internal.TypeId
const TimeZoneTypeId = Internal.TimeZoneTypeId

/**
 * A `DateTime` represents a point in time. It can optionally have a time zone
 * associated with it.
 *
 * @category models
 * @since 3.6.0
 */
export type DateTime = Utc | Zoned

/**
 * Represents a `DateTime` stored as an absolute UTC instant with no associated
 * time zone.
 *
 * **Details**
 *
 * Use `DateTime.isUtc` to narrow a `DateTime` to this variant.
 *
 * @category models
 * @since 3.6.0
 */
export interface Utc extends DateTime.Proto {
  readonly _tag: "Utc"
  readonly epochMilliseconds: number
  partsUtc: DateTime.PartsWithWeekday | undefined
}

/**
 * Represents a `DateTime` with an associated `TimeZone`.
 *
 * **Details**
 *
 * A zoned value still represents an absolute instant through
 * `epochMilliseconds`, while the time zone is used for wall-clock parts,
 * formatting, and zone-aware transformations.
 *
 * @category models
 * @since 3.6.0
 */
export interface Zoned extends DateTime.Proto {
  readonly _tag: "Zoned"
  readonly epochMilliseconds: number
  readonly zone: TimeZone
  adjustedEpochMilliseconds: number | undefined
  partsAdjusted: DateTime.PartsWithWeekday | undefined
  partsUtc: DateTime.PartsWithWeekday | undefined
}

/**
 * Companion namespace containing the public helper types used by `DateTime`
 * constructors, parts APIs, formatting, and date/time arithmetic.
 *
 * @since 3.6.0
 */
export declare namespace DateTime {
  /**
   * Input accepted by `DateTime.make`, `DateTime.makeUnsafe`, and the zoned
   * constructors.
   *
   * **Details**
   *
   * Includes existing `DateTime` values, partial date parts, epoch-millisecond
   * objects, epoch milliseconds, JavaScript `Date` instances, and parseable date
   * strings.
   *
   * @category models
   * @since 3.6.0
   */
  export type Input = DateTime | Partial<Parts> | Instant | InstantWithZone | Date | number | string

  /**
   * Type-level helper used by constructors to preserve a zoned input.
   *
   * **Details**
   *
   * When the input type is `DateTime.Zoned`, the result type is
   * `DateTime.Zoned`; otherwise the result type is `DateTime.Utc`.
   *
   * @category models
   * @since 3.6.0
   */
  export type PreserveZone<A extends DateTime.Input> = A extends Zoned ? Zoned : Utc

  /**
   * Date and time unit name accepted by `DateTime` rounding and arithmetic
   * APIs.
   *
   * **Details**
   *
   * Includes both singular units, such as `"day"`, and plural units, such as
   * `"days"`.
   *
   * @category models
   * @since 3.6.0
   */
  export type Unit = UnitSingular | UnitPlural

  /**
   * Singular date and time unit names used by rounding APIs such as
   * `DateTime.startOf`, `DateTime.endOf`, and `DateTime.nearest`.
   *
   * @category models
   * @since 3.6.0
   */
  export type UnitSingular =
    | "millisecond"
    | "second"
    | "minute"
    | "hour"
    | "day"
    | "week"
    | "month"
    | "year"

  /**
   * Plural date and time unit names used by `DateTime.PartsForMath` for
   * amount-based arithmetic.
   *
   * @category models
   * @since 3.6.0
   */
  export type UnitPlural =
    | "milliseconds"
    | "seconds"
    | "minutes"
    | "hours"
    | "days"
    | "weeks"
    | "months"
    | "years"

  /**
   * Calendar and time components of a `DateTime`, including the weekday.
   *
   * **Details**
   *
   * `month` is one-based (`1` for January through `12` for December), and
   * `weekDay` follows JavaScript `Date#getUTCDay` numbering (`0` for Sunday
   * through `6` for Saturday).
   *
   * @category models
   * @since 3.6.0
   */
  export interface PartsWithWeekday {
    readonly millisecond: number
    readonly second: number
    readonly minute: number
    readonly hour: number
    readonly day: number
    readonly weekDay: number
    readonly month: number
    readonly year: number
  }

  /**
   * Calendar and time components of a `DateTime`, without weekday information.
   *
   * **Details**
   *
   * `month` is one-based (`1` for January through `12` for December).
   *
   * @category models
   * @since 3.6.0
   */
  export interface Parts {
    readonly millisecond: number
    readonly second: number
    readonly minute: number
    readonly hour: number
    readonly day: number
    readonly month: number
    readonly year: number
  }

  /**
   * Plural amount fields accepted by `DateTime.add` and `DateTime.subtract`.
   *
   * **Details**
   *
   * Each field represents the number of units to add or subtract for that part.
   *
   * @category models
   * @since 3.6.0
   */
  export interface PartsForMath {
    readonly milliseconds: number
    readonly seconds: number
    readonly minutes: number
    readonly hours: number
    readonly days: number
    readonly weeks: number
    readonly months: number
    readonly years: number
  }

  /**
   * Object input representing an absolute instant as milliseconds since the Unix
   * epoch.
   *
   * @category models
   * @since 4.0.0
   */
  export interface Instant {
    readonly epochMilliseconds: number
  }

  /**
   * Object input representing an absolute instant plus a time zone identifier.
   *
   * **Details**
   *
   * `DateTime.makeZoned` and `DateTime.makeZonedUnsafe` use `timeZoneId` when
   * no explicit `timeZone` option is supplied.
   *
   * @category models
   * @since 4.0.0
   */
  export interface InstantWithZone {
    readonly timeZoneId: string
    readonly epochMilliseconds: number
  }

  /**
   * Shared protocol implemented by all `DateTime` values.
   *
   * **Details**
   *
   * Provides the `DateTime` type identifier along with pipe and inspection
   * support.
   *
   * @category models
   * @since 3.6.0
   */
  export interface Proto extends Pipeable, Inspectable {
    readonly [TypeId]: typeof TypeId
  }
}

/**
 * Represents a time zone used by `DateTime.Zoned`.
 *
 * **Details**
 *
 * A `TimeZone` is either a fixed offset from UTC or a named IANA time zone.
 *
 * @category models
 * @since 3.6.0
 */
export type TimeZone = TimeZone.Offset | TimeZone.Named

/**
 * Companion namespace containing the public variant and protocol types for
 * `TimeZone`.
 *
 * @since 3.6.0
 */
export declare namespace TimeZone {
  /**
   * Shared protocol implemented by all `TimeZone` values.
   *
   * **Details**
   *
   * Provides the `TimeZone` type identifier and inspection support.
   *
   * @category models
   * @since 3.6.0
   */
  export interface Proto extends Inspectable {
    readonly [TimeZoneTypeId]: typeof TimeZoneTypeId
  }

  /**
   * Fixed-offset time zone.
   *
   * **Details**
   *
   * The `offset` is measured in milliseconds from UTC. Positive offsets are
   * ahead of UTC, and negative offsets are behind UTC.
   *
   * @category models
   * @since 3.6.0
   */
  export interface Offset extends Proto {
    readonly _tag: "Offset"
    readonly offset: number
  }

  /**
   * Named IANA time zone.
   *
   * **Details**
   *
   * The `id` field contains the resolved time zone identifier, such as
   * `"Europe/London"` or `"America/New_York"`.
   *
   * @category models
   * @since 3.6.0
   */
  export interface Named extends Proto {
    readonly _tag: "Named"
    readonly id: string
    /** @internal */
    readonly format: Intl.DateTimeFormat
  }
}

/**
 * A `Disambiguation` is used to resolve ambiguities when a `DateTime` is
 * ambiguous, such as during a daylight saving time transition.
 *
 * **Details**
 *
 * For more information, see the [Temporal documentation](https://tc39.es/proposal-temporal/docs/timezone.html#ambiguity-due-to-dst-or-other-time-zone-offset-changes)
 *
 * - `"compatible"`: (default) Behavior matching Temporal API and legacy JavaScript Date and moment.js.
 *   For repeated times, chooses the earlier occurrence. For gap times, chooses the later interpretation.
 *
 * - `"earlier"`: For repeated times, always choose the earlier occurrence.
 *   For gap times, choose the time before the gap.
 *
 * - `"later"`: For repeated times, always choose the later occurrence.
 *   For gap times, choose the time after the gap.
 *
 * - `"reject"`: Throw an `RangeError` when encountering ambiguous or non-existent times.
 *
 * **Example** (Resolving ambiguous local times)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Option } from "effect"
 *
 * // Fall-back example: 01:30 on Nov 2, 2025 in New York happens twice
 * const ambiguousTime = { year: 2025, month: 11, day: 2, hour: 1, minute: 30 }
 * const timeZone = DateTime.zoneMakeNamedUnsafe("America/New_York")
 *
 * const earlier = DateTime.makeZoned(ambiguousTime, {
 *   timeZone,
 *   adjustForTimeZone: true,
 *   disambiguation: "earlier"
 * })
 * // Earlier occurrence (DST time): 2025-11-02T05:30:00.000Z
 *
 * const later = DateTime.makeZoned(ambiguousTime, {
 *   timeZone,
 *   adjustForTimeZone: true,
 *   disambiguation: "later"
 * })
 * // Later occurrence (standard time): 2025-11-02T06:30:00.000Z
 *
 * // Gap example: 02:30 on Mar 9, 2025 in New York doesn't exist
 * const gapTime = { year: 2025, month: 3, day: 9, hour: 2, minute: 30 }
 *
 * const beforeGap = DateTime.makeZoned(gapTime, {
 *   timeZone,
 *   adjustForTimeZone: true,
 *   disambiguation: "earlier"
 * })
 * // Time before gap: 2025-03-09T06:30:00.000Z (01:30 EST)
 *
 * const afterGap = DateTime.makeZoned(gapTime, {
 *   timeZone,
 *   adjustForTimeZone: true,
 *   disambiguation: "later"
 * })
 * // Time after gap: 2025-03-09T07:30:00.000Z (03:30 EDT)
 *
 * earlier.pipe(Option.getOrThrow, DateTime.formatIso) // => "2025-11-02T05:30:00.000Z"
 * later.pipe(Option.getOrThrow, DateTime.formatIso) // => "2025-11-02T06:30:00.000Z"
 * beforeGap.pipe(Option.getOrThrow, DateTime.formatIso) // => "2025-03-09T06:30:00.000Z"
 * afterGap.pipe(Option.getOrThrow, DateTime.formatIso) // => "2025-03-09T07:30:00.000Z"
 * ```
 *
 * @category models
 * @since 3.18.0
 */
export type Disambiguation = "compatible" | "earlier" | "later" | "reject"

// =============================================================================
// guards
// =============================================================================

/**
 * Checks whether a value is a `DateTime`.
 *
 * **When to use**
 *
 * Use to narrow an unknown value before treating it as a `DateTime`.
 *
 * @see {@link isUtc} for narrowing a known `DateTime` to UTC
 * @see {@link isZoned} for narrowing a known `DateTime` to zoned
 *
 * @category guards
 * @since 3.6.0
 */
export const isDateTime: (u: unknown) => u is DateTime = Internal.isDateTime

/**
 * Checks whether a value is a `TimeZone`.
 *
 * **When to use**
 *
 * Use to narrow unknown input to any `TimeZone` before passing it to APIs that
 * accept either fixed-offset or named time zones.
 *
 * @see {@link isTimeZoneOffset} for narrowing to fixed-offset time zones
 * @see {@link isTimeZoneNamed} for narrowing to named time zones
 *
 * @category guards
 * @since 3.6.0
 */
export const isTimeZone: (u: unknown) => u is TimeZone = Internal.isTimeZone

/**
 * Checks whether a value is an offset-based `TimeZone`.
 *
 * **When to use**
 *
 * Use when you need to narrow an unknown or union `TimeZone` value to the
 * fixed-offset variant before reading its offset in milliseconds.
 *
 * @see {@link isTimeZone} for checking either time zone variant
 * @see {@link isTimeZoneNamed} for narrowing to named time zones
 *
 * @category guards
 * @since 3.6.0
 */
export const isTimeZoneOffset: (u: unknown) => u is TimeZone.Offset = Internal.isTimeZoneOffset

/**
 * Checks whether a value is a named `TimeZone` (IANA time zone).
 *
 * **When to use**
 *
 * Use to narrow an unknown value to the `TimeZone.Named` variant before
 * reading named-zone fields such as `id`.
 *
 * @see {@link isTimeZone} for checking either time zone variant
 * @see {@link isTimeZoneOffset} for narrowing to fixed-offset time zones
 *
 * @category guards
 * @since 3.6.0
 */
export const isTimeZoneNamed: (u: unknown) => u is TimeZone.Named = Internal.isTimeZoneNamed

/**
 * Checks whether a `DateTime` is a UTC `DateTime` (no time zone information).
 *
 * **When to use**
 *
 * Use to narrow a `DateTime` before passing it to code that requires a UTC
 * value without an associated time zone.
 *
 * @see {@link isZoned} for narrowing to zoned date-times
 * @see {@link match} for handling both UTC and zoned cases
 *
 * @category guards
 * @since 3.6.0
 */
export const isUtc: (self: DateTime) => self is Utc = Internal.isUtc

/**
 * Checks whether a `DateTime` is a zoned `DateTime` (has time zone information).
 *
 * **When to use**
 *
 * Use to narrow a known `DateTime` before reading its zone or passing it to
 * APIs that require `DateTime.Zoned`.
 *
 * @see {@link isUtc} for narrowing to UTC date-times
 * @see {@link match} for handling both UTC and zoned cases
 *
 * @category guards
 * @since 3.6.0
 */
export const isZoned: (self: DateTime) => self is Zoned = Internal.isZoned

// =============================================================================
// instances
// =============================================================================

/**
 * Provides an `Equivalence` for comparing two `DateTime` values for equality.
 *
 * **Details**
 *
 * Two `DateTime` values are considered equivalent if they represent the same
 * point in time, regardless of their time zone.
 *
 * **Example** (Comparing DateTime values for equivalence)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const utc = DateTime.makeUnsafe("2024-01-01T12:00:00Z")
 * const zoned = DateTime.makeZonedUnsafe("2024-01-01T12:00:00Z", {
 *   timeZone: "Europe/London"
 * })
 *
 * DateTime.Equivalence(utc, zoned) // => true
 * ```
 *
 * @category instances
 * @since 3.6.0
 */
export const Equivalence: Equ.Equivalence<DateTime> = Internal.Equivalence

/**
 * Provides an `Order` for comparing and sorting `DateTime` values.
 *
 * **Details**
 *
 * `DateTime` values are ordered by their epoch milliseconds, so earlier times
 * come before later times regardless of time zone.
 *
 * **Example** (Sorting DateTime values chronologically)
 *
 * ```ts import.meta.vitest
 * import { Array, DateTime } from "effect"
 *
 * const dates = [
 *   DateTime.makeUnsafe("2024-03-01"),
 *   DateTime.makeUnsafe("2024-01-01"),
 *   DateTime.makeUnsafe("2024-02-01")
 * ]
 *
 * Array.sort(dates, DateTime.Order).map(DateTime.formatIsoDateUtc) // => ["2024-01-01", "2024-02-01", "2024-03-01"]
 * ```
 *
 * @category instances
 * @since 3.6.0
 */
export const Order: order.Order<DateTime> = Internal.Order

/**
 * Returns a `DateTime` constrained between a minimum and maximum value.
 *
 * **Details**
 *
 * If the `DateTime` is before the minimum, the minimum is returned.
 * If the `DateTime` is after the maximum, the maximum is returned.
 * Otherwise, the original `DateTime` is returned.
 *
 * **Example** (Clamping DateTime values)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const min = DateTime.makeUnsafe("2024-01-01")
 * const max = DateTime.makeUnsafe("2024-12-31")
 * const date = DateTime.makeUnsafe("2025-06-15")
 *
 * DateTime.clamp(date, { minimum: min, maximum: max }) // => DateTime.makeUnsafe("2024-12-31")
 * ```
 *
 * @category ordering
 * @since 3.6.0
 */
export const clamp: {
  <Min extends DateTime, Max extends DateTime>(
    options: { readonly minimum: Min; readonly maximum: Max }
  ): <A extends DateTime>(self: A) => A | Min | Max
  <A extends DateTime, Min extends DateTime, Max extends DateTime>(
    self: A,
    options: { readonly minimum: Min; readonly maximum: Max }
  ): A | Min | Max
} = Internal.clamp

// =============================================================================
// constructors
// =============================================================================

/**
 * Create a `DateTime` from a `Date`.
 *
 * **Details**
 *
 * If the `Date` is invalid, an `IllegalArgumentError` will be thrown.
 *
 * **Example** (Creating DateTime values from Dates)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * DateTime.fromDateUnsafe(new Date("2024-01-01T12:00:00Z")) // => DateTime.makeUnsafe("2024-01-01T12:00:00Z")
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromDateUnsafe: (date: Date) => Utc = Internal.fromDateUnsafe

/**
 * Create a `DateTime` from supported input values.
 *
 * **When to use**
 *
 * Use when creating a `DateTime` from trusted input and construction failures
 * should throw an `IllegalArgumentError` instead of returning `Option.none`.
 *
 * **Details**
 *
 * - A `DateTime`
 * - A `Date` instance (invalid dates will throw an `IllegalArgumentError`)
 * - The `number` of milliseconds since the Unix epoch
 * - An object with the parts of a date
 * - A `string` that can be parsed by `Date.parse`
 *
 * **Example** (Creating DateTime values unsafely)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * // from Date
 * DateTime.makeUnsafe(new Date("2024-01-01T12:00:00Z")) // => DateTime.makeUnsafe("2024-01-01T12:00:00Z")
 *
 * // from parts
 * DateTime.makeUnsafe({ year: 2024 }) // => DateTime.makeUnsafe("2024-01-01T00:00:00Z")
 *
 * // from string
 * DateTime.makeUnsafe("2024-01-01") // => DateTime.makeUnsafe("2024-01-01T00:00:00Z")
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeUnsafe: <A extends DateTime.Input>(input: A) => DateTime.PreserveZone<A> = Internal.makeUnsafe

/**
 * Creates a `DateTime.Utc` from the number of seconds since the Unix epoch.
 *
 * **Example** (Creating from epoch seconds)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * DateTime.fromEpochSeconds(1704067200).toJSON() // => "2024-01-01T00:00:00.000Z"
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromEpochSeconds: (seconds: number) => Utc = Internal.fromEpochSeconds

/**
 * Create a `DateTime.Zoned` using `DateTime.makeUnsafe` and a time zone.
 *
 * **When to use**
 *
 * Use when the date/time input and zone options are trusted and invalid or
 * rejected ambiguous times should throw instead of returning `Option.none`.
 *
 * **Details**
 *
 * The input is treated as UTC and then the time zone is attached, unless
 * `adjustForTimeZone` is set to `true`. In that case, the input is treated as
 * already in the time zone.
 *
 * When `adjustForTimeZone` is true and ambiguous times occur during DST transitions,
 * the `disambiguation` option controls how to resolve the ambiguity:
 * - `compatible` (default): Choose earlier time for repeated times, later for gaps
 * - `earlier`: Always choose the earlier of two possible times
 * - `later`: Always choose the later of two possible times
 * - `reject`: Throw an error when ambiguous times are encountered
 *
 * **Example** (Creating zoned DateTime values unsafely)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const zoned = DateTime.makeZonedUnsafe("2024-06-15T14:30:00Z", {
 *   timeZone: "Europe/London"
 * })
 *
 * DateTime.formatIsoZoned(zoned) // => "2024-06-15T15:30:00.000+01:00[Europe/London]"
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeZonedUnsafe: (input: DateTime.Input, options?: {
  readonly timeZone?: number | string | TimeZone | undefined
  readonly adjustForTimeZone?: boolean | undefined
  readonly disambiguation?: Disambiguation | undefined
}) => Zoned = Internal.makeZonedUnsafe

/**
 * Creates a `DateTime.Zoned` safely from an input and a time zone.
 *
 * **Details**
 *
 * By default, the input is interpreted as a UTC instant and the time zone is
 * attached without changing that instant. When `adjustForTimeZone` is `true`,
 * the input is interpreted as wall-clock time in the target zone.
 *
 * When `adjustForTimeZone` is `true`, `disambiguation` controls
 * daylight-saving gaps and repeated times:
 *
 * - `"compatible"` (default): chooses the earlier occurrence for repeated
 *   times and the later interpretation for gaps
 * - `"earlier"`: chooses the earlier possible instant
 * - `"later"`: chooses the later possible instant
 * - `"reject"`: rejects ambiguous or nonexistent wall-clock times
 *
 * Returns `Some` when construction succeeds, or `None` when the input, time
 * zone, or disambiguation cannot be resolved.
 *
 * **Example** (Creating optional zoned DateTime values)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Option } from "effect"
 *
 * const result = DateTime.makeZoned("2024-06-15T14:30:00Z", {
 *   timeZone: "Europe/London"
 * })
 *
 * result.pipe(Option.map(DateTime.formatIsoZoned)) // => Option.some("2024-06-15T15:30:00.000+01:00[Europe/London]")
 * ```
 *
 * @category constructors
 * @since 3.6.0
 */
export const makeZoned: (
  input: DateTime.Input,
  options?: {
    readonly timeZone?: number | string | TimeZone | undefined
    readonly adjustForTimeZone?: boolean | undefined
    readonly disambiguation?: Disambiguation | undefined
  }
) => Option.Option<Zoned> = Internal.makeZoned

/**
 * Creates a `DateTime` safely from supported input values.
 *
 * **Details**
 *
 * - A `DateTime`
 * - A JavaScript `Date`
 * - The number of milliseconds since the Unix epoch
 * - An object with date and time parts
 * - A string that can be parsed as a date
 *
 * Returns `Some` with the constructed `DateTime` when the input is valid, or
 * `None` when construction would fail, including invalid `Date` instances or
 * unparseable strings.
 *
 * **Example** (Creating optional DateTime values)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Option } from "effect"
 *
 * // from Date
 * DateTime.make(new Date("2024-01-01T12:00:00Z")) // => Option.some(DateTime.makeUnsafe("2024-01-01T12:00:00Z"))
 *
 * // from parts
 * DateTime.make({ year: 2024 }) // => Option.some(DateTime.makeUnsafe("2024-01-01T00:00:00Z"))
 *
 * // from string
 * DateTime.make("2024-01-01") // => Option.some(DateTime.makeUnsafe("2024-01-01T00:00:00Z"))
 *
 * DateTime.make("not a date") // => Option.none()
 * ```
 *
 * @category constructors
 * @since 3.6.0
 */
export const make: <A extends DateTime.Input>(input: A) => Option.Option<DateTime.PreserveZone<A>> = Internal.make

/**
 * Parses an ISO zoned date-time string into a `DateTime.Zoned` safely.
 *
 * **Details**
 *
 * Accepts named-zone strings such as
 * `YYYY-MM-DDTHH:mm:ss.sss+HH:MM[Time/Zone]` and offset-only strings such as
 * `YYYY-MM-DDTHH:mm:ss.sss+HH:MM`. Returns `None` when the input cannot be
 * parsed.
 *
 * **Example** (Parsing zoned DateTime strings)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Option } from "effect"
 *
 * DateTime.makeZonedFromString(
 *   "2024-01-01T12:00:00+02:00[Europe/Berlin]"
 * ).pipe(Option.map(DateTime.formatIsoZoned)) // => Option.some("2024-01-01T11:00:00.000+01:00[Europe/Berlin]")
 *
 * DateTime.makeZonedFromString("2024-01-01T12:00:00Z") // => Option.none()
 * DateTime.makeZonedFromString("invalid") // => Option.none()
 * ```
 *
 * @category constructors
 * @since 3.6.0
 */
export const makeZonedFromString: (input: string) => Option.Option<Zoned> = Internal.makeZonedFromString

/**
 * Gets the current time using the `Clock` service and converts it to a `DateTime`.
 *
 * **Example** (Getting the current DateTime)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Effect } from "effect"
 * import { TestClock } from "effect/testing"
 *
 * await Effect.runPromise(Effect.map(DateTime.now, DateTime.isDateTime)) // => true
 * ```
 *
 * @category constructors
 * @since 3.6.0
 */
export const now: Effect.Effect<Utc> = Internal.now

/**
 * Gets the current time from the `Clock` service and returns it as a
 * JavaScript `Date`.
 *
 * **Example** (Getting the current Date)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Effect } from "effect"
 * import { TestClock } from "effect/testing"
 *
 * await Effect.runPromise(Effect.map(DateTime.nowAsDate, (now) => now instanceof Date)) // => true
 * ```
 *
 * @category constructors
 * @since 3.14.0
 */
export const nowAsDate: Effect.Effect<Date> = Internal.nowAsDate

/**
 * Gets the current time using `Date.now`.
 *
 * **When to use**
 *
 * Use when synchronous wall-clock access outside an Effect program is
 * acceptable and testability through the `Clock` service is not needed.
 *
 * **Details**
 *
 * This is a synchronous version of `now` that directly uses `Date.now()`
 * instead of the Effect `Clock` service.
 *
 * **Example** (Getting the current DateTime unsafely)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * Number.isFinite(DateTime.toEpochMillis(DateTime.nowUnsafe())) // => true
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const nowUnsafe: LazyArg<Utc> = Internal.nowUnsafe

// =============================================================================
// time zones
// =============================================================================

/**
 * Converts a `DateTime` to a UTC `DateTime`.
 *
 * **When to use**
 *
 * Use to represent the same instant in UTC instead of its current time zone.
 *
 * **Details**
 *
 * The returned value keeps the same epoch milliseconds and changes only the
 * `DateTime` representation to UTC.
 *
 * **Example** (Converting DateTime values to UTC)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const now = DateTime.makeZonedUnsafe({ year: 2024 }, {
 *   timeZone: "Europe/London"
 * })
 *
 * // set as UTC
 * const utc: DateTime.Utc = DateTime.toUtc(now)
 * utc // => DateTime.makeUnsafe("2024-01-01T00:00:00Z")
 * ```
 *
 * @category converting
 * @since 3.13.0
 */
export const toUtc: (self: DateTime) => Utc = Internal.toUtc

/**
 * Sets the time zone of a `DateTime`, returning a new `DateTime.Zoned`.
 *
 * **Example** (Setting time zones)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const zone = DateTime.zoneMakeNamedUnsafe("Europe/London")
 * const zoned: DateTime.Zoned = DateTime.setZone(DateTime.makeUnsafe("2024-01-01"), zone)
 *
 * DateTime.isZoned(zoned) // => true
 * ```
 *
 * @category transforming
 * @since 3.6.0
 */
export const setZone: {
  (zone: TimeZone, options?: {
    readonly adjustForTimeZone?: boolean | undefined
    readonly disambiguation?: Disambiguation | undefined
  }): (self: DateTime) => Zoned
  (self: DateTime, zone: TimeZone, options?: {
    readonly adjustForTimeZone?: boolean | undefined
    readonly disambiguation?: Disambiguation | undefined
  }): Zoned
} = Internal.setZone

/**
 * Adds a fixed offset time zone to a `DateTime`.
 *
 * **Details**
 *
 * The offset is in milliseconds.
 *
 * **Example** (Setting fixed-offset time zones)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const dateTime = DateTime.makeUnsafe("2024-01-01")
 * const zoned: DateTime.Zoned = DateTime.setZoneOffset(dateTime, 3 * 60 * 60 * 1000)
 *
 * DateTime.zoneToString(zoned.zone) // => "+03:00"
 * ```
 *
 * @category transforming
 * @since 3.6.0
 */
export const setZoneOffset: {
  (offset: number, options?: {
    readonly adjustForTimeZone?: boolean | undefined
    readonly disambiguation?: Disambiguation | undefined
  }): (self: DateTime) => Zoned
  (self: DateTime, offset: number, options?: {
    readonly adjustForTimeZone?: boolean | undefined
    readonly disambiguation?: Disambiguation | undefined
  }): Zoned
} = Internal.setZoneOffset

/**
 * Attempts to create a named time zone from an IANA time zone identifier.
 *
 * **When to use**
 *
 * Use when the IANA zone id is trusted and invalid zones should throw instead
 * of returning `Option.none` or failing in `Effect`.
 *
 * **Details**
 *
 * If the time zone is invalid, an `IllegalArgumentError` will be thrown.
 *
 * **Example** (Creating named time zones unsafely)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * DateTime.zoneToString(DateTime.zoneMakeNamedUnsafe("Europe/London")) // => "Europe/London"
 * DateTime.zoneToString(DateTime.zoneMakeNamedUnsafe("Asia/Tokyo")) // => "Asia/Tokyo"
 *
 * // This would throw an IllegalArgumentError:
 * // DateTime.zoneMakeNamedUnsafe("Invalid/Zone")
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const zoneMakeNamedUnsafe: (zoneId: string) => TimeZone.Named = Internal.zoneMakeNamedUnsafe

/**
 * Create a fixed offset time zone.
 *
 * **Details**
 *
 * The offset is specified in milliseconds from UTC. Positive values are
 * ahead of UTC, negative values are behind UTC.
 *
 * **Example** (Creating fixed-offset time zones)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * // Create a time zone with +3 hours offset
 * const zone = DateTime.zoneMakeOffset(3 * 60 * 60 * 1000)
 *
 * const dt = DateTime.makeZonedUnsafe("2024-01-01T12:00:00Z", {
 *   timeZone: zone
 * })
 * DateTime.formatIsoZoned(dt) // => "2024-01-01T15:00:00.000+03:00"
 * ```
 *
 * @category constructors
 * @since 3.6.0
 */
export const zoneMakeOffset: (offset: number) => TimeZone.Offset = Internal.zoneMakeOffset

/**
 * Creates a named time zone safely from an IANA time zone identifier.
 *
 * **Details**
 *
 * If the time zone is invalid, `None` will be returned.
 *
 * **Example** (Creating optional named time zones)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Option } from "effect"
 *
 * DateTime.zoneMakeNamed("Europe/London").pipe(Option.map(DateTime.zoneToString)) // => Option.some("Europe/London")
 * DateTime.zoneMakeNamed("Invalid/Zone") // => Option.none()
 * ```
 *
 * @category constructors
 * @since 3.6.0
 */
export const zoneMakeNamed: (zoneId: string) => Option.Option<TimeZone.Named> = Internal.zoneMakeNamed

/**
 * Creates a named time zone effectfully from an IANA time zone identifier.
 *
 * **When to use**
 *
 * Use when invalid IANA zone ids should fail in the Effect error channel
 * instead of returning `Option.none` or throwing.
 *
 * **Example** (Creating named time zones effectfully)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const zone = yield* DateTime.zoneMakeNamedEffect("Europe/London")
 *   const now = yield* DateTime.now
 *   return DateTime.setZone(now, zone)
 * })
 *
 * DateTime.zoneToString((await Effect.runPromise(program)).zone) // => "Europe/London"
 * ```
 *
 * @category constructors
 * @since 3.6.0
 */
export const zoneMakeNamedEffect: (zoneId: string) => Effect.Effect<TimeZone.Named, IllegalArgumentError> =
  Internal.zoneMakeNamedEffect

/**
 * Create a named time zone from the system's local time zone.
 *
 * **Details**
 *
 * This uses the system's configured time zone, which may vary depending
 * on the runtime environment.
 *
 * **Example** (Creating local time zones)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * DateTime.isTimeZoneNamed(DateTime.zoneMakeLocal()) // => true
 * ```
 *
 * @category constructors
 * @since 3.6.0
 */
export const zoneMakeLocal: () => TimeZone.Named = Internal.zoneMakeLocal

/**
 * Tries to parse a `TimeZone` from a string safely.
 *
 * **Details**
 *
 * Supports both IANA time zone identifiers and offset formats like "+03:00".
 *
 * **Example** (Parsing time zones)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Option } from "effect"
 *
 * DateTime.zoneFromString("Europe/London").pipe(Option.map(DateTime.zoneToString)) // => Option.some("Europe/London")
 * DateTime.zoneFromString("+03:00").pipe(Option.map(DateTime.zoneToString)) // => Option.some("+03:00")
 * DateTime.zoneFromString("invalid") // => Option.none()
 * ```
 *
 * @category decoding
 * @since 3.6.0
 */
export const zoneFromString: (zone: string) => Option.Option<TimeZone> = Internal.zoneFromString

/**
 * Formats a `TimeZone` as a string.
 *
 * **Example** (Formatting time zones)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * DateTime.zoneToString(DateTime.zoneMakeOffset(3 * 60 * 60 * 1000)) // => "+03:00"
 * DateTime.zoneToString(DateTime.zoneMakeNamedUnsafe("Europe/London")) // => "Europe/London"
 * ```
 *
 * @category encoding
 * @since 3.6.0
 */
export const zoneToString: (self: TimeZone) => string = Internal.zoneToString

/**
 * Sets the time zone of a `DateTime` safely from an IANA time zone identifier. If the
 * time zone is invalid, `None` will be returned.
 *
 * **Example** (Setting named time zones safely)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Option } from "effect"
 *
 * const dateTime = DateTime.makeUnsafe("2024-01-01")
 * const result = DateTime.setZoneNamed(dateTime, "Europe/London").pipe(Option.map(DateTime.formatIsoZoned))
 *
 * result // => Option.some("2024-01-01T00:00:00.000+00:00[Europe/London]")
 * ```
 *
 * @category transforming
 * @since 3.6.0
 */
export const setZoneNamed: {
  (zoneId: string, options?: {
    readonly adjustForTimeZone?: boolean | undefined
    readonly disambiguation?: Disambiguation | undefined
  }): (self: DateTime) => Option.Option<Zoned>
  (self: DateTime, zoneId: string, options?: {
    readonly adjustForTimeZone?: boolean | undefined
    readonly disambiguation?: Disambiguation | undefined
  }): Option.Option<Zoned>
} = Internal.setZoneNamed

/**
 * Sets the time zone of a `DateTime` from an IANA time zone identifier. If the
 * time zone is invalid, an `IllegalArgumentError` will be thrown.
 *
 * **Example** (Setting named time zones unsafely)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const dateTime = DateTime.makeUnsafe("2024-01-01")
 * const zoned = DateTime.setZoneNamedUnsafe(dateTime, "Europe/London")
 *
 * DateTime.zoneToString(zoned.zone) // => "Europe/London"
 * ```
 *
 * @category transforming
 * @since 4.0.0
 */
export const setZoneNamedUnsafe: {
  (zoneId: string, options?: {
    readonly adjustForTimeZone?: boolean | undefined
    readonly disambiguation?: Disambiguation | undefined
  }): (self: DateTime) => Zoned
  (self: DateTime, zoneId: string, options?: {
    readonly adjustForTimeZone?: boolean | undefined
    readonly disambiguation?: Disambiguation | undefined
  }): Zoned
} = Internal.setZoneNamedUnsafe

// =============================================================================
// comparisons
// =============================================================================

/**
 * Computes the difference between two `DateTime` values, returning a
 * `Duration` representing the amount of time between them.
 *
 * **Details**
 *
 * If `other` is *after* `self`, the result will be a positive `Duration`. If
 * `other` is *before* `self`, the result will be a negative `Duration`. If they
 * are equal, the result will be a `Duration` of zero.
 *
 * **Example** (Measuring distance between DateTime values)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Duration } from "effect"
 *
 * const start = DateTime.makeUnsafe("2024-01-01T00:00:00Z")
 * const end = DateTime.add(start, { minutes: 1 })
 *
 * DateTime.distance(start, end) // => Duration.minutes(1)
 * ```
 *
 * @category comparisons
 * @since 3.6.0
 */
export const distance: {
  (other: DateTime): (self: DateTime) => Duration.Duration
  (self: DateTime, other: DateTime): Duration.Duration
} = Internal.distance

/**
 * Returns the earlier of two `DateTime` values.
 *
 * **Example** (Selecting the earlier DateTime)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const date1 = DateTime.makeUnsafe("2024-01-01")
 * const date2 = DateTime.makeUnsafe("2024-02-01")
 *
 * DateTime.min(date1, date2) // => DateTime.makeUnsafe("2024-01-01")
 * ```
 *
 * @category comparisons
 * @since 3.6.0
 */
export const min: {
  <That extends DateTime>(that: That): <Self extends DateTime>(self: Self) => Self | That
  <Self extends DateTime, That extends DateTime>(self: Self, that: That): Self | That
} = Internal.min

/**
 * Returns the later of two `DateTime` values.
 *
 * **Example** (Selecting the later DateTime)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const date1 = DateTime.makeUnsafe("2024-01-01")
 * const date2 = DateTime.makeUnsafe("2024-02-01")
 *
 * DateTime.max(date1, date2) // => DateTime.makeUnsafe("2024-02-01")
 * ```
 *
 * @category comparisons
 * @since 3.6.0
 */
export const max: {
  <That extends DateTime>(that: That): <Self extends DateTime>(self: Self) => Self | That
  <Self extends DateTime, That extends DateTime>(self: Self, that: That): Self | That
} = Internal.max

/**
 * Checks whether the first `DateTime` is after the second `DateTime`.
 *
 * **Example** (Checking whether a DateTime is later)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const date1 = DateTime.makeUnsafe("2024-02-01")
 * const date2 = DateTime.makeUnsafe("2024-01-01")
 *
 * DateTime.isGreaterThan(date1, date2) // => true
 * DateTime.isGreaterThan(date2, date1) // => false
 * ```
 *
 * @category comparisons
 * @since 4.0.0
 */
export const isGreaterThan: {
  (that: DateTime): (self: DateTime) => boolean
  (self: DateTime, that: DateTime): boolean
} = Internal.isGreaterThan

/**
 * Checks whether the first `DateTime` is after or equal to the second `DateTime`.
 *
 * **Example** (Checking whether a DateTime is later or equal)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const date1 = DateTime.makeUnsafe("2024-01-01")
 * const date2 = DateTime.makeUnsafe("2024-01-01")
 * const date3 = DateTime.makeUnsafe("2024-02-01")
 *
 * DateTime.isGreaterThanOrEqualTo(date1, date2) // => true
 * DateTime.isGreaterThanOrEqualTo(date3, date1) // => true
 * DateTime.isGreaterThanOrEqualTo(date1, date3) // => false
 * ```
 *
 * @category comparisons
 * @since 4.0.0
 */
export const isGreaterThanOrEqualTo: {
  (that: DateTime): (self: DateTime) => boolean
  (self: DateTime, that: DateTime): boolean
} = Internal.isGreaterThanOrEqualTo

/**
 * Checks whether the first `DateTime` is before the second `DateTime`.
 *
 * **Example** (Checking whether a DateTime is earlier)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const date1 = DateTime.makeUnsafe("2024-01-01")
 * const date2 = DateTime.makeUnsafe("2024-02-01")
 *
 * DateTime.isLessThan(date1, date2) // => true
 * DateTime.isLessThan(date2, date1) // => false
 * ```
 *
 * @category comparisons
 * @since 4.0.0
 */
export const isLessThan: {
  (that: DateTime): (self: DateTime) => boolean
  (self: DateTime, that: DateTime): boolean
} = Internal.isLessThan

/**
 * Checks whether the first `DateTime` is before or equal to the second `DateTime`.
 *
 * **Example** (Checking whether a DateTime is earlier or equal)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const date1 = DateTime.makeUnsafe("2024-01-01")
 * const date2 = DateTime.makeUnsafe("2024-01-01")
 * const date3 = DateTime.makeUnsafe("2024-02-01")
 *
 * DateTime.isLessThanOrEqualTo(date1, date2) // => true
 * DateTime.isLessThanOrEqualTo(date1, date3) // => true
 * DateTime.isLessThanOrEqualTo(date3, date1) // => false
 * ```
 *
 * @category comparisons
 * @since 4.0.0
 */
export const isLessThanOrEqualTo: {
  (that: DateTime): (self: DateTime) => boolean
  (self: DateTime, that: DateTime): boolean
} = Internal.isLessThanOrEqualTo

/**
 * Checks whether a `DateTime` is between two other `DateTime` values (inclusive).
 *
 * **Example** (Checking whether a DateTime is within bounds)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const min = DateTime.makeUnsafe("2024-01-01")
 * const max = DateTime.makeUnsafe("2024-12-31")
 * const date = DateTime.makeUnsafe("2024-06-15")
 *
 * DateTime.between(date, { minimum: min, maximum: max }) // => true
 * ```
 *
 * @category comparisons
 * @since 3.6.0
 */
export const between: {
  (options: { minimum: DateTime; maximum: DateTime }): (self: DateTime) => boolean
  (self: DateTime, options: { minimum: DateTime; maximum: DateTime }): boolean
} = Internal.between

/**
 * Checks effectfully if a `DateTime` is in the future compared to the current time.
 *
 * **Details**
 *
 * This is an effectful operation that uses the current time from the `Clock` service.
 *
 * **Example** (Checking future DateTime values effectfully)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Effect } from "effect"
 * import { TestClock } from "effect/testing"
 *
 * const futureDate = DateTime.makeUnsafe(1)
 * await Effect.runPromise(Effect.provide(DateTime.isFuture(futureDate), TestClock.layer())) // => true
 * ```
 *
 * @category comparisons
 * @since 3.6.0
 */
export const isFuture: (self: DateTime) => Effect.Effect<boolean> = Internal.isFuture

/**
 * Checks synchronously if a `DateTime` is in the future compared to the current time.
 *
 * **When to use**
 *
 * Use when checking whether a `DateTime` is in the future with a synchronous
 * live-clock read and `Clock`-based testability is not needed.
 *
 * **Details**
 *
 * This is a synchronous version that uses `Date.now()` directly.
 *
 * **Example** (Checking future DateTime values unsafely)
 *
 * ```ts
 * import { DateTime } from "effect"
 *
 * const oneHourFromNow = DateTime.add(DateTime.nowUnsafe(), { hours: 1 })
 * DateTime.isFutureUnsafe(oneHourFromNow)
 * ```
 *
 * @category comparisons
 * @since 4.0.0
 */
export const isFutureUnsafe: (self: DateTime) => boolean = Internal.isFutureUnsafe

/**
 * Checks effectfully if a `DateTime` is in the past compared to the current time.
 *
 * **Details**
 *
 * This is an effectful operation that uses the current time from the `Clock` service.
 *
 * **Example** (Checking past DateTime values effectfully)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Effect } from "effect"
 * import { TestClock } from "effect/testing"
 *
 * const pastDate = DateTime.makeUnsafe(-1)
 * await Effect.runPromise(Effect.provide(DateTime.isPast(pastDate), TestClock.layer())) // => true
 * ```
 *
 * @category comparisons
 * @since 3.6.0
 */
export const isPast: (self: DateTime) => Effect.Effect<boolean> = Internal.isPast

/**
 * Checks synchronously if a `DateTime` is in the past compared to the current time.
 *
 * **When to use**
 *
 * Use when checking whether a `DateTime` is in the past with a synchronous
 * live-clock read and `Clock`-based testability is not needed.
 *
 * **Details**
 *
 * This is a synchronous version that uses `Date.now()` directly.
 *
 * **Example** (Checking past DateTime values unsafely)
 *
 * ```ts
 * import { DateTime } from "effect"
 *
 * const oneHourAgo = DateTime.subtract(DateTime.nowUnsafe(), { hours: 1 })
 * DateTime.isPastUnsafe(oneHourAgo)
 * ```
 *
 * @category comparisons
 * @since 4.0.0
 */
export const isPastUnsafe: (self: DateTime) => boolean = Internal.isPastUnsafe

// =============================================================================
// conversions
// =============================================================================

/**
 * Gets the UTC `Date` of a `DateTime`.
 *
 * **Details**
 *
 * This always returns the UTC representation, ignoring any time zone information.
 *
 * **Example** (Converting DateTime values to UTC Dates)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const dt = DateTime.makeZonedUnsafe("2024-01-01T12:00:00Z", {
 *   timeZone: "Europe/London"
 * })
 *
 * DateTime.toDateUtc(dt).toISOString() // => "2024-01-01T12:00:00.000Z"
 * ```
 *
 * @category converting
 * @since 3.6.0
 */
export const toDateUtc: (self: DateTime) => Date = Internal.toDateUtc

/**
 * Converts a `DateTime` to a `Date`, applying the time zone first.
 *
 * **Details**
 *
 * For `DateTime.Zoned`, this adjusts for the time zone before converting.
 * For `DateTime.Utc`, this is equivalent to `toDateUtc`.
 *
 * **Example** (Converting DateTime values to Dates)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const utc = DateTime.makeUnsafe("2024-01-01T12:00:00Z")
 * const zoned = DateTime.makeZonedUnsafe("2024-01-01T12:00:00Z", {
 *   timeZone: "Europe/London"
 * })
 *
 * DateTime.toDate(utc).toISOString() // => "2024-01-01T12:00:00.000Z"
 * DateTime.toDate(zoned).toISOString() // => "2024-01-01T12:00:00.000Z"
 * ```
 *
 * @category converting
 * @since 3.6.0
 */
export const toDate: (self: DateTime) => Date = Internal.toDate

/**
 * Computes the time zone offset of a `DateTime.Zoned` in milliseconds.
 *
 * **Details**
 *
 * Returns the offset from UTC in milliseconds. Positive values indicate
 * time zones ahead of UTC, negative values indicate time zones behind UTC.
 *
 * **Example** (Reading zoned offsets)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const zoned = DateTime.makeZonedUnsafe("2024-01-01T12:00:00Z", {
 *   timeZone: "Europe/London"
 * })
 *
 * DateTime.zonedOffset(zoned) // => 0
 * ```
 *
 * @category converting
 * @since 3.6.0
 */
export const zonedOffset: (self: Zoned) => number = Internal.zonedOffset

/**
 * Formats the time zone offset of a `DateTime.Zoned` as an ISO string.
 *
 * **Details**
 *
 * The offset is formatted as "±HH:MM".
 *
 * **Example** (Formatting zoned offsets)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const zoned = DateTime.makeZonedUnsafe("2024-01-01T12:00:00Z", {
 *   timeZone: DateTime.zoneMakeOffset(3 * 60 * 60 * 1000) // +3 hours
 * })
 *
 * DateTime.zonedOffsetIso(zoned) // => "+03:00"
 * ```
 *
 * @category converting
 * @since 3.6.0
 */
export const zonedOffsetIso: (self: Zoned) => string = Internal.zonedOffsetIso

/**
 * Gets the milliseconds since the Unix epoch of a `DateTime`.
 *
 * **Details**
 *
 * This returns the UTC timestamp regardless of any time zone information.
 *
 * **Example** (Reading epoch milliseconds)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const dt = DateTime.makeUnsafe("2024-01-01T00:00:00Z")
 * DateTime.toEpochMillis(dt) // => 1704067200000
 * ```
 *
 * @category converting
 * @since 3.6.0
 */
export const toEpochMillis: (self: DateTime) => number = Internal.toEpochMillis

/**
 * Converts a `DateTime` to the number of seconds since the Unix epoch.
 *
 * **Details**
 *
 * This returns the UTC timestamp regardless of any time zone information.
 * The result is floored to the nearest second.
 *
 * **Example** (Reading epoch seconds)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const dt = DateTime.makeUnsafe("2024-01-01T00:00:00Z")
 * DateTime.toEpochSeconds(dt) // => 1704067200
 * ```
 *
 * @category converting
 * @since 4.0.0
 */
export const toEpochSeconds: (self: DateTime) => number = Internal.toEpochSeconds

/**
 * Removes the time aspect of a `DateTime`, first adjusting for the time
 * zone. It will return a `DateTime.Utc` only containing the date.
 *
 * **Example** (Removing time components)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * // returns "2024-01-01T00:00:00Z"
 * DateTime.makeZonedUnsafe("2024-01-01T05:00:00Z", {
 *   timeZone: "Pacific/Auckland",
 *   adjustForTimeZone: true
 * }).pipe(
 *   DateTime.removeTime,
 *   DateTime.formatIso
 * ) // => "2024-01-01T00:00:00.000Z"
 * ```
 *
 * @category converting
 * @since 3.6.0
 */
export const removeTime: (self: DateTime) => Utc = Internal.removeTime

// =============================================================================
// parts
// =============================================================================

/**
 * Gets the time-zone-adjusted parts of a `DateTime` as an object.
 *
 * **Details**
 *
 * The parts will be time zone adjusted if the `DateTime` is zoned.
 *
 * **Example** (Reading DateTime parts)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const dt = DateTime.makeUnsafe("2024-01-01T12:30:45.123Z")
 * const parts = DateTime.toParts(dt)
 *
 * const selectedParts = [parts.year, parts.month, parts.day, parts.hour] // => [2024, 1, 1, 12]
 * ```
 *
 * @category getters
 * @since 3.6.0
 */
export const toParts: (self: DateTime) => DateTime.PartsWithWeekday = Internal.toParts

/**
 * Gets the UTC parts of a `DateTime` as an object.
 *
 * **Details**
 *
 * The parts will always be in UTC, ignoring any time zone information.
 *
 * **Example** (Reading UTC DateTime parts)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const zoned = DateTime.makeZonedUnsafe("2024-01-01T12:30:45.123Z", {
 *   timeZone: "Europe/London"
 * })
 * const parts = DateTime.toPartsUtc(zoned)
 *
 * const selectedParts = [parts.year, parts.month, parts.day, parts.hour] // => [2024, 1, 1, 12]
 * ```
 *
 * @category getters
 * @since 3.6.0
 */
export const toPartsUtc: (self: DateTime) => DateTime.PartsWithWeekday = Internal.toPartsUtc

/**
 * Gets one UTC part of a `DateTime` as a number.
 *
 * **Details**
 *
 * The part will be in the UTC time zone.
 *
 * **Example** (Reading UTC DateTime parts by key)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const dateTime = DateTime.makeUnsafe({ year: 2024 })
 * DateTime.getPartUtc(dateTime, "year") // => 2024
 * ```
 *
 * @category getters
 * @since 3.6.0
 */
export const getPartUtc: {
  (part: keyof DateTime.PartsWithWeekday): (self: DateTime) => number
  (self: DateTime, part: keyof DateTime.PartsWithWeekday): number
} = Internal.getPartUtc

/**
 * Gets one time-zone-adjusted part of a `DateTime` as a number.
 *
 * **Details**
 *
 * The part will be time zone adjusted.
 *
 * **Example** (Reading DateTime parts by key)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const dateTime = DateTime.makeZonedUnsafe({ year: 2024 }, {
 *   timeZone: "Europe/London"
 * })
 * DateTime.getPart(dateTime, "year") // => 2024
 * ```
 *
 * @category getters
 * @since 3.6.0
 */
export const getPart: {
  (part: keyof DateTime.PartsWithWeekday): (self: DateTime) => number
  (self: DateTime, part: keyof DateTime.PartsWithWeekday): number
} = Internal.getPart

/**
 * Sets time-zone-adjusted parts on a `DateTime`.
 *
 * **Details**
 *
 * The date will be time zone adjusted for `DateTime.Zoned`.
 *
 * **Example** (Updating DateTime parts)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const dt = DateTime.makeZonedUnsafe("2024-01-01T12:00:00Z", { timeZone: "UTC" })
 * const updated = DateTime.setParts(dt, {
 *   year: 2025,
 *   month: 6,
 *   day: 15
 * })
 *
 * updated // => DateTime.makeZonedUnsafe("2025-06-15T12:00:00Z", { timeZone: "UTC" })
 * ```
 *
 * @category transforming
 * @since 3.6.0
 */
export const setParts: {
  (parts: Partial<DateTime.PartsWithWeekday>): <A extends DateTime>(self: A) => A
  <A extends DateTime>(self: A, parts: Partial<DateTime.PartsWithWeekday>): A
} = Internal.setParts

/**
 * Sets UTC parts on a `DateTime`.
 *
 * **Details**
 *
 * The parts are always interpreted as UTC, ignoring any time zone information.
 *
 * **Example** (Updating UTC DateTime parts)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const dt = DateTime.makeUnsafe("2024-01-01T12:00:00Z")
 * const updated = DateTime.setPartsUtc(dt, {
 *   year: 2025,
 *   hour: 18
 * })
 *
 * updated // => DateTime.makeUnsafe("2025-01-01T18:00:00Z")
 * ```
 *
 * @category transforming
 * @since 3.6.0
 */
export const setPartsUtc: {
  (parts: Partial<DateTime.PartsWithWeekday>): <A extends DateTime>(self: A) => A
  <A extends DateTime>(self: A, parts: Partial<DateTime.PartsWithWeekday>): A
} = Internal.setPartsUtc

// =============================================================================
// current time zone
// =============================================================================

/**
 * Context service that supplies the ambient `TimeZone` for APIs that work in
 * the current zone, such as `DateTime.setZoneCurrent` and
 * `DateTime.nowInCurrentZone`.
 *
 * **Details**
 *
 * Provide it with `DateTime.withCurrentZone`, one of the `withCurrentZone*`
 * helpers, or one of the `layerCurrentZone*` layers.
 *
 * **Example** (Accessing the current time zone service)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   return DateTime.zoneToString(yield* DateTime.CurrentTimeZone)
 * })
 *
 * // Provide a time zone
 * const layer = DateTime.layerCurrentZoneNamed("Europe/London")
 * await Effect.runPromise(Effect.provide(program, layer)) // => "Europe/London"
 * ```
 *
 * @category services
 * @since 3.11.0
 */
export class CurrentTimeZone extends Context.Service<CurrentTimeZone, TimeZone>()(
  "effect/DateTime/CurrentTimeZone"
) {}

/**
 * Sets the time zone of a `DateTime` to the current time zone, which is
 * determined by the `CurrentTimeZone` service.
 *
 * **Example** (Setting the current time zone)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Effect } from "effect"
 *
 * await Effect.runPromise(Effect.gen(function*() {
 *   const zoned = yield* DateTime.setZoneCurrent(DateTime.makeUnsafe("2024-01-01"))
 *   return DateTime.zoneToString(zoned.zone)
 * }).pipe(DateTime.withCurrentZoneNamed("Europe/London"))) // => "Europe/London"
 * ```
 *
 * @category accessors
 * @since 3.6.0
 */
export const setZoneCurrent = (self: DateTime): Effect.Effect<Zoned, never, CurrentTimeZone> =>
  Effect.map(CurrentTimeZone, (zone) => setZone(self, zone))

/**
 * Provides the `CurrentTimeZone` to an effect.
 *
 * **Example** (Providing the current time zone)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Effect } from "effect"
 *
 * const zone = DateTime.zoneMakeNamedUnsafe("Europe/London")
 *
 * await Effect.runPromise(Effect.gen(function*() {
 *   const zoned = yield* DateTime.setZoneCurrent(DateTime.makeUnsafe("2024-01-01"))
 *   return DateTime.zoneToString(zoned.zone)
 * }).pipe(DateTime.withCurrentZone(zone))) // => "Europe/London"
 * ```
 *
 * @category providing services
 * @since 3.6.0
 */
export const withCurrentZone: {
  (value: TimeZone): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, Exclude<R, CurrentTimeZone>>
  <A, E, R>(self: Effect.Effect<A, E, R>, value: TimeZone): Effect.Effect<A, E, Exclude<R, CurrentTimeZone>>
} = provideService(CurrentTimeZone)

/**
 * Provides the `CurrentTimeZone` to an effect, using the system's local time
 * zone.
 *
 * **Example** (Providing the local time zone)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Effect } from "effect"
 *
 * await Effect.runPromise(Effect.gen(function*() {
 *   return DateTime.isZoned(yield* DateTime.nowInCurrentZone)
 * }).pipe(DateTime.withCurrentZoneLocal)) // => true
 * ```
 *
 * @category providing services
 * @since 3.6.0
 */
export const withCurrentZoneLocal = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, Exclude<R, CurrentTimeZone>> =>
  Effect.provideServiceEffect(effect, CurrentTimeZone, Effect.sync(zoneMakeLocal))

/**
 * Provides the `CurrentTimeZone` to an effect, using an offset.
 *
 * **Example** (Providing a fixed-offset time zone)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   return DateTime.zoneToString(yield* DateTime.CurrentTimeZone)
 * }).pipe(DateTime.withCurrentZoneOffset(3 * 60 * 60 * 1000))
 *
 * await Effect.runPromise(program) // => "+03:00"
 * ```
 *
 * @category providing services
 * @since 3.6.0
 */
export const withCurrentZoneOffset: {
  (offset: number): <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, Exclude<R, CurrentTimeZone>>
  <A, E, R>(effect: Effect.Effect<A, E, R>, offset: number): Effect.Effect<A, E, Exclude<R, CurrentTimeZone>>
} = dual(
  2,
  <A, E, R>(effect: Effect.Effect<A, E, R>, offset: number): Effect.Effect<A, E, Exclude<R, CurrentTimeZone>> =>
    Effect.provideService(effect, CurrentTimeZone, zoneMakeOffset(offset))
)

/**
 * Provides the `CurrentTimeZone` to an effect using an IANA time zone
 * identifier.
 *
 * **Details**
 *
 * If the time zone is invalid, it will fail with an `IllegalArgumentError`.
 *
 * **Example** (Providing a named time zone)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Effect } from "effect"
 *
 * await Effect.runPromise(Effect.gen(function*() {
 *   const zoned = yield* DateTime.setZoneCurrent(DateTime.makeUnsafe("2024-01-01"))
 *   return DateTime.zoneToString(zoned.zone)
 * }).pipe(DateTime.withCurrentZoneNamed("Europe/London"))) // => "Europe/London"
 * ```
 *
 * @category providing services
 * @since 3.6.0
 */
export const withCurrentZoneNamed: {
  (zone: string): <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E | IllegalArgumentError, Exclude<R, CurrentTimeZone>>
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    zone: string
  ): Effect.Effect<A, E | IllegalArgumentError, Exclude<R, CurrentTimeZone>>
} = dual(
  2,
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    zone: string
  ): Effect.Effect<A, E | IllegalArgumentError, Exclude<R, CurrentTimeZone>> =>
    Effect.provideServiceEffect(effect, CurrentTimeZone, zoneMakeNamedEffect(zone))
)

/**
 * Gets the current time as a `DateTime.Zoned`, using the `CurrentTimeZone`.
 *
 * **Example** (Getting the current time in the current zone)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Effect } from "effect"
 *
 * await Effect.runPromise(Effect.gen(function*() {
 *   return DateTime.zoneToString((yield* DateTime.nowInCurrentZone).zone)
 * }).pipe(DateTime.withCurrentZoneNamed("Europe/London"))) // => "Europe/London"
 * ```
 *
 * @category accessors
 * @since 3.6.0
 */
export const nowInCurrentZone: Effect.Effect<Zoned, never, CurrentTimeZone> = Effect.flatMap(now, setZoneCurrent)

// =============================================================================
// mapping
// =============================================================================

/**
 * Modifies a `DateTime` with a mutable local `Date` copy.
 *
 * **When to use**
 *
 * Use to adjust calendar fields in the `DateTime`'s own time zone with an
 * existing `Date` mutation API.
 *
 * **Details**
 *
 * The `Date` will first have the time zone applied if possible, and then be
 * converted back to a `DateTime` within the same time zone.
 *
 * Supports `disambiguation` when the new wall clock time is ambiguous.
 *
 * **Example** (Mutating DateTime values with Dates)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const dt = DateTime.makeUnsafe("2024-01-01T12:00:00Z")
 *
 * DateTime.mutate(dt, (date) => {
 *   date.setHours(15) // Set to 3 PM
 *   date.setMinutes(30) // Set to 30 minutes
 * })
 * ```
 *
 * @category mapping
 * @since 3.6.0
 */
export const mutate: {
  (
    f: (date: Date) => void,
    options?: {
      readonly disambiguation?: Disambiguation | undefined
    }
  ): <A extends DateTime>(self: A) => A
  <A extends DateTime>(
    self: A,
    f: (date: Date) => void,
    options?: {
      readonly disambiguation?: Disambiguation | undefined
    }
  ): A
} = Internal.mutate

/**
 * Modifies a `DateTime` with a mutable UTC `Date` copy.
 *
 * **When to use**
 *
 * Use to adjust the instant with an existing `Date` mutation API that works on
 * UTC calendar fields.
 *
 * **Example** (Mutating DateTime values with UTC Dates)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const dt = DateTime.makeZonedUnsafe("2024-01-01T12:00:00Z", {
 *   timeZone: "Europe/London"
 * })
 *
 * const modified = DateTime.mutateUtc(dt, (date) => {
 *   date.setUTCHours(18) // Set UTC time to 6 PM
 * })
 *
 * modified // => DateTime.makeZonedUnsafe("2024-01-01T18:00:00Z", { timeZone: "Europe/London" })
 * ```
 *
 * @category mapping
 * @since 3.6.0
 */
export const mutateUtc: {
  (f: (date: Date) => void): <A extends DateTime>(self: A) => A
  <A extends DateTime>(self: A, f: (date: Date) => void): A
} = Internal.mutateUtc

/**
 * Transforms a `DateTime` by applying a function to the number of milliseconds
 * since the Unix epoch.
 *
 * **Example** (Mapping epoch milliseconds)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * // add 10 milliseconds
 * const result = DateTime.makeUnsafe(0).pipe(
 *   DateTime.mapEpochMillis((millis) => millis + 10)
 * )
 * result // => DateTime.makeUnsafe(10)
 * ```
 *
 * @category mapping
 * @since 3.6.0
 */
export const mapEpochMillis: {
  (f: (millis: number) => number): <A extends DateTime>(self: A) => A
  <A extends DateTime>(self: A, f: (millis: number) => number): A
} = Internal.mapEpochMillis

/**
 * Applies a function to a JavaScript `Date` representing the `DateTime` and
 * returns the function's result.
 *
 * **Details**
 *
 * The callback receives the time-zone-adjusted wall-clock date for
 * `DateTime.Zoned` values. Use `DateTime.withDateUtc` when the callback should
 * receive the UTC instant.
 *
 * **Example** (Applying time zone adjusted Dates)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * // get the time zone adjusted date in milliseconds
 * DateTime.makeZonedUnsafe(0, { timeZone: "Europe/London" }).pipe(
 *   DateTime.withDate((date) => date.getTime())
 * ) // => 3600000
 * ```
 *
 * @category mapping
 * @since 3.6.0
 */
export const withDate: {
  <A>(f: (date: Date) => A): (self: DateTime) => A
  <A>(self: DateTime, f: (date: Date) => A): A
} = Internal.withDate

/**
 * Applies a function to a JavaScript `Date` representing the `DateTime`'s UTC
 * instant and returns the function's result.
 *
 * **Details**
 *
 * This ignores any associated time zone. Use `DateTime.withDate` when the
 * callback should receive the time-zone-adjusted wall-clock date.
 *
 * **Example** (Applying UTC Dates)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * // get the date in milliseconds
 * DateTime.makeUnsafe(0).pipe(
 *   DateTime.withDateUtc((date) => date.getTime())
 * ) // => 0
 * ```
 *
 * @category mapping
 * @since 3.6.0
 */
export const withDateUtc: {
  <A>(f: (date: Date) => A): (self: DateTime) => A
  <A>(self: DateTime, f: (date: Date) => A): A
} = Internal.withDateUtc

/**
 * Pattern match on a `DateTime` to handle `Utc` and `Zoned` cases differently.
 *
 * **Example** (Pattern matching DateTime variants)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const dt1 = DateTime.makeUnsafe("2024-01-01T12:00:00Z") // Utc
 * const dt2 = DateTime.makeZonedUnsafe("2024-06-15T14:30:00Z", {
 *   timeZone: "Europe/London"
 * }) // Zoned
 *
 * const result1 = DateTime.match(dt1, {
 *   onUtc: (utc) => `UTC: ${DateTime.formatIso(utc)}`,
 *   onZoned: (zoned) => `Zoned: ${DateTime.formatIsoZoned(zoned)}`
 * })
 *
 * const result2 = DateTime.match(dt2, {
 *   onUtc: (utc) => `UTC: ${DateTime.formatIso(utc)}`,
 *   onZoned: (zoned) => `Zoned: ${DateTime.formatIsoZoned(zoned)}`
 * })
 *
 * result1 // => "UTC: 2024-01-01T12:00:00.000Z"
 * result2 // => "Zoned: 2024-06-15T15:30:00.000+01:00[Europe/London]"
 * ```
 *
 * @category mapping
 * @since 3.6.0
 */
export const match: {
  <A, B>(options: {
    readonly onUtc: (_: Utc) => A
    readonly onZoned: (_: Zoned) => B
  }): (self: DateTime) => A | B
  <A, B>(self: DateTime, options: {
    readonly onUtc: (_: Utc) => A
    readonly onZoned: (_: Zoned) => B
  }): A | B
} = Internal.match

// =============================================================================
// math
// =============================================================================

/**
 * Adds the given `Duration` to a `DateTime`.
 *
 * **When to use**
 *
 * Use to move a `DateTime` by an elapsed duration such as minutes, seconds, or
 * milliseconds.
 *
 * **Details**
 *
 * The duration is converted to milliseconds and added to the epoch
 * milliseconds. Zoned values keep their original time zone.
 *
 * **Gotchas**
 *
 * This is elapsed-time arithmetic, not calendar-aware local date arithmetic.
 * Use `add` when adding days, weeks, months, or years should account for the
 * date/time zone rules.
 *
 * **Example** (Adding durations)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * // add 5 minutes
 * DateTime.makeUnsafe(0).pipe(
 *   DateTime.addDuration("5 minutes")
 * ) // => DateTime.makeUnsafe(300000)
 * ```
 *
 * @see {@link add} for calendar-aware date/time part arithmetic
 * @see {@link subtractDuration} for subtracting an elapsed duration
 *
 * @category math
 * @since 3.6.0
 */
export const addDuration: {
  (duration: Duration.Input): <A extends DateTime>(self: A) => A
  <A extends DateTime>(self: A, duration: Duration.Input): A
} = Internal.addDuration

/**
 * Subtracts the given `Duration` from a `DateTime`.
 *
 * **Example** (Subtracting durations)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * // subtract 5 minutes
 * DateTime.makeUnsafe(0).pipe(
 *   DateTime.subtractDuration("5 minutes")
 * ) // => DateTime.makeUnsafe(-300000)
 * ```
 *
 * @category math
 * @since 3.6.0
 */
export const subtractDuration: {
  (duration: Duration.Input): <A extends DateTime>(self: A) => A
  <A extends DateTime>(self: A, duration: Duration.Input): A
} = Internal.subtractDuration

/**
 * Adds the given `amount` of `unit` to a `DateTime`.
 *
 * **Details**
 *
 * The time zone is taken into account when adding days, weeks, months, and
 * years.
 *
 * **Example** (Adding date and time parts)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * // add 5 minutes
 * DateTime.makeUnsafe(0).pipe(
 *   DateTime.add({ minutes: 5 })
 * ) // => DateTime.makeUnsafe(300000)
 * ```
 *
 * @category math
 * @since 3.6.0
 */
export const add: {
  (parts: Partial<DateTime.PartsForMath>): <A extends DateTime>(self: A) => A
  <A extends DateTime>(self: A, parts: Partial<DateTime.PartsForMath>): A
} = Internal.add

/**
 * Subtracts the given `amount` of `unit` from a `DateTime`.
 *
 * **Example** (Subtracting date and time parts)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * // subtract 5 minutes
 * DateTime.makeUnsafe(0).pipe(
 *   DateTime.subtract({ minutes: 5 })
 * ) // => DateTime.makeUnsafe(-300000)
 * ```
 *
 * @category math
 * @since 3.6.0
 */
export const subtract: {
  (parts: Partial<DateTime.PartsForMath>): <A extends DateTime>(self: A) => A
  <A extends DateTime>(self: A, parts: Partial<DateTime.PartsForMath>): A
} = Internal.subtract

/**
 * Converts a `DateTime` to the start of the given `part`.
 *
 * **Details**
 *
 * If the part is `week`, the `weekStartsOn` option can be used to specify the
 * day of the week that the week starts on. The default is 0 (Sunday).
 *
 * **Example** (Rounding down DateTime values)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * // returns "2024-01-01T00:00:00Z"
 * DateTime.makeUnsafe("2024-01-01T12:00:00Z").pipe(
 *   DateTime.startOf("day"),
 * ) // => DateTime.makeUnsafe("2024-01-01T00:00:00Z")
 * ```
 *
 * @category math
 * @since 3.6.0
 */
export const startOf: {
  (
    part: DateTime.UnitSingular,
    options?: { readonly weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | undefined }
  ): <A extends DateTime>(self: A) => A
  <A extends DateTime>(
    self: A,
    part: DateTime.UnitSingular,
    options?: { readonly weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | undefined }
  ): A
} = Internal.startOf

/**
 * Converts a `DateTime` to the end of the given `part`.
 *
 * **Details**
 *
 * If the part is `week`, the `weekStartsOn` option can be used to specify the
 * day of the week that the week starts on. The default is 0 (Sunday).
 *
 * **Example** (Rounding up DateTime values)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * // returns "2024-01-01T23:59:59.999Z"
 * DateTime.makeUnsafe("2024-01-01T12:00:00Z").pipe(
 *   DateTime.endOf("day"),
 * ) // => DateTime.makeUnsafe("2024-01-01T23:59:59.999Z")
 * ```
 *
 * @category math
 * @since 3.6.0
 */
export const endOf: {
  (
    part: DateTime.UnitSingular,
    options?: { readonly weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | undefined }
  ): <A extends DateTime>(self: A) => A
  <A extends DateTime>(
    self: A,
    part: DateTime.UnitSingular,
    options?: { readonly weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | undefined }
  ): A
} = Internal.endOf

/**
 * Converts a `DateTime` to the nearest given `part`.
 *
 * **Details**
 *
 * If the part is `week`, the `weekStartsOn` option can be used to specify the
 * day of the week that the week starts on. The default is 0 (Sunday).
 *
 * **Example** (Rounding DateTime values to nearest units)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * // returns "2024-01-02T00:00:00Z"
 * DateTime.makeUnsafe("2024-01-01T12:01:00Z").pipe(
 *   DateTime.nearest("day"),
 * ) // => DateTime.makeUnsafe("2024-01-02T00:00:00Z")
 * ```
 *
 * @category math
 * @since 3.6.0
 */
export const nearest: {
  (
    part: DateTime.UnitSingular,
    options?: { readonly weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | undefined }
  ): <A extends DateTime>(self: A) => A
  <A extends DateTime>(
    self: A,
    part: DateTime.UnitSingular,
    options?: { readonly weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | undefined }
  ): A
} = Internal.nearest

// =============================================================================
// formatting
// =============================================================================

/**
 * Formats a `DateTime` with `Intl.DateTimeFormat`.
 *
 * **Details**
 *
 * Unless a `timeZone` option is supplied, UTC values are formatted in UTC and
 * zoned values are formatted in their named zone or fixed-offset zone.
 *
 * Fixed-offset zones depend on runtime support for offset `timeZone`
 * identifiers. When unsupported, formatting falls back to UTC with the
 * `DateTime` adjusted to the offset.
 *
 * **Example** (Formatting DateTime values with Intl options)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const dt = DateTime.makeZonedUnsafe("2024-06-15T14:30:00Z", {
 *   timeZone: "Europe/London"
 * })
 *
 * DateTime.format(dt, {
 *   dateStyle: "full",
 *   timeStyle: "short",
 *   locale: "en-US"
 * }) // => "Saturday, June 15, 2024 at 3:30 PM"
 * ```
 *
 * @category formatting
 * @since 3.6.0
 */
export const format: {
  (
    options?:
      | Intl.DateTimeFormatOptions & {
        readonly locale?: string | undefined
      }
      | undefined
  ): (self: DateTime) => string
  (
    self: DateTime,
    options?:
      | Intl.DateTimeFormatOptions & {
        readonly locale?: string | undefined
      }
      | undefined
  ): string
} = Internal.format

/**
 * Formats a `DateTime` with `Intl.DateTimeFormat` using the system local time
 * zone and locale.
 *
 * **Example** (Formatting DateTime values locally)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const dt = DateTime.makeUnsafe("2024-06-15T14:30:00Z")
 *
 * // Uses system local time zone and locale
 * DateTime.formatLocal(dt, {
 *   year: "numeric",
 *   month: "long",
 *   day: "numeric",
 *   hour: "2-digit",
 *   minute: "2-digit"
 * })
 * ```
 *
 * @category formatting
 * @since 3.6.0
 */
export const formatLocal: {
  (
    options?:
      | Intl.DateTimeFormatOptions & {
        readonly locale?: string | undefined
      }
      | undefined
  ): (self: DateTime) => string
  (
    self: DateTime,
    options?:
      | Intl.DateTimeFormatOptions & {
        readonly locale?: string | undefined
      }
      | undefined
  ): string
} = Internal.formatLocal

/**
 * Formats a `DateTime` with `Intl.DateTimeFormat` using the UTC time zone.
 *
 * **Details**
 *
 * This forces the time zone to be UTC.
 *
 * **Example** (Formatting DateTime values in UTC)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const dt = DateTime.makeZonedUnsafe("2024-06-15T14:30:00Z", {
 *   timeZone: "Europe/London"
 * })
 *
 * // Force UTC formatting regardless of time zone
 * DateTime.formatUtc(dt, {
 *   year: "numeric",
 *   month: "2-digit",
 *   day: "2-digit",
 *   hour: "2-digit",
 *   minute: "2-digit",
 *   timeZoneName: "short"
 * })
 * ```
 *
 * @category formatting
 * @since 3.6.0
 */
export const formatUtc: {
  (
    options?:
      | Intl.DateTimeFormatOptions & {
        readonly locale?: string | undefined
      }
      | undefined
  ): (self: DateTime) => string
  (
    self: DateTime,
    options?:
      | Intl.DateTimeFormatOptions & {
        readonly locale?: string | undefined
      }
      | undefined
  ): string
} = Internal.formatUtc

/**
 * Formats a `DateTime` as a string using the `Intl.DateTimeFormat` API.
 *
 * **When to use**
 *
 * Use when you already have an `Intl.DateTimeFormat` and want it to control the
 * locale, time zone, and formatting options.
 *
 * **Details**
 *
 * The formatter receives the `DateTime` epoch milliseconds. Any time zone
 * conversion comes from the supplied formatter.
 *
 * **Example** (Formatting DateTime values with custom formatters)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const dt = DateTime.makeUnsafe("2024-06-15T14:30:00Z")
 *
 * // Create a custom formatter
 * const formatter = new Intl.DateTimeFormat("de-DE", {
 *   year: "numeric",
 *   month: "long",
 *   day: "numeric",
 *   hour: "2-digit",
 *   minute: "2-digit",
 *   timeZone: "Europe/Berlin"
 * })
 *
 * DateTime.formatIntl(dt, formatter).length > 0 // => true
 * ```
 *
 * @see {@link formatUtc} for formatting with options forced to UTC
 * @see {@link formatIso} for stable ISO formatting
 *
 * @category formatting
 * @since 3.6.0
 */
export const formatIntl: {
  (format: Intl.DateTimeFormat): (self: DateTime) => string
  (self: DateTime, format: Intl.DateTimeFormat): string
} = Internal.formatIntl

/**
 * Formats a `DateTime` as a UTC ISO string.
 *
 * **Details**
 *
 * Always returns the UTC representation in ISO 8601 format, ignoring any time zone.
 *
 * **Example** (Formatting DateTime values as ISO strings)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * DateTime.formatIso(DateTime.makeUnsafe("2024-01-01T12:30:45.123Z")) // => "2024-01-01T12:30:45.123Z"
 *
 * const zoned = DateTime.makeZonedUnsafe("2024-01-01T12:30:45.123Z", {
 *   timeZone: "Europe/London"
 * })
 * DateTime.formatIso(zoned) // => "2024-01-01T12:30:45.123Z"
 * ```
 *
 * @category formatting
 * @since 3.6.0
 */
export const formatIso: (self: DateTime) => string = Internal.formatIso

/**
 * Formats a `DateTime` as a time zone adjusted ISO date string.
 *
 * **Details**
 *
 * Returns only the date part (YYYY-MM-DD) after applying time zone adjustments.
 *
 * **Example** (Formatting DateTime values as ISO dates)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const dt = DateTime.makeUnsafe("2024-01-01T23:30:00Z")
 * DateTime.formatIsoDate(dt) // => "2024-01-01"
 *
 * const zoned = DateTime.makeZonedUnsafe("2024-01-01T23:30:00Z", {
 *   timeZone: "Pacific/Auckland" // UTC+12/13
 * })
 * DateTime.formatIsoDate(zoned) // => "2024-01-02"
 * ```
 *
 * @category formatting
 * @since 3.6.0
 */
export const formatIsoDate: (self: DateTime) => string = Internal.formatIsoDate

/**
 * Formats a `DateTime` as a UTC ISO date string.
 *
 * **Details**
 *
 * Returns only the date part (YYYY-MM-DD) in UTC, ignoring any time zone.
 *
 * **Example** (Formatting DateTime values as UTC ISO dates)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const dt = DateTime.makeUnsafe("2024-01-01T23:30:00Z")
 * DateTime.formatIsoDateUtc(dt) // => "2024-01-01"
 *
 * const zoned = DateTime.makeZonedUnsafe("2024-01-01T23:30:00Z", {
 *   timeZone: "Pacific/Auckland"
 * })
 * DateTime.formatIsoDateUtc(zoned) // => "2024-01-01"
 * ```
 *
 * @category formatting
 * @since 3.6.0
 */
export const formatIsoDateUtc: (self: DateTime) => string = Internal.formatIsoDateUtc

/**
 * Formats a `DateTime.Zoned` as an ISO string with an offset.
 *
 * **Details**
 *
 * For `DateTime.Utc`, returns the same as `formatIso`. For `DateTime.Zoned`,
 * includes the time zone offset in the format.
 *
 * **Example** (Formatting DateTime values with offsets)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const utc = DateTime.makeUnsafe("2024-01-01T12:00:00Z")
 * DateTime.formatIsoOffset(utc) // => "2024-01-01T12:00:00.000Z"
 *
 * const zoned = DateTime.makeZonedUnsafe("2024-01-01T12:00:00Z", {
 *   timeZone: DateTime.zoneMakeOffset(3 * 60 * 60 * 1000)
 * })
 * DateTime.formatIsoOffset(zoned) // => "2024-01-01T15:00:00.000+03:00"
 * ```
 *
 * @category formatting
 * @since 3.6.0
 */
export const formatIsoOffset: (self: DateTime) => string = Internal.formatIsoOffset

/**
 * Formats a `DateTime.Zoned` as a string.
 *
 * **Details**
 *
 * It uses the format: `YYYY-MM-DDTHH:mm:ss.sss+HH:MM[Time/Zone]`.
 *
 * **Example** (Formatting zoned DateTime values)
 *
 * ```ts import.meta.vitest
 * import { DateTime } from "effect"
 *
 * const zoned = DateTime.makeZonedUnsafe("2024-06-15T14:30:45.123Z", {
 *   timeZone: "Europe/London"
 * })
 *
 * DateTime.formatIsoZoned(zoned) // => "2024-06-15T15:30:45.123+01:00[Europe/London]"
 *
 * const offsetZone = DateTime.makeZonedUnsafe("2024-06-15T14:30:45.123Z", {
 *   timeZone: DateTime.zoneMakeOffset(3 * 60 * 60 * 1000)
 * })
 *
 * DateTime.formatIsoZoned(offsetZone) // => "2024-06-15T17:30:45.123+03:00"
 * ```
 *
 * @category formatting
 * @since 3.6.0
 */
export const formatIsoZoned: (self: Zoned) => string = Internal.formatIsoZoned

/**
 * Create a Layer from the given time zone.
 *
 * **Details**
 *
 * This layer provides the `CurrentTimeZone` service with the specified time zone.
 *
 * **Example** (Providing current time zone layers)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Effect } from "effect"
 *
 * const zone = DateTime.zoneMakeNamedUnsafe("Europe/London")
 * const layer = DateTime.layerCurrentZone(zone)
 *
 * const program = Effect.gen(function*() {
 *   const now = yield* DateTime.nowInCurrentZone
 *   return DateTime.zoneToString(now.zone)
 * })
 *
 * // Use the layer to provide the time zone
 * await Effect.runPromise(Effect.provide(program, layer)) // => "Europe/London"
 * ```
 *
 * @category layers
 * @since 3.6.0
 */
export const layerCurrentZone: (resource: NoInfer<TimeZone>) => Layer.Layer<CurrentTimeZone> = Layer.succeed(
  CurrentTimeZone
)

/**
 * Create a Layer from the given time zone offset.
 *
 * **Details**
 *
 * This layer provides the `CurrentTimeZone` service with a fixed offset time zone.
 *
 * **Example** (Providing fixed-offset time zone layers)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Effect } from "effect"
 *
 * // Create a layer for UTC+3
 * const layer = DateTime.layerCurrentZoneOffset(3 * 60 * 60 * 1000)
 *
 * const program = Effect.gen(function*() {
 *   const now = yield* DateTime.nowInCurrentZone
 *   return DateTime.zoneToString(now.zone)
 * })
 *
 * await Effect.runPromise(Effect.provide(program, layer)) // => "+03:00"
 * ```
 *
 * @category layers
 * @since 3.6.0
 */
export const layerCurrentZoneOffset = (offset: number): Layer.Layer<CurrentTimeZone> =>
  Layer.succeed(CurrentTimeZone)(Internal.zoneMakeOffset(offset))

/**
 * Create a Layer from the given IANA time zone identifier.
 *
 * **Details**
 *
 * This layer provides the `CurrentTimeZone` service with a named time zone.
 * If the time zone identifier is invalid, the layer will fail.
 *
 * **Example** (Providing named time zone layers)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Effect } from "effect"
 *
 * const layer = DateTime.layerCurrentZoneNamed("Europe/London")
 *
 * const program = Effect.gen(function*() {
 *   const now = yield* DateTime.nowInCurrentZone
 *   return DateTime.zoneToString(now.zone)
 * })
 *
 * await Effect.runPromise(Effect.provide(program, layer)) // => "Europe/London"
 * ```
 *
 * @category layers
 * @since 3.6.0
 */
export const layerCurrentZoneNamed: (zoneId: string) => Layer.Layer<
  CurrentTimeZone,
  IllegalArgumentError
> = flow(Internal.zoneMakeNamedEffect, Layer.effect(CurrentTimeZone))

/**
 * Create a Layer from the system's local time zone.
 *
 * **Details**
 *
 * This layer provides the `CurrentTimeZone` service using the system's
 * configured local time zone.
 *
 * **Example** (Providing local time zone layers)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const now = yield* DateTime.nowInCurrentZone
 *   return DateTime.isZoned(now)
 * })
 *
 * // Use the system's local time zone
 * await Effect.runPromise(Effect.provide(program, DateTime.layerCurrentZoneLocal)) // => true
 * ```
 *
 * @category layers
 * @since 3.6.0
 */
export const layerCurrentZoneLocal: Layer.Layer<CurrentTimeZone> = Layer.sync(CurrentTimeZone)(zoneMakeLocal)
