import * as Boolean from "effect/Boolean"
import { pipe } from "effect/Function"
import assert from "node:assert/strict"
import { describe, it } from "vitest"

describe("Boolean", () => {
  it("re-exports the global Boolean constructor", () => {
    assert.strictEqual(Boolean.Boolean, globalThis.Boolean)
  })

  it("coerces values with Boolean semantics", () => {
    assert.strictEqual(Boolean.Boolean(1), true)
    assert.strictEqual(Boolean.Boolean(0), false)
    assert.strictEqual(Boolean.Boolean(""), false)
    assert.strictEqual(Boolean.Boolean("hello"), true)
    assert.strictEqual(Boolean.Boolean(null), false)
    assert.strictEqual(Boolean.Boolean(undefined), false)
  })
})

describe("isBoolean", () => {
  it("returns true for boolean values", () => {
    assert.strictEqual(Boolean.isBoolean(true), true)
    assert.strictEqual(Boolean.isBoolean(false), true)
  })

  it("returns false for non-boolean values", () => {
    assert.strictEqual(Boolean.isBoolean(0), false)
    assert.strictEqual(Boolean.isBoolean(1), false)
    assert.strictEqual(Boolean.isBoolean("true"), false)
    assert.strictEqual(Boolean.isBoolean(null), false)
    assert.strictEqual(Boolean.isBoolean(undefined), false)
  })
})

describe("match", () => {
  const options = {
    onFalse: () => "false" as const,
    onTrue: () => "true" as const
  }

  it("calls onTrue when value is true (data-first)", () => {
    assert.strictEqual(Boolean.match(true, options), "true")
  })

  it("calls onFalse when value is false (data-first)", () => {
    assert.strictEqual(Boolean.match(false, options), "false")
  })

  it("works in data-last (pipeable) form", () => {
    assert.strictEqual(pipe(true, Boolean.match(options)), "true")
    assert.strictEqual(pipe(false, Boolean.match(options)), "false")
  })
})

describe("Order", () => {
  it("false < true", () => {
    assert.strictEqual(Boolean.Order(false, true), -1)
  })

  it("true > false", () => {
    assert.strictEqual(Boolean.Order(true, false), 1)
  })

  it("equal values return 0", () => {
    assert.strictEqual(Boolean.Order(true, true), 0)
    assert.strictEqual(Boolean.Order(false, false), 0)
  })
})

describe("Equivalence", () => {
  it("returns true for equal booleans", () => {
    assert.strictEqual(Boolean.Equivalence(true, true), true)
    assert.strictEqual(Boolean.Equivalence(false, false), true)
  })

  it("returns false for different booleans", () => {
    assert.strictEqual(Boolean.Equivalence(true, false), false)
    assert.strictEqual(Boolean.Equivalence(false, true), false)
  })
})

describe("not", () => {
  it("negates the value", () => {
    assert.strictEqual(Boolean.not(true), false)
    assert.strictEqual(Boolean.not(false), true)
  })

  it("is self-inverse", () => {
    assert.strictEqual(Boolean.not(Boolean.not(true)), true)
    assert.strictEqual(Boolean.not(Boolean.not(false)), false)
  })
})

describe("and", () => {
  it("truth table (data-first)", () => {
    assert.strictEqual(Boolean.and(true, true), true)
    assert.strictEqual(Boolean.and(true, false), false)
    assert.strictEqual(Boolean.and(false, true), false)
    assert.strictEqual(Boolean.and(false, false), false)
  })

  it("supports data-last form with the pipe value as the left operand", () => {
    assert.strictEqual(pipe(true, Boolean.and(true)), true)
    assert.strictEqual(pipe(true, Boolean.and(false)), false)
  })
})

describe("nand", () => {
  it("truth table (data-first)", () => {
    assert.strictEqual(Boolean.nand(true, true), false)
    assert.strictEqual(Boolean.nand(true, false), true)
    assert.strictEqual(Boolean.nand(false, true), true)
    assert.strictEqual(Boolean.nand(false, false), true)
  })

  it("supports data-last form with the pipe value as the left operand", () => {
    assert.strictEqual(pipe(true, Boolean.nand(true)), false)
    assert.strictEqual(pipe(false, Boolean.nand(false)), true)
  })
})

describe("or", () => {
  it("truth table (data-first)", () => {
    assert.strictEqual(Boolean.or(true, true), true)
    assert.strictEqual(Boolean.or(true, false), true)
    assert.strictEqual(Boolean.or(false, true), true)
    assert.strictEqual(Boolean.or(false, false), false)
  })

  it("supports data-last form with the pipe value as the left operand", () => {
    assert.strictEqual(pipe(false, Boolean.or(true)), true)
    assert.strictEqual(pipe(false, Boolean.or(false)), false)
  })
})

describe("nor", () => {
  it("truth table (data-first)", () => {
    assert.strictEqual(Boolean.nor(true, true), false)
    assert.strictEqual(Boolean.nor(true, false), false)
    assert.strictEqual(Boolean.nor(false, true), false)
    assert.strictEqual(Boolean.nor(false, false), true)
  })

  it("supports data-last form with the pipe value as the left operand", () => {
    assert.strictEqual(pipe(true, Boolean.nor(true)), false)
    assert.strictEqual(pipe(false, Boolean.nor(false)), true)
  })
})

describe("xor", () => {
  it("truth table (data-first)", () => {
    assert.strictEqual(Boolean.xor(true, true), false)
    assert.strictEqual(Boolean.xor(true, false), true)
    assert.strictEqual(Boolean.xor(false, true), true)
    assert.strictEqual(Boolean.xor(false, false), false)
  })

  it("supports data-last form with the pipe value as the left operand", () => {
    assert.strictEqual(pipe(true, Boolean.xor(false)), true)
    assert.strictEqual(pipe(false, Boolean.xor(false)), false)
  })
})

describe("eqv", () => {
  it("truth table (data-first)", () => {
    assert.strictEqual(Boolean.eqv(true, true), true)
    assert.strictEqual(Boolean.eqv(true, false), false)
    assert.strictEqual(Boolean.eqv(false, true), false)
    assert.strictEqual(Boolean.eqv(false, false), true)
  })

  it("supports data-last form with the pipe value as the left operand", () => {
    assert.strictEqual(pipe(true, Boolean.eqv(true)), true)
    assert.strictEqual(pipe(true, Boolean.eqv(false)), false)
  })

  it("is the negation of xor", () => {
    for (const a of [true, false]) {
      for (const b of [true, false]) {
        assert.strictEqual(Boolean.eqv(a, b), !Boolean.xor(a, b))
      }
    }
  })
})

describe("implies", () => {
  it("truth table (data-first)", () => {
    assert.strictEqual(Boolean.implies(true, true), true)
    assert.strictEqual(Boolean.implies(true, false), false)
    assert.strictEqual(Boolean.implies(false, true), true)
    assert.strictEqual(Boolean.implies(false, false), true)
  })

  it("supports data-last form with the pipe value as the left operand", () => {
    assert.strictEqual(pipe(true, Boolean.implies(false)), false)
    assert.strictEqual(pipe(false, Boolean.implies(false)), true)
  })
})

describe("every", () => {
  it("returns true when all elements are true", () => {
    assert.strictEqual(Boolean.every([true, true, true]), true)
  })

  it("returns false when any element is false", () => {
    assert.strictEqual(Boolean.every([true, false, true]), false)
  })

  it("returns true for empty collection", () => {
    assert.strictEqual(Boolean.every([]), true)
  })

  it("short-circuits on first false", () => {
    const iterable: Iterable<boolean> = {
      [Symbol.iterator]: function*() {
        yield true
        yield false
        throw new Error("should not reach here")
      }
    }
    assert.strictEqual(Boolean.every(iterable), false)
  })
})

describe("some", () => {
  it("returns true when any element is true", () => {
    assert.strictEqual(Boolean.some([true, false, false]), true)
  })

  it("returns false when all elements are false", () => {
    assert.strictEqual(Boolean.some([false, false, false]), false)
  })

  it("returns false for empty collection", () => {
    assert.strictEqual(Boolean.some([]), false)
  })

  it("short-circuits on first true", () => {
    const iterable: Iterable<boolean> = {
      [Symbol.iterator]: function*() {
        yield false
        yield true
        throw new Error("should not reach here")
      }
    }
    assert.strictEqual(Boolean.some(iterable), true)
  })
})

describe("ReducerAnd", () => {
  it("initialValue is true (identity for AND)", () => {
    assert.strictEqual(Boolean.ReducerAnd.initialValue, true)
  })

  it("truth table", () => {
    assert.strictEqual(Boolean.ReducerAnd.combine(true, true), true)
    assert.strictEqual(Boolean.ReducerAnd.combine(true, false), false)
    assert.strictEqual(Boolean.ReducerAnd.combine(false, true), false)
    assert.strictEqual(Boolean.ReducerAnd.combine(false, false), false)
  })

  it("initialValue acts as identity element", () => {
    assert.strictEqual(Boolean.ReducerAnd.combine(Boolean.ReducerAnd.initialValue, true), true)
    assert.strictEqual(Boolean.ReducerAnd.combine(Boolean.ReducerAnd.initialValue, false), false)
    assert.strictEqual(Boolean.ReducerAnd.combine(true, Boolean.ReducerAnd.initialValue), true)
    assert.strictEqual(Boolean.ReducerAnd.combine(false, Boolean.ReducerAnd.initialValue), false)
  })
})

describe("ReducerOr", () => {
  it("initialValue is false (identity for OR)", () => {
    assert.strictEqual(Boolean.ReducerOr.initialValue, false)
  })

  it("truth table", () => {
    assert.strictEqual(Boolean.ReducerOr.combine(true, true), true)
    assert.strictEqual(Boolean.ReducerOr.combine(true, false), true)
    assert.strictEqual(Boolean.ReducerOr.combine(false, true), true)
    assert.strictEqual(Boolean.ReducerOr.combine(false, false), false)
  })

  it("initialValue acts as identity element", () => {
    assert.strictEqual(Boolean.ReducerOr.combine(Boolean.ReducerOr.initialValue, true), true)
    assert.strictEqual(Boolean.ReducerOr.combine(Boolean.ReducerOr.initialValue, false), false)
    assert.strictEqual(Boolean.ReducerOr.combine(true, Boolean.ReducerOr.initialValue), true)
    assert.strictEqual(Boolean.ReducerOr.combine(false, Boolean.ReducerOr.initialValue), false)
  })
})
