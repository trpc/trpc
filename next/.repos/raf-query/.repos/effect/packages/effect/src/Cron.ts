/**
 * Utilities for recurring calendar schedules written as cron expressions or
 * explicit field constraints. A `Cron` value stores allowed seconds, minutes,
 * hours, days of month, months, weekdays, and an optional time zone. The module
 * can create or parse schedules, compare them, test whether a date matches, and
 * find previous or next scheduled occurrences.
 *
 * @since 2.0.0
 */
import * as Arr from "./Array.ts"
import * as Data from "./Data.ts"
import type * as DateTime from "./DateTime.ts"
import * as Equal from "./Equal.ts"
import * as Equ from "./Equivalence.ts"
import { format as formatValue } from "./Formatter.ts"
import { constVoid, dual, pipe } from "./Function.ts"
import * as Hash from "./Hash.ts"
import { type Inspectable, NodeInspectSymbol } from "./Inspectable.ts"
import * as dateTime from "./internal/dateTime.ts"
import * as N from "./Number.ts"
import * as Option from "./Option.ts"
import { type Pipeable, pipeArguments } from "./Pipeable.ts"
import { hasProperty } from "./Predicate.ts"
import * as Result from "./Result.ts"
import * as String from "./String.ts"
import type { Mutable } from "./Types.ts"

const TypeId = "~effect/Cron"

/**
 * Represents a cron schedule with time constraints and timezone information.
 *
 * **When to use**
 *
 * Use to represent a recurring calendar schedule that can be matched against
 * dates or used to compute scheduled occurrences.
 *
 * **Details**
 *
 * A `Cron` instance defines when a scheduled task should run, supporting
 * seconds, minutes, hours, days, months, and weekday constraints. It also
 * supports timezone-aware scheduling.
 *
 * **Example** (Creating a cron schedule)
 *
 * ```ts import.meta.vitest
 * import { Cron, DateTime } from "effect"
 *
 * // Create a cron that runs at 9 AM on weekdays
 * const weekdayMorning = Cron.make({
 *   minutes: [0],
 *   hours: [9],
 *   days: [],
 *   months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
 *   weekdays: [1, 2, 3, 4, 5], // Monday to Friday
 *   tz: DateTime.zoneMakeNamedUnsafe("UTC")
 * })
 *
 * // Check if a date matches the schedule
 * Cron.match(weekdayMorning, "2023-06-05T09:00:00Z") // => true
 * ```
 *
 * @see {@link make} for creating a schedule from explicit field constraints
 * @see {@link parse} for creating a schedule from a cron expression string
 * @see {@link match} for testing a date against a schedule
 * @see {@link next} for finding the next scheduled occurrence
 *
 * @category models
 * @since 2.0.0
 */
export interface Cron extends Pipeable, Equal.Equal, Inspectable {
  readonly [TypeId]: typeof TypeId
  readonly tz: Option.Option<DateTime.TimeZone>
  readonly seconds: ReadonlySet<number>
  readonly minutes: ReadonlySet<number>
  readonly hours: ReadonlySet<number>
  readonly days: ReadonlySet<number>
  readonly months: ReadonlySet<number>
  readonly weekdays: ReadonlySet<number>
  /** @internal */
  readonly and: boolean
  /** @internal */
  readonly first: {
    readonly second: number
    readonly minute: number
    readonly hour: number
    readonly day: number
    readonly month: number
    readonly weekday: number
  }
  /** @internal */
  readonly last: {
    readonly second: number
    readonly minute: number
    readonly hour: number
    readonly day: number
    readonly month: number
    readonly weekday: number
  }
  /** @internal */
  readonly next: {
    readonly second: ReadonlyArray<number | undefined>
    readonly minute: ReadonlyArray<number | undefined>
    readonly hour: ReadonlyArray<number | undefined>
    readonly day: ReadonlyArray<number | undefined>
    readonly month: ReadonlyArray<number | undefined>
    readonly weekday: ReadonlyArray<number | undefined>
  }
  /** @internal */
  readonly prev: {
    readonly second: ReadonlyArray<number | undefined>
    readonly minute: ReadonlyArray<number | undefined>
    readonly hour: ReadonlyArray<number | undefined>
    readonly day: ReadonlyArray<number | undefined>
    readonly month: ReadonlyArray<number | undefined>
    readonly weekday: ReadonlyArray<number | undefined>
  }
}

function toPojo(cron: Cron): Record<string, unknown> {
  const out: Record<string, unknown> = {
    tz: cron.tz,
    and: cron.and,
    seconds: Arr.fromIterable(cron.seconds),
    minutes: Arr.fromIterable(cron.minutes),
    hours: Arr.fromIterable(cron.hours),
    days: Arr.fromIterable(cron.days),
    months: Arr.fromIterable(cron.months),
    weekdays: Arr.fromIterable(cron.weekdays)
  }
  return out
}

const CronProto = {
  [TypeId]: TypeId,
  [Equal.symbol](this: Cron, that: unknown) {
    return isCron(that) && equals(this, that)
  },
  [Hash.symbol](this: Cron): number {
    return pipe(
      Hash.hash(this.tz),
      Hash.combine(Hash.hash(this.and)),
      Hash.combine(Hash.array(Arr.fromIterable(this.seconds))),
      Hash.combine(Hash.array(Arr.fromIterable(this.minutes))),
      Hash.combine(Hash.array(Arr.fromIterable(this.hours))),
      Hash.combine(Hash.array(Arr.fromIterable(this.days))),
      Hash.combine(Hash.array(Arr.fromIterable(this.months))),
      Hash.combine(Hash.array(Arr.fromIterable(this.weekdays)))
    )
  },
  toObject(this: Cron) {
    return toPojo(this)
  },
  toString(this: Cron) {
    return `Cron(${formatValue(toPojo(this))})`
  },
  toJSON(this: Cron) {
    const out = toPojo(this)
    out["_id"] = "Cron"
    return out
  },
  [NodeInspectSymbol](this: Cron) {
    return this.toJSON()
  },
  pipe() {
    return pipeArguments(this, arguments)
  }
}

/**
 * Checks whether a given value is a Cron instance.
 *
 * **When to use**
 *
 * Use to narrow an unknown value before treating it as a `Cron` schedule.
 *
 * **Details**
 *
 * This function is a type guard that determines whether the provided
 * value is a valid Cron instance by checking for the presence of the
 * Cron type identifier.
 *
 * **Example** (Checking cron values)
 *
 * ```ts import.meta.vitest
 * import { Cron } from "effect"
 *
 * const cron = Cron.make({
 *   minutes: [0],
 *   hours: [9],
 *   days: [1, 15],
 *   months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
 *   weekdays: [1, 2, 3, 4, 5]
 * })
 *
 * Cron.isCron(cron) // => true
 * Cron.isCron({}) // => false
 * Cron.isCron("not a cron") // => false
 * ```
 *
 * @see {@link make} for constructing a `Cron` value directly
 * @see {@link parse} for constructing a `Cron` value from a string
 *
 * @category guards
 * @since 2.0.0
 */
export const isCron = (u: unknown): u is Cron => hasProperty(u, TypeId)

/**
 * Creates a Cron instance from time constraints.
 *
 * **When to use**
 *
 * Use to build a cron schedule from explicit sets of allowed time-field values.
 *
 * **Details**
 *
 * Constructs a cron schedule by specifying which seconds, minutes, hours,
 * days, months, and weekdays the schedule should match. Empty arrays leave a
 * time unit unrestricted. If only days or weekdays are restricted, that field
 * must match. When both are restricted, the default matches either field; set
 * `and: true` to require both fields to match. Weekdays range from `0` (Sunday)
 * to `7` (also Sunday). The constructor throws a `RangeError` when a field
 * contains a non-integer or out-of-range value.
 *
 * **Example** (Creating schedules from constraints)
 *
 * ```ts import.meta.vitest
 * import { Cron, DateTime } from "effect"
 *
 * const utc = DateTime.zoneMakeNamedUnsafe("UTC")
 *
 * // Every day at midnight
 * const midnight = Cron.make({
 *   minutes: [0],
 *   hours: [0],
 *   days: [
 *     1,
 *     2,
 *     3,
 *     4,
 *     5,
 *     6,
 *     7,
 *     8,
 *     9,
 *     10,
 *     11,
 *     12,
 *     13,
 *     14,
 *     15,
 *     16,
 *     17,
 *     18,
 *     19,
 *     20,
 *     21,
 *     22,
 *     23,
 *     24,
 *     25,
 *     26,
 *     27,
 *     28,
 *     29,
 *     30,
 *     31
 *   ],
 *   months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
 *   weekdays: [0, 1, 2, 3, 4, 5, 6],
 *   tz: utc
 * })
 *
 * // Every 15 minutes during business hours on weekdays
 * const businessHours = Cron.make({
 *   minutes: [0, 15, 30, 45],
 *   hours: [9, 10, 11, 12, 13, 14, 15, 16, 17],
 *   days: [],
 *   months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
 *   weekdays: [1, 2, 3, 4, 5], // Monday to Friday
 *   tz: utc
 * })
 *
 * Cron.match(midnight, "2024-01-01T00:00:00Z") // => true
 * Cron.match(businessHours, "2024-01-01T09:15:00Z") // => true
 * ```
 *
 * @see {@link parse} for building a schedule from a cron expression string
 *
 * @category constructors
 * @since 2.0.0
 */
export const make = (values: {
  readonly seconds?: Iterable<number> | undefined
  readonly minutes: Iterable<number>
  readonly hours: Iterable<number>
  readonly days: Iterable<number>
  readonly months: Iterable<number>
  readonly weekdays: Iterable<number>
  readonly and?: boolean | undefined
  readonly tz?: DateTime.TimeZone | undefined
}): Cron => {
  const o: Mutable<Cron> = Object.create(CronProto)
  o.seconds = restrictions.seconds(values.seconds ?? [0])
  o.minutes = restrictions.minutes(values.minutes)
  o.hours = restrictions.hours(values.hours)
  o.days = restrictions.days(values.days)
  o.months = restrictions.months(values.months)
  o.weekdays = restrictions.weekdays(values.weekdays)
  o.and = values.and === true
  o.tz = Option.fromUndefinedOr(values.tz)

  const seconds = Array.from(o.seconds)
  const minutes = Array.from(o.minutes)
  const hours = Array.from(o.hours)
  const days = Array.from(o.days)
  const months = Array.from(o.months)
  const weekdays = Array.from(o.weekdays)

  o.first = {
    second: seconds[0] ?? 0,
    minute: minutes[0] ?? 0,
    hour: hours[0] ?? 0,
    day: days[0] ?? 1,
    month: (months[0] ?? 1) - 1,
    weekday: weekdays[0] ?? 0
  }

  o.last = {
    second: seconds[seconds.length - 1] ?? 59,
    minute: minutes[minutes.length - 1] ?? 59,
    hour: hours[hours.length - 1] ?? 23,
    day: days[days.length - 1] ?? 31,
    month: (months[months.length - 1] ?? 12) - 1,
    weekday: weekdays[weekdays.length - 1] ?? 6
  }

  o.next = {
    second: lookup.next.second(seconds),
    minute: lookup.next.minute(minutes),
    hour: lookup.next.hour(hours),
    day: lookup.next.day(days),
    month: lookup.next.month(months),
    weekday: lookup.next.weekday(weekdays)
  }

  o.prev = {
    second: lookup.prev.second(seconds),
    minute: lookup.prev.minute(minutes),
    hour: lookup.prev.hour(hours),
    day: lookup.prev.day(days),
    month: lookup.prev.month(months),
    weekday: lookup.prev.weekday(weekdays)
  }

  return o
}

const makeRestrictions = (
  field: string,
  min: number,
  max: number,
  normalize: (value: number) => number = (value) => value
): (values: Iterable<number>) => Set<number> =>
(values) => {
  const restrictions: Array<number> = []
  for (const value of values) {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new RangeError(`${field} must contain only integers between ${min} and ${max}`)
    }
    restrictions.push(normalize(value))
  }
  return new Set(Arr.sort(restrictions, N.Order))
}

const restrictions = {
  seconds: makeRestrictions("seconds", 0, 59),
  minutes: makeRestrictions("minutes", 0, 59),
  hours: makeRestrictions("hours", 0, 23),
  days: makeRestrictions("days", 1, 31),
  months: makeRestrictions("months", 1, 12),
  weekdays: makeRestrictions("weekdays", 0, 7, (value) => value === 7 ? 0 : value)
}

const makeLookupTable = (
  size: number,
  dir: "next" | "prev"
): (values: ReadonlyArray<number>) => Array<number | undefined> =>
(values) => {
  const result = new Array(size).fill(undefined)
  if (values.length === 0) {
    return result
  }

  let current: number | undefined = undefined

  if (dir === "next") {
    let index = values.length - 1
    for (let i = size - 1; i >= 0; i--) {
      while (index >= 0 && values[index] >= i) {
        current = values[index--]
      }
      result[i] = current
    }
  } else {
    let index = 0
    for (let i = 0; i < size; i++) {
      while (index < values.length && values[index] <= i) {
        current = values[index++]
      }
      result[i] = current
    }
  }

  return result
}

const lookup = {
  prev: {
    second: makeLookupTable(60, "prev"),
    minute: makeLookupTable(60, "prev"),
    hour: makeLookupTable(24, "prev"),
    day: makeLookupTable(32, "prev"),
    month: makeLookupTable(13, "prev"),
    weekday: makeLookupTable(7, "prev")
  },
  next: {
    second: makeLookupTable(60, "next"),
    minute: makeLookupTable(60, "next"),
    hour: makeLookupTable(24, "next"),
    day: makeLookupTable(32, "next"),
    month: makeLookupTable(13, "next"),
    weekday: makeLookupTable(7, "next")
  }
}

const CronParseErrorTypeId = "~effect/Cron/CronParseError"

/**
 * Represents an error that occurs when parsing a cron expression fails.
 *
 * **When to use**
 *
 * Use to handle invalid cron expression failures returned by `parse`.
 *
 * **Details**
 *
 * This error provides information about what went wrong during parsing,
 * including the error message and optionally the input that caused the error.
 *
 * **Example** (Handling cron parse failures)
 *
 * ```ts import.meta.vitest
 * import { Cron, Result } from "effect"
 *
 * const expected = Result.fail(new Cron.CronParseError({
 *   message: "Invalid number of segments in cron expression",
 *   input: "invalid expression"
 * }))
 *
 * Cron.parse("invalid expression") // => expected
 * ```
 *
 * @see {@link parse} for the parser that returns this error in `Result.fail`
 * @see {@link isCronParseError} for narrowing unknown values to this error type
 *
 * @category errors
 * @since 4.0.0
 */
export class CronParseError extends Data.TaggedError("CronParseError")<{
  readonly message: string
  readonly input?: string
}> {
  readonly [CronParseErrorTypeId]: typeof CronParseErrorTypeId = CronParseErrorTypeId
}

/**
 * Checks whether a given value is a CronParseError instance.
 *
 * **When to use**
 *
 * Use to narrow an unknown failure before handling it as a cron parse error.
 *
 * **Details**
 *
 * This function is a type guard that determines whether the provided
 * value is a CronParseError by checking for the presence of the
 * CronParseError type identifier.
 *
 * **Example** (Checking cron parse errors)
 *
 * ```ts import.meta.vitest
 * import { Cron, Result } from "effect"
 *
 * Result.mapError(Cron.parse("invalid cron expression"), Cron.isCronParseError) // => Result.fail(true)
 * Cron.isCronParseError(new Error("regular error")) // => false
 * Cron.isCronParseError("not an error") // => false
 * ```
 *
 * @see {@link CronParseError} for the parse error type
 * @see {@link parse} for producing `CronParseError` values on invalid input
 *
 * @category guards
 * @since 4.0.0
 */
export const isCronParseError = (u: unknown): u is CronParseError => hasProperty(u, CronParseErrorTypeId)

/**
 * Parses a cron expression safely into a `Cron` instance, returning a `Result`
 * instead of throwing.
 *
 * **When to use**
 *
 * Use to parse cron expressions from configuration or user input while handling
 * invalid input as a `Result`.
 *
 * **Details**
 *
 * The expression may contain five fields, where seconds default to `0`, or six
 * fields including seconds. Fields support `*`, comma-separated values, ranges,
 * steps, and month or weekday aliases. Invalid expressions fail with
 * `CronParseError`. When both the day-of-month and weekday fields are
 * restricted, a date matches if either field matches. When either field starts
 * with `*`, both fields must match; an unrestricted field always matches.
 *
 * **Example** (Parsing cron expressions)
 *
 * ```ts import.meta.vitest
 * import { Cron, Result } from "effect"
 *
 * // At 04:00 on every day-of-month from 8 through 14.
 * const cron = Result.getOrThrow(Cron.parse("0 0 4 8-14 * *"))
 *
 * Array.from(cron.hours) // => [4]
 * Array.from(cron.days) // => [8, 9, 10, 11, 12, 13, 14]
 * ```
 *
 * @see {@link parseUnsafe} for throwing on invalid cron expressions
 * @see {@link make} for constructing a schedule from explicit field constraints
 *
 * @category constructors
 * @since 2.0.0
 */
export const parse = (cron: string, tz?: DateTime.TimeZone | string): Result.Result<Cron, CronParseError> => {
  const segments = cron.trim().split(/\s+/).filter(String.isNonEmpty)
  if (segments.length !== 5 && segments.length !== 6) {
    return Result.fail(new CronParseError({ message: `Invalid number of segments in cron expression`, input: cron }))
  }

  if (segments.length === 5) {
    segments.unshift("0")
  }

  const [seconds, minutes, hours, days, months, weekdays] = segments
  const zone = tz === undefined || dateTime.isTimeZone(tz) ?
    Result.succeed(tz) :
    Result.fromOption(
      dateTime.zoneFromString(tz),
      () => new CronParseError({ message: `Invalid time zone in cron expression`, input: tz })
    )

  return Result.all({
    tz: zone,
    seconds: parseSegment(seconds, secondOptions),
    minutes: parseSegment(minutes, minuteOptions),
    hours: parseSegment(hours, hourOptions),
    days: parseSegment(days, dayOptions),
    months: parseSegment(months, monthOptions),
    weekdays: parseSegment(weekdays, weekdayOptions)
  }).pipe(Result.map(({ tz, seconds, minutes, hours, days, months, weekdays }) =>
    make({
      tz,
      seconds: seconds.values,
      minutes: minutes.values,
      hours: hours.values,
      days: days.values,
      months: months.values,
      weekdays: weekdays.values,
      and: (days.wildcard || weekdays.wildcard) && days.values.size !== 0 && weekdays.values.size !== 0
    })
  ))
}

/**
 * Parses a cron expression into a `Cron` instance, throwing on failure.
 *
 * **When to use**
 *
 * Use when you expect the input to be valid and want to avoid handling the
 * `Result` type.
 *
 * **Example** (Parsing cron expressions unsafely)
 *
 * ```ts import.meta.vitest
 * import { Cron } from "effect"
 *
 * // At 04:00 on every day-of-month from 8 through 14
 * const cron = Cron.parseUnsafe("0 0 4 8-14 * *", "UTC")
 *
 * // With timezone
 * const cronWithTz = Cron.parseUnsafe("0 0 9 * * *", "America/New_York")
 *
 * // This would throw an error
 * // const invalid = Cron.parseUnsafe("invalid expression")
 * Cron.match(cron, "2024-01-10T04:00:00Z") // => true
 * Cron.match(cronWithTz, "2024-01-01T14:00:00Z") // => true
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const parseUnsafe = (cron: string, tz?: DateTime.TimeZone | string): Cron => Result.getOrThrow(parse(cron, tz))

/**
 * Formats a `Cron` instance as a cron expression.
 *
 * **Details**
 *
 * The default seconds field (`0`) is omitted unless `includeSeconds` is `true`.
 * Other seconds configurations are always included.
 *
 * **Gotchas**
 *
 * Formatting drops the timezone information and the `and` restriction between
 * days and weekdays. Parsing the result is therefore not guaranteed to produce
 * an equivalent schedule.
 *
 * **Example** (Formatting a cron expression)
 *
 * ```ts import.meta.vitest
 * import { Cron } from "effect"
 *
 * const cron = Cron.parseUnsafe("23 0-20/2 * * 0", "UTC")
 *
 * Cron.format(cron) // => "23 0-20/2 * * 0"
 * Cron.format(cron, { includeSeconds: true }) // => "0 23 0-20/2 * * 0"
 * ```
 *
 * @category getters
 * @since 4.0.0
 */
export const format = (cron: Cron, options?: {
  readonly includeSeconds?: boolean | undefined
}): string => {
  const segments = [cron.seconds, cron.minutes, cron.hours, cron.days, cron.months, cron.weekdays]
    .map(formatSegment)
  return (
    options?.includeSeconds !== true && cron.seconds.size === 1 && cron.seconds.has(0) ? segments.slice(1) : segments
  ).join(" ")
}

const formatSegment = (values: ReadonlySet<number>): string => {
  if (values.size === 0) {
    return "*"
  }
  const array = Array.from(values)
  const segments: Array<string> = []
  let index = 0
  while (index < array.length) {
    const start = array[index]!
    const step = array[index + 1]! - start
    if (index + 2 < array.length && array[index + 2]! - array[index + 1]! === step) {
      let end = index + 2
      while (end + 1 < array.length && array[end + 1]! - array[end]! === step) {
        end++
      }
      segments.push(`${start}-${array[end]}${step === 1 ? "" : `/${step}`}`)
      index = end + 1
    } else {
      segments.push(`${start}`)
      index++
    }
  }
  return segments.join(",")
}

/**
 * Returns `true` when a date/time matches a `Cron` schedule.
 *
 * **When to use**
 *
 * Use to test whether a specific date/time satisfies a cron schedule.
 *
 * **Details**
 *
 * The schedule's timezone determines which calendar fields are read from the
 * input; the host system's timezone is used when the schedule has no timezone.
 * Seconds, minutes, hours, and months are checked against their restrictions;
 * an empty set leaves that field unrestricted. If only `days` or `weekdays` is
 * restricted, that field must match. If both are restricted, either may match
 * unless the schedule was created with `and: true`, which requires both to
 * match.
 *
 * **Example** (Matching dates against a schedule)
 *
 * ```ts import.meta.vitest
 * import { Cron, Result } from "effect"
 *
 * const cron = Result.getOrThrow(Cron.parse("0 0 4 8-14 * *", "UTC"))
 *
 * // Check if specific dates match
 * Cron.match(cron, "2021-01-08T04:00:00Z") // => true
 * Cron.match(cron, "2021-01-08T05:00:00Z") // => false
 * Cron.match(cron, "2021-01-07T04:00:00Z") // => false
 * ```
 *
 * @see {@link next} for finding the next matching date/time
 * @see {@link prev} for finding the previous matching date/time
 *
 * @category predicates
 * @since 2.0.0
 */
export const match = (cron: Cron, date: DateTime.DateTime.Input): boolean => {
  const parts = dateTime.makeZonedUnsafe(date, {
    timeZone: Option.getOrUndefined(cron.tz)
  }).pipe(dateTime.toParts)

  if (cron.seconds.size !== 0 && !cron.seconds.has(parts.second)) {
    return false
  }

  if (cron.minutes.size !== 0 && !cron.minutes.has(parts.minute)) {
    return false
  }

  if (cron.hours.size !== 0 && !cron.hours.has(parts.hour)) {
    return false
  }

  if (cron.months.size !== 0 && !cron.months.has(parts.month)) {
    return false
  }

  if (cron.days.size === 0 && cron.weekdays.size === 0) {
    return true
  }

  if (cron.and) {
    return (cron.days.size === 0 || cron.days.has(parts.day)) &&
      (cron.weekdays.size === 0 || cron.weekdays.has(parts.weekDay))
  }

  if (cron.weekdays.size === 0) {
    return cron.days.has(parts.day)
  }

  if (cron.days.size === 0) {
    return cron.weekdays.has(parts.weekDay)
  }

  return cron.days.has(parts.day) || cron.weekdays.has(parts.weekDay)
}

const daysInMonth = (date: Date): number =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()

/**
 * Returns the next scheduled date/time for the given Cron instance.
 *
 * **When to use**
 *
 * Use to find the next occurrence of a cron schedule after a specific date/time
 * or after the current time.
 *
 * **Details**
 *
 * Searches for the next date and time when the cron schedule should trigger,
 * starting after the specified date/time or after the current time when no
 * date is provided.
 *
 * **Example** (Finding the next occurrence)
 *
 * ```ts import.meta.vitest
 * import { Cron, Result } from "effect"
 *
 * const cron = Result.getOrThrow(Cron.parse("0 0 4 8-14 * *", "UTC"))
 *
 * // Get next run after a specific date
 * Cron.next(cron, "2021-01-01T00:00:00Z").toISOString() // => "2021-01-08T04:00:00.000Z"
 * ```
 *
 * @see {@link prev} for finding the previous scheduled occurrence
 * @see {@link sequence} for iterating future scheduled occurrences
 *
 * @category getters
 * @since 2.0.0
 */
export const next = (cron: Cron, now?: DateTime.DateTime.Input): Date => {
  return stepCron(cron, now, "next")
}

/**
 * Returns the previous scheduled date/time for the given Cron instance.
 *
 * **When to use**
 *
 * Use to find the most recent occurrence of a cron schedule before a specific
 * date/time or before the current time.
 *
 * **Details**
 *
 * When no date/time is provided, the search starts from the current time.
 *
 * **Gotchas**
 *
 * The search is strict: if the supplied date/time already matches the schedule,
 * the result is the earlier occurrence.
 *
 * @see {@link next} for finding the next scheduled occurrence
 *
 * @category getters
 * @since 3.20.0
 */
export const prev = (cron: Cron, now?: DateTime.DateTime.Input): Date => {
  return stepCron(cron, now, "prev")
}

const stepCron = (cron: Cron, now: DateTime.DateTime.Input | undefined, direction: "next" | "prev"): Date => {
  const tz = Option.getOrUndefined(cron.tz)
  const zoned = dateTime.makeZonedUnsafe(now ?? new Date(), {
    timeZone: tz
  })

  const reverse = direction === "prev"
  const tick = reverse ? -1 : 1
  const table = cron[direction]
  const boundary = reverse ? cron.last : cron.first

  const needsStep = reverse ?
    (next: number, current: number) => next < current :
    (next: number, current: number) => next > current

  const utc = tz !== undefined && dateTime.isTimeZoneNamed(tz) && tz.id === "UTC"
  const adjustDst = utc ? constVoid : (current: Date) => {
    const adjusted = dateTime.makeZonedUnsafe(current, {
      timeZone: zoned.zone,
      adjustForTimeZone: true,
      disambiguation: reverse ? "later" : undefined
    }).pipe(dateTime.toDate)

    const drift = current.getTime() - adjusted.getTime()
    if (reverse ? drift !== 0 : drift > 0) {
      current.setTime(reverse ? adjusted.getTime() : current.getTime() + drift)
    }
  }

  const result = dateTime.mutate(zoned, (current) => {
    current.setUTCSeconds(current.getUTCSeconds() + tick, 0)

    for (let i = 0; i < 10_000; i++) {
      if (cron.seconds.size !== 0) {
        const currentSecond = current.getUTCSeconds()
        const nextSecond = table.second[currentSecond]
        if (nextSecond === undefined) {
          current.setUTCMinutes(current.getUTCMinutes() + tick, boundary.second)
          adjustDst(current)
          continue
        }
        if (needsStep(nextSecond, currentSecond)) {
          current.setUTCSeconds(nextSecond)
          adjustDst(current)
          continue
        }
      }

      if (cron.minutes.size !== 0) {
        const currentMinute = current.getUTCMinutes()
        const nextMinute = table.minute[currentMinute]
        if (nextMinute === undefined) {
          current.setUTCHours(current.getUTCHours() + tick, boundary.minute, boundary.second)
          adjustDst(current)
          continue
        }
        if (needsStep(nextMinute, currentMinute)) {
          current.setUTCMinutes(nextMinute, boundary.second)
          adjustDst(current)
          continue
        }
      }

      if (cron.hours.size !== 0) {
        const currentHour = current.getUTCHours()
        const nextHour = table.hour[currentHour]
        if (nextHour === undefined) {
          current.setUTCDate(current.getUTCDate() + tick)
          current.setUTCHours(boundary.hour, boundary.minute, boundary.second)
          adjustDst(current)
          continue
        }
        if (needsStep(nextHour, currentHour)) {
          current.setUTCHours(nextHour, boundary.minute, boundary.second)
          adjustDst(current)
          continue
        }
      }

      if (cron.weekdays.size !== 0 || cron.days.size !== 0) {
        if (cron.and) {
          const matchesDay = cron.days.size === 0 || cron.days.has(current.getUTCDate())
          const matchesWeekday = cron.weekdays.size === 0 || cron.weekdays.has(current.getUTCDay())
          if (!matchesDay || !matchesWeekday) {
            current.setUTCDate(current.getUTCDate() + tick)
            current.setUTCHours(boundary.hour, boundary.minute, boundary.second)
            adjustDst(current)
            continue
          }
        } else {
          let a: number = reverse ? -Infinity : Infinity
          let b: number = reverse ? -Infinity : Infinity

          if (cron.weekdays.size !== 0) {
            const currentWeekday = current.getUTCDay()
            const nextWeekday = table.weekday[currentWeekday]
            if (nextWeekday === undefined) {
              a = reverse ?
                boundary.weekday - 7 - currentWeekday :
                7 - currentWeekday + boundary.weekday
            } else {
              a = nextWeekday - currentWeekday
            }
          }

          if (cron.days.size !== 0 && a !== 0) {
            const currentDay = current.getUTCDate()
            const nextDay = table.day[currentDay]
            if (nextDay === undefined) {
              if (reverse) {
                const previous = new Date(current)
                // Day zero is the previous month's last day. These two probes cover every
                // valid day-of-month.
                previous.setUTCDate(0)
                let day = table.day[previous.getUTCDate()]
                if (day === undefined) {
                  previous.setUTCDate(0)
                  day = table.day[previous.getUTCDate()]
                }
                if (day === undefined) {
                  throw new Error("Unable to find cron date")
                }
                previous.setUTCDate(day)
                b = (previous.getTime() - current.getTime()) / 86_400_000
              } else {
                b = daysInMonth(current) - currentDay + boundary.day
              }
            } else if (!reverse && nextDay > daysInMonth(current)) {
              // The next matching day does not exist in the current month. Setting it
              // directly would overflow and skip earlier matching days next month.
              b = daysInMonth(current) - currentDay + boundary.day
            } else {
              b = nextDay - currentDay
            }
          }

          const addDays = reverse ? Math.max(a, b) : Math.min(a, b)
          if (addDays !== 0) {
            current.setUTCDate(current.getUTCDate() + addDays)
            current.setUTCHours(boundary.hour, boundary.minute, boundary.second)
            adjustDst(current)
            continue
          }
        }
      }

      if (cron.months.size !== 0) {
        const currentMonth = current.getUTCMonth() + 1
        const nextMonth = table.month[currentMonth]
        const clampBoundaryDay = (targetMonthIndex: number): number => {
          const maxDayInMonth = daysInMonth(new Date(Date.UTC(current.getUTCFullYear(), targetMonthIndex + 1, 0)))
          if (cron.days.size !== 0 && cron.weekdays.size === 0) {
            return reverse ? table.day[maxDayInMonth] ?? maxDayInMonth : boundary.day
          }
          return reverse ? maxDayInMonth : 1
        }
        if (nextMonth === undefined) {
          current.setUTCFullYear(current.getUTCFullYear() + tick)
          current.setUTCMonth(boundary.month, clampBoundaryDay(boundary.month))
          current.setUTCHours(boundary.hour, boundary.minute, boundary.second)
          adjustDst(current)
          continue
        }
        if (needsStep(nextMonth, currentMonth)) {
          const targetMonthIndex = nextMonth - 1
          current.setUTCMonth(targetMonthIndex, clampBoundaryDay(targetMonthIndex))
          current.setUTCHours(boundary.hour, boundary.minute, boundary.second)
          adjustDst(current)
          continue
        }
      }

      return
    }

    throw new Error("Unable to find cron date")
  })

  return dateTime.toDateUtc(result)
}

/**
 * Returns an infinite iterator that yields dates matching the Cron schedule.
 *
 * **When to use**
 *
 * Use to lazily iterate future occurrences of a cron schedule.
 *
 * **Details**
 *
 * The iterator generates an infinite sequence of dates when the cron schedule
 * should trigger, starting after the specified date/time or after the current
 * time when no date is provided.
 *
 * **Example** (Iterating scheduled occurrences)
 *
 * ```ts import.meta.vitest
 * import { Cron, Result } from "effect"
 *
 * const cron = Result.getOrThrow(Cron.parse("0 0 9 * * 1-5", "UTC")) // 9 AM weekdays
 *
 * // Get first 5 occurrences
 * const iterator = Cron.sequence(cron, "2023-01-01T00:00:00Z")
 * const next5 = Array.from({ length: 5 }, () => iterator.next().value.toISOString())
 * const expected = [
 *   "2023-01-02T09:00:00.000Z",
 *   "2023-01-03T09:00:00.000Z",
 *   "2023-01-04T09:00:00.000Z",
 *   "2023-01-05T09:00:00.000Z",
 *   "2023-01-06T09:00:00.000Z"
 * ]
 *
 * next5 // => expected
 * ```
 *
 * @see {@link next} for computing one next occurrence
 *
 * @category sequencing
 * @since 2.0.0
 */
export const sequence = function*(cron: Cron, now?: DateTime.DateTime.Input): IterableIterator<Date> {
  while (true) {
    yield now = next(cron, now)
  }
}

/**
 * Equivalence instance for comparing the timezone, field restrictions, and
 * day-matching mode of two `Cron` schedules.
 *
 * **When to use**
 *
 * Use to compare cron schedules through APIs that accept an equivalence
 * relation.
 *
 * **Details**
 *
 * This comparison checks the optional timezone, the `and` day-matching mode,
 * seconds, minutes, hours, days, months, and weekdays.
 *
 * **Example** (Comparing schedules with equivalence)
 *
 * ```ts import.meta.vitest
 * import { Cron } from "effect"
 *
 * const cron1 = Cron.make({
 *   minutes: [0, 30],
 *   hours: [9],
 *   days: [1, 15],
 *   months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
 *   weekdays: [1, 2, 3, 4, 5]
 * })
 *
 * const cron2 = Cron.make({
 *   minutes: [30, 0], // Different order
 *   hours: [9],
 *   days: [15, 1], // Different order
 *   months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
 *   weekdays: [1, 2, 3, 4, 5]
 * })
 *
 * Cron.Equivalence(cron1, cron2) // => true
 * ```
 *
 * @see {@link equals} for directly comparing two `Cron` values
 *
 * @category instances
 * @since 2.0.0
 */
export const Equivalence: Equ.Equivalence<Cron> = Equ.make((self, that) =>
  Equal.equals(self.tz, that.tz) &&
  self.and === that.and &&
  restrictionsEquals(self.seconds, that.seconds) &&
  restrictionsEquals(self.minutes, that.minutes) &&
  restrictionsEquals(self.hours, that.hours) &&
  restrictionsEquals(self.days, that.days) &&
  restrictionsEquals(self.months, that.months) &&
  restrictionsEquals(self.weekdays, that.weekdays)
)

const restrictionsArrayEquals = Equ.Array(Equ.strictEqual<number>())
const restrictionsEquals = (self: ReadonlySet<number>, that: ReadonlySet<number>): boolean =>
  restrictionsArrayEquals(Arr.fromIterable(self), Arr.fromIterable(that))

/**
 * Checks whether two `Cron` instances have equal timezone values, field
 * restrictions, and day-matching modes.
 *
 * **When to use**
 *
 * Use to directly compare two cron schedules, including their timezones and
 * day-matching modes.
 *
 * **Details**
 *
 * The comparison checks the optional timezone, the `and` day-matching mode,
 * seconds, minutes, hours, days, months, and weekdays.
 *
 * **Example** (Checking schedule equality)
 *
 * ```ts import.meta.vitest
 * import { Cron } from "effect"
 *
 * const cron1 = Cron.make({
 *   minutes: [0],
 *   hours: [9],
 *   days: [1, 15],
 *   months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
 *   weekdays: [1, 2, 3, 4, 5]
 * })
 *
 * const cron2 = Cron.make({
 *   minutes: [0],
 *   hours: [9],
 *   days: [1, 15],
 *   months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
 *   weekdays: [1, 2, 3, 4, 5]
 * })
 *
 * Cron.equals(cron1, cron2) // => true
 * Cron.equals(cron1)(cron2) // => true
 * ```
 *
 * @see {@link Equivalence} for the reusable equivalence instance
 *
 * @category predicates
 * @since 2.0.0
 */
export const equals: {
  (that: Cron): (self: Cron) => boolean
  (self: Cron, that: Cron): boolean
} = dual(2, (self: Cron, that: Cron): boolean => Equivalence(self, that))

interface SegmentOptions {
  min: number
  max: number
  aliases?: Record<string, number> | undefined
  normalize?: ((value: number) => number) | undefined
}

interface ParsedSegment {
  readonly values: Set<number>
  readonly wildcard: boolean
}

const secondOptions: SegmentOptions = {
  min: 0,
  max: 59
}

const minuteOptions: SegmentOptions = {
  min: 0,
  max: 59
}

const hourOptions: SegmentOptions = {
  min: 0,
  max: 23
}

const dayOptions: SegmentOptions = {
  min: 1,
  max: 31
}

const monthOptions: SegmentOptions = {
  min: 1,
  max: 12,
  aliases: {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12
  }
}

const weekdayOptions: SegmentOptions = {
  min: 0,
  max: 7,
  normalize: (value) => value === 7 ? 0 : value,
  aliases: {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6
  }
}

const parseSegment = (
  input: string,
  options: SegmentOptions
): Result.Result<ParsedSegment, CronParseError> => {
  const values = new Set<number>()
  const fields = input.split(",")
  const first = splitStep(fields[0]!)
  const wildcard = first[0] === "*"
  const normalize = options.normalize ?? ((value: number) => value)
  const add = wildcard && (first[1] === undefined || first[1] === 1) ?
    constVoid :
    (value: number) => {
      values.add(normalize(value))
    }

  for (let index = 0; index < fields.length; index++) {
    const field = fields[index]!
    const [raw, step] = index === 0 ? first : splitStep(field)
    if (step !== undefined) {
      if (!Number.isInteger(step)) {
        return Result.fail(new CronParseError({ message: `Expected step value to be a positive integer`, input }))
      }
      if (step < 1) {
        return Result.fail(new CronParseError({ message: `Expected step value to be greater than 0`, input }))
      }
      if (step > options.max) {
        return Result.fail(
          new CronParseError({ message: `Expected step value to be less than or equal to ${options.max}`, input })
        )
      }
    }

    if (raw === "*") {
      if (index === 0 && (step === undefined || step === 1)) {
        continue
      }
      for (let i = options.min; i <= options.max; i += step ?? 1) {
        add(i)
      }
    } else {
      const [left, right] = splitRange(raw, options.aliases)
      if (!Number.isInteger(left)) {
        return Result.fail(new CronParseError({ message: `Expected a positive integer`, input }))
      }
      if (left < options.min || left > options.max) {
        return Result.fail(
          new CronParseError({ message: `Expected a value between ${options.min} and ${options.max}`, input })
        )
      }

      if (right === undefined) {
        for (let i = left; i <= (step === undefined ? left : options.max); i += step ?? 1) {
          add(i)
        }
      } else {
        if (!Number.isInteger(right)) {
          return Result.fail(new CronParseError({ message: `Expected a positive integer`, input }))
        }
        if (right < options.min || right > options.max) {
          return Result.fail(
            new CronParseError({ message: `Expected a value between ${options.min} and ${options.max}`, input })
          )
        }
        if (left > right) {
          return Result.fail(new CronParseError({ message: `Invalid value range`, input }))
        }

        for (let i = left; i <= right; i += step ?? 1) {
          add(i)
        }
      }
    }
  }

  return Result.succeed({ values, wildcard })
}

const splitStep = (input: string): [string, number | undefined] => {
  const separator = input.indexOf("/")
  if (separator !== -1) {
    const step = input.slice(separator + 1)
    return [input.slice(0, separator), decimalRegex.test(step) ? Number(step) : NaN]
  }

  return [input, undefined]
}

const splitRange = (input: string, aliases?: Record<string, number>): [number, number | undefined] => {
  const separator = input.indexOf("-")
  if (separator !== -1) {
    return [aliasOrValue(input.slice(0, separator), aliases), aliasOrValue(input.slice(separator + 1), aliases)]
  }

  return [aliasOrValue(input, aliases), undefined]
}

function aliasOrValue(field: string, aliases?: Record<string, number>): number {
  return aliases?.[String.toLowerCase(field)] ?? (decimalRegex.test(field) ? Number(field) : NaN)
}

const decimalRegex = /^\d+$/
