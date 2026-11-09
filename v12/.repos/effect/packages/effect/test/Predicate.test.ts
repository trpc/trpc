import { describe, it } from "@effect/vitest"
import { Function as Fun, pipe, Predicate } from "effect"
import assert from "node:assert/strict"

const isPositive: Predicate.Predicate<number> = (n) => n > 0
const isNegative: Predicate.Predicate<number> = (n) => n < 0
const isLessThan2: Predicate.Predicate<number> = (n) => n < 2
const isString: Predicate.Refinement<unknown, string> = (u: unknown): u is string => typeof u === "string"

interface NonEmptyStringBrand {
  readonly NonEmptyString: unique symbol
}

type NonEmptyString = string & NonEmptyStringBrand

const isNonEmptyString: Predicate.Refinement<string, NonEmptyString> = (s): s is NonEmptyString => s.length > 0

describe("compose", () => {
  it("composes refinements to narrow through both checks", () => {
    const refinement = pipe(isString, Predicate.compose(isNonEmptyString))

    assert.equal(refinement("a"), true)
    assert.equal(refinement(null), false)
    assert.equal(refinement(""), false)
  })

  it("composes a refinement with a predicate", () => {
    const isLong = (s: string) => s.length > 2
    const refinement = Predicate.compose(isString, isLong)

    assert.equal(refinement("abcd"), true)
    assert.equal(refinement("a"), false)
    assert.equal(refinement(1), false)
  })
})

describe("mapInput", () => {
  it("maps input before applying the predicate (curried)", () => {
    type A = { readonly a: number }
    const predicate = pipe(
      isPositive,
      Predicate.mapInput((a: A) => a.a)
    )

    assert.equal(predicate({ a: -1 }), false)
    assert.equal(predicate({ a: 0 }), false)
    assert.equal(predicate({ a: 1 }), true)
  })

  it("maps input before applying the predicate (uncurried)", () => {
    type A = { readonly a: number }
    const predicate = Predicate.mapInput(isPositive, (a: A) => a.a)

    assert.equal(predicate({ a: -1 }), false)
    assert.equal(predicate({ a: 0 }), false)
    assert.equal(predicate({ a: 1 }), true)
  })
})

describe("Tuple", () => {
  it("returns true only when all element predicates succeed", () => {
    const p = Predicate.Tuple([isPositive, isNegative])

    assert.equal(p([1, -1]), true)
    assert.equal(p([1, 1]), false)
    assert.equal(p([-1, -1]), false)
    assert.equal(p([-1, 1]), false)
  })

  it("stops checking after the first failing predicate", () => {
    let calls = 0
    const first = (_: number) => {
      calls += 1
      return false
    }
    const second = (_: number) => {
      calls += 1
      return true
    }

    const p = Predicate.Tuple([first, second])

    assert.equal(p([1, 2]), false)
    assert.equal(calls, 1)
  })
})

describe("Struct", () => {
  it("returns true only when all field predicates succeed", () => {
    const p = Predicate.Struct({ a: isPositive, b: isNegative })

    assert.equal(p({ a: 1, b: -1 }), true)
    assert.equal(p({ a: 1, b: 1 }), false)
    assert.equal(p({ a: -1, b: -1 }), false)
    assert.equal(p({ a: -1, b: 1 }), false)
  })

  it("ignores extra keys and stops at first failing field", () => {
    let calls = 0
    const first = (_: number) => {
      calls += 1
      return false
    }
    const second = (_: string) => {
      calls += 1
      return true
    }

    const p = Predicate.Struct({ a: first, b: second })

    assert.equal(p({ a: 1, b: "ok", extra: true } as any), false)
    assert.equal(calls, 1)
  })
})

describe("not", () => {
  it("negates the underlying predicate", () => {
    const p = Predicate.not(isPositive)

    assert.equal(p(1), false)
    assert.equal(p(0), true)
    assert.equal(p(-1), true)
  })
})

describe("or", () => {
  it("returns true when either predicate is true", () => {
    const p = pipe(isPositive, Predicate.or(isNegative))

    assert.equal(p(-1), true)
    assert.equal(p(1), true)
    assert.equal(p(0), false)
  })
})

describe("and", () => {
  it("returns true only when both predicates are true", () => {
    const p = pipe(isPositive, Predicate.and(isLessThan2))

    assert.equal(p(1), true)
    assert.equal(p(-1), false)
    assert.equal(p(3), false)
  })
})

describe("xor", () => {
  it("returns true only when exactly one predicate is true", () => {
    assert.equal(pipe(Fun.constTrue, Predicate.xor(Fun.constTrue))(null), false)
    assert.equal(pipe(Fun.constTrue, Predicate.xor(Fun.constFalse))(null), true)
    assert.equal(pipe(Fun.constFalse, Predicate.xor(Fun.constTrue))(null), true)
    assert.equal(pipe(Fun.constFalse, Predicate.xor(Fun.constFalse))(null), false)
  })
})

describe("eqv", () => {
  it("returns true when both predicates agree", () => {
    assert.equal(pipe(Fun.constTrue, Predicate.eqv(Fun.constTrue))(null), true)
    assert.equal(pipe(Fun.constTrue, Predicate.eqv(Fun.constFalse))(null), false)
    assert.equal(pipe(Fun.constFalse, Predicate.eqv(Fun.constTrue))(null), false)
    assert.equal(pipe(Fun.constFalse, Predicate.eqv(Fun.constFalse))(null), true)
  })
})

describe("implies", () => {
  it("returns true when antecedent is false or consequent is true", () => {
    assert.equal(pipe(Fun.constTrue, Predicate.implies(Fun.constTrue))(null), true)
    assert.equal(pipe(Fun.constTrue, Predicate.implies(Fun.constFalse))(null), false)
    assert.equal(pipe(Fun.constFalse, Predicate.implies(Fun.constTrue))(null), true)
    assert.equal(pipe(Fun.constFalse, Predicate.implies(Fun.constFalse))(null), true)
  })
})

describe("nor", () => {
  it("returns true only when both predicates are false", () => {
    assert.equal(pipe(Fun.constTrue, Predicate.nor(Fun.constTrue))(null), false)
    assert.equal(pipe(Fun.constTrue, Predicate.nor(Fun.constFalse))(null), false)
    assert.equal(pipe(Fun.constFalse, Predicate.nor(Fun.constTrue))(null), false)
    assert.equal(pipe(Fun.constFalse, Predicate.nor(Fun.constFalse))(null), true)
  })
})

describe("nand", () => {
  it("returns false only when both predicates are true", () => {
    assert.equal(pipe(Fun.constTrue, Predicate.nand(Fun.constTrue))(null), false)
    assert.equal(pipe(Fun.constTrue, Predicate.nand(Fun.constFalse))(null), true)
    assert.equal(pipe(Fun.constFalse, Predicate.nand(Fun.constTrue))(null), true)
    assert.equal(pipe(Fun.constFalse, Predicate.nand(Fun.constFalse))(null), true)
  })
})

describe("every", () => {
  it("returns true when all predicates pass", () => {
    const predicate = Predicate.every([isPositive, isLessThan2])

    assert.equal(predicate(1), true)
    assert.equal(predicate(0), false)
    assert.equal(predicate(-2), false)
  })

  it("returns true for empty collections", () => {
    const predicate = Predicate.every([])

    assert.equal(predicate(0), true)
  })
})

describe("some", () => {
  it("returns true when any predicate passes", () => {
    const predicate = Predicate.some([isPositive, isNegative])

    assert.equal(predicate(0), false)
    assert.equal(predicate(-1), true)
    assert.equal(predicate(1), true)
  })

  it("returns false for empty collections", () => {
    const predicate = Predicate.some([])

    assert.equal(predicate(0), false)
  })
})

describe("isTruthy", () => {
  it("uses JavaScript truthiness", () => {
    assert.equal(Predicate.isTruthy(true), true)
    assert.equal(Predicate.isTruthy(false), false)
    assert.equal(Predicate.isTruthy("a"), true)
    assert.equal(Predicate.isTruthy(""), false)
    assert.equal(Predicate.isTruthy(1), true)
    assert.equal(Predicate.isTruthy(0), false)
    assert.equal(Predicate.isTruthy(1n), true)
    assert.equal(Predicate.isTruthy(0n), false)
  })
})

describe("isSet", () => {
  it("detects Set instances", () => {
    assert.equal(Predicate.isSet(new Set([1, 2])), true)
    assert.equal(Predicate.isSet(new Set()), true)
    assert.equal(Predicate.isSet({}), false)
    assert.equal(Predicate.isSet(null), false)
    assert.equal(Predicate.isSet(undefined), false)
  })
})

describe("isMap", () => {
  it("detects Map instances", () => {
    assert.equal(Predicate.isMap(new Map()), true)
    assert.equal(Predicate.isMap({}), false)
    assert.equal(Predicate.isMap(null), false)
    assert.equal(Predicate.isMap(undefined), false)
  })
})

describe("isString", () => {
  it("detects string values", () => {
    assert.equal(Predicate.isString("a"), true)
    assert.equal(Predicate.isString(1), false)
    assert.equal(Predicate.isString(new String("a")), false)
  })
})

describe("isNumber", () => {
  it("detects number values", () => {
    assert.equal(Predicate.isNumber(2), true)
    assert.equal(Predicate.isNumber(Number.NaN), true)
    assert.equal(Predicate.isNumber("2"), false)
  })
})

describe("isBoolean", () => {
  it("detects boolean values", () => {
    assert.equal(Predicate.isBoolean(true), true)
    assert.equal(Predicate.isBoolean(false), true)
    assert.equal(Predicate.isBoolean("true"), false)
  })
})

describe("isBigInt", () => {
  it("detects bigint values", () => {
    assert.equal(Predicate.isBigInt(1n), true)
    assert.equal(Predicate.isBigInt(1), false)
  })
})

describe("isSymbol", () => {
  it("detects symbol values", () => {
    assert.equal(Predicate.isSymbol(Symbol.for("a")), true)
    assert.equal(Predicate.isSymbol("a"), false)
  })
})

describe("isPropertyKey", () => {
  it("accepts strings, numbers, and symbols", () => {
    assert.equal(Predicate.isPropertyKey("a"), true)
    assert.equal(Predicate.isPropertyKey(1), true)
    assert.equal(Predicate.isPropertyKey(Number.NaN), true)
    assert.equal(Predicate.isPropertyKey(Symbol.for("a")), true)
    assert.equal(Predicate.isPropertyKey(true), false)
  })
})

describe("isFunction", () => {
  it("detects callable values", () => {
    assert.equal(Predicate.isFunction(Predicate.isFunction), true)
    assert.equal(Predicate.isFunction("function"), false)
  })
})

describe("isUndefined", () => {
  it("detects undefined", () => {
    assert.equal(Predicate.isUndefined(undefined), true)
    assert.equal(Predicate.isUndefined(null), false)
    assert.equal(Predicate.isUndefined("undefined"), false)
  })
})

describe("isNotUndefined", () => {
  it("filters out undefined", () => {
    assert.equal(Predicate.isNotUndefined(undefined), false)
    assert.equal(Predicate.isNotUndefined(null), true)
    assert.equal(Predicate.isNotUndefined("undefined"), true)
  })
})

describe("isNull", () => {
  it("detects null", () => {
    assert.equal(Predicate.isNull(null), true)
    assert.equal(Predicate.isNull(undefined), false)
    assert.equal(Predicate.isNull("null"), false)
  })
})

describe("isNotNull", () => {
  it("filters out null", () => {
    assert.equal(Predicate.isNotNull(null), false)
    assert.equal(Predicate.isNotNull(undefined), true)
    assert.equal(Predicate.isNotNull("null"), true)
  })
})

describe("isNullish", () => {
  it("detects null and undefined", () => {
    assert.equal(Predicate.isNullish(null), true)
    assert.equal(Predicate.isNullish(undefined), true)
    assert.equal(Predicate.isNullish({}), false)
    assert.equal(Predicate.isNullish([]), false)
  })
})

describe("isNotNullish", () => {
  it("filters out null and undefined", () => {
    assert.equal(Predicate.isNotNullish({}), true)
    assert.equal(Predicate.isNotNullish([]), true)
    assert.equal(Predicate.isNotNullish(null), false)
    assert.equal(Predicate.isNotNullish(undefined), false)
  })
})

describe("isNever", () => {
  it("always returns false", () => {
    assert.equal(Predicate.isNever(null), false)
    assert.equal(Predicate.isNever(undefined), false)
    assert.equal(Predicate.isNever({}), false)
    assert.equal(Predicate.isNever([]), false)
  })
})

describe("isUnknown", () => {
  it("always returns true", () => {
    assert.equal(Predicate.isUnknown(null), true)
    assert.equal(Predicate.isUnknown(undefined), true)
    assert.equal(Predicate.isUnknown({}), true)
    assert.equal(Predicate.isUnknown([]), true)
  })
})

describe("isObjectOrArray", () => {
  it("accepts objects and arrays but not null", () => {
    assert.equal(Predicate.isObjectOrArray({}), true)
    assert.equal(Predicate.isObjectOrArray([]), true)
    assert.equal(Predicate.isObjectOrArray(null), false)
    assert.equal(Predicate.isObjectOrArray(() => {}), false)
  })
})

describe("isObject", () => {
  it("accepts objects but not arrays or functions", () => {
    assert.equal(Predicate.isObject({}), true)
    assert.equal(Predicate.isObject({ a: 1 }), true)
    assert.equal(Predicate.isObject([]), false)
    assert.equal(Predicate.isObject([1, 2, 3]), false)
    assert.equal(Predicate.isObject(null), false)
    assert.equal(Predicate.isObject(undefined), false)
    assert.equal(Predicate.isObject(() => null), false)
  })
})

describe("isReadonlyObject", () => {
  it("behaves like isObject", () => {
    assert.equal(Predicate.isReadonlyObject({}), true)
    assert.equal(Predicate.isReadonlyObject({ a: 1 }), true)
    assert.equal(Predicate.isReadonlyObject([]), false)
    assert.equal(Predicate.isReadonlyObject([1, 2, 3]), false)
    assert.equal(Predicate.isReadonlyObject(null), false)
    assert.equal(Predicate.isReadonlyObject(undefined), false)
  })
})

describe("isObjectKeyword", () => {
  it("accepts objects, arrays, and functions", () => {
    assert.equal(Predicate.isObjectKeyword({}), true)
    assert.equal(Predicate.isObjectKeyword([]), true)
    assert.equal(Predicate.isObjectKeyword(() => 1), true)
    assert.equal(Predicate.isObjectKeyword(null), false)
    assert.equal(Predicate.isObjectKeyword(undefined), false)
    assert.equal(Predicate.isObjectKeyword("a"), false)
    assert.equal(Predicate.isObjectKeyword(1), false)
    assert.equal(Predicate.isObjectKeyword(true), false)
    assert.equal(Predicate.isObjectKeyword(1n), false)
    assert.equal(Predicate.isObjectKeyword(Symbol.for("a")), false)
  })
})

describe("hasProperty", () => {
  it("detects properties with string and symbol keys", () => {
    const a = Symbol.for("effect/test/a")

    assert.equal(Predicate.hasProperty({ a: 1 }, "a"), true)
    assert.equal(Predicate.hasProperty("a")({ a: 1 }), true)
    assert.equal(Predicate.hasProperty({ [a]: 1 }, a), true)
    assert.equal(Predicate.hasProperty(a)({ [a]: 1 }), true)
  })

  it("returns false when the key is missing or the value is not object-like", () => {
    const a = Symbol.for("effect/test/a")

    assert.equal(Predicate.hasProperty({}, "a"), false)
    assert.equal(Predicate.hasProperty(null, "a"), false)
    assert.equal(Predicate.hasProperty(undefined, "a"), false)
    assert.equal(Predicate.hasProperty(() => {}, "a"), false)

    assert.equal(Predicate.hasProperty({}, a), false)
    assert.equal(Predicate.hasProperty(null, a), false)
    assert.equal(Predicate.hasProperty(undefined, a), false)
    assert.equal(Predicate.hasProperty(() => {}, a), false)
  })
})

describe("isTagged", () => {
  it("matches objects with the expected _tag", () => {
    assert.equal(Predicate.isTagged(1, "a"), false)
    assert.equal(Predicate.isTagged("", "a"), false)
    assert.equal(Predicate.isTagged({}, "a"), false)
    assert.equal(Predicate.isTagged("a")({}), false)
    assert.equal(Predicate.isTagged({ a: "a" }, "a"), false)
    assert.equal(Predicate.isTagged({ _tag: "a" }, "a"), true)
    assert.equal(Predicate.isTagged("a")({ _tag: "a" }), true)
  })
})

describe("isError", () => {
  it("detects Error instances", () => {
    assert.equal(Predicate.isError(new Error()), true)
    assert.equal(Predicate.isError(null), false)
    assert.equal(Predicate.isError({}), false)
  })
})

describe("isUint8Array", () => {
  it("detects Uint8Array instances", () => {
    assert.equal(Predicate.isUint8Array(new Uint8Array()), true)
    assert.equal(Predicate.isUint8Array(null), false)
    assert.equal(Predicate.isUint8Array({}), false)
  })
})

describe("isDate", () => {
  it("detects Date instances", () => {
    assert.equal(Predicate.isDate(new Date()), true)
    assert.equal(Predicate.isDate(null), false)
    assert.equal(Predicate.isDate({}), false)
  })
})

describe("isIterable", () => {
  it("detects iterable values including strings", () => {
    assert.equal(Predicate.isIterable([]), true)
    assert.equal(Predicate.isIterable(""), true)
    assert.equal(Predicate.isIterable(new Set()), true)
    assert.equal(Predicate.isIterable(new Map()), true)

    assert.equal(Predicate.isIterable(null), false)
    assert.equal(Predicate.isIterable({}), false)
  })
})

describe("isPromise", () => {
  it("detects promise-like values with then and catch", () => {
    assert.equal(Predicate.isPromise(Promise.resolve("ok")), true)
    /* oxlint-disable-next-line no-thenable */
    assert.equal(Predicate.isPromise({ then: () => {}, catch: () => {} }), true)
    /* oxlint-disable-next-line no-thenable */
    assert.equal(Predicate.isPromise({ then: () => {} }), false)
    assert.equal(Predicate.isPromise({}), false)
  })
})

describe("isPromiseLike", () => {
  it("detects thenables", () => {
    assert.equal(Predicate.isPromiseLike(Promise.resolve("ok")), true)
    /* oxlint-disable-next-line no-thenable */
    assert.equal(Predicate.isPromiseLike({ then: () => {} }), true)
    assert.equal(Predicate.isPromiseLike({}), false)
    assert.equal(Predicate.isPromiseLike(null), false)
  })
})

describe("isRegExp", () => {
  it("detects RegExp instances", () => {
    assert.equal(Predicate.isRegExp(/a/), true)
    assert.equal(Predicate.isRegExp(null), false)
    assert.equal(Predicate.isRegExp("a"), false)
  })
})

describe("isTupleOf", () => {
  it("checks for exact length", () => {
    assert.equal(Predicate.isTupleOf([1, 2, 3], 3), true)
    assert.equal(Predicate.isTupleOf([1, 2, 3], 4), false)
    assert.equal(Predicate.isTupleOf([1, 2, 3], 2), false)
  })

  it("supports curried usage", () => {
    const isPair = Predicate.isTupleOf(2)

    assert.equal(isPair(["a", "b"]), true)
    assert.equal(isPair(["a"]), false)
  })
})

describe("isTupleOfAtLeast", () => {
  it("checks for minimum length", () => {
    assert.equal(Predicate.isTupleOfAtLeast([1, 2, 3], 3), true)
    assert.equal(Predicate.isTupleOfAtLeast([1, 2, 3], 2), true)
    assert.equal(Predicate.isTupleOfAtLeast([1, 2, 3], 4), false)
  })

  it("supports curried usage", () => {
    const hasAtLeast2 = Predicate.isTupleOfAtLeast(2)

    assert.equal(hasAtLeast2(["a", "b", "c"]), true)
    assert.equal(hasAtLeast2(["a"]), false)
  })
})
