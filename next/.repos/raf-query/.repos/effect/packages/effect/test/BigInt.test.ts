import { assert, describe, it } from "@effect/vitest"
import * as BigInt from "effect/BigInt"
import { assertNone, assertSome } from "./utils/assert.ts"

describe("BigInt", () => {
  it("re-exports the global BigInt constructor", () => {
    assert.strictEqual(BigInt.Equivalence(1n, 1n), true)
    assert.strictEqual(BigInt.Equivalence(1n, 2n), false)
  })

  it("divide returns some for non-zero divisors in data-first and data-last forms", () => {
    assertSome(BigInt.divide(6n, 3n), 2n)
    assertNone(BigInt.divide(6n, 0n))
    assert.strictEqual(BigInt.divideUnsafe(6n, 3n), 2n)
  })

  it("sqrt returns integer square roots", () => {
    assertSome(BigInt.sqrt(4n), 2n)
    assertNone(BigInt.sqrt(-1n))
  })

  it("toNumber converts bigints in the safe integer range", () => {
    assertSome(BigInt.toNumber(42n), 42)
    assertNone(BigInt.toNumber(BigInt.BigInt(Number.MAX_SAFE_INTEGER) + 1n))
  })

  it("toNumber returns none outside the safe integer range", () => {
    assertSome(BigInt.fromString("42"), 42n)
    assertNone(BigInt.fromString(" "))
    assertNone(BigInt.fromString("a"))
  })

  it("fromNumber converts safe integers to bigint", () => {
    assertSome(BigInt.fromNumber(42), 42n)
    assertNone(BigInt.fromNumber(Number.MAX_SAFE_INTEGER + 1))
  })

  it("fromNumber returns none for unsafe or non-integral numbers", () => {
    assert.strictEqual(BigInt.ReducerSum.combine(1n, 2n), 3n)
    assert.strictEqual(BigInt.ReducerSum.combine(BigInt.ReducerSum.initialValue, 2n), 2n)
    assert.strictEqual(BigInt.ReducerSum.combine(2n, BigInt.ReducerSum.initialValue), 2n)
  })

  it("ReducerMultiply combines values with one as the identity", () => {
    assert.strictEqual(BigInt.ReducerMultiply.combine(2n, 3n), 6n)
    assert.strictEqual(BigInt.ReducerMultiply.combine(BigInt.ReducerMultiply.initialValue, 2n), 2n)
    assert.strictEqual(BigInt.ReducerMultiply.combine(2n, BigInt.ReducerMultiply.initialValue), 2n)
  })

  it("CombinerMax returns the larger bigint", () => {
    assert.strictEqual(BigInt.CombinerMax.combine(1n, 2n), 2n)
  })

  it("CombinerMin returns the smaller bigint", () => {
    assert.strictEqual(BigInt.CombinerMin.combine(1n, 2n), 1n)
  })

  it("returns a non-negative greatest common divisor", () => {
    assert.strictEqual(BigInt.gcd(-6n, 4n), 2n)
  })

  it("returns a non-negative least common multiple", () => {
    assert.strictEqual(BigInt.lcm(6n, -4n), 12n)
  })

  it("returns zero for two zero operands", () => {
    assert.strictEqual(BigInt.lcm(0n, 0n), 0n)
  })

  it("Order compares bigints", () => {
    assert.strictEqual(BigInt.Order(1n, 2n), -1)
    assert.strictEqual(BigInt.Order(2n, 1n), 1)
    assert.strictEqual(BigInt.Order(1n, 1n), 0)
  })

  it("isLessThan and isLessThanOrEqualTo compare against an upper bound", () => {
    assert.strictEqual(BigInt.isLessThan(2n, 3n), true)
    assert.strictEqual(BigInt.isLessThan(3n, 3n), false)
    assert.strictEqual(BigInt.isLessThanOrEqualTo(3n, 3n), true)
    assert.strictEqual(BigInt.isLessThanOrEqualTo(4n, 3n), false)
  })

  it("isGreaterThan and isGreaterThanOrEqualTo compare against a lower bound", () => {
    assert.strictEqual(BigInt.isGreaterThan(4n, 3n), true)
    assert.strictEqual(BigInt.isGreaterThan(3n, 3n), false)
    assert.strictEqual(BigInt.isGreaterThanOrEqualTo(3n, 3n), true)
    assert.strictEqual(BigInt.isGreaterThanOrEqualTo(2n, 3n), false)
  })

  it("between checks inclusive range membership", () => {
    assert.strictEqual(BigInt.between(3n, { minimum: 1n, maximum: 5n }), true)
    assert.strictEqual(BigInt.between(0n, { minimum: 1n, maximum: 5n }), false)
    assert.strictEqual(BigInt.between(6n, { minimum: 1n, maximum: 5n }), false)
  })

  it("clamp restricts a bigint to an inclusive range", () => {
    assert.strictEqual(BigInt.clamp(3n, { minimum: 1n, maximum: 5n }), 3n)
    assert.strictEqual(BigInt.clamp(0n, { minimum: 1n, maximum: 5n }), 1n)
    assert.strictEqual(BigInt.clamp(6n, { minimum: 1n, maximum: 5n }), 5n)
  })

  it("min and max select the smaller and larger bigint", () => {
    assert.strictEqual(BigInt.min(2n, 3n), 2n)
    assert.strictEqual(BigInt.max(2n, 3n), 3n)
  })

  it("sign returns the ordering of a bigint against zero", () => {
    assert.strictEqual(BigInt.sign(5n), 1)
    assert.strictEqual(BigInt.sign(-5n), -1)
    assert.strictEqual(BigInt.sign(0n), 0)
  })
})
