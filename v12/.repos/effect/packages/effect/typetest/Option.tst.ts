import { Option, pipe, Result } from "effect"
import type { Predicate } from "effect"
import { describe, expect, it } from "tstyche"

declare const number: Option.Option<number>
declare const numberOrString: Option.Option<string | number>

declare const predicateNumberOrString: Predicate.Predicate<number | string>
declare const refinementNumberOrString: Predicate.Refinement<number | string, number>

declare const nullish: number | null | undefined
declare const nullOr: number | null
declare const undefinedOr: number | undefined

describe("Option", () => {
  it("data-last product operations", () => {
    expect(Option.product(Option.some("a"))(number)).type.toBe<Option.Option<[number, string]>>()
    expect(Option.productMany([Option.some(1), Option.some(2)])(number)).type.toBe<
      Option.Option<[number, ...Array<number>]>
    >()
  })

  it("filter", () => {
    expect(Option.filter(number, predicateNumberOrString)).type.toBe<Option.Option<number>>()
    expect(pipe(number, Option.filter(predicateNumberOrString))).type.toBe<Option.Option<number>>()

    expect(pipe(numberOrString, Option.filter(refinementNumberOrString))).type.toBe<Option.Option<number>>()
    expect(Option.filter(numberOrString, refinementNumberOrString)).type.toBe<Option.Option<number>>()

    expect(
      Option.filter(number, (value) => {
        expect(value).type.toBe<number>()
        return true
      })
    ).type.toBe<Option.Option<number>>()
    expect(
      pipe(
        number,
        Option.filter((value) => {
          expect(value).type.toBe<number>()
          return true
        })
      )
    ).type.toBe<Option.Option<number>>()
  })

  it("filterMap", () => {
    expect(Option.filterMap(number, (value) => {
      expect(value).type.toBe<number>()
      return Result.succeed(value + 1)
    })).type.toBe<Option.Option<number>>()

    expect(pipe(
      number,
      Option.filterMap((value) => {
        expect(value).type.toBe<number>()
        return Result.fail("skip")
      })
    )).type.toBe<Option.Option<never>>()
  })

  it("fromNullishOr", () => {
    expect(Option.fromNullishOr(nullish)).type.toBe<Option.Option<number>>()
    expect(Option.fromNullishOr(nullOr)).type.toBe<Option.Option<number>>()
    expect(Option.fromNullishOr(undefinedOr)).type.toBe<Option.Option<number>>()
  })

  it("fromUndefinedOr", () => {
    expect(Option.fromUndefinedOr(nullish)).type.toBe<Option.Option<number | null>>()
    expect(Option.fromUndefinedOr(nullOr)).type.toBe<Option.Option<number | null>>()
    expect(Option.fromUndefinedOr(undefinedOr)).type.toBe<Option.Option<number>>()
  })

  it("fromNullOr", () => {
    expect(Option.fromNullOr(nullish)).type.toBe<Option.Option<number | undefined>>()
    expect(Option.fromNullOr(nullOr)).type.toBe<Option.Option<number>>()
    expect(Option.fromNullOr(undefinedOr)).type.toBe<Option.Option<number | undefined>>()
  })
})
