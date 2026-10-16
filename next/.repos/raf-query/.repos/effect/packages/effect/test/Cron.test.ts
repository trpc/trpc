import { describe, it } from "@effect/vitest"
import { assertFalse, assertTrue, deepStrictEqual, strictEqual, throws } from "@effect/vitest/utils"
import { Cron, DateTime, Equal, Hash, HashSet, Option, Result } from "effect"

const match = (input: Cron.Cron | string, date: DateTime.DateTime.Input) =>
  Cron.match(Cron.isCron(input) ? input : Cron.parseUnsafe(input), date)

const next = (input: Cron.Cron | string, after?: DateTime.DateTime.Input) =>
  Cron.next(Cron.isCron(input) ? input : Cron.parseUnsafe(input), after)

const prev = (input: Cron.Cron | string, after?: DateTime.DateTime.Input) =>
  Cron.prev(Cron.isCron(input) ? input : Cron.parseUnsafe(input), after)

const allDays = Array.from({ length: 31 }, (_, i) => i + 1)
const allWeekdays = Array.from({ length: 7 }, (_, i) => i)

describe("Cron", () => {
  it("isCronParseError", () => {
    const result = Cron.parse("")
    assertTrue(Result.isFailure(result))
    assertTrue(Cron.isCronParseError(result.failure))
    assertFalse(Cron.isCronParseError(new Error("regular error")))
    assertFalse(Cron.isCronParseError("not an error"))
  })

  it("CronParseError constructor", () => {
    const error = new Cron.CronParseError({ message: "boom", input: "0 0 * * *" })
    assertTrue(error instanceof Error)
    assertTrue(Cron.isCronParseError(error))
    deepStrictEqual(error._tag, "CronParseError")
    deepStrictEqual(error.message, "boom")
    deepStrictEqual(error.input, "0 0 * * *")
  })

  it("parse", () => {
    // Explicit full weekday ranges are preserved for day-of-month / weekday OR semantics.
    deepStrictEqual(
      Cron.parse("0 4 8-14 * 0-6"),
      Result.succeed(Cron.make({
        minutes: [0],
        hours: [4],
        days: [8, 9, 10, 11, 12, 13, 14],
        months: [],
        weekdays: allWeekdays
      }))
    )
    // At 00:00 on day-of-month 1 and 15 and on Wednesday.
    deepStrictEqual(
      Cron.parse("0 0 1,15 * 3"),
      Result.succeed(Cron.make({
        minutes: [0],
        hours: [0],
        days: [1, 15],
        months: [],
        weekdays: [3]
      }))
    )
    // At 00:00 on day-of-month 1 and 15 and on Wednesday.
    deepStrictEqual(
      Cron.parse("23 0-20/2 * * *"),
      Result.succeed(Cron.make({
        minutes: [23],
        hours: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
        days: [],
        months: [],
        weekdays: []
      }))
    )

    // Starting at minute 5 and then every 15 minutes.
    deepStrictEqual(
      Cron.parse("5/15 * * * *"),
      Result.succeed(Cron.make({
        minutes: [5, 20, 35, 50],
        hours: [],
        days: [],
        months: [],
        weekdays: []
      }))
    )

    // At 00:00 on every day-of-month from 1 through 31 and on Monday.
    deepStrictEqual(
      Cron.parse("0 0 1/1 * 1"),
      Result.succeed(Cron.make({
        minutes: [0],
        hours: [0],
        days: allDays,
        months: [],
        weekdays: [1]
      }))
    )

    deepStrictEqual(
      Cron.parse("0 0 */1 * 1"),
      Result.succeed(Cron.make({
        minutes: [0],
        hours: [0],
        days: [],
        months: [],
        weekdays: [1]
      }))
    )

    deepStrictEqual(
      Cron.parse("0 0 1-31 * MON"),
      Result.succeed(Cron.make({
        minutes: [0],
        hours: [0],
        days: allDays,
        months: [],
        weekdays: [1]
      }))
    )

    deepStrictEqual(
      Cron.parse("0 0 1-31/1 * MON"),
      Result.succeed(Cron.make({
        minutes: [0],
        hours: [0],
        days: allDays,
        months: [],
        weekdays: [1]
      }))
    )

    deepStrictEqual(
      Cron.parse("0 0 1 * 0-6"),
      Result.succeed(Cron.make({
        minutes: [0],
        hours: [0],
        days: [1],
        months: [],
        weekdays: allWeekdays
      }))
    )

    deepStrictEqual(
      Cron.parse("0 0 1 * SUN-SAT"),
      Result.succeed(Cron.make({
        minutes: [0],
        hours: [0],
        days: [1],
        months: [],
        weekdays: allWeekdays
      }))
    )

    deepStrictEqual(
      Cron.parse("0\t0\t*\t*\t7"),
      Result.succeed(Cron.make({
        minutes: [0],
        hours: [0],
        days: [],
        months: [],
        weekdays: [0]
      }))
    )

    const invalidMinuteTail = Cron.parse("0/1,60 * * * *")
    assertTrue(Result.isFailure(invalidMinuteTail))
    deepStrictEqual(invalidMinuteTail.failure.message, "Expected a value between 0 and 59")

    const invalidDayTail = Cron.parse("0 0 1/1,32 * *")
    assertTrue(Result.isFailure(invalidDayTail))
    deepStrictEqual(invalidDayTail.failure.message, "Expected a value between 1 and 31")

    const invalidMinuteStep = Cron.parse("*/60 * * * *")
    assertTrue(Result.isFailure(invalidMinuteStep))
    deepStrictEqual(invalidMinuteStep.failure.message, "Expected step value to be less than or equal to 59")

    for (
      const invalid of [
        "0,,5 * * * *",
        ",5 * * * *",
        "-5 * * * *",
        "0- * * * *",
        "1e1 * * * *",
        "0x10 * * * *",
        "+5 * * * *"
      ]
    ) {
      assertTrue(Result.isFailure(Cron.parse(invalid)))
    }

    const withNamedTimeZone = Cron.parseUnsafe("23 0-20/2 * * *", "Europe/Berlin")
    assertTrue(Option.isSome(withNamedTimeZone.tz))
    deepStrictEqual(DateTime.zoneToString(withNamedTimeZone.tz.value), "Europe/Berlin")

    const withOffsetTimeZone = Cron.parseUnsafe("23 0-20/2 * * *", "+02:00")
    assertTrue(Option.isSome(withOffsetTimeZone.tz))
    deepStrictEqual(DateTime.zoneToString(withOffsetTimeZone.tz.value), "+02:00")

    const withoutTimeZone = Cron.parseUnsafe("23 0-20/2 * * *")
    assertTrue(Option.isNone(withoutTimeZone.tz))
  })

  it("parseUnsafe", () => {
    throws(
      () => Cron.parseUnsafe(""),
      (error) => {
        if (!Cron.isCronParseError(error)) {
          throw new Error("Expected CronParseError")
        }
        deepStrictEqual(error.message, "Invalid number of segments in cron expression")
        deepStrictEqual(error.input, "")
      }
    )
    throws(
      () => Cron.parseUnsafe("0 0 4 8-14 * *", ""),
      (error) => {
        if (!Cron.isCronParseError(error)) {
          throw new Error("Expected CronParseError")
        }
        deepStrictEqual(error.message, "Invalid time zone in cron expression")
        deepStrictEqual(error.input, "")
      }
    )
  })

  it("format preserves compact cron syntax", () => {
    strictEqual(
      Cron.format(Cron.parseUnsafe("23 0-20/2 * * 0", "Europe/Berlin")),
      "23 0-20/2 * * 0"
    )
  })

  it("format can include the default seconds field", () => {
    strictEqual(
      Cron.format(Cron.parseUnsafe("23 0-20/2 * * 0"), { includeSeconds: true }),
      "0 23 0-20/2 * * 0"
    )
  })

  it("format compacts multiple runs within a field", () => {
    strictEqual(
      Cron.format(Cron.make({
        minutes: [0, 1, 2, 10, 20, 30],
        hours: [],
        days: [],
        months: [],
        weekdays: []
      })),
      "0-2,10-30/10 * * * *"
    )
  })

  it("format preserves non-uniform values", () => {
    strictEqual(
      Cron.format(Cron.make({
        minutes: [1, 5, 11],
        hours: [],
        days: [],
        months: [],
        weekdays: []
      })),
      "1,5,11 * * * *"
    )
  })

  it("format handles default, non-default, and unrestricted seconds", () => {
    const format = (seconds?: Iterable<number>) =>
      Cron.format(Cron.make({
        seconds,
        minutes: [],
        hours: [],
        days: [],
        months: [],
        weekdays: []
      }))

    strictEqual(format(), "* * * * *")
    strictEqual(format([15, 30]), "15,30 * * * * *")
    strictEqual(format([]), "* * * * * *")
  })

  it("make supports requiring both days and weekdays", () => {
    const utc = DateTime.zoneMakeNamedUnsafe("UTC")
    const values = {
      minutes: [0],
      hours: [0],
      days: [1],
      months: [],
      weekdays: [1],
      tz: utc
    }
    const orCron = Cron.make(values)
    const andCron = Cron.make({ ...values, and: true })

    assertTrue(Cron.match(orCron, new Date("2024-01-08T00:00:00.000Z")))
    assertFalse(Cron.match(andCron, new Date("2024-01-08T00:00:00.000Z")))
    assertTrue(Cron.match(andCron, new Date("2024-01-01T00:00:00.000Z")))
    assertFalse(Equal.equals(orCron, andCron))
    deepStrictEqual(Cron.next(orCron, new Date("2024-01-02T00:00:00.000Z")), new Date("2024-01-08T00:00:00.000Z"))
    deepStrictEqual(Cron.next(andCron, new Date("2024-01-02T00:00:00.000Z")), new Date("2024-04-01T00:00:00.000Z"))
  })

  it("make validates field values and normalizes weekday 7", () => {
    const make = (field: string, value: number) =>
      Cron.make({
        minutes: field === "minutes" ? [value] : [],
        hours: field === "hours" ? [value] : [],
        days: field === "days" ? [value] : [],
        months: field === "months" ? [value] : [],
        weekdays: field === "weekdays" ? [value] : [],
        seconds: field === "seconds" ? [value] : []
      })

    for (
      const [field, value] of [
        ["seconds", 60],
        ["minutes", -1],
        ["hours", 24],
        ["days", 0],
        ["months", 13],
        ["weekdays", 8],
        ["seconds", 0.5],
        ["minutes", NaN]
      ] as const
    ) {
      throws(() => make(field, value), (error) => {
        assertTrue(error instanceof RangeError)
        return undefined
      })
    }

    const normalized = Cron.make({
      minutes: [],
      hours: [],
      days: [],
      months: [],
      weekdays: [7]
    })
    deepStrictEqual(normalized.seconds, new Set([0]))
    deepStrictEqual(normalized.weekdays, new Set([0]))
  })

  it("make treats weekday 7 as Sunday when matching", () => {
    const cron = Cron.make({
      minutes: [0],
      hours: [0],
      days: [],
      months: [],
      weekdays: [7],
      tz: DateTime.zoneMakeNamedUnsafe("UTC")
    })

    assertTrue(Cron.match(cron, new Date("2024-01-07T00:00:00.000Z")))
    assertFalse(Cron.match(cron, new Date("2024-01-08T00:00:00.000Z")))
  })

  it("make treats weekday 7 as Sunday when stepping", () => {
    const cron = Cron.make({
      minutes: [0],
      hours: [0],
      days: [],
      months: [],
      weekdays: [7],
      tz: DateTime.zoneMakeNamedUnsafe("UTC")
    })

    deepStrictEqual(Cron.next(cron, new Date("2024-01-05T00:00:00.000Z")), new Date("2024-01-07T00:00:00.000Z"))
    deepStrictEqual(Cron.prev(cron, new Date("2024-01-08T00:00:00.000Z")), new Date("2024-01-07T00:00:00.000Z"))
  })

  it("match", () => {
    assertTrue(match("5 0 * 8 *", new Date("2024-08-01 00:05:00")))
    assertFalse(match("5 0 * 8 *", new Date("2024-09-01 00:05:00")))
    assertFalse(match("5 0 * 8 *", new Date("2024-08-01 01:05:00")))

    assertTrue(match("15 14 1 * *", new Date("2024-02-01 14:15:00")))
    assertFalse(match("15 14 1 * *", new Date("2024-02-01 15:15:00")))
    assertFalse(match("15 14 1 * *", new Date("2024-02-02 14:15:00")))

    assertTrue(match("23 0-20/2 * * 0", new Date("2024-01-07 00:23:00")))
    assertFalse(match("23 0-20/2 * * 0", new Date("2024-01-07 03:23:00")))
    assertFalse(match("23 0-20/2 * * 0", new Date("2024-01-08 00:23:00")))

    assertTrue(match("5 4 * * SUN", new Date("2024-01-07 04:05:00")))
    assertFalse(match("5 4 * * SUN", new Date("2024-01-08 04:05:00")))
    assertFalse(match("5 4 * * SUN", new Date("2025-01-07 04:05:00")))

    assertTrue(match("5 4 * DEC SUN", new Date("2024-12-01 04:05:00")))
    assertFalse(match("5 4 * DEC SUN", new Date("2024-12-01 04:06:00")))
    assertFalse(match("5 4 * DEC SUN", new Date("2024-12-02 04:05:00")))

    assertTrue(match("5 4 * * SUN", new Date("2024-01-07 04:05:00")))
    assertFalse(match("5 4 * * SUN", new Date("2024-01-08 04:05:00")))
    assertFalse(match("5 4 * * SUN", new Date("2025-01-07 04:05:00")))

    assertTrue(match("0 0 1/1 * 1", new Date("2024-01-02 00:00:00")))
    assertTrue(match("0 0 1-31 * 1", new Date("2024-01-02 00:00:00")))
    assertTrue(match("0 0 1 * SUN-SAT", new Date("2024-01-02 00:00:00")))
    assertTrue(match("0 0 * * 7", new Date("2024-01-07 00:00:00")))
    assertFalse(match("0 0 */2 * MON", new Date("2024-01-03 00:00:00")))
    assertTrue(match("0 0 */2 * MON", new Date("2024-01-15 00:00:00")))
    assertTrue(match("0 0 1-31/2 * MON", new Date("2024-01-03 00:00:00")))
    assertFalse(match("0 0 *,5 * MON", new Date("2024-01-03 00:00:00")))
    assertTrue(match("0 0 5,* * MON", new Date("2024-01-03 00:00:00")))

    assertTrue(match("42 5 0 * 8 *", new Date("2024-08-01 00:05:42")))
    assertFalse(match("42 5 0 * 8 *", new Date("2024-09-01 00:05:42")))
    assertFalse(match("42 5 0 * 8 *", new Date("2024-08-01 01:05:42")))

    const london = DateTime.zoneMakeNamedUnsafe("Europe/London")
    const londonTime = DateTime.makeZonedUnsafe("2024-06-01 14:15:00Z", {
      timeZone: london,
      adjustForTimeZone: true
    })

    const amsterdam = DateTime.zoneMakeNamedUnsafe("Europe/Amsterdam")
    const amsterdamTime = DateTime.makeZonedUnsafe("2024-06-01 15:15:00Z", {
      timeZone: amsterdam,
      adjustForTimeZone: true
    })

    assertTrue(match(Cron.parseUnsafe("15 14 1 * *", london), londonTime))
    assertTrue(match(Cron.parseUnsafe("15 14 1 * *", london), amsterdamTime))
  })

  it("next", () => {
    const after = new Date("2024-01-04 16:21:00")
    deepStrictEqual(next("5 0 8 2 *", after), new Date("2024-02-08 00:05:00"))
    deepStrictEqual(next("15 14 1 * *", after), new Date("2024-02-01 14:15:00"))
    deepStrictEqual(next("23 0-20/2 * * 0", after), new Date("2024-01-07 00:23:00"))
    deepStrictEqual(next("5 4 * * SUN", after), new Date("2024-01-07 04:05:00"))
    deepStrictEqual(next("5 4 * DEC SUN", after), new Date("2024-12-01 04:05:00"))
    deepStrictEqual(next("30 5 0 8 2 *", after), new Date("2024-02-08 00:05:30"))

    const london = DateTime.zoneMakeNamedUnsafe("Europe/London")
    const londonTime = DateTime.makeZonedUnsafe("2024-02-08 00:05:00Z", {
      timeZone: london,
      adjustForTimeZone: true
    })

    const amsterdam = DateTime.zoneMakeNamedUnsafe("Europe/Amsterdam")
    const amsterdamTime = DateTime.makeZonedUnsafe("2024-02-08 01:05:00Z", {
      timeZone: amsterdam,
      adjustForTimeZone: true
    })

    deepStrictEqual(next(Cron.parseUnsafe("5 0 8 2 *", london), after), DateTime.toDateUtc(londonTime))
    deepStrictEqual(next(Cron.parseUnsafe("5 0 8 2 *", london), after), DateTime.toDateUtc(amsterdamTime))
  })

  it("next adheres to day-of-month and weekday semantics", () => {
    const utc = DateTime.zoneMakeNamedUnsafe("UTC")
    const after = new Date("2024-01-02T12:00:00.000Z")

    deepStrictEqual(next(Cron.parseUnsafe("0 0 */2 * MON", utc), after), new Date("2024-01-15T00:00:00.000Z"))
    deepStrictEqual(next(Cron.parseUnsafe("0 0 1-31/2 * MON", utc), after), new Date("2024-01-03T00:00:00.000Z"))
    deepStrictEqual(next(Cron.parseUnsafe("0 0 *,5 * MON", utc), after), new Date("2024-01-08T00:00:00.000Z"))
    deepStrictEqual(next(Cron.parseUnsafe("0 0 5,* * MON", utc), after), new Date("2024-01-03T00:00:00.000Z"))
  })

  it("next does not skip earlier days when the upcoming day is missing from the month", () => {
    const tz = DateTime.zoneMakeNamedUnsafe("UTC")
    const cron = Cron.parseUnsafe("0 0 1,16,31 * *", tz)
    // From Feb 18 the next matching day in February would be the 31st, which does
    // not exist. Rolling onto it must not overshoot past March 1 (also a match).
    deepStrictEqual(next(cron, new Date("2020-02-18T00:00:00.000Z")), new Date("2020-03-01T00:00:00.000Z"))
    // `*/15` expands to days [1, 16, 31] and exhibits the same wrap.
    deepStrictEqual(
      next(Cron.parseUnsafe("0 0 */15 * *", tz), new Date("2020-02-18T00:00:00.000Z")),
      new Date("2020-03-01T00:00:00.000Z")
    )
    // 30-day month: from the 20th the next day is the 31st (missing) -> July 1.
    deepStrictEqual(next(cron, new Date("2024-06-20T00:00:00.000Z")), new Date("2024-07-01T00:00:00.000Z"))
  })

  it("next respects day-of-month or weekday constraints when entering a restricted month", () => {
    const tz = DateTime.zoneMakeNamedUnsafe("UTC")
    const after = new Date("2024-01-01T00:00:00.000Z")

    deepStrictEqual(next(Cron.parseUnsafe("0 0 29 2 MON", tz), after), new Date("2024-02-05T00:00:00.000Z"))
    deepStrictEqual(next(Cron.parseUnsafe("0 0 30 2 MON", tz), after), new Date("2024-02-05T00:00:00.000Z"))
    deepStrictEqual(next(Cron.parseUnsafe("0 0 31 2 MON", tz), after), new Date("2024-02-05T00:00:00.000Z"))
  })

  it("prev", () => {
    const utc = DateTime.zoneMakeNamedUnsafe("UTC")
    const before = new Date("2024-01-04T16:21:00Z")
    deepStrictEqual(prev(Cron.parseUnsafe("5 0 8 2 *", utc), before), new Date("2023-02-08T00:05:00.000Z"))
    deepStrictEqual(prev(Cron.parseUnsafe("15 14 1 * *", utc), before), new Date("2024-01-01T14:15:00.000Z"))
    deepStrictEqual(prev(Cron.parseUnsafe("23 0-20/2 * * * 0", utc), before), new Date("2023-12-31T23:20:23.000Z"))
    deepStrictEqual(prev(Cron.parseUnsafe("5 4 * * SUN", utc), before), new Date("2023-12-31T04:05:00.000Z"))
    deepStrictEqual(prev(Cron.parseUnsafe("5 4 * DEC SUN", utc), before), new Date("2023-12-31T04:05:00.000Z"))
    deepStrictEqual(prev(Cron.parseUnsafe("30 5 0 8 2 *", utc), before), new Date("2023-02-08T00:05:30.000Z"))

    const wednesday = new Date("2025-10-22T01:00:00.000Z")
    deepStrictEqual(prev(Cron.parseUnsafe("0 1 * * MON", utc), wednesday), new Date("2025-10-20T01:00:00.000Z"))
    deepStrictEqual(next(Cron.parseUnsafe("0 1 * * MON", utc), wednesday), new Date("2025-10-27T01:00:00.000Z"))
    deepStrictEqual(prev(Cron.parseUnsafe("0 1 * * TUE", utc), wednesday), new Date("2025-10-21T01:00:00.000Z"))
    deepStrictEqual(next(Cron.parseUnsafe("0 1 * * TUE", utc), wednesday), new Date("2025-10-28T01:00:00.000Z"))
  })

  it("returns the latest second when rolling back a minute", () => {
    const utc = DateTime.zoneMakeNamedUnsafe("UTC")
    const expr = Cron.parseUnsafe("10,30 * * * * *", utc)
    const before = new Date("2024-01-01T00:00:05.000Z")
    deepStrictEqual(prev(expr, before), new Date("2023-12-31T23:59:30.000Z"))
  })

  it("forward and reverse sequences stay aligned", () => {
    const cases = [
      ["5 2 * * 1", "2020-01-01T00:00:01Z", "2021-01-01T00:00:01Z"],
      ["0 12 1 * *", "2020-01-01T00:00:01Z", "2021-01-01T00:00:01Z"],
      ["10,30 * * * * *", "2024-01-01T00:00:00Z", "2024-01-02T00:00:00Z"]
    ] as const

    const gatherForward = (cron: Cron.Cron, lower: Date, upper: Date) => {
      const dates: Array<Date> = []
      let current = lower
      while (true) {
        current = Cron.next(cron, current)
        if (current >= upper) {
          return dates
        }
        dates.push(current)
      }
    }

    const gatherReverse = (cron: Cron.Cron, lower: Date, upper: Date) => {
      const dates: Array<Date> = []
      let current = upper
      while (true) {
        current = Cron.prev(cron, current)
        if (current <= lower) {
          return dates.reverse()
        }
        dates.push(current)
      }
    }

    for (const [expr, lowerStr, upperStr] of cases) {
      const lower = new Date(lowerStr)
      const upper = new Date(upperStr)
      const cron = Cron.parseUnsafe(expr, DateTime.zoneMakeNamedUnsafe("UTC"))

      deepStrictEqual(gatherForward(cron, lower, upper), gatherReverse(cron, lower, upper))
    }
  })

  it("prev prefers the latest matching day within the previous month", () => {
    const cron = Cron.parseUnsafe("0 0 8 5,20 * *", DateTime.zoneMakeNamedUnsafe("UTC"))
    const before = new Date("2024-06-03T00:00:00.000Z")
    deepStrictEqual(prev(cron, before), new Date("2024-05-20T08:00:00.000Z"))
  })

  it("prev wraps weekday using the last allowed value", () => {
    const cron = Cron.parseUnsafe("0 1 * * MON,FRI", DateTime.zoneMakeNamedUnsafe("UTC"))
    const sunday = new Date("2025-10-19T12:00:00.000Z")
    deepStrictEqual(prev(cron, sunday), new Date("2025-10-17T01:00:00.000Z"))
  })

  it("prev wraps a later weekday into the previous week", () => {
    const cron = Cron.parseUnsafe("0 0 * * SAT", DateTime.zoneMakeNamedUnsafe("UTC"))
    const thursday = new Date("2025-10-23T12:00:00.000Z")
    deepStrictEqual(prev(cron, thursday), new Date("2025-10-18T00:00:00.000Z"))
  })

  it("prev weekday wrapping returns matching instants strictly before the input", () => {
    const cron = Cron.parseUnsafe("0 0 * * SAT", DateTime.zoneMakeNamedUnsafe("UTC"))
    for (
      const input of [
        new Date("2025-10-19T12:00:00.000Z"),
        new Date("2025-10-20T12:00:00.000Z"),
        new Date("2025-10-21T12:00:00.000Z"),
        new Date("2025-10-22T12:00:00.000Z"),
        new Date("2025-10-23T12:00:00.000Z"),
        new Date("2025-10-24T12:00:00.000Z")
      ]
    ) {
      const result = prev(cron, input)
      assertTrue(result < input)
      assertTrue(Cron.match(cron, result))
    }
  })

  it("prev chooses the preferred occurrence in DST fall-back", () => {
    const make = (s: string): DateTime.Zoned => Option.getOrThrow(DateTime.makeZonedFromString(s))
    const cron = Cron.parseUnsafe("0 30 2 * * *", "Europe/Berlin")
    const before = make("2024-10-27T03:30:00.000+01:00[Europe/Berlin]")
    const result = DateTime.makeZonedUnsafe(prev(cron, before), { timeZone: "Europe/Berlin" })
    deepStrictEqual(result.pipe(DateTime.formatIsoZoned), "2024-10-27T02:30:00.000+02:00[Europe/Berlin]")
  })

  it("prev respects combined day-of-month and weekday constraints", () => {
    const tz = DateTime.zoneMakeNamedUnsafe("UTC")
    const cron = Cron.parseUnsafe("0 0 9 1,15 * MON", tz)
    const before = new Date("2024-04-02T12:00:00.000Z")
    deepStrictEqual(prev(cron, before), new Date("2024-04-01T09:00:00.000Z"))
  })

  it("prev handles step expressions across day boundary", () => {
    const tz = DateTime.zoneMakeNamedUnsafe("UTC")
    const cron = Cron.parseUnsafe("0 */7 8-10 * * *", tz)
    const before = new Date("2024-01-01T08:01:00.000Z")
    deepStrictEqual(prev(cron, before), new Date("2024-01-01T08:00:00.000Z"))
  })

  it("prev works with fixed offset time zones", () => {
    const offset = DateTime.zoneMakeOffset(2 * 60 * 60 * 1000)
    const cron = Cron.parseUnsafe("0 0 10 * * *", offset)
    const before = new Date("2024-05-01T07:00:00.000Z")
    deepStrictEqual(prev(cron, before), new Date("2024-04-30T08:00:00.000Z"))
  })

  it("prev wraps across year boundary", () => {
    const tz = DateTime.zoneMakeNamedUnsafe("UTC")
    const cron = Cron.parseUnsafe("0 0 1 1 *", tz)
    const from = new Date("2024-01-01T00:00:00.000Z")
    deepStrictEqual(prev(cron, from), new Date("2023-01-01T00:00:00.000Z"))
  })

  it("prev handles day 31 skipping months without it", () => {
    const tz = DateTime.zoneMakeNamedUnsafe("UTC")
    const cron = Cron.parseUnsafe("0 0 31 * *", tz)
    const from = new Date("2024-03-01T00:00:00.000Z")
    deepStrictEqual(prev(cron, from), new Date("2024-01-31T00:00:00.000Z"))
  })

  it("prev skips an invalid day in the immediately preceding month", () => {
    const tz = DateTime.zoneMakeNamedUnsafe("UTC")
    const cron = Cron.parseUnsafe("0 0 31 * *", tz)
    const from = new Date("2024-03-15T00:00:00.000Z")
    deepStrictEqual(prev(cron, from), new Date("2024-01-31T00:00:00.000Z"))
  })

  it("prev finds the previous leap day", () => {
    const tz = DateTime.zoneMakeNamedUnsafe("UTC")
    const cron = Cron.parseUnsafe("0 0 29 2 *", tz)
    const from = new Date("2024-01-01T00:00:00.000Z")
    deepStrictEqual(prev(cron, from), new Date("2020-02-29T00:00:00.000Z"))
  })

  it("prev day-of-month rollovers preserve match and ordering invariants", () => {
    const tz = DateTime.zoneMakeNamedUnsafe("UTC")
    const cases = [
      [Cron.parseUnsafe("0 0 31 * *", tz), new Date("2024-03-15T00:00:00.000Z")],
      [Cron.parseUnsafe("0 0 29 2 *", tz), new Date("2024-01-01T00:00:00.000Z")]
    ] as const

    for (const [cron, from] of cases) {
      const result = prev(cron, from)
      assertTrue(Cron.match(cron, result))
      assertTrue(result < from)
    }
  })

  it("prev terminates for an impossible day and month combination", () => {
    const tz = DateTime.zoneMakeNamedUnsafe("UTC")
    const cron = Cron.parseUnsafe("0 0 30 2 *", tz)
    throws(() => prev(cron, new Date("2024-03-01T00:00:00.000Z")))
  })

  it("prev clamps to the last valid day when rolling back a month with only month constraints", () => {
    const tz = DateTime.zoneMakeNamedUnsafe("UTC")
    const cron = Cron.parseUnsafe("0 0 0 * FEB *", tz)
    const from = new Date("2024-03-31T12:00:00.000Z")
    deepStrictEqual(prev(cron, from), new Date("2024-02-29T00:00:00.000Z"))
  })

  it("prev with multiple months specified", () => {
    const tz = DateTime.zoneMakeNamedUnsafe("UTC")
    const cron = Cron.parseUnsafe("0 0 15 1,4,7,10 *", tz)
    const from = new Date("2024-05-01T00:00:00.000Z")
    deepStrictEqual(prev(cron, from), new Date("2024-04-15T00:00:00.000Z"))
  })

  it("sequence", () => {
    const start = new Date("2024-01-01 00:00:00")
    const generator = Cron.sequence(Cron.parseUnsafe("23 0-20/2 * * 0"), start)
    deepStrictEqual(generator.next().value, new Date("2024-01-07 00:23:00"))
    deepStrictEqual(generator.next().value, new Date("2024-01-07 02:23:00"))
    deepStrictEqual(generator.next().value, new Date("2024-01-07 04:23:00"))
    deepStrictEqual(generator.next().value, new Date("2024-01-07 06:23:00"))
    deepStrictEqual(generator.next().value, new Date("2024-01-07 08:23:00"))
  })

  it("equal", () => {
    const cron = Cron.parseUnsafe("23 0-20/2 * * 0")
    const utc = Cron.parseUnsafe("23 0-20/2 * * 0", "UTC")
    const anotherUtc = Cron.parseUnsafe("23 0-20/2 * * 0", "UTC")
    const berlin = Cron.parseUnsafe("23 0-20/2 * * 0", "Europe/Berlin")
    assertTrue(Equal.equals(cron, cron))
    assertTrue(Equal.equals(cron, Cron.parseUnsafe("23 0-20/2 * * 0")))
    assertTrue(Cron.equals(utc, anotherUtc))
    assertTrue(Cron.Equivalence(utc, anotherUtc))
    assertTrue(Equal.equals(utc, anotherUtc))
    strictEqual(Hash.hash(utc), Hash.hash(anotherUtc))
    strictEqual(HashSet.size(HashSet.make(cron, utc, anotherUtc, berlin)), 3)
    assertFalse(Cron.equals(cron, utc))
    assertFalse(Cron.Equivalence(utc, berlin))
    assertFalse(Equal.equals(cron, utc))
    assertFalse(Equal.equals(utc, berlin))
    assertFalse(Equal.equals(cron, Cron.parseUnsafe("23 0-20/2 * * 1")))
    assertFalse(Equal.equals(cron, Cron.parseUnsafe("23 0-20/2 * * 0-6")))
    assertFalse(Equal.equals(cron, Cron.parseUnsafe("23 0-20/2 1 * 0")))
  })

  it("handles leap years", () => {
    assertTrue(match("0 0 29 2 *", new Date("2024-02-29 00:00:00")))
    assertFalse(match("0 0 29 2 *", new Date("2025-02-29 00:00:00")))
    assertFalse(match("0 0 29 2 *", new Date("2026-02-29 00:00:00")))
    assertFalse(match("0 0 29 2 *", new Date("2027-02-29 00:00:00")))
    assertTrue(match("0 0 29 2 *", new Date("2028-02-29 00:00:00")))

    deepStrictEqual(next("0 0 29 2 *", new Date("2024-01-01 00:00:00")), new Date("2024-02-29 00:00:00"))
    deepStrictEqual(next("0 0 29 2 *", new Date("2025-01-01 00:00:00")), new Date("2028-02-29 00:00:00"))
  })

  it("handles transition into daylight savings time", () => {
    const make = (date: string): DateTime.Zoned => Option.getOrThrow(DateTime.makeZonedFromString(date))
    const sequence = Cron.sequence(
      Cron.parseUnsafe("30 * * * *", "Europe/Berlin"),
      make("2024-03-31T00:00:00.000+01:00[Europe/Berlin]")
    )
    const next = (): DateTime.Zoned => DateTime.makeZonedUnsafe(sequence.next().value, { timeZone: "Europe/Berlin" })

    const a = make("2024-03-31T00:30:00.000+01:00[Europe/Berlin]")
    const b = make("2024-03-31T01:30:00.000+01:00[Europe/Berlin]")
    const c = make("2024-03-31T03:30:00.000+02:00[Europe/Berlin]")
    const d = make("2024-03-31T04:30:00.000+02:00[Europe/Berlin]")

    deepStrictEqual(next().pipe(DateTime.formatIsoZoned), a.pipe(DateTime.formatIsoZoned))
    deepStrictEqual(next().pipe(DateTime.formatIsoZoned), b.pipe(DateTime.formatIsoZoned))
    deepStrictEqual(next().pipe(DateTime.formatIsoZoned), c.pipe(DateTime.formatIsoZoned))
    deepStrictEqual(next().pipe(DateTime.formatIsoZoned), d.pipe(DateTime.formatIsoZoned))
  })

  it("handles transition out of daylight savings time", () => {
    // DST fall-back transition in Europe/Berlin on 2024-10-27:
    // At 3:00 AM +02:00, clocks "fall back" to 2:00 AM +01:00
    // This means times from 2:00-2:59 AM occur twice (ambiguous period)
    //
    // Correct "once" mode behavior for cron:
    // - Include all normal times (00:30, 01:30)
    // - Return first occurrence only of ambiguous times (02:30 +02:00)
    // - Skip second occurrence of ambiguous times (02:30 +01:00)
    // - Continue normally after transition (03:30 +01:00)

    const make = (date: string): DateTime.Zoned => Option.getOrThrow(DateTime.makeZonedFromString(date))
    const sequence = Cron.sequence(
      Cron.parseUnsafe("30 * * * *", "Europe/Berlin"),
      make("2024-10-27T00:00:00.000+02:00[Europe/Berlin]")
    )
    const next = (): DateTime.Zoned => DateTime.makeZonedUnsafe(sequence.next().value, { timeZone: "Europe/Berlin" })

    const a = make("2024-10-27T00:30:00.000+02:00[Europe/Berlin]") // Normal time
    const b = make("2024-10-27T01:30:00.000+02:00[Europe/Berlin]") // Normal time (not ambiguous)
    const c = make("2024-10-27T02:30:00.000+02:00[Europe/Berlin]") // First occurrence during DST
    const d = make("2024-10-27T03:30:00.000+01:00[Europe/Berlin]") // Standard time (skips 2nd 02:30)
    const e = make("2024-10-27T04:30:00.000+01:00[Europe/Berlin]") // Standard time

    deepStrictEqual(next().pipe(DateTime.formatIsoZoned), a.pipe(DateTime.formatIsoZoned))
    deepStrictEqual(next().pipe(DateTime.formatIsoZoned), b.pipe(DateTime.formatIsoZoned))
    deepStrictEqual(next().pipe(DateTime.formatIsoZoned), c.pipe(DateTime.formatIsoZoned))
    deepStrictEqual(next().pipe(DateTime.formatIsoZoned), d.pipe(DateTime.formatIsoZoned))
    deepStrictEqual(next().pipe(DateTime.formatIsoZoned), e.pipe(DateTime.formatIsoZoned))
  })

  it("handles utc timezone", () => {
    const utc = DateTime.zoneMakeNamedUnsafe("UTC")
    const make = (date: string): DateTime.Zoned => Option.getOrThrow(DateTime.makeZonedFromString(date))
    const sequence = Cron.sequence(Cron.parseUnsafe("30 * * * *", utc), make("2024-10-27T00:00:00.000+00:00[UTC]"))
    const next = (): DateTime.Zoned => DateTime.makeZonedUnsafe(sequence.next().value, { timeZone: utc })

    const a = make("2024-10-27T00:30:00.000+00:00[UTC]")
    const b = make("2024-10-27T01:30:00.000+00:00[UTC]")
    const c = make("2024-10-27T02:30:00.000+00:00[UTC]")
    const d = make("2024-10-27T03:30:00.000+00:00[UTC]")

    deepStrictEqual(next().pipe(DateTime.formatIsoZoned), a.pipe(DateTime.formatIsoZoned))
    deepStrictEqual(next().pipe(DateTime.formatIsoZoned), b.pipe(DateTime.formatIsoZoned))
    deepStrictEqual(next().pipe(DateTime.formatIsoZoned), c.pipe(DateTime.formatIsoZoned))
    deepStrictEqual(next().pipe(DateTime.formatIsoZoned), d.pipe(DateTime.formatIsoZoned))
  })
})
