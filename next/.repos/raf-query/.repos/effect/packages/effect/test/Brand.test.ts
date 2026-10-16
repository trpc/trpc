import { describe, it } from "@effect/vitest"
import {
  assertFailure as vassertFailure,
  assertFalse,
  assertNone,
  assertSome,
  assertSuccess as vassertSuccess,
  assertTrue,
  strictEqual,
  throws
} from "@effect/vitest/utils"
import { Brand, Result, Schema } from "effect"

function assertSuccess<T extends Brand.Brand<any>>(ctor: Brand.Constructor<T>, value: Brand.Brand.Unbranded<T>) {
  vassertSuccess(ctor.result(value), value as T)
}

function assertFailure<T extends Brand.Brand<any>>(
  ctor: Brand.Constructor<T>,
  value: Brand.Brand.Unbranded<T>,
  message: string
) {
  vassertFailure(ctor.result(value).pipe(Result.mapError((e) => e.message)), message)
}

describe("Brand", () => {
  it("formats validation failures as BrandError", () => {
    type Int = number & Brand.Brand<"Int">
    const Int = Brand.check<Int>(Schema.isInt())
    const result = Int.result(1.1)
    assertTrue(Result.isFailure(result))
    strictEqual(String(result.failure), "BrandError(Expected an integer)")
  })

  it("creates nominal brands without runtime validation", () => {
    type MyNumber = number & Brand.Brand<"MyNumber">
    const MyNumber = Brand.nominal<MyNumber>()

    strictEqual(MyNumber(1), 1)
    strictEqual(MyNumber(1.1), 1.1)
    strictEqual(MyNumber(-1), -1)

    assertTrue(MyNumber.is(1))
    assertTrue(MyNumber.is(1.1))
    assertTrue(MyNumber.is(-1))

    assertSome(MyNumber.option(1), 1 as MyNumber)
    assertSome(MyNumber.option(1.1), 1.1 as MyNumber)
    assertSome(MyNumber.option(-1), -1 as MyNumber)

    assertSuccess(MyNumber, 1)
    assertSuccess(MyNumber, 1.1)
    assertSuccess(MyNumber, -1)
  })

  it("validates custom predicates created with make", () => {
    type Int = number & Brand.Brand<"Int">
    const Int = Brand.make<Int>(
      (n) => Number.isInteger(n) || `Expected ${n} to be an integer`
    )

    strictEqual(Int(1), 1)
    throws(() => Int(1.1))
    strictEqual(Int(-1), -1)

    assertTrue(Int.is(1))
    assertFalse(Int.is(1.1))
    assertTrue(Int.is(-1))

    assertSome(Int.option(1), 1 as Int)
    assertNone(Int.option(1.1))
    assertSome(Int.option(-1), -1 as Int)

    assertSuccess(Int, 1)
    assertFailure(Int, 1.1, "Expected 1.1 to be an integer")
    assertSuccess(Int, -1)
  })

  describe("check", () => {
    it("validates a single schema check", () => {
      type Int = number & Brand.Brand<"Int">
      const Int = Brand.check<Int>(Schema.isInt())

      strictEqual(Int(1), 1)
      throws(() => Int(1.1))
      strictEqual(Int(-1), -1)

      assertTrue(Int.is(1))
      assertFalse(Int.is(1.1))
      assertTrue(Int.is(-1))

      assertSome(Int.option(1), 1 as Int)
      assertNone(Int.option(1.1))
      assertSome(Int.option(-1), -1 as Int)

      assertSuccess(Int, 1)
      assertFailure(Int, 1.1, "Expected an integer")
      assertSuccess(Int, -1)
    })

    it("accumulates failures from multiple schema checks", () => {
      type PositiveInt = number & Brand.Brand<"PositiveInt">
      const PositiveInt = Brand.check<PositiveInt>(Schema.isInt(), Schema.isGreaterThan(0))

      assertSuccess(PositiveInt, 1)
      assertFailure(PositiveInt, 1.1, "Expected an integer")
      assertFailure(PositiveInt, -1, "Expected a value greater than 0")
      assertFailure(
        PositiveInt,
        -1.1,
        `Expected an integer
Expected a value greater than 0`
      )
    })

    it("stops after an aborted failed schema check", () => {
      type PositiveInt = number & Brand.Brand<"PositiveInt">
      const PositiveInt = Brand.check<PositiveInt>(
        Schema.isInt().abort(), // abort the first check
        Schema.isGreaterThan(0)
      )

      assertSuccess(PositiveInt, 1)
      assertFailure(PositiveInt, 1.1, "Expected an integer")
      assertFailure(PositiveInt, -1, "Expected a value greater than 0")
      assertFailure(PositiveInt, -1.1, `Expected an integer`)
    })
  })

  it("combines existing brand constructors with all", () => {
    type Int = number & Brand.Brand<"Int">
    const Int = Brand.check<Int>(Schema.isInt())

    type Positive = number & Brand.Brand<"Positive">
    const Positive = Brand.check<Positive>(Schema.isGreaterThan(0))

    const PositiveInt = Brand.all(Int, Positive)

    strictEqual(PositiveInt(1), 1)
    throws(() => PositiveInt(1.1))
    throws(() => PositiveInt(-1))

    assertTrue(PositiveInt.is(1))
    assertFalse(PositiveInt.is(1.1))
    assertFalse(PositiveInt.is(-1))

    assertSome(PositiveInt.option(1), 1 as any)
    assertNone(PositiveInt.option(1.1))
    assertNone(PositiveInt.option(-1))

    assertSuccess(PositiveInt, 1)
    assertFailure(PositiveInt, 1.1, "Expected an integer")
    assertFailure(
      PositiveInt,
      -1.1,
      `Expected an integer
Expected a value greater than 0`
    )
  })
})
