import { describe, it } from "@effect/vitest"
import {
  assertFalse,
  assertNone,
  assertSome,
  assertTrue,
  deepStrictEqual,
  doesNotThrow,
  strictEqual
} from "@effect/vitest/utils"
import { DateTime, Duration, Redacted, Result, Schema } from "effect"
import { Headers } from "effect/http"
import { assertSuccess, throws } from "../utils/assert.ts"

describe("Headers", () => {
  describe("Schema.Headers", () => {
    it("serializer annotation", () => {
      const _Accept = Schema.toIso(Schema.Headers).at("Accept")
      const headers = Headers.fromRecordUnsafe({
        "Accept": "application/json, text/plain, */*",
        "Cache-Control": "no-cache"
      })
      assertSuccess(_Accept.getResult(headers), "application/json, text/plain, */*")
      assertSuccess(
        _Accept.replaceResult("application/json", headers),
        Headers.fromRecordUnsafe({
          "accept": "application/json",
          "cache-control": "no-cache"
        })
      )
    })
  })

  it("does not expose inspectable prototype methods during for..in iteration", () => {
    const headers = Headers.fromInput({ foo: "bar" })
    const keys: Array<string> = []

    for (const key in headers) {
      keys.push(key)
    }

    deepStrictEqual(keys, ["foo"])
  })

  it("remove", () => {
    const headers = Headers.fromInput({ foo: "bar", baz: "qux", hello: "world" })
    const result = Headers.remove(headers, "baz")
    deepStrictEqual({ ...result }, { foo: "bar", hello: "world" })
  })

  it("removeMany deletes multiple headers", () => {
    const headers = Headers.fromInput({ foo: "bar", baz: "qux", hello: "world" })
    const result = Headers.removeMany(headers, ["baz", "hello"])
    deepStrictEqual({ ...result }, { foo: "bar" })
  })

  it("removeMany normalizes keys to lowercase", () => {
    const headers = Headers.fromInput({ "Content-Type": "text/plain", "X-Custom": "value", keep: "me" })
    const result = Headers.removeMany(headers, ["Content-Type", "X-CUSTOM"])
    deepStrictEqual({ ...result }, { keep: "me" })
  })

  it("isRedactedName compares string patterns case-insensitively", () => {
    strictEqual(Headers.isRedactedName("Authorization", ["authorization"]), true)
  })

  it("works with for..in based headers polyfills", () => {
    const effectHeaders = Headers.fromInput({ foo: "bar" })
    const nativeHeaders = new globalThis.Headers()

    doesNotThrow(() => {
      for (const key in effectHeaders) {
        nativeHeaders.append(key, effectHeaders[key])
      }
    })

    strictEqual(nativeHeaders.get("foo"), "bar")
  })

  it("get returns Option", () => {
    const headers = Headers.fromInput({ foo: "bar" })
    assertSome(Headers.get(headers, "foo"), "bar")
    assertNone(Headers.get(headers, "missing"))
  })

  it("redacts each header independently with a global pattern", () => {
    const result = Headers.redact(
      Headers.fromInput({ "x-secret-one": "one", "x-secret-two": "two" }),
      /^x-secret-/g
    )

    assertTrue(Redacted.isRedacted(result["x-secret-one"]))
    assertTrue(Redacted.isRedacted(result["x-secret-two"]))
  })

  it("checks each header independently with a sticky pattern", () => {
    const pattern = /^x-secret-/y

    assertTrue(Headers.isRedactedName("x-secret-one", [pattern]))
    assertTrue(Headers.isRedactedName("x-secret-two", [pattern]))
  })

  it("preserves caller-owned stateful pattern cursors", () => {
    const redactPattern = /^x-secret/g
    const namePattern = /^x-secret/y
    redactPattern.lastIndex = 3
    namePattern.lastIndex = 4

    Headers.redact(Headers.fromInput({ "x-secret": "value" }), redactPattern)
    Headers.isRedactedName("x-secret", [namePattern])

    strictEqual(redactPattern.lastIndex, 3)
    strictEqual(namePattern.lastIndex, 4)
  })
})

// 1994-11-06T08:49:37Z, the example date of RFC 9110 §5.6.7
const httpDateMillis = 784_111_777_000

const withTimeZone = <A>(timeZone: string, body: () => A): A => {
  const previous = process.env.TZ
  process.env.TZ = timeZone
  try {
    return body()
  } finally {
    if (previous === undefined) {
      delete process.env.TZ
    } else {
      process.env.TZ = previous
    }
  }
}

describe("HttpDate", () => {
  it("parses every RFC 9110 format as UTC, whatever the process time zone", () => {
    withTimeZone("America/New_York", () => {
      for (
        const input of [
          "Sun, 06 Nov 1994 08:49:37 GMT",
          "Sunday, 06-Nov-94 08:49:37 GMT",
          "Sun Nov  6 08:49:37 1994"
        ]
      ) {
        const date = Result.getOrThrow(Headers.parseHttpDate(input))
        strictEqual(DateTime.toEpochMillis(date), httpDateMillis, input)
      }
    })
  })

  it("rejects values that are not HTTP dates", () => {
    for (const input of ["1994-11-06T08:49:37Z", "120", "", "Sun, 06 Nov 1994 08:49:37 PST"]) {
      const result = Headers.parseHttpDate(input)
      assertTrue(Result.isFailure(result) && result.failure.reason._tag === "InvalidHttpDate", input)
    }
  })

  it("fails with a HeaderParseError", () => {
    const result = Headers.parseHttpDate("tomorrow")
    assertTrue(Result.isFailure(result))
    strictEqual(result.failure._tag, "HeaderParseError")
    assertTrue(Headers.isHeaderParseError(result.failure))
  })

  it("reads RFC 850 two-digit years with a fixed pivot: 70-99 as 19xx, 00-69 as 20xx", () => {
    const year = (input: string) => DateTime.toDateUtc(Result.getOrThrow(Headers.parseHttpDate(input))).getUTCFullYear()
    strictEqual(year("Thursday, 01-Jan-70 00:00:00 GMT"), 1970)
    strictEqual(year("Wednesday, 31-Dec-69 23:59:59 GMT"), 2069)
    strictEqual(year("Saturday, 01-Jan-00 00:00:00 GMT"), 2000)
  })

  it("reads a leap second as the following second", () => {
    const leap = Result.getOrThrow(Headers.parseHttpDate("Sat, 31 Dec 2016 23:59:60 GMT"))
    strictEqual(DateTime.formatIso(leap), "2017-01-01T00:00:00.000Z")
  })

  it("formats as IMF-fixdate", () => {
    strictEqual(Headers.formatHttpDate(DateTime.makeUnsafe(httpDateMillis)), "Sun, 06 Nov 1994 08:49:37 GMT")
  })

  it("Schema.DateTimeUtcFromHttpDate decodes any format and encodes IMF-fixdate", () => {
    const decoded = Schema.decodeSync(Schema.DateTimeUtcFromHttpDate)("Sun Nov  6 08:49:37 1994")
    strictEqual(DateTime.toEpochMillis(decoded), httpDateMillis)
    strictEqual(Schema.encodeSync(Schema.DateTimeUtcFromHttpDate)(decoded), "Sun, 06 Nov 1994 08:49:37 GMT")
    throws(() => Schema.decodeSync(Schema.DateTimeUtcFromHttpDate)("tomorrow"))
  })
})

describe("RetryAfter", () => {
  it("parses whole seconds", () => {
    const value = Result.getOrThrow(Headers.parseRetryAfter("120"))
    strictEqual(value._tag, "Duration")
    if (value._tag === "Duration") {
      strictEqual(Duration.toMillis(value.duration), 120_000)
    }
    strictEqual(Headers.formatRetryAfter(value), "120")
  })

  it("parses an HTTP date", () => {
    const value = Result.getOrThrow(Headers.parseRetryAfter("Sun Nov  6 08:49:37 1994"))
    strictEqual(value._tag, "DateTime")
    if (value._tag === "DateTime") {
      strictEqual(DateTime.toEpochMillis(value.dateTime), httpDateMillis)
    }
    strictEqual(Headers.formatRetryAfter(value), "Sun, 06 Nov 1994 08:49:37 GMT")
  })

  it("rejects negative, fractional, exponent and non-finite seconds", () => {
    for (const input of ["-5", "1.5", "1e3", "Infinity", "", "soon"]) {
      const result = Headers.parseRetryAfter(input)
      assertTrue(Result.isFailure(result) && result.failure.reason._tag === "InvalidRetryAfter", input)
    }
  })

  it("parses and formats seconds beyond the safe integer range exactly", () => {
    const input = "1000000000000000000000"
    const value = Result.getOrThrow(Headers.parseRetryAfter(input))
    strictEqual(Duration.toNanosUnsafe(Headers.retryAfterDelay(value, 0)), 10n ** 30n)
    strictEqual(Headers.formatRetryAfter(value), input)
    strictEqual(
      Schema.encodeSync(Schema.RetryAfterFromString)(Schema.decodeSync(Schema.RetryAfterFromString)(input)),
      input
    )
  })

  it("retryAfterDuration rounds fractions up on the wire, clamps negatives and rejects infinity", () => {
    const fractional = Headers.retryAfterDuration(Duration.millis(1500))
    strictEqual(Headers.formatRetryAfter(fractional), "2")
    strictEqual(Duration.toMillis(Headers.retryAfterDelay(fractional, 0)), 1500)
    const negative = Headers.retryAfterDuration(Duration.seconds(-5))
    strictEqual(Headers.formatRetryAfter(negative), "0")
    strictEqual(Duration.toMillis(Headers.retryAfterDelay(negative, 0)), 0)
    throws(() => Headers.retryAfterDuration(Duration.infinity))
  })

  it("delay is measured from now and never negative", () => {
    const seconds = Result.getOrThrow(Headers.parseRetryAfter("120"))
    strictEqual(Duration.toMillis(Headers.retryAfterDelay(seconds, httpDateMillis)), 120_000)
    const date = Result.getOrThrow(Headers.parseRetryAfter("Sun, 06 Nov 1994 08:49:37 GMT"))
    strictEqual(Duration.toMillis(Headers.retryAfterDelay(date, httpDateMillis - 30_000)), 30_000)
    strictEqual(Duration.toMillis(Headers.retryAfterDelay(date, httpDateMillis + 30_000)), 0)
  })

  it("Schema.RetryAfterFromString round trips and rejects invalid values", () => {
    const decoded = Schema.decodeSync(Schema.RetryAfterFromString)("120")
    strictEqual(decoded._tag, "Duration")
    strictEqual(Schema.encodeSync(Schema.RetryAfterFromString)(decoded), "120")
    throws(() => Schema.decodeSync(Schema.RetryAfterFromString)("-5"))
  })

  it("Schema.RetryAfter accepts only finite, non-negative durations", () => {
    const is = Schema.is(Schema.RetryAfter)
    assertTrue(is({ _tag: "Duration", duration: Duration.seconds(5) }))
    assertFalse(is({ _tag: "Duration", duration: Duration.seconds(-5) }))
    assertFalse(is({ _tag: "Duration", duration: Duration.infinity }))
  })
})
