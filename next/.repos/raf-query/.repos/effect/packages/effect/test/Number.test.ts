import { pipe } from "effect/Function"
import * as N from "effect/Number"
import assert from "node:assert/strict"
import { describe, it } from "vitest"
import { assertNone, assertSome } from "./utils/assert.ts"

const assertNaN = (value: number): void => {
  assert.ok(Number.isNaN(value))
}

const assertNegativeZero = (value: number): void => {
  assert.ok(Object.is(value, -0))
}

const iterableThatFailsAfterZero = (): Iterable<number> => ({
  [Symbol.iterator]: function*() {
    yield 2
    yield 0
    throw new Error("iteration continued past zero")
  }
})

describe("Number", () => {
  it("re-exports the global Number constructor", () => {
    assert.strictEqual(N.Number, globalThis.Number)
  })

  it("coerces values with Number semantics", () => {
    assert.strictEqual(N.Number("42"), 42)
    assert.strictEqual(N.Number("3.14"), 3.14)
    assert.strictEqual(N.Number(true), 1)
    assert.strictEqual(N.Number(null), 0)
  })
})

describe("isNumber", () => {
  it("returns true for numbers, including NaN and infinities", () => {
    assert.strictEqual(N.isNumber(0), true)
    assert.strictEqual(N.isNumber(-1.5), true)
    assert.strictEqual(N.isNumber(NaN), true)
    assert.strictEqual(N.isNumber(Infinity), true)
  })

  it("returns false for non-number values", () => {
    assert.strictEqual(N.isNumber("1"), false)
    assert.strictEqual(N.isNumber(new globalThis.Number(1)), false)
    assert.strictEqual(N.isNumber(null), false)
    assert.strictEqual(N.isNumber(undefined), false)
  })
})

describe("sum", () => {
  it("adds numbers in data-first and data-last forms", () => {
    assert.strictEqual(N.sum(2, 3), 5)
    assert.strictEqual(pipe(2, N.sum(3)), 5)
  })

  it("preserves zero and supports negative operands", () => {
    assert.strictEqual(N.sum(0, 5), 5)
    assert.strictEqual(N.sum(-2, 5), 3)
  })
})

describe("multiply", () => {
  it("multiplies numbers in data-first and data-last forms", () => {
    assert.strictEqual(N.multiply(2, 3), 6)
    assert.strictEqual(pipe(2, N.multiply(3)), 6)
  })

  it("handles zero and negative operands", () => {
    assert.strictEqual(N.multiply(0, 5), 0)
    assert.strictEqual(N.multiply(-2, 5), -10)
  })
})

describe("subtract", () => {
  it("subtracts numbers in data-first and data-last forms", () => {
    assert.strictEqual(N.subtract(5, 3), 2)
    assert.strictEqual(pipe(5, N.subtract(3)), 2)
  })

  it("supports negative results", () => {
    assert.strictEqual(N.subtract(2, 5), -3)
    assert.strictEqual(N.subtract(-2, -5), 3)
  })
})

describe("divide", () => {
  it("divides numbers in data-first and data-last forms", () => {
    assertSome(N.divide(6, 3), 2)
    assertSome(pipe(6, N.divide(3)), 2)
    assertSome(N.divide(0, 3), 0)
  })

  it("returns none for zero and negative-zero divisors", () => {
    assertNone(N.divide(6, 0))
    assertNone(N.divide(6, -0))
  })
})

describe("increment", () => {
  it("adds one to the input", () => {
    assert.strictEqual(N.increment(2), 3)
    assert.strictEqual(N.increment(-1), 0)
  })
})

describe("decrement", () => {
  it("subtracts one from the input", () => {
    assert.strictEqual(N.decrement(3), 2)
    assert.strictEqual(N.decrement(0), -1)
  })
})

describe("Order", () => {
  it("compares less than, equal, and greater than values", () => {
    assert.strictEqual(N.Order(1, 2), -1)
    assert.strictEqual(N.Order(2, 2), 0)
    assert.strictEqual(N.Order(3, 2), 1)
  })

  it("treats NaN as less than any non-NaN and equal to NaN", () => {
    assert.strictEqual(N.Order(NaN, 1), -1)
    assert.strictEqual(N.Order(1, NaN), 1)
    assert.strictEqual(N.Order(NaN, NaN), 0)
  })

  it("treats 0 and -0 as equal", () => {
    assert.strictEqual(N.Order(0, -0), 0)
    assert.strictEqual(N.Order(-0, 0), 0)
  })
})

describe("Equivalence", () => {
  it("returns true for equal numbers and false for different numbers", () => {
    assert.strictEqual(N.Equivalence(1, 1), true)
    assert.strictEqual(N.Equivalence(1, 2), false)
  })

  it("treats NaN as equivalent to NaN and 0 as equivalent to -0", () => {
    assert.strictEqual(N.Equivalence(NaN, NaN), true)
    assert.strictEqual(N.Equivalence(0, -0), true)
  })
})

describe("isLessThan", () => {
  it("returns true only when the first operand is strictly smaller", () => {
    assert.strictEqual(N.isLessThan(2, 3), true)
    assert.strictEqual(N.isLessThan(3, 3), false)
    assert.strictEqual(N.isLessThan(4, 3), false)
  })

  it("supports the data-last form", () => {
    assert.strictEqual(pipe(2, N.isLessThan(3)), true)
  })
})

describe("isLessThanOrEqualTo", () => {
  it("returns true for smaller or equal values", () => {
    assert.strictEqual(N.isLessThanOrEqualTo(2, 3), true)
    assert.strictEqual(N.isLessThanOrEqualTo(3, 3), true)
    assert.strictEqual(N.isLessThanOrEqualTo(4, 3), false)
  })

  it("supports the data-last form", () => {
    assert.strictEqual(pipe(2, N.isLessThanOrEqualTo(3)), true)
  })
})

describe("isGreaterThan", () => {
  it("returns true only when the first operand is strictly greater", () => {
    assert.strictEqual(N.isGreaterThan(2, 3), false)
    assert.strictEqual(N.isGreaterThan(3, 3), false)
    assert.strictEqual(N.isGreaterThan(4, 3), true)
  })

  it("supports the data-last form", () => {
    assert.strictEqual(pipe(4, N.isGreaterThan(3)), true)
  })
})

describe("isGreaterThanOrEqualTo", () => {
  it("returns true for greater or equal values", () => {
    assert.strictEqual(N.isGreaterThanOrEqualTo(2, 3), false)
    assert.strictEqual(N.isGreaterThanOrEqualTo(3, 3), true)
    assert.strictEqual(N.isGreaterThanOrEqualTo(4, 3), true)
  })

  it("supports the data-last form", () => {
    assert.strictEqual(pipe(4, N.isGreaterThanOrEqualTo(3)), true)
  })
})

describe("between", () => {
  it("includes both bounds and excludes values outside the range", () => {
    const options = { minimum: 0, maximum: 5 }

    assert.strictEqual(N.between(0, options), true)
    assert.strictEqual(N.between(3, options), true)
    assert.strictEqual(N.between(5, options), true)
    assert.strictEqual(N.between(-1, options), false)
    assert.strictEqual(N.between(6, options), false)
  })

  it("supports the data-last form", () => {
    assert.strictEqual(pipe(3, N.between({ minimum: 0, maximum: 5 })), true)
  })
})

describe("clamp", () => {
  it("returns the input when it is within bounds and clamps out-of-range values", () => {
    const options = { minimum: 1, maximum: 5 }

    assert.strictEqual(N.clamp(3, options), 3)
    assert.strictEqual(N.clamp(0, options), 1)
    assert.strictEqual(N.clamp(6, options), 5)
  })

  it("supports the data-last form", () => {
    assert.strictEqual(pipe(3, N.clamp({ minimum: 1, maximum: 5 })), 3)
  })

  it("clamps NaN to the minimum according to Number.Order", () => {
    assert.strictEqual(N.clamp(Number.NaN, { minimum: 1, maximum: 5 }), 1)
  })
})

describe("min", () => {
  it("returns the smaller value in data-first and data-last forms", () => {
    assert.strictEqual(N.min(2, 3), 2)
    assert.strictEqual(pipe(2, N.min(3)), 2)
    assert.strictEqual(N.min(5, 0.1), 0.1)
  })

  it("returns the first argument when both values compare as equal", () => {
    assertNegativeZero(N.min(-0, 0))
    assert.strictEqual(Object.is(N.min(0, -0), 0), true)
  })
})

describe("max", () => {
  it("returns the larger value in data-first and data-last forms", () => {
    assert.strictEqual(N.max(2, 3), 3)
    assert.strictEqual(pipe(2, N.max(3)), 3)
    assert.strictEqual(N.max(0.005, 3), 3)
  })

  it("returns the first argument when both values compare as equal", () => {
    assert.strictEqual(Object.is(N.max(-0, 0), -0), true)
    assert.strictEqual(Object.is(N.max(0, -0), 0), true)
  })
})

describe("sign", () => {
  it("returns -1, 0, or 1 for negative, zero, and positive numbers", () => {
    assert.strictEqual(N.sign(-5), -1)
    assert.strictEqual(N.sign(0), 0)
    assert.strictEqual(N.sign(-0), 0)
    assert.strictEqual(N.sign(5), 1)
  })

  it("treats NaN as less than zero because it delegates to Number.Order", () => {
    assert.strictEqual(N.sign(NaN), -1)
  })
})

describe("sumAll", () => {
  it("sums arrays and arbitrary iterables", () => {
    assert.strictEqual(N.sumAll([2, 3, 4]), 9)
    assert.strictEqual(N.sumAll(new Set([1, 2, 3])), 6)
  })

  it("returns zero for an empty iterable", () => {
    assert.strictEqual(N.sumAll([]), 0)
  })
})

describe("multiplyAll", () => {
  it("multiplies arrays and returns one for an empty iterable", () => {
    assert.strictEqual(N.multiplyAll([2, 3, 4]), 24)
    assert.strictEqual(N.multiplyAll([]), 1)
  })

  it("stops iterating once it encounters zero", () => {
    assert.strictEqual(N.multiplyAll(iterableThatFailsAfterZero()), 0)
  })
})

describe("remainder", () => {
  it("computes integer and decimal remainders in data-first and data-last forms", () => {
    assert.strictEqual(N.remainder(3, 2), 1)
    assert.strictEqual(N.remainder(0.3, 0.2), 0.1)
    assert.strictEqual(pipe(0.3, N.remainder(0.2)), 0.1)
  })

  it("preserves the dividend sign, including negative zero", () => {
    assert.strictEqual(N.remainder(-5, 2), -1)
    assertNegativeZero(N.remainder(-4, 2))
    assertNegativeZero(N.remainder(-0, 2))
  })

  it("preserves the dividend sign with negative divisors", () => {
    assert.strictEqual(N.remainder(5, -2), 1)
    assert.strictEqual(N.remainder(-5, -2), -1)
    assertNegativeZero(N.remainder(-4, -2))
  })

  it("returns NaN when the divisor is zero", () => {
    assertNaN(N.remainder(5, 0))
    assertNaN(N.remainder(Number("1e-101"), 0))
  })

  it("returns NaN for non-finite operands", () => {
    assertNaN(N.remainder(NaN, 1))
    assertNaN(N.remainder(Infinity, 1))
    assertNaN(N.remainder(-Infinity, 1))
    assertNaN(N.remainder(1, Infinity))
    assertNaN(N.remainder(1, -Infinity))
  })

  it("handles small floats / scientific notation", () => {
    const divisor = 1e-7

    // Valid multiples (integer * 1e-7)
    assert.strictEqual(N.remainder(0, divisor), 0)
    assert.strictEqual(N.remainder(1e-7, divisor), 0)
    assert.strictEqual(N.remainder(2e-7, divisor), 0)
    assert.strictEqual(N.remainder(3e-7, divisor), 0)

    // Invalid — 2.5 and 1.5 are not integers
    assert.strictEqual(N.remainder(2.5e-7, divisor), 5e-8)
    assert.strictEqual(N.remainder(1.5e-7, divisor), 5e-8)
  })

  it("preserves signs in scientific notation", () => {
    const divisor = 1e-7

    assert.strictEqual(N.remainder(-2.5e-7, divisor), -5e-8)
    assert.strictEqual(N.remainder(2.5e-7, -divisor), 5e-8)
    assert.strictEqual(N.remainder(-2.5e-7, -divisor), -5e-8)
    assertNegativeZero(N.remainder(-0, divisor))
  })

  it("handles scientific notation beyond the toFixed precision limit", () => {
    const divisor = Number("1e-101")

    assert.strictEqual(N.remainder(0, divisor), 0)
    assert.strictEqual(N.remainder(divisor, divisor), 0)
    assert.strictEqual(N.remainder(Number("3e-101"), divisor), 0)
    assert.strictEqual(N.remainder(Number("2.5e-101"), divisor), Number("5e-102"))
    assertNegativeZero(N.remainder(Number("-3e-101"), divisor))
  })

  it("handles subnormal values", () => {
    const min = Number.MIN_VALUE

    assert.strictEqual(N.remainder(min, min), 0)
    assert.strictEqual(N.remainder(min * 2, min), 0)
    assert.strictEqual(N.remainder(min, min * 2), min)
  })

  it("preserves nonzero subnormal remainders", () => {
    const divisor = Number("1e-323")

    assert.strictEqual(N.remainder(Number("1.042e-321"), divisor), Number.MIN_VALUE)
    assert.strictEqual(N.remainder(Number("-1.042e-321"), divisor), -Number.MIN_VALUE)
  })

  it("handles large values formatted in scientific notation", () => {
    const large = Number("1e21")

    assert.strictEqual(N.remainder(large, 2), 0)
    assert.strictEqual(N.remainder(large, 3), 1)
    assert.strictEqual(N.remainder(3, large), 3)
    assertNegativeZero(N.remainder(-large, 2))
  })

  it("handles decimal coefficients beyond the safe integer range", () => {
    assert.strictEqual(N.remainder(100000000000000.05, 0.03), 0)
    assert.strictEqual(N.remainder(100000000000000.1, 0.03), 0.02)
  })

  it("preserves exact integer remainders beyond the safe integer range", () => {
    const large = 2 ** 60

    assert.strictEqual(N.remainder(large, 5), 1)
    assert.strictEqual(N.remainder(-large, 5), -1)
    assert.strictEqual(N.remainder(large, -5), 1)
    assert.strictEqual(N.remainder(large + 256, large), 256)
    assertNegativeZero(N.remainder(-large, 2))
  })

  it("preserves exact integer dividends with fractional divisors", () => {
    const large = 2 ** 60

    assert.strictEqual(N.remainder(large, 2.5), 1)
    assert.strictEqual(N.remainder(large, 1.25), 1)
    assert.strictEqual(N.remainder(large, 3.5), 1)
    assert.strictEqual(N.remainder(-large, 2.5), -1)
    assert.strictEqual(N.remainder(large, -2.5), 1)
    assertNegativeZero(N.remainder(-large, 0.5))
  })

  it("preserves exact integers formatted in scientific notation", () => {
    const large = 2 ** 70

    assert.strictEqual(N.remainder(large, 3), 1)
    assert.strictEqual(N.remainder(large, 2.5), 1.5)
  })
})

describe("nextPow2", () => {
  it("rounds non-powers of two up to the next power of two", () => {
    assert.strictEqual(N.nextPow2(5), 8)
    assert.strictEqual(N.nextPow2(17), 32)
  })

  it("returns the same value for powers of two and a minimum of two otherwise", () => {
    assert.strictEqual(N.nextPow2(8), 8)
    assert.strictEqual(N.nextPow2(1), 2)
    assert.strictEqual(N.nextPow2(0), 2)
    assert.strictEqual(N.nextPow2(1.5), 2)
  })

  it("returns NaN for negative inputs", () => {
    assertNaN(N.nextPow2(-1))
  })
})

describe("parse", () => {
  it("parses valid numeric strings using Number semantics", () => {
    assertSome(N.parse("42"), 42)
    assertSome(N.parse("3.14"), 3.14)
    assertSome(N.parse(" 42 "), 42)
  })

  it("supports NaN and infinities as explicit string literals", () => {
    assertSome(N.parse("NaN"), NaN)
    assertSome(N.parse("Infinity"), Infinity)
    assertSome(N.parse("-Infinity"), -Infinity)
  })

  it("returns none for empty or invalid strings", () => {
    assertNone(N.parse(""))
    assertNone(N.parse("   "))
    assertNone(N.parse("not a number"))
  })
})

describe("round", () => {
  it("rounds with positive precision in data-first and data-last forms", () => {
    assert.strictEqual(N.round(1.1234, 2), 1.12)
    assert.strictEqual(N.round(1.567, 2), 1.57)
    assert.strictEqual(pipe(1.567, N.round(2)), 1.57)
  })

  it("supports zero and negative precision", () => {
    assert.strictEqual(N.round(1.5, 0), 2)
    assert.strictEqual(N.round(145, -1), 150)
  })

  it("follows Math.round semantics for negative halves", () => {
    assert.strictEqual(N.round(-1.25, 1), -1.2)
  })
})

describe("ReducerSum", () => {
  it("combines values and uses zero as the identity", () => {
    assert.strictEqual(N.ReducerSum.combine(1, 2), 3)
    assert.strictEqual(N.ReducerSum.combine(N.ReducerSum.initialValue, 2), 2)
    assert.strictEqual(N.ReducerSum.combine(2, N.ReducerSum.initialValue), 2)
  })

  it("reduces iterables with combineAll", () => {
    assert.strictEqual(N.ReducerSum.combineAll([1, 2, 3]), 6)
    assert.strictEqual(N.ReducerSum.combineAll([]), 0)
  })
})

describe("ReducerMultiply", () => {
  it("combines values and uses one as the identity", () => {
    assert.strictEqual(N.ReducerMultiply.combine(2, 3), 6)
    assert.strictEqual(N.ReducerMultiply.combine(N.ReducerMultiply.initialValue, 2), 2)
    assert.strictEqual(N.ReducerMultiply.combine(2, N.ReducerMultiply.initialValue), 2)
  })

  it("reduces iterables and short-circuits on zero", () => {
    assert.strictEqual(N.ReducerMultiply.combineAll([2, 3, 4]), 24)
    assert.strictEqual(N.ReducerMultiply.combineAll([]), 1)
    assert.strictEqual(N.ReducerMultiply.combineAll(iterableThatFailsAfterZero()), 0)
  })
})

describe("ReducerMax", () => {
  it("combines values and uses negative infinity as the identity", () => {
    assert.strictEqual(N.ReducerMax.combine(1, 2), 2)
    assert.strictEqual(N.ReducerMax.combine(N.ReducerMax.initialValue, 2), 2)
    assert.strictEqual(N.ReducerMax.combine(2, N.ReducerMax.initialValue), 2)
  })

  it("reduces iterables with combineAll", () => {
    assert.strictEqual(N.ReducerMax.combineAll([1, 5, 3]), 5)
    assert.strictEqual(N.ReducerMax.combineAll([]), -Infinity)
  })
})

describe("ReducerMin", () => {
  it("combines values and uses infinity as the identity", () => {
    assert.strictEqual(N.ReducerMin.combine(1, 2), 1)
    assert.strictEqual(N.ReducerMin.combine(N.ReducerMin.initialValue, 2), 2)
    assert.strictEqual(N.ReducerMin.combine(2, N.ReducerMin.initialValue), 2)
  })

  it("reduces iterables with combineAll", () => {
    assert.strictEqual(N.ReducerMin.combineAll([1, 5, 3]), 1)
    assert.strictEqual(N.ReducerMin.combineAll([]), Infinity)
  })
})
