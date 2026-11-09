import { Array, hole, Option, pipe, Predicate, Result } from "effect"
import { describe, expect, it } from "tstyche"

declare const string$string: Result.Result<string, string>
declare const number$string: Result.Result<number, string>
declare const boolean$string: Result.Result<boolean, string>
declare const boolean$Error: Result.Result<boolean, Error>
declare const literal$Error: Result.Result<"a", Error>

describe("Result", () => {
  it("flip", () => {
    expect(Result.flip(number$string)).type.toBe<Result.Result<string, number>>()
    expect(pipe(number$string, Result.flip)).type.toBe<Result.Result<string, number>>()
  })

  it("try", () => {
    expect(Result.try(() => 1)).type.toBe<Result.Result<number, unknown>>()
    expect(Result.try({ try: () => 1, catch: () => new Error() })).type.toBe<Result.Result<number, Error>>()
  })

  describe("all", () => {
    it("tuple", () => {
      expect(Result.all([])).type.toBe<Result.Result<[], never>>()
      expect(Result.all([number$string])).type.toBe<Result.Result<[number], string>>()
      expect(Result.all([number$string, boolean$string])).type.toBe<Result.Result<[number, boolean], string>>()
      expect(Result.all([number$string, boolean$Error])).type.toBe<Result.Result<[number, boolean], string | Error>>()
      expect(pipe([number$string, boolean$string] as const, Result.all)).type.toBe<
        Result.Result<[number, boolean], string>
      >()
      expect(pipe([number$string, boolean$Error] as const, Result.all)).type.toBe<
        Result.Result<[number, boolean], string | Error>
      >()
    })

    it("struct", () => {
      expect(Result.all({})).type.toBe<Result.Result<{}, never>>()
      expect(Result.all({ a: number$string })).type.toBe<Result.Result<{ a: number }, string>>()
      expect(Result.all({ a: number$string, b: boolean$string })).type.toBe<
        Result.Result<{ a: number; b: boolean }, string>
      >()
      expect(Result.all({ a: number$string, b: boolean$Error })).type.toBe<
        Result.Result<{ a: number; b: boolean }, string | Error>
      >()
      expect(pipe({ a: number$string, b: boolean$string }, Result.all)).type.toBe<
        Result.Result<{ a: number; b: boolean }, string>
      >()
      expect(pipe({ a: number$string, b: boolean$Error }, Result.all)).type.toBe<
        Result.Result<{ a: number; b: boolean }, string | Error>
      >()
    })

    it("array", () => {
      const resultArray = hole<Array<Result.Result<number, string>>>()
      expect(Result.all(resultArray)).type.toBe<Result.Result<Array<number>, string>>()
      expect(pipe(resultArray, Result.all)).type.toBe<Result.Result<Array<number>, string>>()
    })

    it("record", () => {
      const resultRecord = hole<Record<string, Result.Result<number, string>>>()
      expect(Result.all(resultRecord)).type.toBe<Result.Result<{ [x: string]: number }, string>>()
      expect(pipe(resultRecord, Result.all)).type.toBe<Result.Result<{ [x: string]: number }, string>>()
    })
  })

  it("andThen", () => {
    expect(Result.andThen(string$string, number$string)).type.toBe<Result.Result<number, string>>()
    expect(string$string.pipe(Result.andThen(number$string))).type.toBe<Result.Result<number, string>>()

    expect(Result.andThen(string$string, () => number$string)).type.toBe<Result.Result<number, string>>()
    expect(string$string.pipe(Result.andThen(() => number$string))).type.toBe<Result.Result<number, string>>()
  })

  it("liftPredicate", () => {
    const primitiveNumber = hole<number>()
    const stringOrNumber = hole<string | number>()
    const predicateNumberOrString = hole<Predicate.Predicate<number | string>>()
    const refinementNumberOrStringToNumber = hole<Predicate.Refinement<number | string, number>>()

    expect(
      Result.liftPredicate(predicateNumberOrString, (sn) => {
        expect(sn).type.toBe<string | number>()
        return "b" as const
      })
    ).type.toBe<(a: string | number) => Result.Result<string | number, "b">>()
    expect(
      Result.liftPredicate(refinementNumberOrStringToNumber, (sn) => {
        expect(sn).type.toBe<string | number>()
        return "b" as const
      })
    ).type.toBe<(a: string | number) => Result.Result<number, "b">>()

    expect(
      Result.liftPredicate(
        stringOrNumber,
        (sn): sn is number => {
          expect(sn).type.toBe<string | number>()
          return typeof sn === "number"
        },
        (sn) => {
          expect(sn).type.toBe<string | number>()
          return "b" as const
        }
      )
    ).type.toBe<Result.Result<number, "b">>()
    expect(
      pipe(
        stringOrNumber,
        Result.liftPredicate(
          (sn): sn is number => {
            expect(sn).type.toBe<string | number>()
            return typeof sn === "number"
          },
          (sn) => {
            expect(sn).type.toBe<string | number>()
            return "b" as const
          }
        )
      )
    ).type.toBe<Result.Result<number, "b">>()

    expect(
      Result.liftPredicate(stringOrNumber, predicateNumberOrString, (sn) => {
        expect(sn).type.toBe<string | number>()
        return "b" as const
      })
    ).type.toBe<Result.Result<string | number, "b">>()
    expect(
      pipe(
        stringOrNumber,
        Result.liftPredicate(predicateNumberOrString, (sn) => {
          expect(sn).type.toBe<string | number>()
          return "b" as const
        })
      )
    ).type.toBe<Result.Result<string | number, "b">>()

    expect(
      Result.liftPredicate(primitiveNumber, predicateNumberOrString, (sn) => {
        expect(sn).type.toBe<string | number>()
        return "b" as const
      })
    ).type.toBe<Result.Result<number, "b">>()
    expect(
      pipe(
        primitiveNumber,
        Result.liftPredicate(predicateNumberOrString, (sn) => {
          expect(sn).type.toBe<string | number>()
          return "b" as const
        })
      )
    ).type.toBe<Result.Result<number, "b">>()
  })

  it("fromNullishOr", () => {
    const nullableString = hole<string | null>()
    const nullableObject = hole<{ a: string } | undefined>()

    expect(
      Result.fromNullishOr(
        nullableString,
        () => new Error()
      )
    ).type.toBe<Result.Result<string, Error>>()

    expect(
      pipe(
        nullableString,
        Result.fromNullishOr(() => new Error())
      )
    ).type.toBe<Result.Result<string, Error>>()

    expect(
      Result.fromNullishOr(nullableObject, () => new Error())
    ).type.toBe<Result.Result<{ a: string }, Error>>()

    expect(
      pipe(
        nullableObject,
        Result.fromNullishOr(() => new Error())
      )
    ).type.toBe<
      Result.Result<{ a: string }, Error>
    >()
  })

  it("filterOrFail", () => {
    const predicateUnknown = hole<Predicate.Predicate<unknown>>()

    const arrayOfStrings$Error = hole<Result.Result<Array<string>, Error>>()
    expect(
      Result.filterOrFail(arrayOfStrings$Error, Array.isArrayNonEmpty, (ss) => {
        expect(ss).type.toBe<Array<string>>()
        return "b" as const
      })
    ).type.toBe<Result.Result<[string, ...Array<string>], "b" | Error>>()
    expect(
      pipe(
        arrayOfStrings$Error,
        Result.filterOrFail(Array.isArrayNonEmpty, (ss) => {
          expect(ss).type.toBe<Array<string>>()
          return "b" as const
        })
      )
    ).type.toBe<Result.Result<[string, ...Array<string>], "b" | Error>>()

    const readonlyArrayOfStrings$Error = hole<Result.Result<ReadonlyArray<string>, Error>>()
    expect(
      Result.filterOrFail(readonlyArrayOfStrings$Error, Array.isReadonlyArrayNonEmpty, (ss) => {
        expect(ss).type.toBe<ReadonlyArray<string>>()
        return "b" as const
      })
    ).type.toBe<Result.Result<readonly [string, ...Array<string>], "b" | Error>>()
    expect(
      pipe(
        readonlyArrayOfStrings$Error,
        Result.filterOrFail(Array.isReadonlyArrayNonEmpty, (ss) => {
          expect(ss).type.toBe<ReadonlyArray<string>>()
          return "b" as const
        })
      )
    ).type.toBe<Result.Result<readonly [string, ...Array<string>], "b" | Error>>()

    // @tstyche fixme -- This doesn't work but it should
    expect(
      Result.filterOrFail(literal$Error, Predicate.isString, (a) => {
        // @tstyche fixme -- This doesn't work but it should
        expect(a).type.toBe<"a">()
        return "b" as const
      })
    ).type.toBe<Result.Result<"a", "b" | Error>>()
    expect(
      pipe(
        literal$Error,
        Result.filterOrFail(Predicate.isString, (a) => {
          expect(a).type.toBe<"a">()
          return "b" as const
        })
      )
    ).type.toBe<Result.Result<"a", "b" | Error>>()

    // @tstyche fixme -- This doesn't work but it should
    expect(
      Result.filterOrFail(literal$Error, Predicate.isString, (_s: string) => "b" as const)
    ).type.toBe<Result.Result<"a", "b" | Error>>()
    expect(
      pipe(
        literal$Error,
        Result.filterOrFail(Predicate.isString, (_s: string) => "b" as const)
      )
    ).type.toBe<Result.Result<"a", "b" | Error>>()

    expect(
      Result.filterOrFail(literal$Error, predicateUnknown, (a) => {
        expect(a).type.toBe<"a">()
        return "b" as const
      })
    ).type.toBe<Result.Result<"a", "b" | Error>>()
    expect(
      pipe(
        literal$Error,
        Result.filterOrFail(predicateUnknown, (a) => {
          expect(a).type.toBe<"a">()
          return "b" as const
        })
      )
    ).type.toBe<Result.Result<"a", "b" | Error>>()

    expect(
      Result.filterOrFail(literal$Error, predicateUnknown, (_s: string) => "b" as const)
    ).type.toBe<Result.Result<"a", "b" | Error>>()
    expect(
      pipe(
        literal$Error,
        Result.filterOrFail(predicateUnknown, (_s: string) => "b" as const)
      )
    ).type.toBe<Result.Result<"a", "b" | Error>>()
  })

  it("type level helpers", () => {
    type S = Result.Result.Success<typeof number$string>
    type F = Result.Result.Failure<typeof number$string>
    expect<S>().type.toBe<number>()
    expect<F>().type.toBe<string>()
  })

  it("do notation", () => {
    expect(
      pipe(
        Result.Do,
        Result.bind("a", (scope) => {
          expect(scope).type.toBe<{}>()
          return Result.succeed(1)
        }),
        Result.bind("b", (scope) => {
          expect(scope).type.toBe<{ a: number }>()
          return Result.succeed("b")
        }),
        Result.let("c", (scope) => {
          expect(scope).type.toBe<{ a: number; b: string }>()
          return true
        })
      )
    ).type.toBe<Result.Result<{ a: number; b: string; c: boolean }, never>>()

    expect(
      pipe(
        Result.succeed(1),
        Result.bindTo("a"),
        Result.bind("b", (scope) => {
          expect(scope).type.toBe<{ a: number }>()
          return Result.succeed("b")
        }),
        Result.let("c", (scope) => {
          expect(scope).type.toBe<{ a: number; b: string }>()
          return true
        })
      )
    ).type.toBe<Result.Result<{ a: number; b: string; c: boolean }, never>>()
  })
})

it("transposeMapOption", () => {
  expect(Result.transposeMapOption(Option.none(), (value) => {
    expect(value).type.toBe<never>()
    return string$string
  })).type.toBe<
    Result.Result<Option.Option<string>, string>
  >()
  expect(pipe(
    Option.none(),
    Result.transposeMapOption((value) => {
      expect(value).type.toBe<never>()
      return string$string
    })
  )).type.toBe<
    Result.Result<Option.Option<string>, string>
  >()
  expect(Result.transposeMapOption(Option.some(42), (value) => {
    expect(value).type.toBe<number>()
    return string$string
  })).type.toBe<
    Result.Result<Option.Option<string>, string>
  >()
  expect(pipe(
    Option.some(42),
    Result.transposeMapOption((value) => {
      expect(value).type.toBe<number>()
      return string$string
    })
  )).type.toBe<
    Result.Result<Option.Option<string>, string>
  >()
})
