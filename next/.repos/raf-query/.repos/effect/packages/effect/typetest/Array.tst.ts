import { Array, Effect, Option, type Order, Predicate, Result } from "effect"
import { hole, identity, pipe } from "effect/Function"
import { describe, expect, it } from "tstyche"

declare const iterableString: Iterable<string>
declare const unknownValue: unknown
declare const stringOrStringArrayOrNull: string | Array<string> | null

declare const readonlyNumbers: ReadonlyArray<number>
declare const numbers: Array<number>
declare const nonEmptyNumbers: Array.NonEmptyArray<number>

declare const iterNumbers: Iterable<number>
declare const iterStrings: Iterable<string>

declare const readonlyStrings: ReadonlyArray<string>
declare const strings: Array<string>
declare const nonEmptyReadonlyStrings: Array.NonEmptyReadonlyArray<string>
declare const nonEmptyStrings: Array.NonEmptyArray<string>

declare const numbersOrStrings: Array<number | string>

declare const primitiveNumber: number
declare const primitiveNumberOrString: string | number

declare const predicateNumbersOrStrings: Predicate.Predicate<number | string>

const symA = Symbol.for("a")
const symB = Symbol.for("b")
const symC = Symbol.for("c")

interface A {
  readonly a: string
}
interface AB extends A {
  readonly b: number
}
declare const ABs: ReadonlyArray<AB>
declare const nonEmptyABs: Array.NonEmptyReadonlyArray<AB>
declare const orderA: Order.Order<A>

describe("Array", () => {
  it("isArray", () => {
    if (Array.isArray(unknownValue)) {
      expect(unknownValue).type.toBe<Array<unknown>>()
    }
    if (Array.isArray(stringOrStringArrayOrNull)) {
      expect(stringOrStringArrayOrNull).type.toBe<Array<string>>()
    }
  })

  it("isReadonlyArrayEmpty", () => {
    if (Array.isReadonlyArrayEmpty(readonlyNumbers)) {
      expect(readonlyNumbers).type.toBe<readonly []>()
    }
    // should play well with `Option.liftPredicate`
    expect(Option.liftPredicate(Array.isReadonlyArrayEmpty)).type.toBe<
      <A>(a: ReadonlyArray<A>) => Option.Option<readonly []>
    >()
  })

  it("isArrayEmpty", () => {
    if (Array.isArrayEmpty(numbers)) {
      expect(numbers).type.toBe<[]>()
    }
    // should play well with `Option.liftPredicate`
    expect(Option.liftPredicate(Array.isArrayEmpty)).type.toBe<
      <A>(a: Array<A>) => Option.Option<[]>
    >()
  })

  it("isReadonlyArrayNonEmpty", () => {
    if (Array.isReadonlyArrayNonEmpty(readonlyNumbers)) {
      expect(readonlyNumbers).type.toBe<readonly [number, ...Array<number>]>()
    }
    // should play well with `Option.liftPredicate`
    expect(Option.liftPredicate(Array.isReadonlyArrayNonEmpty)).type.toBe<
      <A>(a: ReadonlyArray<A>) => Option.Option<readonly [A, ...Array<A>]>
    >()
  })

  it("isArrayNonEmpty", () => {
    if (Array.isArrayNonEmpty(numbers)) {
      expect(numbers).type.toBe<[number, ...Array<number>]>()
    }
    // should play well with `Option.liftPredicate`
    expect(Option.liftPredicate(Array.isArrayNonEmpty)).type.toBe<
      <A>(a: Array<A>) => Option.Option<[A, ...Array<A>]>
    >()
  })

  it("map", () => {
    expect(Array.map(readonlyStrings, (s, i) => {
      expect(s).type.toBe<string>()
      expect(i).type.toBe<number>()
      return s + "a"
    })).type.toBe<Array<string>>()
    expect(pipe(
      readonlyStrings,
      Array.map((s, i) => {
        expect(s).type.toBe<string>()
        expect(i).type.toBe<number>()
        return s + "a"
      })
    )).type.toBe<Array<string>>()

    expect(Array.map(strings, (s, i) => {
      expect(s).type.toBe<string>()
      expect(i).type.toBe<number>()
      return s + "a"
    })).type.toBe<Array<string>>()
    expect(pipe(
      strings,
      Array.map((s, i) => {
        expect(s).type.toBe<string>()
        expect(i).type.toBe<number>()
        return s + "a"
      })
    )).type.toBe<Array<string>>()

    expect(Array.map(nonEmptyReadonlyStrings, (s, i) => {
      expect(s).type.toBe<string>()
      expect(i).type.toBe<number>()
      return s + "a"
    })).type.toBe<[string, ...Array<string>]>()
    expect(pipe(
      nonEmptyReadonlyStrings,
      Array.map((s, i) => {
        expect(s).type.toBe<string>()
        expect(i).type.toBe<number>()
        return s + "a"
      })
    )).type.toBe<[string, ...Array<string>]>()

    expect(Array.map(nonEmptyStrings, (s, i) => {
      expect(s).type.toBe<string>()
      expect(i).type.toBe<number>()
      return s + "a"
    })).type.toBe<[string, ...Array<string>]>()
    expect(pipe(
      nonEmptyStrings,
      Array.map((s, i) => {
        expect(s).type.toBe<string>()
        expect(i).type.toBe<number>()
        return s + "a"
      })
    )).type.toBe<[string, ...Array<string>]>()
  })

  it("groupBy", () => {
    expect(Array.groupBy([1, 2, 3], (n) => {
      expect(n).type.toBe<number>()
      return String(n)
    })).type.toBe<Record<string, [number, ...Array<number>]>>()
    expect(pipe(
      [1, 2, 3],
      Array.groupBy((n) => {
        expect(n).type.toBe<number>()
        return String(n)
      })
    )).type.toBe<Record<string, [number, ...Array<number>]>>()
    const bySingleKey = Array.groupBy([1, 2, 3], () => "key" as const)
    expect(bySingleKey).type.toBe<Partial<Record<"key", [number, ...Array<number>]>>>()
    expect(bySingleKey.key).type.toBe<[number, ...Array<number>] | undefined>()
    // @ts-expect-error Property 'other' does not exist
    void bySingleKey.other
    const bySign = Array.groupBy(
      [1, 2, 3],
      (n) => n > 0 ? "positive" as const : "negative" as const
    )
    expect(bySign).type.toBe<Partial<Record<"positive" | "negative", [number, ...Array<number>]>>>()
    expect(
      pipe(
        [1, 2, 3],
        Array.groupBy((n) => n > 0 ? "positive" as const : "negative" as const)
      )
    ).type.toBe<Partial<Record<"positive" | "negative", [number, ...Array<number>]>>>()
    expect(Array.groupBy(["a", "b"], Symbol.for)).type.toBe<Record<symbol, [string, ...Array<string>]>>()
    expect(Array.groupBy(["a", "b"], (s) => s === "a" ? symA : s === "b" ? symB : symC)).type.toBe<
      Partial<Record<typeof symA | typeof symB | typeof symC, [string, ...Array<string>]>>
    >()
    expect(Array.groupBy(["a", "b"], (s) => s === "a" ? "a" as const : symA)).type.toBe<
      Partial<Record<"a" | typeof symA, [string, ...Array<string>]>>
    >()
  })

  it("some", () => {
    expect(Array.some(numbersOrStrings, (item, i) => {
      expect(item).type.toBe<string | number>()
      expect(i).type.toBe<number>()
      return true
    })).type.toBe<boolean>()
    expect(pipe(
      numbersOrStrings,
      Array.some((item, i) => {
        expect(item).type.toBe<string | number>()
        expect(i).type.toBe<number>()
        return true
      })
    )).type.toBe<boolean>()
    if (Array.some(numbersOrStrings, Predicate.isString)) {
      expect(numbersOrStrings).type.toBe<
        Array<string | number> & readonly [string | number, ...Array<string | number>]
      >()
    }
  })

  it("every", () => {
    expect(Array.every(numbersOrStrings, (item, i) => {
      expect(item).type.toBe<string | number>()
      expect(i).type.toBe<number>()
      return true
    })).type.toBe<boolean>()
    expect(pipe(
      numbersOrStrings,
      Array.every((item, i) => {
        expect(item).type.toBe<string | number>()
        expect(i).type.toBe<number>()
        return true
      })
    )).type.toBe<boolean>()
    if (Array.every(numbersOrStrings, Predicate.isString)) {
      expect(numbersOrStrings).type.toBe<Array<string | number> & ReadonlyArray<string>>()
    }
    if (Array.every(Predicate.isString)(numbersOrStrings)) {
      expect(numbersOrStrings).type.toBe<Array<string | number> & ReadonlyArray<string>>()
    }
  })

  it("append", () => {
    expect(Array.append(numbersOrStrings, true))
      .type.toBe<[string | number | boolean, ...Array<string | number | boolean>]>()
    expect(pipe(numbersOrStrings, Array.append(true)))
      .type.toBe<[string | number | boolean, ...Array<string | number | boolean>]>()
    expect(Array.append(true)(numbersOrStrings))
      .type.toBe<[string | number | boolean, ...Array<string | number | boolean>]>()
  })

  it("prepend", () => {
    expect(Array.prepend(numbersOrStrings, true))
      .type.toBe<[string | number | boolean, ...Array<string | number | boolean>]>()
    expect(pipe(numbersOrStrings, Array.prepend(true)))
      .type.toBe<[string | number | boolean, ...Array<string | number | boolean>]>()
    expect(Array.prepend(true)(numbersOrStrings))
      .type.toBe<[string | number | boolean, ...Array<string | number | boolean>]>()
  })

  it("sort", () => {
    expect(Array.sort(ABs, orderA)).type.toBe<Array<AB>>()
    expect(pipe(ABs, Array.sort(orderA))).type.toBe<Array<AB>>()
    expect(Array.sort(orderA)(ABs)).type.toBe<Array<AB>>()
    expect(Array.sort(nonEmptyABs, orderA)).type.toBe<[AB, ...Array<AB>]>()
    expect(pipe(nonEmptyABs, Array.sort(orderA))).type.toBe<[AB, ...Array<AB>]>()
    expect(Array.sort(orderA)(nonEmptyABs)).type.toBe<[AB, ...Array<AB>]>()
  })

  it("sortWith", () => {
    expect(pipe(
      ABs,
      Array.sortWith(identity, (a, b) => {
        expect(a).type.toBe<AB>()
        expect(b).type.toBe<AB>()
        return 0
      })
    )).type.toBe<Array<AB>>()
    expect(Array.sortWith(ABs, identity, (a, b) => {
      expect(a).type.toBe<AB>()
      expect(b).type.toBe<AB>()
      return 0
    })).type.toBe<Array<AB>>()
    expect(pipe(
      nonEmptyABs,
      Array.sortWith(identity, (a, b) => {
        expect(a).type.toBe<AB>()
        expect(b).type.toBe<AB>()
        return 0
      })
    )).type.toBe<
      [AB, ...Array<AB>]
    >()
    expect(Array.sortWith(nonEmptyABs, identity, (a, b) => {
      expect(a).type.toBe<AB>()
      expect(b).type.toBe<AB>()
      return 0
    })).type.toBe<
      [AB, ...Array<AB>]
    >()
  })

  it("sortBy", () => {
    // Array
    expect(pipe(
      ABs,
      Array.sortBy((a, b) => {
        expect(a).type.toBe<AB>()
        expect(b).type.toBe<AB>()
        return 0
      })
    )).type.toBe<Array<AB>>()
    expect(
      pipe(
        ABs,
        Array.sortBy((a, b) => {
          expect(a).type.toBe<AB>()
          expect(b).type.toBe<AB>()
          return 0
        })
      )
    ).type.toBe<Array<AB>>()

    // NonEmptyArray
    expect(pipe(
      nonEmptyABs,
      Array.sortBy((a, b) => {
        expect(a).type.toBe<AB>()
        expect(b).type.toBe<AB>()
        return 0
      })
    )).type.toBe<[AB, ...Array<AB>]>()
    expect(
      pipe(
        nonEmptyABs,
        Array.sortBy((a, b) => {
          expect(a).type.toBe<AB>()
          expect(b).type.toBe<AB>()
          return 0
        })
      )
    ).type.toBe<[AB, ...Array<AB>]>()
  })

  it("partition", () => {
    expect(Array.partition(numbersOrStrings, (item, i) => {
      expect(item).type.toBe<string | number>()
      expect(i).type.toBe<number>()
      return typeof item === "number" ? Result.succeed(item + i) : Result.fail(item)
    })).type.toBe<[passes: Array<number>, fails: Array<string>]>()
    expect(pipe(
      numbersOrStrings,
      Array.partition((item, i) => {
        expect(item).type.toBe<string | number>()
        expect(i).type.toBe<number>()
        return typeof item === "number" ? Result.succeed(item + i) : Result.fail(item)
      })
    )).type.toBe<[passes: Array<number>, fails: Array<string>]>()

    expect(Array.partition).type.not.toBeCallableWith(
      numbersOrStrings,
      (_item: string | number) => true
    )
  })

  it("filter", () => {
    expect(Array.filter(numbersOrStrings, (item, i) => {
      expect(item).type.toBe<string | number>()
      expect(i).type.toBe<number>()
      return true
    })).type.toBe<Array<string | number>>()
    expect(pipe(
      numbersOrStrings,
      Array.filter((item, i) => {
        expect(item).type.toBe<string | number>()
        expect(i).type.toBe<number>()
        return true
      })
    )).type.toBe<Array<string | number>>()

    expect(Array.filter).type.not.toBeCallableWith(numbersOrStrings, (_item: string) => true)

    expect(Array.filter(numbers, predicateNumbersOrStrings)).type.toBe<Array<number>>()
    expect(pipe(numbers, Array.filter(predicateNumbersOrStrings))).type.toBe<Array<number>>()

    expect(Array.filter(numbersOrStrings, predicateNumbersOrStrings)).type.toBe<Array<string | number>>()
    expect(pipe(numbersOrStrings, Array.filter(predicateNumbersOrStrings))).type.toBe<Array<string | number>>()

    expect(Array.filter(numbersOrStrings, Predicate.isNumber)).type.toBe<Array<number>>()
    expect(pipe(numbersOrStrings, Array.filter(Predicate.isNumber))).type.toBe<Array<number>>()

    expect(Array.filter).type.not.toBeCallableWith(
      numbersOrStrings,
      (_item: string | number) => Result.succeed(_item)
    )
  })

  it("filterMap", () => {
    expect(Array.filterMap(numbersOrStrings, (item, i) => {
      expect(item).type.toBe<string | number>()
      expect(i).type.toBe<number>()
      return typeof item === "number" ? Result.succeed(item + i) : Result.fail("error")
    })).type.toBe<Array<number>>()
    expect(pipe(
      numbersOrStrings,
      Array.filterMap((item, i) => {
        expect(item).type.toBe<string | number>()
        expect(i).type.toBe<number>()
        return typeof item === "number" ? Result.succeed(item + i) : Result.fail("error")
      })
    )).type.toBe<Array<number>>()
  })

  it("takeWhile", () => {
    expect(Array.takeWhile(numbersOrStrings, (item, i) => {
      expect(item).type.toBe<string | number>()
      expect(i).type.toBe<number>()
      return true
    })).type.toBe<Array<string | number>>()
    expect(pipe(
      numbersOrStrings,
      Array.takeWhile((item, i) => {
        expect(item).type.toBe<string | number>()
        expect(i).type.toBe<number>()
        return true
      })
    )).type.toBe<Array<string | number>>()

    expect(Array.takeWhile(numbers, predicateNumbersOrStrings)).type.toBe<Array<number>>()
    expect(pipe(numbers, Array.takeWhile(predicateNumbersOrStrings))).type.toBe<Array<number>>()

    expect(Array.takeWhile(numbersOrStrings, predicateNumbersOrStrings)).type.toBe<Array<string | number>>()
    expect(pipe(numbersOrStrings, Array.takeWhile(predicateNumbersOrStrings))).type.toBe<Array<string | number>>()

    expect(Array.takeWhile(numbersOrStrings, Predicate.isNumber)).type.toBe<Array<number>>()
    expect(pipe(numbersOrStrings, Array.takeWhile(Predicate.isNumber))).type.toBe<Array<number>>()

    expect(Array.takeWhile).type.not.toBeCallableWith(
      numbersOrStrings,
      (_item: string | number) => Result.succeed(_item)
    )
  })

  it("takeWhileFilter", () => {
    expect(Array.takeWhileFilter(numbersOrStrings, (item, i) => {
      expect(item).type.toBe<string | number>()
      expect(i).type.toBe<number>()
      return typeof item === "number" ? Result.succeed(item + i) : Result.fail("stop")
    })).type.toBe<Array<number>>()
    expect(pipe(
      numbersOrStrings,
      Array.takeWhileFilter((item, i) => {
        expect(item).type.toBe<string | number>()
        expect(i).type.toBe<number>()
        return typeof item === "number" ? Result.succeed(item + i) : Result.fail("stop")
      })
    )).type.toBe<Array<number>>()
  })

  it("findFirst", () => {
    expect(Array.findFirst(numbersOrStrings, (item, i) => {
      expect(item).type.toBe<string | number>()
      expect(i).type.toBe<number>()
      return true
    })).type.toBe<Option.Option<string | number>>()
    expect(pipe(
      numbersOrStrings,
      Array.findFirst((item, i) => {
        expect(item).type.toBe<string | number>()
        expect(i).type.toBe<number>()
        return true
      })
    )).type.toBe<Option.Option<string | number>>()

    expect(Array.findFirst(numbersOrStrings, Predicate.isNumber)).type.toBe<Option.Option<number>>()
    expect(pipe(numbersOrStrings, Array.findFirst(Predicate.isNumber))).type.toBe<Option.Option<number>>()

    expect(Array.findFirst(numbersOrStrings, (item, i) => {
      expect(item).type.toBe<string | number>()
      expect(i).type.toBe<number>()
      return Option.some(true)
    })).type.toBe<Option.Option<boolean>>()
    expect(pipe(
      numbersOrStrings,
      Array.findFirst((item, i) => {
        expect(item).type.toBe<string | number>()
        expect(i).type.toBe<number>()
        return Option.some(true)
      })
    )).type.toBe<Option.Option<boolean>>()

    expect(Array.findFirst(numbersOrStrings, predicateNumbersOrStrings)).type.toBe<Option.Option<string | number>>()
    expect(pipe(numbersOrStrings, Array.findFirst(predicateNumbersOrStrings)))
      .type.toBe<Option.Option<string | number>>()
  })

  it("findLast", () => {
    expect(Array.findLast(numbersOrStrings, (item, i) => {
      expect(item).type.toBe<string | number>()
      expect(i).type.toBe<number>()
      return true
    })).type.toBe<Option.Option<string | number>>()
    expect(pipe(
      numbersOrStrings,
      Array.findLast((item, i) => {
        expect(item).type.toBe<string | number>()
        expect(i).type.toBe<number>()
        return true
      })
    )).type.toBe<Option.Option<string | number>>()

    expect(Array.findLast(numbersOrStrings, Predicate.isNumber)).type.toBe<Option.Option<number>>()
    expect(pipe(numbersOrStrings, Array.findLast(Predicate.isNumber))).type.toBe<Option.Option<number>>()

    expect(Array.findLast(numbersOrStrings, (item, i) => {
      expect(item).type.toBe<string | number>()
      expect(i).type.toBe<number>()
      return Option.some(true)
    })).type.toBe<Option.Option<boolean>>()
    expect(pipe(
      numbersOrStrings,
      Array.findLast((item, i) => {
        expect(item).type.toBe<string | number>()
        expect(i).type.toBe<number>()
        return Option.some(true)
      })
    )).type.toBe<Option.Option<boolean>>()

    expect(Array.findLast(numbersOrStrings, predicateNumbersOrStrings)).type.toBe<Option.Option<string | number>>()
    expect(pipe(numbersOrStrings, Array.findLast(predicateNumbersOrStrings)))
      .type.toBe<Option.Option<string | number>>()
  })

  it("liftPredicate", () => {
    expect(
      pipe(
        primitiveNumber,
        Array.liftPredicate((n) => {
          expect(n).type.toBe<number>()
          return true
        })
      )
    ).type.toBe<Array<number>>()
    expect(pipe(
      primitiveNumberOrString,
      Array.liftPredicate((n): n is number => {
        expect(n).type.toBe<string | number>()
        return typeof n === "number"
      })
    )).type.toBe<Array<number>>()

    expect(pipe(primitiveNumberOrString, Array.liftPredicate(Predicate.isString))).type.toBe<Array<string>>()
    expect(pipe(primitiveNumberOrString, Array.liftPredicate(predicateNumbersOrStrings)))
      .type.toBe<Array<string | number>>()
    expect(pipe(primitiveNumber, Array.liftPredicate(predicateNumbersOrStrings))).type.toBe<Array<number>>()
  })

  it("span", () => {
    Array.span(numbersOrStrings, (item, i) => {
      expect(item).type.toBe<string | number>()
      expect(i).type.toBe<number>()
      return true
    })
    pipe(
      numbersOrStrings,
      Array.span((item, i) => {
        expect(item).type.toBe<string | number>()
        expect(i).type.toBe<number>()
        return true
      })
    )
    expect(Array.span(numbers, predicateNumbersOrStrings)).type.toBe<[init: Array<number>, rest: Array<number>]>()
    expect(pipe(numbers, Array.span(predicateNumbersOrStrings))).type.toBe<[init: Array<number>, rest: Array<number>]>()

    expect(Array.span(numbersOrStrings, predicateNumbersOrStrings))
      .type.toBe<[init: Array<string | number>, rest: Array<string | number>]>()
    expect(pipe(numbersOrStrings, Array.span(predicateNumbersOrStrings)))
      .type.toBe<[init: Array<string | number>, rest: Array<string | number>]>()

    expect(Array.span(numbersOrStrings, Predicate.isNumber)).type.toBe<[init: Array<number>, rest: Array<string>]>()
    expect(pipe(numbersOrStrings, Array.span(Predicate.isNumber)))
      .type.toBe<[init: Array<number>, rest: Array<string>]>()
  })

  it("dropWhile", () => {
    expect(Array.dropWhile(numbersOrStrings, (item, i) => {
      expect(item).type.toBe<string | number>()
      expect(i).type.toBe<number>()
      return true
    })).type.toBe<Array<string | number>>()
    expect(pipe(
      numbersOrStrings,
      Array.dropWhile((item, i) => {
        expect(item).type.toBe<string | number>()
        expect(i).type.toBe<number>()
        return true
      })
    )).type.toBe<Array<string | number>>()

    expect(Array.dropWhile(numbers, predicateNumbersOrStrings)).type.toBe<Array<number>>()
    expect(pipe(numbers, Array.dropWhile(predicateNumbersOrStrings))).type.toBe<Array<number>>()

    expect(Array.dropWhile(numbersOrStrings, predicateNumbersOrStrings)).type.toBe<Array<string | number>>()
    expect(pipe(numbersOrStrings, Array.dropWhile(predicateNumbersOrStrings))).type.toBe<Array<string | number>>()

    expect(Array.dropWhile(numbersOrStrings, Predicate.isNumber)).type.toBe<Array<string | number>>()
    expect(pipe(numbersOrStrings, Array.dropWhile(Predicate.isNumber))).type.toBe<Array<string | number>>()

    expect(Array.dropWhile).type.not.toBeCallableWith(
      numbersOrStrings,
      (_item: string | number) => Result.succeed(_item)
    )
  })

  it("dropWhileFilter", () => {
    expect(Array.dropWhileFilter(numbersOrStrings, (item, i) => {
      expect(item).type.toBe<string | number>()
      expect(i).type.toBe<number>()
      return typeof item === "number" ? Result.succeed(item + i) : Result.fail("stop")
    })).type.toBe<Array<string | number>>()
    expect(pipe(
      numbersOrStrings,
      Array.dropWhileFilter((item, i) => {
        expect(item).type.toBe<string | number>()
        expect(i).type.toBe<number>()
        return typeof item === "number" ? Result.succeed(item + i) : Result.fail("stop")
      })
    )).type.toBe<Array<string | number>>()
  })

  it("flatMap", () => {
    expect(
      Array.flatMap(strings, (item, i) => {
        expect(item).type.toBe<string>()
        expect(i).type.toBe<number>()
        return Array.empty<number>()
      })
    ).type.toBe<Array<number>>()
    expect(
      pipe(
        strings,
        Array.flatMap((item, i) => {
          expect(item).type.toBe<string>()
          expect(i).type.toBe<number>()
          return Array.empty<number>()
        })
      )
    ).type.toBe<Array<number>>()

    expect(
      Array.flatMap(nonEmptyReadonlyStrings, (item, i) => {
        expect(item).type.toBe<string>()
        expect(i).type.toBe<number>()
        return Array.empty<number>()
      })
    ).type.toBe<Array<number>>()
    expect(
      pipe(
        nonEmptyReadonlyStrings,
        Array.flatMap((item, i) => {
          expect(item).type.toBe<string>()
          expect(i).type.toBe<number>()
          return Array.empty<number>()
        })
      )
    ).type.toBe<Array<number>>()

    expect(
      Array.flatMap(nonEmptyReadonlyStrings, (item, i) => {
        expect(item).type.toBe<string>()
        expect(i).type.toBe<number>()
        return Array.of(item.length)
      })
    ).type.toBe<[number, ...Array<number>]>()
    expect(
      pipe(
        nonEmptyReadonlyStrings,
        Array.flatMap((item, i) => {
          expect(item).type.toBe<string>()
          expect(i).type.toBe<number>()
          return Array.of(item.length)
        })
      )
    ).type.toBe<[number, ...Array<number>]>()
  })

  it("prependAll", () => {
    // Array + Array
    expect(Array.prependAll(strings, numbers)).type.toBe<Array<string | number>>()
    expect(pipe(strings, Array.prependAll(numbers))).type.toBe<Array<string | number>>()

    // NonEmptyArray + Array
    expect(Array.prependAll(nonEmptyStrings, numbers)).type.toBe<[string | number, ...Array<string | number>]>()
    expect(pipe(nonEmptyStrings, Array.prependAll(numbers))).type.toBe<[string | number, ...Array<string | number>]>()

    // Array + NonEmptyArray
    expect(Array.prependAll(strings, nonEmptyNumbers)).type.toBe<[string | number, ...Array<string | number>]>()
    expect(pipe(strings, Array.prependAll(nonEmptyNumbers))).type.toBe<[string | number, ...Array<string | number>]>()

    // NonEmptyArray + NonEmptyArray
    expect(Array.prependAll(nonEmptyStrings, nonEmptyNumbers)).type.toBe<[string | number, ...Array<string | number>]>()
    expect(pipe(nonEmptyStrings, Array.prependAll(nonEmptyNumbers))).type.toBe<
      [string | number, ...Array<string | number>]
    >()

    // Iterable + Array
    expect(Array.prependAll(iterStrings, numbers)).type.toBe<Array<string | number>>()
    expect(pipe(iterStrings, Array.prependAll(numbers))).type.toBe<Array<string | number>>()

    // Iterable + NonEmptyArray
    expect(Array.prependAll(iterStrings, nonEmptyNumbers)).type.toBe<[string | number, ...Array<string | number>]>()
    expect(pipe(iterStrings, Array.prependAll(nonEmptyNumbers))).type.toBe<
      [string | number, ...Array<string | number>]
    >()

    // Array + Iterable
    expect(Array.prependAll(numbers, iterStrings)).type.toBe<Array<string | number>>()
    expect(pipe(numbers, Array.prependAll(iterStrings))).type.toBe<Array<string | number>>()

    // NonEmptyArray + Iterable
    expect(Array.prependAll(nonEmptyStrings, iterNumbers)).type.toBe<[string | number, ...Array<string | number>]>()
    expect(pipe(nonEmptyStrings, Array.prependAll(iterNumbers))).type.toBe<
      [string | number, ...Array<string | number>]
    >()
  })

  it("appendAll", () => {
    // Array + Array
    expect(Array.appendAll(strings, numbers)).type.toBe<Array<string | number>>()
    expect(pipe(strings, Array.appendAll(numbers))).type.toBe<Array<string | number>>()

    // NonEmptyArray + Array
    expect(Array.appendAll(nonEmptyStrings, numbers)).type.toBe<[string | number, ...Array<string | number>]>()
    expect(pipe(nonEmptyStrings, Array.appendAll(numbers))).type.toBe<[string | number, ...Array<string | number>]>()

    // Array + NonEmptyArray
    expect(Array.appendAll(strings, nonEmptyNumbers)).type.toBe<[string | number, ...Array<string | number>]>()
    expect(pipe(strings, Array.appendAll(nonEmptyNumbers))).type.toBe<[string | number, ...Array<string | number>]>()

    // NonEmptyArray + NonEmptyArray
    expect(Array.appendAll(nonEmptyStrings, nonEmptyNumbers)).type.toBe<[string | number, ...Array<string | number>]>()
    expect(pipe(nonEmptyStrings, Array.appendAll(nonEmptyNumbers)))
      .type.toBe<[string | number, ...Array<string | number>]>()

    // Iterable + Array
    expect(Array.appendAll(iterStrings, numbers)).type.toBe<Array<string | number>>()
    expect(pipe(iterStrings, Array.appendAll(numbers))).type.toBe<Array<string | number>>()

    // Iterable + NonEmptyArray
    expect(Array.appendAll(iterStrings, nonEmptyNumbers)).type.toBe<[string | number, ...Array<string | number>]>()
    expect(pipe(iterStrings, Array.appendAll(nonEmptyNumbers))).type.toBe<
      [string | number, ...Array<string | number>]
    >()

    // Array + Iterable
    expect(Array.appendAll(numbers, iterStrings)).type.toBe<Array<string | number>>()
    expect(pipe(numbers, Array.appendAll(iterStrings))).type.toBe<Array<string | number>>()

    // NonEmptyArray + Iterable
    expect(Array.appendAll(nonEmptyStrings, iterNumbers)).type.toBe<[string | number, ...Array<string | number>]>()
    expect(pipe(nonEmptyStrings, Array.appendAll(iterNumbers)))
      .type.toBe<[string | number, ...Array<string | number>]>()
  })

  it("zip", () => {
    expect(Array.zip(strings, numbers)).type.toBe<Array<[string, number]>>()
    expect(pipe(strings, Array.zip(numbers))).type.toBe<Array<[string, number]>>()
    expect(Array.zip(numbers)(strings)).type.toBe<Array<[string, number]>>()

    expect(Array.zip(nonEmptyStrings, nonEmptyNumbers)).type.toBe<[[string, number], ...Array<[string, number]>]>()
    expect(pipe(nonEmptyStrings, Array.zip(nonEmptyNumbers)))
      .type.toBe<[[string, number], ...Array<[string, number]>]>()
    expect(Array.zip(nonEmptyNumbers)(nonEmptyStrings)).type.toBe<[[string, number], ...Array<[string, number]>]>()
  })

  it("intersperse", () => {
    expect(Array.intersperse(strings, "a")).type.toBe<Array<string>>()
    expect(pipe(strings, Array.intersperse("a"))).type.toBe<Array<string>>()
    expect(Array.intersperse("a")(strings)).type.toBe<Array<string>>()

    expect(Array.intersperse(strings, 1)).type.toBe<Array<string | number>>()
    expect(pipe(strings, Array.intersperse(1))).type.toBe<Array<string | number>>()
    expect(Array.intersperse(1)(strings)).type.toBe<Array<string | number>>()

    expect(Array.intersperse(nonEmptyStrings, "a")).type.toBe<[string, ...Array<string>]>()
    expect(pipe(nonEmptyStrings, Array.intersperse("a"))).type.toBe<[string, ...Array<string>]>()
    expect(Array.intersperse("a")(nonEmptyStrings)).type.toBe<[string, ...Array<string>]>()

    expect(Array.intersperse(nonEmptyStrings, 1)).type.toBe<[string | number, ...Array<string | number>]>()
    expect(pipe(nonEmptyStrings, Array.intersperse(1))).type.toBe<[string | number, ...Array<string | number>]>()
    expect(Array.intersperse(1)(nonEmptyStrings)).type.toBe<[string | number, ...Array<string | number>]>()
  })

  it("rotate", () => {
    expect(Array.rotate(strings, 10)).type.toBe<Array<string>>()
    expect(pipe(strings, Array.rotate(10))).type.toBe<Array<string>>()
    expect(Array.rotate(10)(strings)).type.toBe<Array<string>>()

    expect(Array.rotate(nonEmptyStrings, 10)).type.toBe<[string, ...Array<string>]>()
    expect(pipe(nonEmptyStrings, Array.rotate(10))).type.toBe<[string, ...Array<string>]>()
    expect(Array.rotate(10)(nonEmptyStrings)).type.toBe<[string, ...Array<string>]>()
  })

  it("union", () => {
    expect(Array.union(strings, numbers)).type.toBe<Array<string | number>>()
    expect(pipe(strings, Array.union(numbers))).type.toBe<Array<string | number>>()
    expect(Array.union(numbers)(strings)).type.toBe<Array<string | number>>()

    expect(Array.union(nonEmptyStrings, numbers)).type.toBe<[string | number, ...Array<string | number>]>()
    expect(pipe(nonEmptyStrings, Array.union(numbers))).type.toBe<[string | number, ...Array<string | number>]>()
    expect(Array.union(numbers)(nonEmptyStrings)).type.toBe<[string | number, ...Array<string | number>]>()

    expect(Array.union(strings, nonEmptyNumbers)).type.toBe<[string | number, ...Array<string | number>]>()
    expect(pipe(strings, Array.union(nonEmptyNumbers))).type.toBe<[string | number, ...Array<string | number>]>()
    expect(Array.union(nonEmptyNumbers)(strings)).type.toBe<[string | number, ...Array<string | number>]>()

    expect(Array.union(nonEmptyStrings, nonEmptyNumbers)).type.toBe<[string | number, ...Array<string | number>]>()
    expect(pipe(nonEmptyStrings, Array.union(nonEmptyNumbers)))
      .type.toBe<[string | number, ...Array<string | number>]>()

    expect(Array.union(nonEmptyNumbers)(nonEmptyStrings)).type.toBe<[string | number, ...Array<string | number>]>()
  })

  it("unionWith", () => {
    // Array + Array
    expect(
      Array.unionWith(strings, numbers, (a, b) => {
        expect(a).type.toBe<string>()
        expect(b).type.toBe<number>()
        return true
      })
    ).type.toBe<Array<string | number>>()
    expect(
      pipe(
        strings,
        Array.unionWith(numbers, (a, b) => {
          expect(a).type.toBe<string>()
          expect(b).type.toBe<number>()
          return true
        })
      )
    ).type.toBe<Array<string | number>>()

    // NonEmptyArray + Array
    expect(
      Array.unionWith(nonEmptyStrings, numbers, (a, b) => {
        expect(a).type.toBe<string>()
        expect(b).type.toBe<number>()
        return true
      })
    ).type.toBe<[string | number, ...Array<string | number>]>()
    expect(
      pipe(
        nonEmptyStrings,
        Array.unionWith(numbers, (a, b) => {
          expect(a).type.toBe<string>()
          expect(b).type.toBe<number>()
          return true
        })
      )
    ).type.toBe<[string | number, ...Array<string | number>]>()

    // Array + NonEmptyArray
    expect(
      Array.unionWith(strings, nonEmptyNumbers, (a, b) => {
        expect(a).type.toBe<string>()
        expect(b).type.toBe<number>()
        return true
      })
    ).type.toBe<[string | number, ...Array<string | number>]>()
    expect(
      pipe(
        strings,
        Array.unionWith(nonEmptyNumbers, (a, b) => {
          expect(a).type.toBe<string>()
          expect(b).type.toBe<number>()
          return true
        })
      )
    ).type.toBe<[string | number, ...Array<string | number>]>()

    // NonEmptyArray + NonEmptyArray
    expect(
      Array.unionWith(nonEmptyStrings, nonEmptyNumbers, (a, b) => {
        expect(a).type.toBe<string>()
        expect(b).type.toBe<number>()
        return true
      })
    ).type.toBe<[string | number, ...Array<string | number>]>()
    expect(
      pipe(
        nonEmptyStrings,
        Array.unionWith(nonEmptyNumbers, (a, b) => {
          expect(a).type.toBe<string>()
          expect(b).type.toBe<number>()
          return true
        })
      )
    ).type.toBe<[string | number, ...Array<string | number>]>()
  })

  it("dedupe", () => {
    // Array
    expect(Array.dedupe(strings)).type.toBe<Array<string>>()
    expect(pipe(strings, Array.dedupe)).type.toBe<Array<string>>()

    // NonEmptyArray
    expect(Array.dedupe(nonEmptyStrings)).type.toBe<[string, ...Array<string>]>()
    expect(pipe(nonEmptyStrings, Array.dedupe)).type.toBe<[string, ...Array<string>]>()
  })

  it("dedupeWith", () => {
    // Array
    expect(
      Array.dedupeWith(strings, (a, b) => {
        expect(a).type.toBe<string>()
        expect(b).type.toBe<string>()
        return true
      })
    ).type.toBe<Array<string>>()
    expect(pipe(
      strings,
      Array.dedupeWith((a, b) => {
        expect(a).type.toBe<string>()
        expect(b).type.toBe<string>()
        return true
      })
    )).type.toBe<Array<string>>()

    // NonEmptyArray
    expect(
      Array.dedupeWith(nonEmptyStrings, (a, b) => {
        expect(a).type.toBe<string>()
        expect(b).type.toBe<string>()
        return true
      })
    ).type.toBe<[string, ...Array<string>]>()
    expect(
      pipe(
        nonEmptyStrings,
        Array.dedupeWith((a, b) => {
          expect(a).type.toBe<string>()
          expect(b).type.toBe<string>()
          return true
        })
      )
    ).type.toBe<[string, ...Array<string>]>()
  })

  it("chop", () => {
    // Array
    expect(
      Array.chop(strings, ([head, ...tail]) => {
        expect(head).type.toBe<string>()
        expect(tail).type.toBe<Array<string>>()
        return [head, tail]
      })
    ).type.toBe<Array<string>>()
    expect(
      pipe(
        strings,
        Array.chop(([head, ...tail]) => {
          expect(head).type.toBe<string>()
          expect(tail).type.toBe<Array<string>>()
          return [head, tail]
        })
      )
    ).type.toBe<Array<string>>()

    // NonEmptyArray
    expect(
      Array.chop(nonEmptyStrings, ([head, ...tail]) => {
        expect(head).type.toBe<string>()
        expect(tail).type.toBe<Array<string>>()
        return [head, tail]
      })
    ).type.toBe<[string, ...Array<string>]>()
    expect(
      pipe(
        nonEmptyStrings,
        Array.chop(([head, ...tail]) => {
          expect(head).type.toBe<string>()
          expect(tail).type.toBe<Array<string>>()
          return [head, tail]
        })
      )
    ).type.toBe<[string, ...Array<string>]>()
  })

  it("chunksOf", () => {
    // Array
    expect(Array.chunksOf(strings, 10)).type.toBe<Array<[string, ...Array<string>]>>()
    expect(pipe(strings, Array.chunksOf(10))).type.toBe<Array<[string, ...Array<string>]>>()
    expect(Array.chunksOf(10)(strings)).type.toBe<Array<[string, ...Array<string>]>>()

    // NonEmptyArray
    expect(Array.chunksOf(nonEmptyStrings, 10))
      .type.toBe<[[string, ...Array<string>], ...Array<[string, ...Array<string>]>]>()
    expect(pipe(nonEmptyStrings, Array.chunksOf(10)))
      .type.toBe<[[string, ...Array<string>], ...Array<[string, ...Array<string>]>]>()
    expect(Array.chunksOf(10)(nonEmptyStrings))
      .type.toBe<[[string, ...Array<string>], ...Array<[string, ...Array<string>]>]>()
  })

  it("reverse", () => {
    // Array
    expect(Array.reverse(strings)).type.toBe<Array<string>>()
    expect(pipe(strings, Array.reverse)).type.toBe<Array<string>>()

    // NonEmptyArray
    expect(Array.reverse(nonEmptyStrings)).type.toBe<[string, ...Array<string>]>()
    expect(pipe(nonEmptyStrings, Array.reverse)).type.toBe<[string, ...Array<string>]>()
  })

  it("unzip", () => {
    // Array
    expect(Array.unzip(hole<Iterable<[string, number]>>())).type.toBe<[Array<string>, Array<number>]>()
    expect(pipe(hole<Iterable<[string, number]>>(), Array.unzip)).type.toBe<[Array<string>, Array<number>]>()

    // NonEmptyArray
    expect(Array.unzip(hole<Array.NonEmptyReadonlyArray<[string, number]>>()))
      .type.toBe<[[string, ...Array<string>], [number, ...Array<number>]]>()
    expect(pipe(hole<Array.NonEmptyReadonlyArray<[string, number]>>(), Array.unzip))
      .type.toBe<[[string, ...Array<string>], [number, ...Array<number>]]>()
  })

  it("zipWith", () => {
    // Array + Array
    expect(
      Array.zipWith(strings, numbers, (a, b) => {
        expect(a).type.toBe<string>()
        expect(b).type.toBe<number>()
        return [a, b] as [string, number]
      })
    ).type.toBe<Array<[string, number]>>()
    expect(
      pipe(
        strings,
        Array.zipWith(numbers, (a, b) => {
          expect(a).type.toBe<string>()
          expect(b).type.toBe<number>()
          return [a, b] as [string, number]
        })
      )
    ).type.toBe<Array<[string, number]>>()

    // NonEmptyArray + NonEmptyArray
    expect(
      Array.zipWith(nonEmptyStrings, nonEmptyNumbers, (a, b) => {
        expect(a).type.toBe<string>()
        expect(b).type.toBe<number>()
        return [a, b] as [string, number]
      })
    ).type.toBe<[[string, number], ...Array<[string, number]>]>()
    expect(
      pipe(
        nonEmptyStrings,
        Array.zipWith(nonEmptyNumbers, (a, b) => {
          expect(a).type.toBe<string>()
          expect(b).type.toBe<number>()
          return [a, b] as [string, number]
        })
      )
    ).type.toBe<[[string, number], ...Array<[string, number]>]>()
  })

  it("separate", () => {
    expect(Array.separate([])).type.toBe<[Array<unknown>, Array<unknown>]>()
    expect(Array.separate([Result.succeed(1)])).type.toBe<[Array<number>, Array<never>]>()
    expect(Array.separate([Result.fail("a")])).type.toBe<[Array<never>, Array<string>]>()
    expect(Array.separate([Result.fail("a"), Result.succeed(1)])).type.toBe<[Array<number>, Array<string>]>()
    expect(Array.separate(hole<Array<Result.Result<number, string>>>())).type.toBe<[Array<number>, Array<string>]>()
    expect(Array.separate(hole<Iterable<Result.Result<number, string>>>())).type.toBe<[Array<number>, Array<string>]>()
    expect(Array.separate(
      hole<Iterable<Result.Result<number, string> | Result.Result<boolean, Date>>>()
    )).type.toBe<[Array<number | boolean>, Array<string | Date>]>()
    expect(Array.separate(
      hole<Iterable<Result.Result<number, string>> | Iterable<Result.Result<boolean, Date>>>()
    )).type.toBe<[Array<number | boolean>, Array<string | Date>]>()
  })

  it("getSuccesses", () => {
    expect(Array.getSuccesses([])).type.toBe<Array<unknown>>()
    expect(Array.getSuccesses([Result.fail("a")])).type.toBe<Array<never>>()
    expect(Array.getSuccesses([Result.succeed(1)])).type.toBe<Array<number>>()
    expect(Array.getSuccesses([Result.fail("a"), Result.succeed(1)])).type.toBe<Array<number>>()
    expect(Array.getSuccesses(hole<Array<Result.Result<number, string>>>())).type.toBe<Array<number>>()
    expect(Array.getSuccesses(hole<Iterable<Result.Result<number, string>>>())).type.toBe<Array<number>>()
    expect(Array.getSuccesses(
      hole<Iterable<Result.Result<number, string> | Result.Result<boolean, Date>>>()
    )).type.toBe<Array<number | boolean>>()
    expect(Array.getSuccesses(
      hole<Iterable<Result.Result<number, string>> | Iterable<Result.Result<boolean, Date>>>()
    )).type.toBe<Array<number | boolean>>()
  })

  it("getFailures", () => {
    expect(Array.getFailures([])).type.toBe<Array<unknown>>()
    expect(Array.getFailures([Result.fail("a")])).type.toBe<Array<string>>()
    expect(Array.getFailures([Result.succeed(1)])).type.toBe<Array<never>>()
    expect(Array.getFailures([Result.fail("a"), Result.succeed(1)])).type.toBe<Array<string>>()
    expect(Array.getFailures(hole<Array<Result.Result<number, string>>>())).type.toBe<Array<string>>()
    expect(Array.getFailures(hole<Iterable<Result.Result<number, string>>>())).type.toBe<Array<string>>()
    expect(Array.getFailures(hole<Iterable<Result.Result<number, string> | Result.Result<boolean, Date>>>()))
      .type.toBe<Array<string | Date>>()
    expect(Array.getFailures(hole<Iterable<Result.Result<number, string>> | Iterable<Result.Result<boolean, Date>>>()))
      .type.toBe<Array<string | Date>>()
  })

  it("getSomes", () => {
    expect(Array.getSomes([])).type.toBe<Array<unknown>>()
    expect(Array.getSomes([Option.none()])).type.toBe<Array<never>>()
    expect(Array.getSomes([Option.some(1)])).type.toBe<Array<number>>()
    expect(Array.getSomes([Option.none(), Option.some(1)])).type.toBe<Array<number>>()
    expect(Array.getSomes(hole<Array<Option.Option<number>>>())).type.toBe<Array<number>>()
    expect(Array.getSomes(hole<Iterable<Option.Option<number>>>())).type.toBe<Array<number>>()
    expect(Array.getSomes(hole<Iterable<Option.Option<number> | Option.Option<string>>>()))
      .type.toBe<Array<string | number>>()
    expect(Array.getSomes(hole<Iterable<Option.Option<number>> | Iterable<Option.Option<string>>>()))
      .type.toBe<Array<string | number>>()
  })

  it("replace", () => {
    expect(Array.replace([], 0, "a")).type.toBe<Option.Option<Array<string>>>()
    expect(Array.replace(numbers, 0, "a")).type.toBe<Option.Option<Array<string | number>>>()
    expect(Array.replace(nonEmptyNumbers, 0, "a" as const)).type.toBe<
      Option.Option<[number | "a", ...Array<number | "a">]>
    >()
    expect(Array.replace(new Set([1, 2] as const), 0, "a" as const)).type.toBe<Option.Option<Array<"a" | 1 | 2>>>()
    expect(pipe([], Array.replace(0, "a"))).type.toBe<Option.Option<Array<string>>>()
    expect(pipe(numbers, Array.replace(0, "a"))).type.toBe<Option.Option<Array<string | number>>>()
    expect(pipe(nonEmptyNumbers, Array.replace(0, "a" as const))).type.toBe<
      Option.Option<[number | "a", ...Array<number | "a">]>
    >()
    expect(pipe(new Set([1, 2] as const), Array.replace(0, "a" as const))).type.toBe<
      Option.Option<Array<"a" | 1 | 2>>
    >()
    expect(pipe(Array.of(1), Array.replace(0, "a" as const))).type.toBe<
      Option.Option<[number | "a", ...Array<number | "a">]>
    >()
  })

  it("modify", () => {
    // Empty Array
    expect(Array.modify([], 0, (n) => {
      expect(n).type.toBe<never>()
      return "a"
    })).type.toBe<Option.Option<Array<string>>>()
    expect(pipe(
      [],
      Array.modify(0, (n) => {
        expect(n).type.toBe<never>()
        return "a"
      })
    )).type.toBe<Option.Option<Array<string>>>()

    // Array
    expect(Array.modify(numbers, 0, (n) => {
      expect(n).type.toBe<number>()
      return "a"
    })).type.toBe<Option.Option<Array<string | number>>>()
    expect(pipe(
      numbers,
      Array.modify(0, (n) => {
        expect(n).type.toBe<number>()
        return "a"
      })
    )).type.toBe<Option.Option<Array<string | number>>>()

    // NonEmptyArray
    expect(Array.modify(nonEmptyNumbers, 0, (n) => {
      expect(n).type.toBe<number>()
      return "a" as const
    })).type.toBe<Option.Option<[number | "a", ...Array<number | "a">]>>()
    expect(pipe(
      nonEmptyNumbers,
      Array.modify(0, (n) => {
        expect(n).type.toBe<number>()
        return "a" as const
      })
    )).type.toBe<Option.Option<[number | "a", ...Array<number | "a">]>>()

    // Iterable
    expect(Array.modify(new Set([1, 2] as const), 0, (n) => {
      expect(n).type.toBe<1 | 2>()
      return "a" as const
    })).type.toBe<Option.Option<Array<"a" | 1 | 2>>>()
    expect(pipe(
      new Set([1, 2] as const),
      Array.modify(0, (n) => {
        expect(n).type.toBe<1 | 2>()
        return "a" as const
      })
    )).type.toBe<Option.Option<Array<"a" | 1 | 2>>>()
  })

  it("mapAccum", () => {
    // Array
    expect(Array.mapAccum(strings, 0, (s, a, i) => {
      expect(s).type.toBe<number>()
      expect(a).type.toBe<string>()
      expect(i).type.toBe<number>()
      return [s + i, a]
    })).type.toBe<[state: number, mappedArray: Array<string>]>()
    expect(pipe(
      strings,
      Array.mapAccum(0, (s, a, i) => {
        expect(s).type.toBe<number>()
        expect(a).type.toBe<string>()
        expect(i).type.toBe<number>()
        return [s + i, a]
      })
    )).type.toBe<[state: number, mappedArray: Array<string>]>()

    // NonEmptyArray
    expect(Array.mapAccum(nonEmptyReadonlyStrings, 0, (s, a, i) => {
      expect(s).type.toBe<number>()
      expect(a).type.toBe<string>()
      expect(i).type.toBe<number>()
      return [s + i, a]
    })).type.toBe<[state: number, mappedArray: [string, ...Array<string>]]>()
    expect(pipe(
      nonEmptyReadonlyStrings,
      Array.mapAccum(0, (s, a, i) => {
        expect(s).type.toBe<number>()
        expect(a).type.toBe<string>()
        expect(i).type.toBe<number>()
        return [s + i, a]
      })
    )).type.toBe<[state: number, mappedArray: [string, ...Array<string>]]>()
  })

  describe("make", () => {
    it("should require at least 1 argument", () => {
      expect(Array.make).type.not.toBeCallableWith()
      expect(Array.make).type.toBeCallableWith(1)
    })

    it("should return a non-empty array", () => {
      expect(Array.make(1, 2, 3)).type.toBe<Array.NonEmptyArray<number>>()
      expect(Array.make("a", 1, "b")).type.toBe<Array.NonEmptyArray<string | number>>()
    })
  })

  describe("window", () => {
    it("should infer a literal for n", () => {
      expect(Array.window(iterableString, 2)).type.toBe<Array<[string, string]>>()
      expect(pipe(iterableString, Array.window(2))).type.toBe<Array<[string, string]>>()
      expect(Array.window(2)(iterableString)).type.toBe<Array<[string, string]>>()
    })

    it("n: forced number", () => {
      const n = hole<number>()
      expect(Array.window(iterableString, n)).type.toBe<Array<Array<string>>>()
      expect(pipe(iterableString, Array.window(n))).type.toBe<Array<Array<string>>>()
      expect(Array.window(n)(iterableString)).type.toBe<Array<Array<string>>>()
    })

    it("n: forced literal", () => {
      const two = hole<2>()
      expect(Array.window(iterableString, two)).type.toBe<Array<[string, string]>>()
      expect(pipe(iterableString, Array.window(two))).type.toBe<Array<[string, string]>>()
      expect(Array.window(two)(iterableString)).type.toBe<Array<[string, string]>>()

      const zero = hole<0>()
      expect(Array.window(iterableString, zero)).type.toBe<Array<[]>>()
      expect(pipe(iterableString, Array.window(zero))).type.toBe<Array<[]>>()
      expect(Array.window(zero)(iterableString)).type.toBe<Array<[]>>()

      const negativeOne = hole<-1>()
      expect(Array.window(iterableString, negativeOne)).type.toBe<Array<never>>()
      expect(pipe(iterableString, Array.window(negativeOne))).type.toBe<Array<never>>()
      expect(Array.window(negativeOne)(iterableString)).type.toBe<Array<never>>()
    })

    it("n: fractional literal", () => {
      expect(Array.window(iterableString, 1.5)).type.toBe<Array<Array<string>>>()
      expect(pipe(iterableString, Array.window(1.5))).type.toBe<Array<Array<string>>>()
      expect(Array.window(1.5)(iterableString)).type.toBe<Array<Array<string>>>()
    })
  })

  it("flatten", () => {
    // Mutable arrays
    expect(Array.flatten(hole<Array<Array<number>>>())).type.toBe<Array<number>>()
    expect(Array.flatten(hole<Array<Array.NonEmptyArray<number>>>())).type.toBe<Array<number>>()
    expect(Array.flatten(hole<Array.NonEmptyArray<Array<number>>>())).type.toBe<Array<number>>()
    expect(Array.flatten(hole<Array.NonEmptyReadonlyArray<Array.NonEmptyReadonlyArray<number>>>()))
      .type.toBe<[number, ...Array<number>]>()

    // Readonly arrays
    expect(
      hole<Effect.Effect<ReadonlyArray<ReadonlyArray<number>>>>().pipe(Effect.map((x) => {
        expect(x).type.toBe<ReadonlyArray<ReadonlyArray<number>>>()
        return Array.flatten(x)
      }))
    ).type.toBe<Effect.Effect<Array<number>, never, never>>()
    expect(
      hole<Effect.Effect<Array.NonEmptyReadonlyArray<Array.NonEmptyReadonlyArray<number>>>>().pipe(Effect.map((x) => {
        expect(x).type.toBe<Array.NonEmptyReadonlyArray<Array.NonEmptyReadonlyArray<number>>>()
        return Array.flatten(x)
      }))
    ).type.toBe<Effect.Effect<[number, ...Array<number>], never, never>>()

    // distributive indexed access
    interface Eff<R> {
      readonly _R: (_: R) => void
    }
    interface R1 {
      readonly _r1: unique symbol
    }
    interface R2 {
      readonly _r2: unique symbol
    }
    interface R3 {
      readonly _r3: unique symbol
    }
    const arg1 = hole<Eff<R1 | R2>>()
    const arg2 = hole<Eff<R1 | R2 | R3>>()

    expect(Array.flatten([[arg1], [arg2]])).type.toBe<Array.NonEmptyArray<Eff<R1 | R2> | Eff<R1 | R2 | R3>>>()
    expect(Array.flatten([[arg2], [arg1]])).type.toBe<Array.NonEmptyArray<Eff<R1 | R2> | Eff<R1 | R2 | R3>>>()
  })
})
