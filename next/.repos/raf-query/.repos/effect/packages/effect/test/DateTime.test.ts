import { describe, it } from "@effect/vitest"
import { assertNone, assertSome, deepStrictEqual, strictEqual, throws } from "@effect/vitest/utils"
import { DateTime, Duration, Effect, Option } from "effect"
import { TestClock } from "effect/testing"
import { vi } from "vitest"

const setTo2024NZ = TestClock.setTime(new Date("2023-12-31T11:00:00.000Z").getTime())
const assertSomeIso = (value: Option.Option<DateTime.DateTime>, expected: string) => {
  const iso = Option.map(value, (value) => DateTime.formatIso(DateTime.toUtc(value)))
  assertSome(iso, expected)
}
const isDeno = "Deno" in globalThis

describe("DateTime", () => {
  it("preserves pre-epoch milliseconds when Intl omits fractionalSecond", () => {
    const formatToParts = Intl.DateTimeFormat.prototype.formatToParts
    const mock = vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts").mockImplementation(function(
      this: Intl.DateTimeFormat,
      date
    ) {
      return formatToParts.call(this, date).filter((part) => part.type !== "fractionalSecond")
    })
    try {
      const dt = DateTime.makeZonedUnsafe("1969-12-31T23:59:59.999Z", {
        timeZone: "Australia/Brisbane"
      })
      strictEqual(DateTime.toDate(dt).toISOString(), "1970-01-01T09:59:59.999Z")
      strictEqual(DateTime.formatIsoDate(dt), "1970-01-01")
    } finally {
      mock.mockRestore()
    }
  })

  describe("mutate", () => {
    it.effect("should mutate the date", () =>
      Effect.gen(function*() {
        const now = yield* DateTime.now
        const tomorrow = DateTime.mutate(now, (date) => {
          date.setUTCDate(date.getUTCDate() + 1)
        })
        const diff = DateTime.distance(now, tomorrow)
        deepStrictEqual(diff, Duration.fromInputUnsafe("1 day"))
      }))

    it.effect("preserves the named zone when mutating across DST", () =>
      Effect.gen(function*() {
        yield* setTo2024NZ
        const now = yield* DateTime.nowInCurrentZone.pipe(
          DateTime.withCurrentZoneNamed("Pacific/Auckland")
        )
        const future = DateTime.mutate(now, (date) => {
          date.setUTCMonth(date.getUTCMonth() + 6)
        })
        strictEqual(DateTime.toDateUtc(future).toISOString(), "2024-06-30T12:00:00.000Z")
        strictEqual(DateTime.toDate(future).toISOString(), "2024-07-01T00:00:00.000Z")
        const plusOne = DateTime.mutate(future, (date) => {
          date.setUTCDate(date.getUTCDate() + 1)
        })
        strictEqual(DateTime.toDateUtc(plusOne).toISOString(), "2024-07-01T12:00:00.000Z")
        strictEqual(DateTime.toDate(plusOne).toISOString(), "2024-07-02T00:00:00.000Z")
      }))
  })

  describe("add", () => {
    it.effect("adds calendar days to a UTC DateTime", () =>
      Effect.gen(function*() {
        const now = yield* DateTime.now
        const tomorrow = DateTime.add(now, { days: 1 })
        const diff = DateTime.distance(now, tomorrow)
        deepStrictEqual(diff, Duration.fromInputUnsafe("1 day"))
      }))

    it("clamps to the last valid day when changing months", () => {
      const jan = DateTime.makeUnsafe({ year: 2023, month: 1, day: 31 })
      let feb = DateTime.add(jan, { months: 1 })
      strictEqual(feb.toJSON(), "2023-02-28T00:00:00.000Z")

      const mar = DateTime.makeUnsafe({ year: 2023, month: 3, day: 31 })
      feb = DateTime.subtract(mar, { months: 1 })
      strictEqual(feb.toJSON(), "2023-02-28T00:00:00.000Z")
    })

    it.effect("preserves the named zone when adding calendar units across DST", () =>
      Effect.gen(function*() {
        yield* setTo2024NZ
        const now = yield* DateTime.nowInCurrentZone.pipe(
          DateTime.withCurrentZoneNamed("Pacific/Auckland")
        )
        const future = DateTime.add(now, { months: 6 })
        strictEqual(DateTime.toDateUtc(future).toISOString(), "2024-06-30T12:00:00.000Z")
        strictEqual(DateTime.toDate(future).toISOString(), "2024-07-01T00:00:00.000Z")
        const plusOne = DateTime.add(future, { days: 1 })
        strictEqual(DateTime.toDateUtc(plusOne).toISOString(), "2024-07-01T12:00:00.000Z")
        strictEqual(DateTime.toDate(plusOne).toISOString(), "2024-07-02T00:00:00.000Z")
        const minusOne = DateTime.subtract(plusOne, { days: 1 })
        strictEqual(DateTime.toDateUtc(minusOne).toISOString(), "2024-06-30T12:00:00.000Z")
        strictEqual(DateTime.toDate(minusOne).toISOString(), "2024-07-01T00:00:00.000Z")
      }))

    it.effect("leap years", () =>
      Effect.gen(function*() {
        yield* setTo2024NZ
        const now = DateTime.make({ year: 2024, month: 2, day: 29 })
        assertSomeIso(now, "2024-02-29T00:00:00.000Z")
        const future = Option.map(now, (value) => DateTime.add(value, { years: 1 }))
        assertSome(Option.map(future, DateTime.formatIso), "2025-02-28T00:00:00.000Z")
      }))
  })

  describe("endOf", () => {
    it("month", () => {
      const mar = DateTime.makeUnsafe("2024-03-15T12:00:00.000Z")
      const end = DateTime.endOf(mar, "month")
      strictEqual(end.toJSON(), "2024-03-31T23:59:59.999Z")
    })

    it("feb leap year", () => {
      const feb = DateTime.makeUnsafe("2024-02-15T12:00:00.000Z")
      const end = DateTime.endOf(feb, "month")
      strictEqual(end.toJSON(), "2024-02-29T23:59:59.999Z")
    })

    it("week", () => {
      const start = DateTime.makeUnsafe("2024-03-15T12:00:00.000Z")
      const end = DateTime.endOf(start, "week")
      strictEqual(end.toJSON(), "2024-03-16T23:59:59.999Z")
      strictEqual(DateTime.getPartUtc(end, "weekDay"), 6)
    })

    it("week last day", () => {
      const start = DateTime.makeUnsafe("2024-03-16T12:00:00.000Z")
      const end = DateTime.endOf(start, "week")
      strictEqual(end.toJSON(), "2024-03-16T23:59:59.999Z")
    })

    it("week with options", () => {
      const start = DateTime.makeUnsafe("2024-03-15T12:00:00.000Z")
      const end = DateTime.endOf(start, "week", {
        weekStartsOn: 1
      })
      strictEqual(end.toJSON(), "2024-03-17T23:59:59.999Z")
    })

    it.effect("returns the zoned end of the month", () =>
      Effect.gen(function*() {
        yield* setTo2024NZ
        const now = yield* DateTime.nowInCurrentZone.pipe(
          DateTime.withCurrentZoneNamed("Pacific/Auckland")
        )
        const future = DateTime.endOf(now, "month")
        strictEqual(DateTime.toDateUtc(future).toISOString(), "2024-01-31T10:59:59.999Z")
        strictEqual(DateTime.toDate(future).toISOString(), "2024-01-31T23:59:59.999Z")
      }))
  })

  describe("startOf", () => {
    it("month", () => {
      const mar = DateTime.makeUnsafe("2024-03-15T12:00:00.000Z")
      const end = DateTime.startOf(mar, "month")
      strictEqual(end.toJSON(), "2024-03-01T00:00:00.000Z")
    })

    it("month duplicated", () => {
      const mar = DateTime.makeUnsafe("2024-03-15T12:00:00.000Z")
      const end = DateTime.startOf(mar, "month").pipe(
        DateTime.startOf("month")
      )
      strictEqual(end.toJSON(), "2024-03-01T00:00:00.000Z")
    })

    it("feb leap year", () => {
      const feb = DateTime.makeUnsafe("2024-02-15T12:00:00.000Z")
      const end = DateTime.startOf(feb, "month")
      strictEqual(end.toJSON(), "2024-02-01T00:00:00.000Z")
    })

    it("week", () => {
      const start = DateTime.makeUnsafe("2024-03-15T12:00:00.000Z")
      const end = DateTime.startOf(start, "week")
      strictEqual(end.toJSON(), "2024-03-10T00:00:00.000Z")
      strictEqual(DateTime.getPartUtc(end, "weekDay"), 0)
    })

    it("week first day", () => {
      const start = DateTime.makeUnsafe("2024-03-10T12:00:00.000Z")
      const end = DateTime.startOf(start, "week")
      strictEqual(end.toJSON(), "2024-03-10T00:00:00.000Z")
    })

    it("week with options", () => {
      const start = DateTime.makeUnsafe("2024-03-15T12:00:00.000Z")
      const end = DateTime.startOf(start, "week", {
        weekStartsOn: 1
      })
      strictEqual(end.toJSON(), "2024-03-11T00:00:00.000Z")
    })
  })

  describe("nearest", () => {
    it("month up", () => {
      const mar = DateTime.makeUnsafe("2024-03-16T12:00:00.000Z")
      const end = DateTime.nearest(mar, "month")
      strictEqual(end.toJSON(), "2024-04-01T00:00:00.000Z")
    })

    it("month down", () => {
      const mar = DateTime.makeUnsafe("2024-03-16T11:00:00.000Z")
      const end = DateTime.nearest(mar, "month")
      strictEqual(end.toJSON(), "2024-03-01T00:00:00.000Z")
    })

    it("second up", () => {
      const mar = DateTime.makeUnsafe("2024-03-20T12:00:00.500Z")
      const end = DateTime.nearest(mar, "second")
      strictEqual(end.toJSON(), "2024-03-20T12:00:01.000Z")
    })

    it("second down", () => {
      const mar = DateTime.makeUnsafe("2024-03-20T12:00:00.400Z")
      const end = DateTime.nearest(mar, "second")
      strictEqual(end.toJSON(), "2024-03-20T12:00:00.000Z")
    })
  })

  describe.skipIf(isDeno)("format", () => {
    it.effect("full", () =>
      Effect.gen(function*() {
        const now = yield* DateTime.now
        strictEqual(
          DateTime.format(now, {
            locale: "en-US",
            dateStyle: "full",
            timeStyle: "full"
          }),
          "Thursday, January 1, 1970 at 12:00:00 AM Coordinated Universal Time"
        )
      }))
  })

  describe.skipIf(isDeno)("formatUtc", () => {
    it.effect("full", () =>
      Effect.gen(function*() {
        const now = yield* DateTime.now
        strictEqual(
          DateTime.formatUtc(now, {
            locale: "en-US",
            dateStyle: "full",
            timeStyle: "full"
          }),
          "Thursday, January 1, 1970 at 12:00:00 AM Coordinated Universal Time"
        )
      }))
  })

  describe.skipIf(isDeno)("format zoned", () => {
    it.effect("full", () =>
      Effect.gen(function*() {
        const now = yield* DateTime.nowInCurrentZone.pipe(
          DateTime.withCurrentZoneNamed("Pacific/Auckland")
        )
        strictEqual(
          DateTime.format(now, {
            locale: "en-US",
            dateStyle: "full",
            timeStyle: "full"
          }),
          "Thursday, January 1, 1970 at 12:00:00 PM New Zealand Standard Time"
        )
      }))

    it.effect.skipIf(isDeno)("long with offset", () =>
      Effect.gen(function*() {
        const now = yield* DateTime.now
        const formatted = now.pipe(
          DateTime.setZoneOffset(10 * 60 * 60 * 1000),
          DateTime.format({
            locale: "en-US",
            dateStyle: "long",
            timeStyle: "short"
          })
        )
        strictEqual(formatted, "January 1, 1970 at 10:00 AM")
      }))
  })

  describe("fromParts", () => {
    it("partial", () => {
      const date = DateTime.makeUnsafe({
        year: 2024,
        month: 12,
        day: 25
      })
      strictEqual(date.toJSON(), "2024-12-25T00:00:00.000Z")
    })

    it("month is set correctly", () => {
      const date = DateTime.makeUnsafe({ year: 2024 })
      strictEqual(date.toJSON(), "2024-01-01T00:00:00.000Z")
    })
  })

  describe("setPartsUtc", () => {
    it("applies calendar parts without intermediate overflow", () => {
      const date = DateTime.makeUnsafe("2024-01-31T12:34:56.789Z")
      const updated = DateTime.setPartsUtc(date, { month: 2, day: 1 })
      strictEqual(DateTime.formatIso(updated), "2024-02-01T12:34:56.789Z")
    })

    it("partial", () => {
      const date = DateTime.makeUnsafe({
        year: 2024,
        month: 12,
        day: 25
      })
      strictEqual(date.toJSON(), "2024-12-25T00:00:00.000Z")

      const updated = DateTime.setPartsUtc(date, {
        year: 2023,
        month: 1
      })
      strictEqual(updated.toJSON(), "2023-01-25T00:00:00.000Z")
    })

    it("ignores time zones", () => {
      const date = DateTime.makeUnsafe({
        year: 2024,
        month: 12,
        day: 25
      }).pipe(DateTime.setZoneNamedUnsafe("Pacific/Auckland"))
      strictEqual(date.toJSON(), "2024-12-25T00:00:00.000Z")

      const updated = DateTime.setPartsUtc(date, {
        year: 2023,
        month: 1
      })
      strictEqual(updated.toJSON(), "2023-01-25T00:00:00.000Z")
    })
  })

  describe("setParts", () => {
    it("partial", () => {
      const date = DateTime.makeUnsafe({
        year: 2024,
        month: 12,
        day: 25
      })
      strictEqual(date.toJSON(), "2024-12-25T00:00:00.000Z")

      const updated = DateTime.setParts(date, {
        year: 2023,
        month: 1
      })
      strictEqual(updated.toJSON(), "2023-01-25T00:00:00.000Z")
    })

    it("accounts for time zone", () => {
      const date = DateTime.makeUnsafe({
        year: 2024,
        month: 12,
        day: 25
      }).pipe(DateTime.setZoneNamedUnsafe("Pacific/Auckland"))
      strictEqual(date.toJSON(), "2024-12-25T00:00:00.000Z")

      const updated = DateTime.setParts(date, {
        year: 2023,
        month: 6,
        hour: 12
      })
      strictEqual(updated.toJSON(), "2023-06-25T00:00:00.000Z")
    })
  })

  describe("formatIso", () => {
    it("full", () => {
      const now = DateTime.makeUnsafe("2024-03-15T12:00:00.000Z")
      strictEqual(DateTime.formatIso(now), "2024-03-15T12:00:00.000Z")
    })
  })

  describe("formatIsoOffset", () => {
    it.effect("correctly adds offset", () =>
      Effect.gen(function*() {
        const now = yield* DateTime.nowInCurrentZone.pipe(
          DateTime.withCurrentZoneNamed("Pacific/Auckland")
        )
        strictEqual(DateTime.formatIsoOffset(now), "1970-01-01T12:00:00.000+12:00")
      }))
  })

  describe("layerCurrentZoneNamed", () => {
    it.effect("correctly adds offset", () =>
      Effect.gen(function*() {
        const now = yield* DateTime.nowInCurrentZone
        strictEqual(DateTime.formatIsoOffset(now), "1970-01-01T12:00:00.000+12:00")
      }).pipe(
        Effect.provide(DateTime.layerCurrentZoneNamed("Pacific/Auckland"))
      ))
  })

  describe("removeTime", () => {
    it("removes time", () => {
      const dt = DateTime.makeZonedUnsafe("2024-01-01T01:00:00Z", {
        timeZone: "Pacific/Auckland",
        adjustForTimeZone: true
      }).pipe(DateTime.removeTime)
      strictEqual(dt.toJSON(), "2024-01-01T00:00:00.000Z")
    })
  })

  describe("toEpochSeconds", () => {
    it("returns epoch seconds", () => {
      const dt = DateTime.makeUnsafe("2024-01-01T00:00:00Z")
      strictEqual(DateTime.toEpochSeconds(dt), 1704067200)
    })

    it("floors to nearest second", () => {
      const dt = DateTime.makeUnsafe("2024-01-01T00:00:00.999Z")
      strictEqual(DateTime.toEpochSeconds(dt), 1704067200)
    })
  })

  describe("fromEpochSeconds", () => {
    it("creates DateTime from epoch seconds", () => {
      const dt = DateTime.fromEpochSeconds(1704067200)
      strictEqual(dt.toJSON(), "2024-01-01T00:00:00.000Z")
    })

    it("roundtrips with toEpochSeconds", () => {
      const original = DateTime.makeUnsafe("2024-06-15T12:30:00Z")
      const seconds = DateTime.toEpochSeconds(original)
      const restored = DateTime.fromEpochSeconds(seconds)
      strictEqual(DateTime.toEpochSeconds(restored), seconds)
    })
  })

  describe("makeZonedFromString", () => {
    it.effect("parses an instant with an offset and IANA zone", () =>
      Effect.gen(function*() {
        const dt = DateTime.makeZonedFromString("2024-07-21T20:12:34.112546348+12:00[Pacific/Auckland]")
        assertSome(Option.map(dt, (value) => value.toJSON()), "2024-07-21T08:12:34.112Z")
      }))

    it.effect("parses an offset-only string as an Offset zone", () =>
      Effect.gen(function*() {
        const dt = DateTime.makeZonedFromString("2024-07-21T20:12:34.112546348+12:00")
        assertSome(Option.map(dt, (value) => value.zone._tag), "Offset")
        assertSome(Option.map(dt, (value) => value.toJSON()), "2024-07-21T08:12:34.112Z")
      }))

    it.effect("parses a UTC offset-only string as an Offset zone", () =>
      Effect.gen(function*() {
        const dt = DateTime.makeZonedFromString("2024-07-21T20:12:34.112546348+00:00")
        assertSome(Option.map(dt, (value) => value.zone._tag), "Offset")
        assertSome(Option.map(dt, (value) => value.toJSON()), "2024-07-21T20:12:34.112Z")
      }))

    it.effect("roundtrips a bracketed IANA zone string", () =>
      Effect.gen(function*() {
        const dt = Option.flatMap(
          DateTime.makeZonedFromString("2024-07-21T20:12:34.112546348+12:00[Pacific/Auckland]"),
          (d) => DateTime.makeZonedFromString(DateTime.formatIsoZoned(d))
        )
        assertSome(Option.map(dt, (value) => DateTime.zoneToString(value.zone)), "Pacific/Auckland")
        assertSome(Option.map(dt, (value) => value.toJSON()), "2024-07-21T08:12:34.112Z")
      }))
  })

  it("parts equality", () => {
    const d1 = DateTime.makeUnsafe("2025-01-01")
    const d2 = DateTime.makeUnsafe("2025-01-01")
    deepStrictEqual(d1, d2)
    DateTime.toPartsUtc(d2)
    deepStrictEqual(d1, d2)
  })

  // doesnt work in CI
  it.skip("makeZonedUnsafe no options", () => {
    const date = new Date("2024-07-21T20:12:34.112Z")
    ;(date as any).getTimezoneOffset = () => -60
    const dt = DateTime.makeZonedUnsafe(date)
    deepStrictEqual(dt.zone, DateTime.zoneMakeOffset(60 * 60 * 1000))
  })

  describe("toUtc", () => {
    it.effect("with a Utc", () =>
      Effect.gen(function*() {
        const dt = DateTime.makeUnsafe("2024-01-01T01:00:00Z")
        strictEqual(dt.toJSON(), "2024-01-01T01:00:00.000Z")
      }))

    it.effect("with a Zoned", () =>
      Effect.gen(function*() {
        const dt = DateTime.makeZonedUnsafe("2024-01-01T01:00:00Z", {
          timeZone: "Pacific/Auckland",
          adjustForTimeZone: true
        })
        strictEqual(dt.toJSON(), "2023-12-31T12:00:00.000Z")
      }))
  })

  describe("nowAsDate", () => {
    it.effect("should return the current Date", () =>
      Effect.gen(function*() {
        yield* setTo2024NZ
        const now = yield* DateTime.nowAsDate
        deepStrictEqual(now, new Date("2023-12-31T11:00:00.000Z"))
      }))
  })

  describe("make", () => {
    it("rejects invalid object instants", () => {
      assertNone(DateTime.make({ epochMilliseconds: NaN }))
      assertNone(DateTime.make({ epochMilliseconds: 8_640_000_000_000_001 }))
    })
  })

  describe("makeUnsafe", () => {
    it("throws for invalid object instants", () => {
      throws(() => DateTime.makeUnsafe({ epochMilliseconds: NaN }))
      throws(() => DateTime.makeUnsafe({ epochMilliseconds: 8_640_000_000_000_001 }))
    })

    it("treats strings without zone info as UTC", () => {
      const dt = DateTime.makeUnsafe("2024-01-01 01:00:00")
      strictEqual(dt.toJSON(), "2024-01-01T01:00:00.000Z")
    })

    it("does not append Z to strings ending with Z", () => {
      const dt = DateTime.makeUnsafe("2026-01-27T17:14:06.000Z")
      strictEqual(dt.toJSON(), "2026-01-27T17:14:06.000Z")
    })

    it("does not append Z to strings with explicit offset", () => {
      const dt = DateTime.makeUnsafe("2020-02-01T11:17:00+1100")
      strictEqual(dt.toJSON(), "2020-02-01T00:17:00.000Z")
    })

    it("does not append Z to strings containing GMT", () => {
      const dt = DateTime.makeUnsafe("Tue, 27 Jan 2026 17:14:06 GMT")
      strictEqual(dt.toJSON(), "2026-01-27T17:14:06.000Z")
    })
  })

  describe("Disambiguation", () => {
    it.each<{
      zone: string
      time: Partial<DateTime.DateTime.Parts>
      description: string
      expectedResults: Record<DateTime.Disambiguation, string>
    }>(
      [
        {
          zone: "America/New_York",
          time: { year: 2024, month: 3, day: 10, hour: 2 },
          description: "America/New_York 02:00 gap time during leap year (2024)",
          expectedResults: {
            compatible: "2024-03-10T07:00:00.000Z",
            earlier: "2024-03-10T06:00:00.000Z",
            later: "2024-03-10T07:00:00.000Z",
            reject: "REJECT"
          }
        },
        {
          zone: "America/New_York",
          time: { year: 2024, month: 11, day: 3, hour: 1, minute: 30 },
          description: "America/New_York 01:30 ambiguous time during leap year (2024)",
          expectedResults: {
            compatible: "2024-11-03T05:30:00.000Z",
            earlier: "2024-11-03T05:30:00.000Z",
            later: "2024-11-03T06:30:00.000Z",
            reject: "REJECT"
          }
        },
        {
          zone: "America/New_York",
          time: { year: 2025, month: 3, day: 9, hour: 1 },
          description: "America/New_York 01:00 before DST transition",
          expectedResults: {
            compatible: "2025-03-09T06:00:00.000Z",
            earlier: "2025-03-09T06:00:00.000Z",
            later: "2025-03-09T06:00:00.000Z",
            reject: "2025-03-09T06:00:00.000Z"
          }
        },
        {
          zone: "America/New_York",
          time: { year: 2025, month: 3, day: 9, hour: 1, minute: 59, second: 59 },
          description: "America/New_York 01:59:59 last second before DST gap",
          expectedResults: {
            compatible: "2025-03-09T06:59:59.000Z",
            earlier: "2025-03-09T06:59:59.000Z",
            later: "2025-03-09T06:59:59.000Z",
            reject: "2025-03-09T06:59:59.000Z"
          }
        },
        {
          zone: "America/New_York",
          time: { year: 2025, month: 3, day: 9, hour: 2 },
          description: "America/New_York 02:00 gap time (DST spring forward)",
          expectedResults: {
            compatible: "2025-03-09T07:00:00.000Z",
            earlier: "2025-03-09T06:00:00.000Z",
            later: "2025-03-09T07:00:00.000Z",
            reject: "REJECT"
          }
        },
        {
          zone: "America/New_York",
          time: { year: 2025, month: 3, day: 9, hour: 2, minute: 15 },
          description: "America/New_York 02:15 gap time (DST spring forward)",
          expectedResults: {
            compatible: "2025-03-09T07:15:00.000Z",
            earlier: "2025-03-09T06:15:00.000Z",
            later: "2025-03-09T07:15:00.000Z",
            reject: "REJECT"
          }
        },
        {
          zone: "America/New_York",
          time: { year: 2025, month: 3, day: 9, hour: 2, minute: 30 },
          description: "America/New_York 02:30 gap time (DST spring forward)",
          expectedResults: {
            compatible: "2025-03-09T07:30:00.000Z",
            earlier: "2025-03-09T06:30:00.000Z",
            later: "2025-03-09T07:30:00.000Z",
            reject: "REJECT"
          }
        },
        {
          zone: "America/New_York",
          time: { year: 2025, month: 3, day: 9, hour: 2, minute: 45 },
          description: "America/New_York 02:45 gap time (DST spring forward)",
          expectedResults: {
            compatible: "2025-03-09T07:45:00.000Z",
            earlier: "2025-03-09T06:45:00.000Z",
            later: "2025-03-09T07:45:00.000Z",
            reject: "REJECT"
          }
        },
        {
          zone: "America/New_York",
          time: { year: 2025, month: 3, day: 9, hour: 3 },
          description: "America/New_York 03:00 first valid time after DST gap",
          expectedResults: {
            compatible: "2025-03-09T07:00:00.000Z",
            earlier: "2025-03-09T07:00:00.000Z",
            later: "2025-03-09T07:00:00.000Z",
            reject: "2025-03-09T07:00:00.000Z"
          }
        },
        {
          zone: "America/New_York",
          time: { year: 2025, month: 11, day: 2, hour: 1, minute: 0, second: 0 },
          description: "America/New_York 01:00:00 exact start of ambiguous period",
          expectedResults: {
            compatible: "2025-11-02T05:00:00.000Z",
            earlier: "2025-11-02T05:00:00.000Z",
            later: "2025-11-02T06:00:00.000Z",
            reject: "REJECT"
          }
        },
        {
          zone: "America/New_York",
          time: { year: 2025, month: 11, day: 2, hour: 1, minute: 30 },
          description: "America/New_York 01:30 ambiguous time (DST fall back)",
          expectedResults: {
            compatible: "2025-11-02T05:30:00.000Z",
            earlier: "2025-11-02T05:30:00.000Z",
            later: "2025-11-02T06:30:00.000Z",
            reject: "REJECT"
          }
        },
        {
          zone: "America/New_York",
          time: { year: 2025, month: 11, day: 2, hour: 1, minute: 59, second: 59 },
          description: "America/New_York 01:59:59 last second of ambiguous period",
          expectedResults: {
            compatible: "2025-11-02T05:59:59.000Z",
            earlier: "2025-11-02T05:59:59.000Z",
            later: "2025-11-02T06:59:59.000Z",
            reject: "REJECT"
          }
        },
        {
          zone: "Asia/Kathmandu",
          time: { year: 2025, month: 6, day: 15, hour: 12 },
          description: "Asia/Kathmandu 12:00 unusual offset (UTC+05:45)",
          expectedResults: {
            compatible: "2025-06-15T06:15:00.000Z",
            earlier: "2025-06-15T06:15:00.000Z",
            later: "2025-06-15T06:15:00.000Z",
            reject: "2025-06-15T06:15:00.000Z"
          }
        },
        {
          zone: "Australia/Melbourne",
          time: { year: 2025, month: 10, day: 5, hour: 2 },
          description: "Australia/Melbourne 02:00 gap time (DST starts, spring forward)",
          expectedResults: {
            compatible: "2025-10-04T16:00:00.000Z",
            earlier: "2025-10-04T15:00:00.000Z",
            later: "2025-10-04T16:00:00.000Z",
            reject: "REJECT"
          }
        },
        {
          zone: "Australia/Sydney",
          time: { year: 2025, month: 4, day: 6, hour: 1 },
          description: "Australia/Sydney 01:00 normal timezone conversion",
          expectedResults: {
            compatible: "2025-04-05T14:00:00.000Z",
            earlier: "2025-04-05T14:00:00.000Z",
            later: "2025-04-05T14:00:00.000Z",
            reject: "2025-04-05T14:00:00.000Z"
          }
        },
        {
          zone: "Australia/Sydney",
          time: { year: 2025, month: 4, day: 6, hour: 2, minute: 30 },
          description: "Australia/Sydney 02:30 ambiguous time (DST ends, fall back)",
          expectedResults: {
            compatible: "2025-04-05T15:30:00.000Z",
            earlier: "2025-04-05T15:30:00.000Z",
            later: "2025-04-05T16:30:00.000Z",
            reject: "REJECT"
          }
        },
        {
          zone: "Australia/Sydney",
          time: { year: 2025, month: 10, day: 5, hour: 2, minute: 30 },
          description: "Australia/Sydney 02:30 gap time (DST starts, spring forward)",
          expectedResults: {
            compatible: "2025-10-04T16:30:00.000Z",
            earlier: "2025-10-04T15:30:00.000Z",
            later: "2025-10-04T16:30:00.000Z",
            reject: "REJECT"
          }
        },
        {
          zone: "Europe/Athens",
          time: { year: 2024, month: 10, day: 27, hour: 3 },
          description: "Europe/Athens 03:00 ambiguous time during leap year (2024)",
          expectedResults: {
            compatible: "2024-10-27T00:00:00.000Z",
            earlier: "2024-10-27T00:00:00.000Z",
            later: "2024-10-27T01:00:00.000Z",
            reject: "REJECT"
          }
        },
        {
          zone: "Europe/Athens",
          time: { year: 2025, month: 3, day: 27, hour: 1 },
          description: "Europe/Athens 01:00 normal time before DST",
          expectedResults: {
            compatible: "2025-03-26T23:00:00.000Z",
            earlier: "2025-03-26T23:00:00.000Z",
            later: "2025-03-26T23:00:00.000Z",
            reject: "2025-03-26T23:00:00.000Z"
          }
        },
        {
          zone: "Europe/Athens",
          time: { year: 2025, month: 3, day: 30, hour: 1 },
          description: "Europe/Athens 01:00 before DST transition (UTC+2)",
          expectedResults: {
            compatible: "2025-03-29T23:00:00.000Z",
            earlier: "2025-03-29T23:00:00.000Z",
            later: "2025-03-29T23:00:00.000Z",
            reject: "2025-03-29T23:00:00.000Z"
          }
        },
        {
          zone: "Europe/Athens",
          time: { year: 2025, month: 3, day: 30, hour: 2, minute: 30 },
          description: "Europe/Athens 02:30 normal time before DST transition",
          expectedResults: {
            compatible: "2025-03-30T00:30:00.000Z",
            earlier: "2025-03-30T00:30:00.000Z",
            later: "2025-03-30T00:30:00.000Z",
            reject: "2025-03-30T00:30:00.000Z"
          }
        },
        {
          zone: "Europe/Athens",
          time: { year: 2025, month: 3, day: 30, hour: 3 },
          description: "Europe/Athens 03:00 gap time (DST spring forward)",
          expectedResults: {
            compatible: "2025-03-30T01:00:00.000Z",
            earlier: "2025-03-30T00:00:00.000Z",
            later: "2025-03-30T01:00:00.000Z",
            reject: "REJECT"
          }
        },
        {
          zone: "Europe/Athens",
          time: { year: 2025, month: 3, day: 30, hour: 4 },
          description: "Europe/Athens 04:00 normal time after DST transition",
          expectedResults: {
            compatible: "2025-03-30T01:00:00.000Z",
            earlier: "2025-03-30T01:00:00.000Z",
            later: "2025-03-30T01:00:00.000Z",
            reject: "2025-03-30T01:00:00.000Z"
          }
        },
        {
          zone: "Europe/Athens",
          time: { year: 2025, month: 10, day: 26, hour: 3 },
          description: "Europe/Athens 03:00 ambiguous time (DST fall back)",
          expectedResults: {
            compatible: "2025-10-26T00:00:00.000Z",
            earlier: "2025-10-26T00:00:00.000Z",
            later: "2025-10-26T01:00:00.000Z",
            reject: "REJECT"
          }
        },
        {
          zone: "Europe/Berlin",
          time: { year: 2025, month: 10, day: 26, hour: 2, minute: 30 },
          description: "Europe/Berlin 02:30 ambiguous time (DST fall back)",
          expectedResults: {
            compatible: "2025-10-26T00:30:00.000Z",
            earlier: "2025-10-26T00:30:00.000Z",
            later: "2025-10-26T01:30:00.000Z",
            reject: "REJECT"
          }
        },
        {
          zone: "Europe/London",
          time: { year: 2024, month: 3, day: 31, hour: 1 },
          description: "Europe/London 01:00 gap time during leap year (2024)",
          expectedResults: {
            compatible: "2024-03-31T01:00:00.000Z",
            earlier: "2024-03-31T00:00:00.000Z",
            later: "2024-03-31T01:00:00.000Z",
            reject: "REJECT"
          }
        },
        {
          zone: "Europe/London",
          time: { year: 2025, month: 3, day: 29, hour: 1 },
          description: "Europe/London 01:00 normal time day before DST",
          expectedResults: {
            compatible: "2025-03-29T01:00:00.000Z",
            earlier: "2025-03-29T01:00:00.000Z",
            later: "2025-03-29T01:00:00.000Z",
            reject: "2025-03-29T01:00:00.000Z"
          }
        },
        {
          zone: "Europe/London",
          time: { year: 2025, month: 3, day: 30, hour: 1 },
          description: "Europe/London 01:00 gap time (DST spring forward)",
          expectedResults: {
            compatible: "2025-03-30T01:00:00.000Z",
            earlier: "2025-03-30T00:00:00.000Z",
            later: "2025-03-30T01:00:00.000Z",
            reject: "REJECT"
          }
        },
        {
          zone: "Europe/London",
          time: { year: 2025, month: 10, day: 26, hour: 1, minute: 30 },
          description: "Europe/London 01:30 ambiguous time (DST fall back)",
          expectedResults: {
            compatible: "2025-10-26T00:30:00.000Z",
            earlier: "2025-10-26T00:30:00.000Z",
            later: "2025-10-26T01:30:00.000Z",
            reject: "REJECT"
          }
        },
        {
          zone: "Pacific/Auckland",
          time: { year: 2025, month: 1, day: 15, hour: 12 },
          description: "Pacific/Auckland 12:00 during DST period (NZDT, UTC+13)",
          expectedResults: {
            compatible: "2025-01-14T23:00:00.000Z",
            earlier: "2025-01-14T23:00:00.000Z",
            later: "2025-01-14T23:00:00.000Z",
            reject: "2025-01-14T23:00:00.000Z"
          }
        },
        {
          zone: "Pacific/Auckland",
          time: { year: 2025, month: 4, day: 6, hour: 1, minute: 59 },
          description: "Pacific/Auckland 01:59 last minute before DST ends",
          expectedResults: {
            compatible: "2025-04-05T12:59:00.000Z",
            earlier: "2025-04-05T12:59:00.000Z",
            later: "2025-04-05T12:59:00.000Z",
            reject: "2025-04-05T12:59:00.000Z"
          }
        },
        {
          zone: "Pacific/Auckland",
          time: { year: 2025, month: 4, day: 6, hour: 2, minute: 30 },
          description: "Pacific/Auckland 02:30 ambiguous time (DST ends, fall back)",
          expectedResults: {
            compatible: "2025-04-05T13:30:00.000Z",
            earlier: "2025-04-05T13:30:00.000Z",
            later: "2025-04-05T14:30:00.000Z",
            reject: "REJECT"
          }
        },
        {
          zone: "Pacific/Auckland",
          time: { year: 2025, month: 4, day: 6, hour: 3 },
          description: "Pacific/Auckland 03:00 normal time after DST ends",
          expectedResults: {
            compatible: "2025-04-05T15:00:00.000Z",
            earlier: "2025-04-05T15:00:00.000Z",
            later: "2025-04-05T15:00:00.000Z",
            reject: "2025-04-05T15:00:00.000Z"
          }
        },
        {
          zone: "Pacific/Auckland",
          time: { year: 2025, month: 7, day: 15, hour: 12 },
          description: "Pacific/Auckland 12:00 during standard time (NZST, UTC+12)",
          expectedResults: {
            compatible: "2025-07-15T00:00:00.000Z",
            earlier: "2025-07-15T00:00:00.000Z",
            later: "2025-07-15T00:00:00.000Z",
            reject: "2025-07-15T00:00:00.000Z"
          }
        },
        {
          zone: "Pacific/Auckland",
          time: { year: 2025, month: 9, day: 28, hour: 1, minute: 59, second: 59 },
          description: "Pacific/Auckland 01:59:59 last second before DST starts",
          expectedResults: {
            compatible: "2025-09-27T13:59:59.000Z",
            earlier: "2025-09-27T13:59:59.000Z",
            later: "2025-09-27T13:59:59.000Z",
            reject: "2025-09-27T13:59:59.000Z"
          }
        },
        {
          zone: "Pacific/Auckland",
          time: { year: 2025, month: 9, day: 28, hour: 2, minute: 30 },
          description: "Pacific/Auckland 02:30 gap time (DST starts, spring forward)",
          expectedResults: {
            compatible: "2025-09-27T14:30:00.000Z",
            earlier: "2025-09-27T13:30:00.000Z",
            later: "2025-09-27T14:30:00.000Z",
            reject: "REJECT"
          }
        },
        {
          zone: "Pacific/Auckland",
          time: { year: 2025, month: 9, day: 28, hour: 3 },
          description: "Pacific/Auckland 03:00 first valid time after DST gap",
          expectedResults: {
            compatible: "2025-09-27T14:00:00.000Z",
            earlier: "2025-09-27T14:00:00.000Z",
            later: "2025-09-27T14:00:00.000Z",
            reject: "2025-09-27T14:00:00.000Z"
          }
        },
        {
          zone: "Pacific/Kiritimati",
          time: { year: 2025, month: 6, day: 15, hour: 12 },
          description: "Pacific/Kiritimati 12:00 extreme positive offset (UTC+14)",
          expectedResults: {
            compatible: "2025-06-14T22:00:00.000Z",
            earlier: "2025-06-14T22:00:00.000Z",
            later: "2025-06-14T22:00:00.000Z",
            reject: "2025-06-14T22:00:00.000Z"
          }
        },
        {
          zone: "Pacific/Marquesas",
          time: { year: 2025, month: 6, day: 15, hour: 12 },
          description: "Pacific/Marquesas 12:00 unusual negative offset (UTC-09:30)",
          expectedResults: {
            compatible: "2025-06-15T21:30:00.000Z",
            earlier: "2025-06-15T21:30:00.000Z",
            later: "2025-06-15T21:30:00.000Z",
            reject: "2025-06-15T21:30:00.000Z"
          }
        }
      ]
    )(
      "should handle $description",
      ({ expectedResults, time, zone }) => {
        // Test normal strategies
        for (const strategy of ["compatible", "earlier", "later"] as const) {
          const result = DateTime.makeZoned(time, {
            timeZone: zone,
            adjustForTimeZone: true,
            disambiguation: strategy
          })
          assertSomeIso(result, expectedResults[strategy])
        }

        // Test default strategy
        const defaultResult = DateTime.makeZoned(time, {
          timeZone: zone,
          adjustForTimeZone: true
        })
        assertSomeIso(defaultResult, expectedResults.compatible)

        // Test reject strategy
        const rejectResult = DateTime.makeZoned(time, {
          timeZone: zone,
          adjustForTimeZone: true,
          disambiguation: "reject"
        })

        if (expectedResults.reject === "REJECT") {
          assertNone(rejectResult)
        } else {
          assertSomeIso(rejectResult, expectedResults.reject)
        }
      }
    )
  })
})
