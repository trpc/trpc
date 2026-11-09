import { hole, pipe, Predicate } from "effect"
import { describe, expect, it } from "tstyche"

declare const u: unknown
declare const anys: ReadonlyArray<any>
declare const unknowns: ReadonlyArray<unknown>
declare const numberOrNull: ReadonlyArray<number | null>
declare const numberOrUndefined: ReadonlyArray<number | undefined>
declare const numberOrNullOrUndefined: ReadonlyArray<number | null | undefined>

describe("Predicate", () => {
  it("isString", () => {
    expect(unknowns.filter(Predicate.isString)).type.toBe<Array<string>>()
  })

  it("isNumber", () => {
    expect(unknowns.filter(Predicate.isNumber)).type.toBe<Array<number>>()
  })

  it("isBoolean", () => {
    expect(unknowns.filter(Predicate.isBoolean)).type.toBe<Array<boolean>>()
  })

  it("isBigInt", () => {
    expect(unknowns.filter(Predicate.isBigInt)).type.toBe<Array<bigint>>()
  })

  it("isSymbol", () => {
    expect(unknowns.filter(Predicate.isSymbol)).type.toBe<Array<symbol>>()
  })

  it("isUndefined", () => {
    expect(unknowns.filter(Predicate.isUndefined)).type.toBe<Array<undefined>>()
  })

  it("isNotUndefined", () => {
    expect(numberOrUndefined.filter(Predicate.isNotUndefined)).type.toBe<Array<number>>()
    expect(numberOrNullOrUndefined.filter(Predicate.isNotUndefined)).type.toBe<Array<number | null>>()
  })

  it("isNull", () => {
    expect(unknowns.filter(Predicate.isNull)).type.toBe<Array<null>>()
  })

  it("isNotNull", () => {
    expect(numberOrNull.filter(Predicate.isNotNull)).type.toBe<Array<number>>()
    expect(numberOrNullOrUndefined.filter(Predicate.isNotNull)).type.toBe<Array<number | undefined>>()
  })

  it("isNever", () => {
    expect(unknowns.filter(Predicate.isNever)).type.toBe<Array<never>>()
  })

  it("isUnknown", () => {
    expect(anys.filter(Predicate.isUnknown)).type.toBe<Array<unknown>>()
  })

  it("isTagged", () => {
    expect(anys.filter(Predicate.isTagged("a"))).type.toBe<Array<{ _tag: "a" }>>()
  })

  it("isNullish", () => {
    expect(numberOrNull.filter(Predicate.isNullish)).type.toBe<Array<null>>()
    expect(numberOrUndefined.filter(Predicate.isNullish)).type.toBe<Array<undefined>>()
    expect(numberOrNullOrUndefined.filter(Predicate.isNullish)).type.toBe<Array<null | undefined>>()

    if (Predicate.isNullish(u)) {
      expect(u).type.toBe<null | undefined>()
    }
  })

  it("isNotNullish", () => {
    expect(numberOrNull.filter(Predicate.isNotNullish)).type.toBe<Array<number>>()
    expect(numberOrUndefined.filter(Predicate.isNotNullish)).type.toBe<Array<number>>()
    expect(numberOrNullOrUndefined.filter(Predicate.isNotNullish)).type.toBe<Array<number>>()

    if (Predicate.isNotNullish(u)) {
      expect(u).type.toBe<{}>()
    }
  })

  it("isError", () => {
    expect(unknowns.filter(Predicate.isError)).type.toBe<Array<Error>>()
  })

  it("isDate", () => {
    expect(unknowns.filter(Predicate.isDate)).type.toBe<Array<Date>>()
  })

  it("isObject", () => {
    expect(unknowns.filter(Predicate.isObject)).type.toBe<Array<{ [x: PropertyKey]: unknown }>>()
  })

  it("isReadonlyObject", () => {
    expect(unknowns.filter(Predicate.isReadonlyObject)).type.toBe<Array<{ readonly [x: PropertyKey]: unknown }>>()
  })

  it("isTupleOf", () => {
    if (Predicate.isTupleOf(unknowns, 3)) {
      expect(unknowns).type.toBe<[unknown, unknown, unknown]>()
    }
  })

  it("isTupleOfAtLeast", () => {
    if (Predicate.isTupleOfAtLeast(unknowns, 3)) {
      expect(unknowns).type.toBe<[unknown, unknown, unknown, ...Array<unknown>]>()
    }
  })

  it("isRegExp", () => {
    expect(unknowns.filter(Predicate.isRegExp)).type.toBe<Array<RegExp>>()
  })

  it("compose", () => {
    interface NonEmptyStringBrand {
      readonly NonEmptyString: unique symbol
    }
    type NonEmptyString = string & NonEmptyStringBrand
    const isNonEmptyString = hole<Predicate.Refinement<string, NonEmptyString>>()

    expect(pipe(Predicate.isString, Predicate.compose(isNonEmptyString)))
      .type.toBe<Predicate.Refinement<unknown, NonEmptyString>>()

    expect(Predicate.compose(Predicate.isString, isNonEmptyString))
      .type.toBe<Predicate.Refinement<unknown, NonEmptyString>>()

    expect(
      pipe(
        Predicate.isString,
        Predicate.compose((s): s is NonEmptyString => {
          expect(s).type.toBe<string>()
          return s.length > 0
        })
      )
    ).type.toBe<Predicate.Refinement<unknown, NonEmptyString>>()

    expect(Predicate.compose(Predicate.isString, (s): s is NonEmptyString => {
      expect(s).type.toBe<string>()
      return s.length > 0
    }))
      .type.toBe<Predicate.Refinement<unknown, NonEmptyString>>()

    expect(pipe(Predicate.isString, Predicate.compose((s) => s.startsWith("a"))))
      .type.toBe<Predicate.Refinement<unknown, string>>()
  })

  it("and", () => {
    const isPositive = hole<Predicate.Predicate<number>>()
    const isLessThan2 = hole<Predicate.Predicate<number>>()

    expect(pipe(isPositive, Predicate.and(isLessThan2)))
      .type.toBe<Predicate.Predicate<number>>()

    expect(Predicate.and(isPositive, isLessThan2))
      .type.toBe<Predicate.Predicate<number>>()

    expect(pipe(Predicate.isNumber, Predicate.and(isPositive)))
      .type.toBe<Predicate.Predicate<number>>()

    expect(Predicate.and(Predicate.isNumber, isPositive))
      .type.toBe<Predicate.Predicate<number>>()

    const hasa = hole<Predicate.Refinement<unknown, { a: unknown }>>()
    const hasb = hole<Predicate.Refinement<unknown, { b: unknown }>>()

    expect(pipe(hasa, Predicate.and(hasb)))
      .type.toBe<Predicate.Refinement<unknown, { a: unknown } & { b: unknown }>>()

    expect(Predicate.and(hasa, hasb))
      .type.toBe<Predicate.Refinement<unknown, { a: unknown } & { b: unknown }>>()
  })

  it("or", () => {
    expect(
      pipe(
        hole<Predicate.Predicate<number>>(),
        Predicate.or(hole<Predicate.Predicate<number>>())
      )
    ).type.toBe<Predicate.Predicate<number>>()

    expect(Predicate.or(hole<Predicate.Predicate<number>>(), hole<Predicate.Predicate<number>>()))
      .type.toBe<Predicate.Predicate<number>>()

    expect(pipe(Predicate.isString, Predicate.or(Predicate.isNumber)))
      .type.toBe<Predicate.Refinement<unknown, string | number>>()

    expect(Predicate.or(Predicate.isString, Predicate.isNumber))
      .type.toBe<Predicate.Refinement<unknown, string | number>>()
  })

  it("Tuple", () => {
    const isA = hole<Predicate.Refinement<string, "a">>()
    const isTrue = hole<Predicate.Refinement<boolean, true>>()
    const isOdd = hole<Predicate.Predicate<number>>()

    expect(Predicate.Tuple([isTrue, isA]))
      .type.toBe<Predicate.Refinement<readonly [boolean, string], readonly [true, "a"]>>()

    expect(Predicate.Tuple([isTrue, isOdd]))
      .type.toBe<Predicate.Refinement<readonly [boolean, number], readonly [true, number]>>()

    expect(Predicate.Tuple([isOdd, isOdd]))
      .type.toBe<Predicate.Predicate<readonly [number, number]>>()

    expect(Predicate.Tuple([...hole<Array<Predicate.Predicate<number>>>()]))
      .type.toBe<Predicate.Predicate<ReadonlyArray<number>>>()

    expect(Predicate.Tuple([...hole<Array<Predicate.Predicate<number> | Predicate.Refinement<boolean, true>>>()]))
      .type.toBe<Predicate.Refinement<ReadonlyArray<never>, ReadonlyArray<never>>>()

    expect(Predicate.Tuple([...hole<Array<Predicate.Refinement<boolean, true>>>()]))
      .type.toBe<Predicate.Refinement<ReadonlyArray<boolean>, ReadonlyArray<true>>>()
  })

  it("Struct", () => {
    expect(
      Predicate.Struct({
        a: hole<Predicate.Refinement<string, "a">>(),
        true: hole<Predicate.Refinement<boolean, true>>()
      })
    ).type.toBe<
      Predicate.Refinement<
        { readonly a: string; readonly true: boolean },
        { readonly a: "a"; readonly true: true }
      >
    >()

    expect(
      Predicate.Struct({
        odd: hole<Predicate.Predicate<number>>(),
        true: hole<Predicate.Refinement<boolean, true>>()
      })
    ).type.toBe<
      Predicate.Refinement<
        { readonly odd: number; readonly true: boolean },
        { readonly odd: number; readonly true: true }
      >
    >()

    expect(
      Predicate.Struct({
        odd: hole<Predicate.Predicate<number>>(),
        odd1: hole<Predicate.Predicate<number>>()
      })
    ).type.toBe<Predicate.Predicate<{ readonly odd: number; readonly odd1: number }>>()
  })

  it("isUint8Array", () => {
    expect(unknowns.filter(Predicate.isUint8Array)).type.toBe<Array<Uint8Array>>()
  })
})
