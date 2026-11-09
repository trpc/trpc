import { describe, it } from "@effect/vitest"
import {
  assertFalse,
  assertNone,
  assertSome,
  assertTrue,
  deepStrictEqual,
  strictEqual,
  throws
} from "@effect/vitest/utils"
import { ByteSize, Equal, Hash, Option } from "effect"
import * as fc from "fast-check"

const arb = fc.bigInt({ min: 0n, max: 10n ** 40n }).map(ByteSize.bytes)

describe("ByteSize", () => {
  it("decodes strict inputs and validates numeric values at runtime", () => {
    deepStrictEqual(ByteSize.fromInputUnsafe("4MB"), ByteSize.megabytes(4))
    assertSome(ByteSize.fromInput("100kB"), ByteSize.kilobytes(100))
    assertSome(ByteSize.fromInput("2 mebibytes"), ByteSize.mebibytes(2))
    assertSome(ByteSize.fromInput("0B"), ByteSize.zero)
    for (const input of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, -1n]) {
      assertNone(ByteSize.fromInput(input))
      throws(() => ByteSize.fromInputUnsafe(input))
    }
  })

  it("constructs exact decimal and binary units", () => {
    const decimal = [
      ByteSize.kilobytes,
      ByteSize.megabytes,
      ByteSize.gigabytes,
      ByteSize.terabytes,
      ByteSize.petabytes,
      ByteSize.exabytes,
      ByteSize.zettabytes,
      ByteSize.yottabytes,
      ByteSize.ronnabytes,
      ByteSize.quettabytes
    ]
    const binary = [
      ByteSize.kibibytes,
      ByteSize.mebibytes,
      ByteSize.gibibytes,
      ByteSize.tebibytes,
      ByteSize.pebibytes,
      ByteSize.exbibytes,
      ByteSize.zebibytes,
      ByteSize.yobibytes
    ]
    decimal.forEach((constructor, index) => {
      strictEqual(ByteSize.toBigInt(constructor(1n)), 1_000n ** BigInt(index + 1))
    })
    binary.forEach((constructor, index) => {
      strictEqual(ByteSize.toBigInt(constructor(1n)), 1_024n ** BigInt(index + 1))
    })
  })

  it("validates primitive and unit constructor inputs", () => {
    deepStrictEqual(ByteSize.bytes(-0), ByteSize.zero)
    deepStrictEqual(ByteSize.bytes(0n), ByteSize.zero)
    for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, -Infinity]) {
      throws(() => ByteSize.bytes(value))
    }
    throws(() => ByteSize.bytes(-1n))
    deepStrictEqual(ByteSize.kilobytes(1.5), ByteSize.bytes(1500))
    deepStrictEqual(ByteSize.kibibytes(0.5), ByteSize.bytes(512))
    throws(() => ByteSize.kibibytes(0.1))
  })

  it("parses strict SI and IEC strings exactly", () => {
    const cases: ReadonlyArray<readonly [string, bigint]> = [
      ["0 B", 0n],
      ["1 byte", 1n],
      ["1500 bytes", 1500n],
      ["1.5 kB", 1500n],
      ["1.5KiB", 1536n],
      ["0.001 kB", 1n],
      ["2 megabytes", 2_000_000n],
      ["2 mebibytes", 2_097_152n],
      ["  9007199254740993 B  ", 9_007_199_254_740_993n]
    ]
    for (const [input, expected] of cases) {
      deepStrictEqual(ByteSize.fromStringUnsafe(input), ByteSize.bytes(expected))
      assertSome(ByteSize.fromString(input), ByteSize.bytes(expected))
    }
  })

  it("rejects ambiguous, negative, and fractional-byte strings", () => {
    const invalid = [
      "",
      "1",
      "+1 B",
      "-1 B",
      "1e3 B",
      "1_000 B",
      "0.5 B",
      "0.1 KiB",
      "1 KB",
      "1 mb",
      "1 Mb",
      "1 K",
      "1 b",
      "1 MiB trailing"
    ]
    for (const input of invalid) {
      assertNone(ByteSize.fromString(input))
      throws(() => ByteSize.fromStringUnsafe(input))
    }
  })

  it("uses a branded bigint representation", () => {
    const value = ByteSize.bytes(9_007_199_254_740_993n)
    strictEqual(typeof value, "bigint")
    strictEqual(String(value), "9007199254740993")
    assertTrue(Equal.equals(value, ByteSize.bytes(9_007_199_254_740_993n)))
    strictEqual(Hash.hash(value), Hash.hash(9_007_199_254_740_993n))
    assertTrue(ByteSize.isByteSize(value))
    assertTrue(ByteSize.isByteSize(0n))
    assertFalse(ByteSize.isByteSize(-1n))
  })

  it("converts to numbers only within the safe-integer range", () => {
    assertSome(ByteSize.toNumber(ByteSize.bytes(BigInt(Number.MAX_SAFE_INTEGER))), Number.MAX_SAFE_INTEGER)
    assertNone(ByteSize.toNumber(ByteSize.bytes(BigInt(Number.MAX_SAFE_INTEGER) + 1n)))
    throws(() => ByteSize.toNumberUnsafe(ByteSize.bytes(BigInt(Number.MAX_SAFE_INTEGER) + 1n)))
    strictEqual(ByteSize.toUnit(ByteSize.kibibytes(3), "KiB"), 3)
  })

  it("supports ordering and checked arithmetic", () => {
    const one = ByteSize.bytes(1)
    const two = ByteSize.bytes(2)
    const three = ByteSize.bytes(3)
    strictEqual(ByteSize.Order(one, two), -1)
    strictEqual(ByteSize.Order(two, two), 0)
    strictEqual(ByteSize.Order(two, one), 1)
    deepStrictEqual(ByteSize.sum(one, two), three)
    assertSome(ByteSize.subtract(three, one), two)
    assertNone(ByteSize.subtract(one, two))
    throws(() => ByteSize.subtractUnsafe(one, two))
    assertSome(ByteSize.times(three, 2), ByteSize.bytes(6))
    assertNone(ByteSize.times(three, -1))
    assertNone(ByteSize.times(three, 0.5))
    assertSome(ByteSize.divide(ByteSize.bytes(7), 2), three)
    assertNone(ByteSize.divide(three, 0))
    assertNone(ByteSize.divide(three, 0.5))
    deepStrictEqual(ByteSize.ReducerSum.combineAll([one, two]), three)
    deepStrictEqual(ByteSize.ReducerSum.combineAll([]), ByteSize.zero)
    deepStrictEqual(ByteSize.CombinerMin.combine(one, two), one)
    deepStrictEqual(ByteSize.CombinerMax.combine(one, two), two)
  })

  it("formats without losing the represented value", () => {
    strictEqual(ByteSize.format(ByteSize.bytes(0)), "0 B")
    strictEqual(ByteSize.format(ByteSize.bytes(1536)), "1.5 KiB")
    strictEqual(ByteSize.format(ByteSize.bytes(1536), { system: "decimal" }), "1.54 kB")
    strictEqual(ByteSize.format(ByteSize.bytes(1500), { unit: "kB", precision: 3, trailingZeros: true }), "1.500 kB")
    strictEqual(ByteSize.format(ByteSize.mebibytes(1)), "1 MiB")
    strictEqual(ByteSize.format(ByteSize.subtractUnsafe(ByteSize.mebibytes(1), ByteSize.bytes(1))), "1 MiB")
    strictEqual(ByteSize.format(ByteSize.bytes(10n ** 35n), { system: "decimal" }), "100000 QB")
    throws(() => ByteSize.format(ByteSize.zero, { precision: 21 }))
  })

  it("roundtrips canonical strings", () => {
    fc.assert(fc.property(arb, (value) => {
      deepStrictEqual(ByteSize.fromStringUnsafe(`${value} B`), value)
    }))
  })

  it("preserves arithmetic invariants", () => {
    fc.assert(fc.property(arb, arb, (a, b) => {
      if (ByteSize.isGreaterThanOrEqualTo(a, b)) {
        deepStrictEqual(ByteSize.sum(ByteSize.subtractUnsafe(a, b), b), a)
      } else {
        assertNone(ByteSize.subtract(a, b))
      }
    }))
    fc.assert(fc.property(arb, fc.bigInt({ min: 1n, max: 1_000n }), (value, divisor) => {
      const quotient = Option.getOrThrow(ByteSize.divide(value, divisor))
      const product = Option.getOrThrow(ByteSize.times(quotient, divisor))
      assertTrue(ByteSize.isLessThanOrEqualTo(product, value))
      assertTrue(ByteSize.isLessThan(value, ByteSize.sum(product, ByteSize.bytes(divisor))))
    }))
  })

  it("is total for arbitrary strings", () => {
    fc.assert(fc.property(fc.string(), (input) => {
      ByteSize.fromString(input)
    }))
  })
})
