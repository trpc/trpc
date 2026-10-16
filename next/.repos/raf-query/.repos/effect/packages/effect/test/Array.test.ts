import { assert, describe, it } from "@effect/vitest"
import { assertNone, assertSome, deepStrictEqual, strictEqual, throws } from "@effect/vitest/utils"
import {
  Array as Arr,
  Equal,
  Equivalence,
  Hash,
  Number as Num,
  Option,
  Order,
  type Predicate,
  Result,
  String as Str
} from "effect"
import { identity, pipe } from "effect/Function"
import * as fc from "fast-check"

const symA = Symbol.for("a")
const symB = Symbol.for("b")
const symC = Symbol.for("c")

const double = (n: number) => n * 2

class HashCollision implements Equal.Equal {
  constructor(readonly value: number) {}
  [Hash.symbol](): number {
    return 0
  }
  [Equal.symbol](that: Equal.Equal): boolean {
    return that instanceof HashCollision && this.value === that.value
  }
}

describe("Array", () => {
  it("isCanonicalArrayIndex", () => {
    assert.isTrue(Arr.isCanonicalArrayIndex("0"))
    assert.isTrue(Arr.isCanonicalArrayIndex("4294967294"))
    assert.isFalse(Arr.isCanonicalArrayIndex("01"))
    assert.isFalse(Arr.isCanonicalArrayIndex("4294967295"))
  })

  it("of", () => {
    deepStrictEqual(Arr.of(1), [1])
  })

  it("fromIterable/Array should return the same reference if the iterable is an Array", () => {
    const i = [1, 2, 3]
    strictEqual(Arr.fromIterable(i), i)
  })

  it("fromIterable/Iterable", () => {
    deepStrictEqual(Arr.fromIterable(new Set([1, 2, 3])), [1, 2, 3])
  })

  it("ensure", () => {
    deepStrictEqual(Arr.ensure(1), [1])
    deepStrictEqual(Arr.ensure(null), [null])
    deepStrictEqual(Arr.ensure([1]), [1])
    deepStrictEqual(Arr.ensure([1, 2]), [1, 2])
    deepStrictEqual(Arr.ensure(new Set([1, 2])), [new Set([1, 2])])
  })

  describe("iterable inputs", () => {
    it("prepend", () => {
      deepStrictEqual(pipe([1, 2, 3], Arr.prepend(0)), [0, 1, 2, 3])
      deepStrictEqual(pipe([[2]], Arr.prepend([1])), [[1], [2]])

      deepStrictEqual(pipe(new Set([1, 2, 3]), Arr.prepend(0)), [0, 1, 2, 3])
      deepStrictEqual(pipe(new Set([[2]]), Arr.prepend([1])), [[1], [2]])
    })

    it("prependAll", () => {
      deepStrictEqual(pipe([3, 4], Arr.prependAll([1, 2])), [1, 2, 3, 4])

      deepStrictEqual(pipe([3, 4], Arr.prependAll(new Set([1, 2]))), [1, 2, 3, 4])
      deepStrictEqual(pipe(new Set([3, 4]), Arr.prependAll([1, 2])), [1, 2, 3, 4])
    })

    it("append", () => {
      deepStrictEqual(pipe([1, 2, 3], Arr.append(4)), [1, 2, 3, 4])
      deepStrictEqual(pipe([[1]], Arr.append([2])), [[1], [2]])

      deepStrictEqual(pipe(new Set([1, 2, 3]), Arr.append(4)), [1, 2, 3, 4])
      deepStrictEqual(pipe(new Set([[1]]), Arr.append([2])), [[1], [2]])
    })

    it("appendAll", () => {
      deepStrictEqual(pipe([1, 2], Arr.appendAll([3, 4])), [1, 2, 3, 4])

      deepStrictEqual(pipe([1, 2], Arr.appendAll(new Set([3, 4]))), [1, 2, 3, 4])
      deepStrictEqual(pipe(new Set([1, 2]), Arr.appendAll([3, 4])), [1, 2, 3, 4])
    })

    it("scan", () => {
      const f = (b: number, a: number) => b - a
      deepStrictEqual(pipe([1, 2, 3], Arr.scan(10, f)), [10, 9, 7, 4])
      deepStrictEqual(pipe([0], Arr.scan(10, f)), [10, 10])
      deepStrictEqual(pipe([], Arr.scan(10, f)), [10])

      deepStrictEqual(pipe(new Set([1, 2, 3]), Arr.scan(10, f)), [10, 9, 7, 4])
      deepStrictEqual(pipe(new Set([0]), Arr.scan(10, f)), [10, 10])
      deepStrictEqual(pipe(new Set([]), Arr.scan(10, f)), [10])
    })

    it("scanRight", () => {
      const f = (b: number, a: number) => a - b
      deepStrictEqual(pipe([1, 2, 3], Arr.scanRight(10, f)), [-8, 9, -7, 10])
      deepStrictEqual(pipe([0], Arr.scanRight(10, f)), [-10, 10])
      deepStrictEqual(pipe([], Arr.scanRight(10, f)), [10])

      deepStrictEqual(pipe(new Set([1, 2, 3]), Arr.scanRight(10, f)), [-8, 9, -7, 10])
      deepStrictEqual(pipe(new Set([0]), Arr.scanRight(10, f)), [-10, 10])
      deepStrictEqual(pipe(new Set([]), Arr.scanRight(10, f)), [10])
    })

    it("tail", () => {
      assertSome(Arr.tail([1, 2, 3]), [2, 3])
      assertNone(Arr.tail([]))

      assertSome(Arr.tail(new Set([1, 2, 3])), [2, 3])
      assertNone(Arr.tail(new Set([])))
    })

    it("init", () => {
      assertSome(Arr.init([1, 2, 3]), [1, 2])
      assertNone(Arr.init([]))

      assertSome(Arr.init(new Set([1, 2, 3])), [1, 2])
      assertNone(Arr.init(new Set([])))
    })

    it("take", () => {
      deepStrictEqual(pipe([1, 2, 3, 4], Arr.take(2)), [1, 2])
      deepStrictEqual(pipe([1, 2, 3, 4], Arr.take(0)), [])
      deepStrictEqual(pipe([1, 2, 3, 4], Arr.take(Number.NaN)), [])
      // out of bounds
      deepStrictEqual(pipe([1, 2, 3, 4], Arr.take(-10)), [])
      deepStrictEqual(pipe([1, 2, 3, 4], Arr.take(10)), [1, 2, 3, 4])

      deepStrictEqual(pipe(new Set([1, 2, 3, 4]), Arr.take(2)), [1, 2])
      deepStrictEqual(pipe(new Set([1, 2, 3, 4]), Arr.take(0)), [])
      // out of bounds
      deepStrictEqual(pipe(new Set([1, 2, 3, 4]), Arr.take(-10)), [])
      deepStrictEqual(pipe(new Set([1, 2, 3, 4]), Arr.take(10)), [1, 2, 3, 4])
    })

    it("takeRight", () => {
      deepStrictEqual(pipe(Arr.empty(), Arr.takeRight(0)), [])
      deepStrictEqual(pipe([1, 2], Arr.takeRight(0)), [])
      deepStrictEqual(pipe([1, 2], Arr.takeRight(Number.NaN)), [])
      deepStrictEqual(pipe([1, 2], Arr.takeRight(1)), [2])
      deepStrictEqual(pipe([1, 2], Arr.takeRight(2)), [1, 2])
      // out of bound
      deepStrictEqual(pipe(Arr.empty(), Arr.takeRight(1)), [])
      deepStrictEqual(pipe(Arr.empty(), Arr.takeRight(-1)), [])
      deepStrictEqual(pipe([1, 2], Arr.takeRight(3)), [1, 2])
      deepStrictEqual(pipe([1, 2], Arr.takeRight(-1)), [])

      deepStrictEqual(pipe(new Set(), Arr.takeRight(0)), [])
      deepStrictEqual(pipe(new Set([1, 2]), Arr.takeRight(0)), [])
      deepStrictEqual(pipe(new Set([1, 2]), Arr.takeRight(1)), [2])
      deepStrictEqual(pipe(new Set([1, 2]), Arr.takeRight(2)), [1, 2])
      // out of bound
      deepStrictEqual(pipe(new Set(), Arr.takeRight(1)), [])
      deepStrictEqual(pipe(new Set(), Arr.takeRight(-1)), [])
      deepStrictEqual(pipe(new Set([1, 2]), Arr.takeRight(3)), [1, 2])
      deepStrictEqual(pipe(new Set([1, 2]), Arr.takeRight(-1)), [])
    })

    it("takeWhile", () => {
      const f = (n: number) => n % 2 === 0
      deepStrictEqual(pipe([2, 4, 3, 6], Arr.takeWhile(f)), [2, 4])
      deepStrictEqual(pipe(Arr.empty(), Arr.takeWhile(f)), [])
      deepStrictEqual(pipe([1, 2, 4], Arr.takeWhile(f)), [])
      deepStrictEqual(pipe([2, 4], Arr.takeWhile(f)), [2, 4])

      deepStrictEqual(pipe(new Set([2, 4, 3, 6]), Arr.takeWhile(f)), [2, 4])
      deepStrictEqual(pipe(new Set<number>(), Arr.takeWhile(f)), [])
      deepStrictEqual(pipe(new Set([1, 2, 4]), Arr.takeWhile(f)), [])
      deepStrictEqual(pipe(new Set([2, 4]), Arr.takeWhile(f)), [2, 4])
    })

    it("takeWhileFilter", () => {
      const f: (n: number, i: number) => Result.Result<number, string> = (n, i) =>
        n + i < 5 ? Result.succeed(n * 10) : Result.fail(`stop: ${n}`)

      deepStrictEqual(Arr.takeWhileFilter([], f), [])
      deepStrictEqual(Arr.takeWhileFilter([1, 2, 3], f), [10, 20])
      deepStrictEqual(pipe([1, 2, 3], Arr.takeWhileFilter(f)), [10, 20])

      deepStrictEqual(pipe(new Set([1, 2, 3]), Arr.takeWhileFilter(f)), [10, 20])
      deepStrictEqual(pipe([][Symbol.iterator](), Arr.takeWhileFilter(f)), [])
    })

    it("span", () => {
      const f = Arr.span<number>((n) => n % 2 === 1)
      const assertSpan = (
        input: Iterable<number>,
        expectedInit: ReadonlyArray<number>,
        expectedRest: ReadonlyArray<number>
      ) => {
        const [init, rest] = f(input)
        deepStrictEqual(init, expectedInit)
        deepStrictEqual(rest, expectedRest)
      }
      assertSpan([1, 3, 2, 4, 5], [1, 3], [2, 4, 5])
      assertSpan(Arr.empty(), Arr.empty(), Arr.empty())
      assertSpan([1, 3], [1, 3], Arr.empty())
      assertSpan([2, 4], Arr.empty(), [2, 4])

      assertSpan(new Set([1, 3, 2, 4, 5]), [1, 3], [2, 4, 5])
      assertSpan(new Set(), Arr.empty(), Arr.empty())
      assertSpan(new Set([1, 3]), [1, 3], Arr.empty())
      assertSpan(new Set([2, 4]), Arr.empty(), [2, 4])

      // iterator input
      assertSpan([1, 3, 2, 4, 5][Symbol.iterator](), [1, 3], [2, 4, 5])
      assertSpan([][Symbol.iterator](), Arr.empty(), Arr.empty())
    })

    it("splitWhere", () => {
      const f = Arr.splitWhere<number>((n) => n % 2 !== 1)
      const assertSplitWhere = (
        input: Iterable<number>,
        expectedInit: ReadonlyArray<number>,
        expectedRest: ReadonlyArray<number>
      ) => {
        const [init, rest] = f(input)
        deepStrictEqual(init, expectedInit)
        deepStrictEqual(rest, expectedRest)
      }
      assertSplitWhere([1, 3, 2, 4, 5], [1, 3], [2, 4, 5])
      assertSplitWhere(Arr.empty(), Arr.empty(), Arr.empty())
      assertSplitWhere([1, 3], [1, 3], Arr.empty())
      assertSplitWhere([2, 4], Arr.empty(), [2, 4])

      assertSplitWhere(new Set([1, 3, 2, 4, 5]), [1, 3], [2, 4, 5])
      assertSplitWhere(new Set(), Arr.empty(), Arr.empty())
      assertSplitWhere(new Set([1, 3]), [1, 3], Arr.empty())
      assertSplitWhere(new Set([2, 4]), Arr.empty(), [2, 4])
    })

    it("split", () => {
      deepStrictEqual(pipe(Arr.empty(), Arr.split(2)), Arr.empty())
      deepStrictEqual(pipe(Arr.make(1), Arr.split(2)), Arr.make(Arr.make(1)))
      deepStrictEqual(pipe(Arr.make(1, 2, 3), Arr.split(Number.NaN)), Arr.make(Arr.make(1, 2, 3)))
      deepStrictEqual(pipe(Arr.make(1, 2), Arr.split(2)), Arr.make(Arr.make(1), Arr.make(2)))
      deepStrictEqual(pipe(Arr.make(1, 2, 3, 4, 5), Arr.split(2)), Arr.make(Arr.make(1, 2, 3), Arr.make(4, 5)))
      deepStrictEqual(
        pipe(Arr.make(1, 2, 3, 4, 5), Arr.split(3)),
        Arr.make(Arr.make(1, 2), Arr.make(3, 4), Arr.make(5))
      )
    })

    it("drop", () => {
      deepStrictEqual(pipe(Arr.empty(), Arr.drop(0)), [])
      deepStrictEqual(pipe([1, 2], Arr.drop(0)), [1, 2])
      deepStrictEqual(pipe([1, 2], Arr.drop(Number.NaN)), [1, 2])
      deepStrictEqual(pipe([1, 2], Arr.drop(1)), [2])
      deepStrictEqual(pipe([1, 2], Arr.drop(2)), [])
      // out of bound
      deepStrictEqual(pipe(Arr.empty(), Arr.drop(1)), [])
      deepStrictEqual(pipe(Arr.empty(), Arr.drop(-1)), [])
      deepStrictEqual(pipe([1, 2], Arr.drop(3)), [])
      deepStrictEqual(pipe([1, 2], Arr.drop(-1)), [1, 2])

      deepStrictEqual(pipe(new Set(), Arr.drop(0)), [])
      deepStrictEqual(pipe(new Set([1, 2]), Arr.drop(0)), [1, 2])
      deepStrictEqual(pipe(new Set([1, 2]), Arr.drop(1)), [2])
      deepStrictEqual(pipe(new Set([1, 2]), Arr.drop(2)), [])
      // out of bound
      deepStrictEqual(pipe(new Set(), Arr.drop(1)), [])
      deepStrictEqual(pipe(new Set(), Arr.drop(-1)), [])
      deepStrictEqual(pipe(new Set([1, 2]), Arr.drop(3)), [])
      deepStrictEqual(pipe(new Set([1, 2]), Arr.drop(-1)), [1, 2])
    })

    it("dropRight", () => {
      deepStrictEqual(pipe([], Arr.dropRight(0)), [])
      deepStrictEqual(pipe([1, 2], Arr.dropRight(0)), [1, 2])
      deepStrictEqual(pipe([1, 2], Arr.dropRight(Number.NaN)), [1, 2])
      deepStrictEqual(pipe([1, 2], Arr.dropRight(1)), [1])
      deepStrictEqual(pipe([1, 2], Arr.dropRight(2)), [])
      // out of bound
      deepStrictEqual(pipe([], Arr.dropRight(1)), [])
      deepStrictEqual(pipe([1, 2], Arr.dropRight(3)), [])
      deepStrictEqual(pipe([], Arr.dropRight(-1)), [])
      deepStrictEqual(pipe([1, 2], Arr.dropRight(-1)), [1, 2])

      deepStrictEqual(pipe(new Set(), Arr.dropRight(0)), [])
      deepStrictEqual(pipe(new Set([1, 2]), Arr.dropRight(0)), [1, 2])
      deepStrictEqual(pipe(new Set([1, 2]), Arr.dropRight(1)), [1])
      deepStrictEqual(pipe(new Set([1, 2]), Arr.dropRight(2)), [])
      // out of bound
      deepStrictEqual(pipe(new Set(), Arr.dropRight(1)), [])
      deepStrictEqual(pipe(new Set([1, 2]), Arr.dropRight(3)), [])
      deepStrictEqual(pipe(new Set(), Arr.dropRight(-1)), [])
      deepStrictEqual(pipe(new Set([1, 2]), Arr.dropRight(-1)), [1, 2])
    })

    it("dropWhile", () => {
      const f = Arr.dropWhile<number>((n) => n > 0)

      deepStrictEqual(f([]), [])
      deepStrictEqual(f([1, 2]), Arr.empty())
      deepStrictEqual(f([-1, -2]), [-1, -2])
      deepStrictEqual(f([-1, 2]), [-1, 2])
      deepStrictEqual(f([1, -2, 3]), [-2, 3])

      deepStrictEqual(f(new Set<number>()), [])
      deepStrictEqual(f(new Set([1, 2])), Arr.empty())
      deepStrictEqual(f(new Set([-1, -2])), [-1, -2])
      deepStrictEqual(f(new Set([-1, 2])), [-1, 2])
      deepStrictEqual(f(new Set([1, -2, 3])), [-2, 3])

      // iterator input
      deepStrictEqual(f([1, -2, 3][Symbol.iterator]()), [-2, 3])
      deepStrictEqual(f([][Symbol.iterator]()), [])
    })

    it("dropWhileFilter", () => {
      const f: (n: number, i: number) => Result.Result<number, string> = (n, i) =>
        n + i < 5 ? Result.succeed(n * 10) : Result.fail(`stop: ${n}`)

      deepStrictEqual(Arr.dropWhileFilter([], f), [])
      deepStrictEqual(Arr.dropWhileFilter([1, 2, 3], f), [3])
      deepStrictEqual(pipe([1, 2, 3], Arr.dropWhileFilter(f)), [3])

      deepStrictEqual(pipe(new Set([1, 2, 3]), Arr.dropWhileFilter(f)), [3])
      deepStrictEqual(pipe([][Symbol.iterator](), Arr.dropWhileFilter(f)), [])
    })

    it("findFirstIndex", () => {
      assertNone(pipe([], Arr.findFirstIndex((n) => n % 2 === 0)))
      assertSome(pipe([1, 2, 3], Arr.findFirstIndex((n) => n % 2 === 0)), 1)
      assertSome(pipe([1, 2, 3, 1], Arr.findFirstIndex((n) => n % 2 === 0)), 1)

      assertNone(pipe(new Set<number>(), Arr.findFirstIndex((n) => n % 2 === 0)))
      assertSome(pipe(new Set([1, 2, 3]), Arr.findFirstIndex((n) => n % 2 === 0)), 1)
      assertSome(pipe(new Set([1, 2, 3, 4]), Arr.findFirstIndex((n) => n % 2 === 0)), 1)
    })

    it("findLastIndex", () => {
      assertNone(pipe([], Arr.findLastIndex((n) => n % 2 === 0)))
      assertSome(pipe([1, 2, 3], Arr.findLastIndex((n) => n % 2 === 0)), 1)
      assertSome(pipe([1, 2, 3, 4], Arr.findLastIndex((n) => n % 2 === 0)), 3)

      assertNone(pipe(new Set<number>(), Arr.findLastIndex((n) => n % 2 === 0)))
      assertSome(pipe(new Set([1, 2, 3]), Arr.findLastIndex((n) => n % 2 === 0)), 1)
      assertSome(pipe(new Set([1, 2, 3, 4]), Arr.findLastIndex((n) => n % 2 === 0)), 3)
    })

    describe("findFirst", () => {
      it("boolean-returning overloads", () => {
        assertNone(pipe([], Arr.findFirst((n) => n % 2 === 0)))
        assertSome(pipe([1, 2, 3], Arr.findFirst((n) => n % 2 === 0)), 2)
        assertSome(pipe([1, 2, 3, 4], Arr.findFirst((n) => n % 2 === 0)), 2)

        assertNone(pipe(new Set<number>(), Arr.findFirst((n) => n % 2 === 0)))
        assertSome(pipe(new Set([1, 2, 3]), Arr.findFirst((n) => n % 2 === 0)), 2)
        assertSome(pipe(new Set([1, 2, 3, 4]), Arr.findFirst((n) => n % 2 === 0)), 2)
      })

      it("Option-returning overloads", () => {
        assertNone(
          pipe([], Arr.findFirst((n, i) => n % 2 === 0 ? Option.some([n, i]) : Option.none()))
        )
        assertSome(
          pipe([1, 2, 3], Arr.findFirst((n, i) => n % 2 === 0 ? Option.some([n, i]) : Option.none())),
          [2, 1]
        )
        assertSome(
          pipe([1, 2, 3, 4], Arr.findFirst((n, i) => n % 2 === 0 ? Option.some([n, i]) : Option.none())),
          [2, 1]
        )

        assertNone(
          pipe(new Set<number>(), Arr.findFirst((n, i) => n % 2 === 0 ? Option.some([n, i]) : Option.none()))
        )
        assertSome(
          pipe(new Set([1, 2, 3]), Arr.findFirst((n, i) => n % 2 === 0 ? Option.some([n, i]) : Option.none())),
          [2, 1]
        )
        assertSome(
          pipe(new Set([1, 2, 3, 4]), Arr.findFirst((n, i) => n % 2 === 0 ? Option.some([n, i]) : Option.none())),
          [2, 1]
        )
      })
    })

    describe("findFirstWithIndex", () => {
      it("boolean-returning overloads", () => {
        assertNone(pipe([], Arr.findFirstWithIndex((n) => n % 2 === 0)))
        assertSome(pipe([1, 2, 3], Arr.findFirstWithIndex((n) => n % 2 === 0)), [2, 1])
        assertSome(pipe([1, 2, 3, 4], Arr.findFirstWithIndex((n) => n % 2 === 0)), [2, 1])

        assertNone(pipe(new Set<number>(), Arr.findFirstWithIndex((n) => n % 2 === 0)))
        assertSome(pipe(new Set([1, 2, 3]), Arr.findFirstWithIndex((n) => n % 2 === 0)), [2, 1])
        assertSome(pipe(new Set([1, 2, 3, 4]), Arr.findFirstWithIndex((n) => n % 2 === 0)), [2, 1])
      })

      it("Option-returning overloads", () => {
        assertNone(
          pipe([], Arr.findFirstWithIndex((n) => n % 2 === 0 ? Option.some(n + 1) : Option.none()))
        )
        assertSome(
          pipe([1, 2, 3], Arr.findFirstWithIndex((n) => n % 2 === 0 ? Option.some(n + 1) : Option.none())),
          [3, 1]
        )
        assertSome(
          pipe([1, 2, 3, 4], Arr.findFirstWithIndex((n) => n % 2 === 0 ? Option.some(n + 1) : Option.none())),
          [3, 1]
        )

        assertNone(
          pipe(new Set<number>(), Arr.findFirstWithIndex((n) => n % 2 === 0 ? Option.some(n + 1) : Option.none()))
        )
        assertSome(
          pipe(new Set([1, 2, 3]), Arr.findFirstWithIndex((n) => n % 2 === 0 ? Option.some(n + 1) : Option.none())),
          [3, 1]
        )
        assertSome(
          pipe(new Set([1, 2, 3, 4]), Arr.findFirstWithIndex((n) => n % 2 === 0 ? Option.some(n + 1) : Option.none())),
          [3, 1]
        )
      })
    })

    describe("findLast", () => {
      it("boolean-returning overloads", () => {
        assertNone(pipe([], Arr.findLast((n) => n % 2 === 0)))
        assertSome(pipe([1, 2, 3], Arr.findLast((n) => n % 2 === 0)), 2)
        assertSome(pipe([1, 2, 3, 4], Arr.findLast((n) => n % 2 === 0)), 4)

        assertNone(pipe(new Set<number>(), Arr.findLast((n) => n % 2 === 0)))
        assertSome(pipe(new Set([1, 2, 3]), Arr.findLast((n) => n % 2 === 0)), 2)
        assertSome(pipe(new Set([1, 2, 3, 4]), Arr.findLast((n) => n % 2 === 0)), 4)
      })

      it("Option-returning overloads", () => {
        assertNone(
          pipe([], Arr.findLast((n, i) => n % 2 === 0 ? Option.some([n, i]) : Option.none()))
        )
        assertSome(
          pipe([1, 2, 3], Arr.findLast((n, i) => n % 2 === 0 ? Option.some([n, i]) : Option.none())),
          [2, 1]
        )
        assertSome(
          pipe([1, 2, 3, 4], Arr.findLast((n, i) => n % 2 === 0 ? Option.some([n, i]) : Option.none())),
          [4, 3]
        )

        assertNone(
          pipe(new Set<number>(), Arr.findLast((n, i) => n % 2 === 0 ? Option.some([n, i]) : Option.none()))
        )
        assertSome(
          pipe(new Set([1, 2, 3]), Arr.findLast((n, i) => n % 2 === 0 ? Option.some([n, i]) : Option.none())),
          [2, 1]
        )
        assertSome(
          pipe(new Set([1, 2, 3, 4]), Arr.findLast((n, i) => n % 2 === 0 ? Option.some([n, i]) : Option.none())),
          [4, 3]
        )
      })
    })

    it("insertAt", () => {
      assertNone(Arr.insertAt(1, 1)([]))
      assertSome(Arr.insertAt(0, 1)([]), [1])
      assertSome(Arr.insertAt(2, 5)([1, 2, 3, 4]), [1, 2, 5, 3, 4])
      // out of bound
      assertNone(Arr.insertAt(-1, 5)([1, 2, 3, 4]))
      assertNone(Arr.insertAt(10, 5)([1, 2, 3, 4]))

      assertNone(Arr.insertAt(1, 1)(new Set([])))
      assertSome(Arr.insertAt(0, 1)(new Set([])), [1])
      assertSome(Arr.insertAt(2, 5)(new Set([1, 2, 3, 4])), [1, 2, 5, 3, 4])
      // out of bound
      assertNone(Arr.insertAt(-1, 5)(new Set([1, 2, 3, 4])))
      assertNone(Arr.insertAt(10, 5)(new Set([1, 2, 3, 4])))
    })

    it("replace", () => {
      assertSome(pipe([1, 2, 3], Arr.replace(1, "a")), [1, "a", 3])
      // out of bound
      assertNone(pipe([], Arr.replace(1, "a")))
      assertNone(pipe([1, 2, 3], Arr.replace(-1, "a")))
      assertNone(pipe([1, 2, 3], Arr.replace(10, "a")))

      assertSome(pipe(new Set([1, 2, 3]), Arr.replace(1, "a")), [1, "a", 3])
      // out of bound
      assertNone(pipe(new Set([]), Arr.replace(1, "a")))
      assertNone(pipe(new Set([1, 2, 3]), Arr.replace(-1, "a")))
      assertNone(pipe(new Set([1, 2, 3]), Arr.replace(10, "a")))
    })

    it("modify", () => {
      assertSome(pipe([1, 2, 3], Arr.modify(1, double)), [1, 4, 3])
      // out of bound
      assertNone(pipe([], Arr.modify(1, double)))
      assertNone(pipe([1, 2, 3], Arr.modify(10, double)))

      assertSome(pipe(new Set([1, 2, 3]), Arr.modify(1, double)), [1, 4, 3])
      // out of bound
      assertNone(pipe(new Set([]), Arr.modify(1, double)))
      assertNone(pipe(new Set([1, 2, 3]), Arr.modify(10, double)))
    })

    it("remove", () => {
      deepStrictEqual(pipe([1, 2, 3], Arr.remove(0)), [2, 3])
      // out of bound
      deepStrictEqual(pipe([], Arr.remove(0)), [])
      deepStrictEqual(pipe([1, 2, 3], Arr.remove(-1)), [1, 2, 3])
      deepStrictEqual(pipe([1, 2, 3], Arr.remove(10)), [1, 2, 3])

      deepStrictEqual(pipe(new Set([1, 2, 3]), Arr.remove(0)), [2, 3])
      // out of bound
      deepStrictEqual(pipe(new Set([]), Arr.remove(0)), [])
      deepStrictEqual(pipe(new Set([1, 2, 3]), Arr.remove(-1)), [1, 2, 3])
      deepStrictEqual(pipe(new Set([1, 2, 3]), Arr.remove(10)), [1, 2, 3])
    })

    it("reverse", () => {
      deepStrictEqual(Arr.reverse([]), [])
      deepStrictEqual(Arr.reverse([1]), [1])
      deepStrictEqual(Arr.reverse([1, 2, 3]), [3, 2, 1])

      deepStrictEqual(Arr.reverse(new Set([])), [])
      deepStrictEqual(Arr.reverse(new Set([1])), [1])
      deepStrictEqual(Arr.reverse(new Set([1, 2, 3])), [3, 2, 1])
    })

    it("sort", () => {
      deepStrictEqual(Arr.sort(Num.Order)([]), [])
      deepStrictEqual(Arr.sort(Num.Order)([1, 3, 2]), [1, 2, 3])

      deepStrictEqual(Arr.sort(Num.Order)(new Set<number>()), [])
      deepStrictEqual(Arr.sort(Num.Order)(new Set([1, 3, 2])), [1, 2, 3])
    })

    it("zip", () => {
      deepStrictEqual(pipe(new Set([]), Arr.zip(new Set(["a", "b", "c", "d"]))), [])
      deepStrictEqual(pipe(new Set([1, 2, 3]), Arr.zip(new Set([]))), [])
      deepStrictEqual(pipe(new Set([1, 2, 3]), Arr.zip(new Set(["a", "b", "c", "d"]))), [
        [1, "a"],
        [2, "b"],
        [3, "c"]
      ])
      deepStrictEqual(pipe(new Set([1, 2, 3]), Arr.zip(new Set(["a", "b", "c", "d"]))), [
        [1, "a"],
        [2, "b"],
        [3, "c"]
      ])
    })

    it("zipWith", () => {
      deepStrictEqual(
        pipe(new Set([1, 2, 3]), Arr.zipWith(new Set([]), (n, s) => s + n)),
        []
      )
      deepStrictEqual(
        pipe(new Set([]), Arr.zipWith(new Set(["a", "b", "c", "d"]), (n, s) => s + n)),
        []
      )
      deepStrictEqual(
        pipe(new Set([]), Arr.zipWith(new Set([]), (n, s) => s + n)),
        []
      )
      deepStrictEqual(
        pipe(new Set([1, 2, 3]), Arr.zipWith(new Set(["a", "b", "c", "d"]), (n, s) => s + n)),
        ["a1", "b2", "c3"]
      )
    })

    it("unzip", () => {
      deepStrictEqual(Arr.unzip(new Set([])), [[], []])
      deepStrictEqual(
        Arr.unzip(
          new Set(
            [
              [1, "a"],
              [2, "b"],
              [3, "c"]
            ] as const
          )
        ),
        [
          [1, 2, 3],
          ["a", "b", "c"]
        ]
      )
    })

    it("intersperse", () => {
      deepStrictEqual(pipe([], Arr.intersperse(0)), [])
      deepStrictEqual(pipe([1], Arr.intersperse(0)), [1])
      deepStrictEqual(pipe([1, 2, 3], Arr.intersperse(0)), [1, 0, 2, 0, 3])
      deepStrictEqual(pipe([1, 2], Arr.intersperse(0)), [1, 0, 2])
      deepStrictEqual(pipe([1, 2, 3, 4], Arr.intersperse(0)), [1, 0, 2, 0, 3, 0, 4])

      deepStrictEqual(pipe(new Set([]), Arr.intersperse(0)), [])
      deepStrictEqual(pipe(new Set([1]), Arr.intersperse(0)), [1])
      deepStrictEqual(pipe(new Set([1, 2, 3]), Arr.intersperse(0)), [1, 0, 2, 0, 3])
      deepStrictEqual(pipe(new Set([1, 2]), Arr.intersperse(0)), [1, 0, 2])
      deepStrictEqual(pipe(new Set([1, 2, 3, 4]), Arr.intersperse(0)), [1, 0, 2, 0, 3, 0, 4])
    })

    it("rotate", () => {
      deepStrictEqual(Arr.rotate(0)(Arr.empty()), Arr.empty())
      deepStrictEqual(Arr.rotate(1)(Arr.empty()), Arr.empty())
      deepStrictEqual(Arr.rotate(1)([1]), [1])
      deepStrictEqual(Arr.rotate(2)([1]), [1])
      deepStrictEqual(Arr.rotate(-1)([1]), [1])
      deepStrictEqual(Arr.rotate(-2)([1]), [1])
      deepStrictEqual(Arr.rotate(2)([1, 2]), [1, 2])
      deepStrictEqual(Arr.rotate(0)([1, 2]), [1, 2])
      deepStrictEqual(Arr.rotate(-2)([1, 2]), [1, 2])
      deepStrictEqual(Arr.rotate(1)([1, 2]), [2, 1])
      deepStrictEqual(Arr.rotate(1)(new Set([1, 2, 3, 4, 5])), [5, 1, 2, 3, 4])
      deepStrictEqual(Arr.rotate(2)(new Set([1, 2, 3, 4, 5])), [4, 5, 1, 2, 3])
      deepStrictEqual(Arr.rotate(-1)(new Set([1, 2, 3, 4, 5])), [2, 3, 4, 5, 1])
      deepStrictEqual(Arr.rotate(-2)(new Set([1, 2, 3, 4, 5])), [3, 4, 5, 1, 2])
      deepStrictEqual(
        Arr.rotate(1)((function*() {
          yield* [1, 2, 3]
        })()),
        [3, 1, 2]
      )
      // out of bounds
      deepStrictEqual(Arr.rotate(7)([1, 2, 3, 4, 5]), [4, 5, 1, 2, 3])
      deepStrictEqual(Arr.rotate(-7)([1, 2, 3, 4, 5]), [3, 4, 5, 1, 2])
      deepStrictEqual(Arr.rotate(2.2)([1, 2, 3, 4, 5]), [4, 5, 1, 2, 3])
      deepStrictEqual(Arr.rotate(-2.2)([1, 2, 3, 4, 5]), [3, 4, 5, 1, 2])
    })

    it("containsWith", () => {
      const contains = Arr.containsWith(Equivalence.strictEqual<number>())
      deepStrictEqual(pipe([1, 2, 3], contains(2)), true)
      deepStrictEqual(pipe([1, 2, 3], contains(0)), false)

      deepStrictEqual(pipe(new Set([1, 2, 3]), contains(2)), true)
      deepStrictEqual(pipe(new Set([1, 2, 3]), contains(0)), false)
    })

    it("contains", () => {
      const contains = Arr.contains
      deepStrictEqual(pipe([1, 2, 3], contains(2)), true)
      deepStrictEqual(pipe([1, 2, 3], contains(0)), false)

      deepStrictEqual(pipe(new Set([1, 2, 3]), contains(2)), true)
      deepStrictEqual(pipe(new Set([1, 2, 3]), contains(0)), false)
    })

    it("dedupeWith", () => {
      const dedupe = Arr.dedupeWith(Equivalence.strictEqual<number>())
      deepStrictEqual(dedupe([]), [])
      deepStrictEqual(dedupe([-0, -0]), [-0])
      deepStrictEqual(dedupe([0, -0]), [0])
      deepStrictEqual(dedupe([1]), [1])
      deepStrictEqual(dedupe([2, 1, 2]), [2, 1])
      deepStrictEqual(dedupe([1, 2, 1]), [1, 2])
      deepStrictEqual(dedupe([1, 2, 3, 4, 5]), [1, 2, 3, 4, 5])
      deepStrictEqual(dedupe([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]), [1, 2, 3, 4, 5])
      deepStrictEqual(dedupe([1, 2, 3, 4, 5, 1, 2, 3, 4, 5]), [1, 2, 3, 4, 5])
    })

    it("dedupeAdjacentWith", () => {
      const dedupeAdjacent = Arr.dedupeAdjacentWith(Equivalence.strictEqual<number>())
      deepStrictEqual(dedupeAdjacent([]), [])
      deepStrictEqual(dedupeAdjacent([1, 2, 3]), [1, 2, 3])
      deepStrictEqual(dedupeAdjacent([1, 2, 2, 3, 3]), [1, 2, 3])
    })

    it("splitAt", () => {
      const assertSplitAt = (
        input: ReadonlyArray<number>,
        index: number,
        expectedInit: ReadonlyArray<number>,
        expectedRest: ReadonlyArray<number>
      ) => {
        const [init, rest] = Arr.splitAt(index)(input)
        deepStrictEqual(init, expectedInit)
        deepStrictEqual(rest, expectedRest)
      }
      deepStrictEqual(Arr.splitAt(1)([1, 2]), [[1], [2]])
      assertSplitAt([1, 2], 2, [1, 2], [])
      deepStrictEqual(Arr.splitAt(2)([1, 2, 3, 4, 5]), [
        [1, 2],
        [3, 4, 5]
      ])
      deepStrictEqual(Arr.splitAt(2)(new Set([1, 2, 3, 4, 5])), [
        [1, 2],
        [3, 4, 5]
      ])
      assertSplitAt([], 0, [], [])
      assertSplitAt([1, 2], 0, [], [1, 2])
      assertSplitAt([1, 2], Number.NaN, [], [1, 2])

      // out of bounds
      assertSplitAt([], -1, [], [])
      assertSplitAt([1, 2], -1, [], [1, 2])
      assertSplitAt([1, 2], 3, [1, 2], [])
      assertSplitAt([], 3, [], [])
    })
  })

  it("splitAtNonEmpty", () => {
    deepStrictEqual(pipe(Arr.make(1, 2, 3, 4), Arr.splitAtNonEmpty(2)), [[1, 2], [3, 4]])
    deepStrictEqual(pipe(Arr.make(1, 2, 3, 4), Arr.splitAtNonEmpty(10)), [[1, 2, 3, 4], []])
    deepStrictEqual(pipe(Arr.make(1, 2, 3, 4), Arr.splitAtNonEmpty(Number.NaN)), [[1], [2, 3, 4]])
  })

  describe("getUnsafe", () => {
    it("should throw on index out of bound", () => {
      throws(() => pipe([], Arr.getUnsafe(100)), new Error("Index out of bounds: 100"))
    })
  })

  it("fromNullishOr", () => {
    deepStrictEqual(Arr.fromNullishOr(undefined), [])
    deepStrictEqual(Arr.fromNullishOr(null), [])
    deepStrictEqual(Arr.fromNullishOr(1), [1])
  })

  it("liftNullishOr", () => {
    const f = Arr.liftNullishOr((n: number) => (n > 0 ? n : null))
    deepStrictEqual(f(1), [1])
    deepStrictEqual(f(-1), [])
  })

  it("flatMapNullishOr", () => {
    const f = Arr.flatMapNullishOr((n: number) => (n > 0 ? n : null))
    deepStrictEqual(pipe([], f), [])
    deepStrictEqual(pipe([1], f), [1])
    deepStrictEqual(pipe([1, 2], f), [1, 2])
    deepStrictEqual(pipe([-1], f), [])
    deepStrictEqual(pipe([-1, 2], f), [2])
  })

  it("liftPredicate", () => {
    const p = (n: number): boolean => n > 2
    const f = Arr.liftPredicate(p)
    deepStrictEqual(f(1), [])
    deepStrictEqual(f(3), [3])
  })

  it("liftOption", () => {
    const f = Arr.liftOption((n: number) => (n > 0 ? Option.some(n) : Option.none()))
    deepStrictEqual(f(1), [1])
    deepStrictEqual(f(-1), [])
  })

  it("unprepend", () => {
    deepStrictEqual(Arr.unprepend([0]), [0, []])
    deepStrictEqual(Arr.unprepend([1, 2, 3, 4]), [1, [2, 3, 4]])
  })

  it("unappend", () => {
    deepStrictEqual(Arr.unappend([0]), [[], 0])
    deepStrictEqual(Arr.unappend([1, 2, 3, 4]), [
      Arr.make(1, 2, 3),
      4
    ])
    deepStrictEqual(Arr.unappend([0]), [[], 0])
    deepStrictEqual(Arr.unappend([1, 2, 3, 4]), [
      Arr.make(1, 2, 3),
      4
    ])
  })

  it("modifyHeadNonEmpty", () => {
    const f = (s: string) => s + "!"
    deepStrictEqual(pipe(["a"], Arr.modifyHeadNonEmpty(f)), ["a!"])
    deepStrictEqual(pipe(["a", "b"], Arr.modifyHeadNonEmpty(f)), ["a!", "b"])
    deepStrictEqual(pipe(["a", "b", "c"], Arr.modifyHeadNonEmpty(f)), ["a!", "b", "c"])
  })

  it("modifyLastNonEmpty", () => {
    const f = (s: string) => s + "!"
    deepStrictEqual(pipe(["a"], Arr.modifyLastNonEmpty(f)), ["a!"])
    deepStrictEqual(pipe(["a", "b"], Arr.modifyLastNonEmpty(f)), ["a", "b!"])
    deepStrictEqual(pipe(["a", "b", "c"], Arr.modifyLastNonEmpty(f)), ["a", "b", "c!"])
  })

  it("setHeadNonEmpty", () => {
    deepStrictEqual(pipe(Arr.make("a"), Arr.setHeadNonEmpty("d")), ["d"])
    deepStrictEqual(pipe(Arr.make("a", "b"), Arr.setHeadNonEmpty("d")), ["d", "b"])
    deepStrictEqual(pipe(Arr.make("a", "b", "c"), Arr.setHeadNonEmpty("d")), ["d", "b", "c"])
  })

  it("setLastNonEmpty", () => {
    deepStrictEqual(pipe(Arr.make("a"), Arr.setLastNonEmpty("d")), ["d"])
    deepStrictEqual(pipe(Arr.make("a", "b"), Arr.setLastNonEmpty("d")), ["a", "d"])
    deepStrictEqual(pipe(Arr.make("a", "b", "c"), Arr.setLastNonEmpty("d")), ["a", "b", "d"])
  })

  it("liftResult", () => {
    const f = Arr.liftResult((s: string) => s.length > 2 ? Result.succeed(s.length) : Result.fail("e"))
    deepStrictEqual(f("a"), [])
    deepStrictEqual(f("aaa"), [3])
  })

  it("headNonEmpty", () => {
    deepStrictEqual(Arr.headNonEmpty(Arr.make(1, 2)), 1)
  })

  it("tailNonEmpty", () => {
    deepStrictEqual(Arr.tailNonEmpty(Arr.make(1, 2)), [2])
  })

  it("lastNonEmpty", () => {
    deepStrictEqual(Arr.lastNonEmpty(Arr.make(1, 2, 3)), 3)
    deepStrictEqual(Arr.lastNonEmpty([1]), 1)
  })

  it("initNonEmpty", () => {
    deepStrictEqual(
      Arr.initNonEmpty(Arr.make(1, 2, 3)),
      Arr.make(1, 2)
    )
    deepStrictEqual(Arr.initNonEmpty([1]), [])
  })

  it("get", () => {
    assertSome(pipe([1, 2, 3], Arr.get(0)), 1)
    assertNone(pipe([1, 2, 3], Arr.get(3)))
  })

  it("unfold", () => {
    const as = Arr.unfold(5, (n) => (n > 0 ? Option.some([n, n - 1]) : Option.none()))
    deepStrictEqual(as, [5, 4, 3, 2, 1])
  })

  it("map", () => {
    deepStrictEqual(
      pipe([1, 2, 3], Arr.map((n) => n * 2)),
      [2, 4, 6]
    )
    deepStrictEqual(
      pipe(["a", "b"], Arr.map((s, i) => s + i)),
      ["a0", "b1"]
    )
  })

  it("flatMap", () => {
    deepStrictEqual(
      pipe([1, 2, 3], Arr.flatMap((n) => [n, n + 1])),
      [1, 2, 2, 3, 3, 4]
    )
    const f = Arr.flatMap((n: number, i) => [n + i])
    deepStrictEqual(pipe([], f), [])
    deepStrictEqual(pipe([1, 2, 3], f), [1, 3, 5])
  })

  it("extend", () => {
    deepStrictEqual(pipe([1, 2, 3, 4], Arr.extend(Num.sumAll)), [10, 9, 7, 4])
    deepStrictEqual(pipe([1, 2, 3, 4], Arr.extend(identity)), [
      [1, 2, 3, 4],
      [2, 3, 4],
      [3, 4],
      [4]
    ])
  })

  it("compact", () => {
    deepStrictEqual(Arr.getSomes([]), [])
    deepStrictEqual(Arr.getSomes([Option.some(1), Option.some(2), Option.some(3)]), [
      1,
      2,
      3
    ])
    deepStrictEqual(Arr.getSomes([Option.some(1), Option.none(), Option.some(3)]), [
      1,
      3
    ])
  })

  it("separate", () => {
    deepStrictEqual(Arr.separate([]), [[], []])
    deepStrictEqual(Arr.separate([Result.succeed(1), Result.fail("e"), Result.fail(2), Result.succeed(2)]), [
      [1, 2],
      ["e", 2]
    ])
  })

  it("filter", () => {
    deepStrictEqual(Arr.filter([1, 2, 3], (n) => n % 2 === 1), [1, 3])
    deepStrictEqual(Arr.filter([Option.some(3), Option.some(2), Option.some(1)], Option.isSome), [
      Option.some(3),
      Option.some(2),
      Option.some(1)
    ])
    deepStrictEqual(Arr.filter([Option.some(3), Option.none(), Option.some(1)], Option.isSome), [
      Option.some(3),
      Option.some(1)
    ])
    deepStrictEqual(Arr.filter(["a", "b", "c"], (_, i) => i % 2 === 0), ["a", "c"])
  })

  it("filterMap", () => {
    const f: (n: number, i: number) => Result.Result<number, string> = (n, i) =>
      n + i < 4 ? Result.succeed(n * 2) : Result.fail(`skip: ${n}`)

    deepStrictEqual(Arr.filterMap([], f), [])
    deepStrictEqual(Arr.filterMap([1, 2, 3], f), [2, 4])
    deepStrictEqual(pipe([1, 2, 3], Arr.filterMap(f)), [2, 4])
    deepStrictEqual(pipe(new Set([1, 2, 3]), Arr.filterMap(f)), [2, 4])
    deepStrictEqual(pipe([1, 2, 3][Symbol.iterator](), Arr.filterMap(f)), [2, 4])
  })

  it("partition (identity)", () => {
    deepStrictEqual(Arr.partition([], identity), [[], []])
    deepStrictEqual(Arr.partition([Result.succeed(1), Result.fail("a"), Result.succeed(2)], identity), [[1, 2], ["a"]])
  })

  it("partition - transformed outputs", () => {
    deepStrictEqual(Arr.partition([], (n) => n > 2 ? Result.succeed(n) : Result.fail(n)), [[], []])
    deepStrictEqual(Arr.partition([1, 3], (n) => n > 2 ? Result.succeed(n) : Result.fail(n)), [[3], [1]])

    deepStrictEqual(Arr.partition([], (n, i) => n + i > 2 ? Result.succeed(n) : Result.fail(n)), [[], []])
    deepStrictEqual(Arr.partition([1, 2], (n, i) => n + i > 2 ? Result.succeed(n) : Result.fail(n)), [[2], [1]])
  })

  it("reduce", () => {
    deepStrictEqual(pipe(["a", "b", "c"], Arr.reduce("", (b, a) => b + a)), "abc")
    deepStrictEqual(
      pipe(
        ["a", "b"],
        Arr.reduce("", (b, a, i) => b + i + a)
      ),
      "0a1b"
    )
  })

  it("reduceRight", () => {
    const f = (b: string, a: string) => b + a
    deepStrictEqual(pipe(["a", "b", "c"], Arr.reduceRight("", f)), "cba")
    deepStrictEqual(pipe([], Arr.reduceRight("", f)), "")
    deepStrictEqual(
      pipe(
        ["a", "b"],
        Arr.reduceRight("", (b, a, i) => b + i + a)
      ),
      "1b0a"
    )
  })

  it("makeOrder", () => {
    const O = Arr.makeOrder(Str.Order)
    deepStrictEqual(O([], []), 0)
    deepStrictEqual(O(["a"], ["a"]), 0)

    deepStrictEqual(O(["a"], ["b"]), -1)
    deepStrictEqual(O(["b"], ["a"]), 1)

    deepStrictEqual(O([], ["a"]), -1)
    deepStrictEqual(O(["a"], []), 1)
    deepStrictEqual(O(["a"], ["a", "a"]), -1)
    deepStrictEqual(O(["b"], ["a", "a"]), 1)

    deepStrictEqual(O(["a", "a"], ["a", "a"]), 0)
    deepStrictEqual(O(["a", "b"], ["a", "b"]), 0)

    deepStrictEqual(O(["a", "b"], ["a", "a"]), 1)
    deepStrictEqual(O(["a", "a"], ["a", "b"]), -1)

    deepStrictEqual(O(["b", "a"], ["a", "b"]), 1)
    deepStrictEqual(O(["a", "a"], ["b", "a"]), -1)
    deepStrictEqual(O(["a", "b"], ["b", "a"]), -1)
    deepStrictEqual(O(["b", "a"], ["b", "b"]), -1)
    deepStrictEqual(O(["b", "b"], ["b", "a"]), 1)
  })

  it("isReadonlyArrayEmpty", () => {
    deepStrictEqual(Arr.isReadonlyArrayEmpty([1, 2, 3]), false)
    deepStrictEqual(Arr.isReadonlyArrayEmpty([]), true)
  })

  it("isArrayEmpty", () => {
    deepStrictEqual(Arr.isArrayEmpty([1, 2, 3]), false)
    deepStrictEqual(Arr.isArrayEmpty([]), true)
  })

  it("isReadonlyArrayNonEmpty", () => {
    deepStrictEqual(Arr.isReadonlyArrayNonEmpty([1, 2, 3]), true)
    deepStrictEqual(Arr.isReadonlyArrayNonEmpty([]), false)
  })

  it("isArrayNonEmpty", () => {
    deepStrictEqual(Arr.isArrayNonEmpty([1, 2, 3]), true)
    deepStrictEqual(Arr.isArrayNonEmpty([]), false)
  })

  it("head", () => {
    const as: ReadonlyArray<number> = [1, 2, 3]
    assertSome(Arr.head(as), 1)
    assertNone(Arr.head([]))
  })

  it("last", () => {
    const as: ReadonlyArray<number> = [1, 2, 3]
    assertSome(Arr.last(as), 3)
    assertNone(Arr.last([]))
  })

  it("chunksOf", () => {
    deepStrictEqual(Arr.chunksOf(2)([1, 2, 3, 4, 5]), [
      Arr.make(1, 2),
      [3, 4],
      [5]
    ])
    deepStrictEqual(Arr.chunksOf(2)([1, 2, 3, 4, 5, 6]), [
      Arr.make(1, 2),
      [3, 4],
      [5, 6]
    ])
    deepStrictEqual(Arr.chunksOf(1)([1, 2, 3, 4, 5]), [[1], [2], [3], [4], [5]])
    deepStrictEqual(Arr.chunksOf(5)([1, 2, 3, 4, 5]), [[1, 2, 3, 4, 5]])
    // out of bounds
    deepStrictEqual(Arr.chunksOf(0)([1, 2, 3, 4, 5]), [[1], [2], [3], [4], [5]])
    deepStrictEqual(Arr.chunksOf(-1)([1, 2, 3, 4, 5]), [[1], [2], [3], [4], [5]])
    deepStrictEqual(Arr.chunksOf(Number.NaN)([1, 2, 3]), [[1], [2], [3]])

    const assertSingleChunk = (
      input: Arr.NonEmptyReadonlyArray<number>,
      n: number
    ) => {
      const chunks = Arr.chunksOf(n)(input)
      strictEqual(chunks.length, 1)
      deepStrictEqual(Arr.headNonEmpty(chunks), input)
    }
    // n = length
    assertSingleChunk(Arr.make(1, 2), 2)
    // n out of bounds
    assertSingleChunk(Arr.make(1, 2), 3)
  })

  it("window", () => {
    deepStrictEqual(Arr.window([], 0), [])
    deepStrictEqual(Arr.window([], 2), [])
    deepStrictEqual(Arr.window([1, 2, 3, 4, 5], 2), [[1, 2], [2, 3], [3, 4], [4, 5]])
    deepStrictEqual(Arr.window([1, 2, 3, 4, 5], 3), [[1, 2, 3], [2, 3, 4], [3, 4, 5]])
    deepStrictEqual(Arr.window([1, 2, 3], 1.5), [[1], [2], [3]])
    deepStrictEqual(Arr.window([1, 2, 3], Number.NaN), [])

    // n out of bounds
    deepStrictEqual(Arr.window([1, 2, 3, 4, 5], 6), [])
    deepStrictEqual(Arr.window([1, 2, 3, 4, 5], 0), [])
    deepStrictEqual(Arr.window([1, 2, 3, 4, 5], -1), [])
  })

  it("min", () => {
    deepStrictEqual(Arr.min(Num.Order)([2, 1, 3]), 1)
    deepStrictEqual(Arr.min(Num.Order)([3]), 3)
  })

  it("max", () => {
    deepStrictEqual(
      Arr.max(Num.Order)(Arr.make(1, 2, 3)),
      3
    )
    deepStrictEqual(Arr.max(Num.Order)([1]), 1)
  })

  it("flatten", () => {
    deepStrictEqual(Arr.flatten([[1], [2], [3]]), [1, 2, 3])
  })

  it("groupWith", () => {
    const groupWith = Arr.groupWith(Equivalence.strictEqual<number>())
    deepStrictEqual(groupWith([1, 2, 1, 1]), [[1], [2], [1, 1]])
    deepStrictEqual(groupWith([1, 2, 1, 1, 3]), [[1], [2], [1, 1], [3]])
  })

  it("groupBy", () => {
    deepStrictEqual(Arr.groupBy((_) => "")([]), {})
    deepStrictEqual(Arr.groupBy((a) => `${a}`)([1]), { "1": [1] })
    deepStrictEqual(
      Arr.groupBy((s: string) => `${s.length}`)(["foo", "bar", "foobar"]),
      {
        "3": ["foo", "bar"],
        "6": ["foobar"]
      }
    )
    deepStrictEqual(Arr.groupBy(["a", "b"], (s) => s === "a" ? symA : s === "b" ? symB : symC), {
      [symA]: ["a"],
      [symB]: ["b"]
    })
    deepStrictEqual(Arr.groupBy(["a", "b", "c", "d"], (s) => s === "a" ? symA : s === "b" ? symB : symC), {
      [symA]: ["a"],
      [symB]: ["b"],
      [symC]: ["c", "d"]
    })
  })

  it("match", () => {
    const len: <A>(as: ReadonlyArray<A>) => number = Arr.match({
      onEmpty: () => 0,
      onNonEmpty: (as) => 1 + len(as.slice(1))
    })
    deepStrictEqual(len([1, 2, 3]), 3)
  })

  it("matchLeft", () => {
    const len: <A>(as: ReadonlyArray<A>) => number = Arr.matchLeft({
      onEmpty: () => 0,
      onNonEmpty: (_, tail) => 1 + len(tail)
    })
    deepStrictEqual(len([1, 2, 3]), 3)
  })

  it("matchRight", () => {
    const len: <A>(as: ReadonlyArray<A>) => number = Arr.matchRight({
      onEmpty: () => 0,
      onNonEmpty: (init, _) => 1 + len(init)
    })
    deepStrictEqual(len([1, 2, 3]), 3)
  })

  it("sortBy", () => {
    interface X {
      readonly a: string
      readonly b: number
      readonly c: boolean
    }

    const byName = pipe(
      Str.Order,
      Order.mapInput((p: { readonly a: string; readonly b: number }) => p.a)
    )

    const byAge = pipe(
      Num.Order,
      Order.mapInput((p: { readonly a: string; readonly b: number }) => p.b)
    )

    const sortByNameByAge = Arr.sortBy(byName, byAge)

    const xs: Arr.NonEmptyArray<X> = [
      { a: "a", b: 1, c: true },
      { a: "b", b: 3, c: true },
      { a: "c", b: 2, c: true },
      { a: "b", b: 2, c: true }
    ]

    deepStrictEqual(Arr.sortBy()(xs), xs)
    deepStrictEqual(sortByNameByAge([]), [])
    deepStrictEqual(sortByNameByAge(xs), [
      { a: "a", b: 1, c: true },
      { a: "b", b: 2, c: true },
      { a: "b", b: 3, c: true },
      { a: "c", b: 2, c: true }
    ])

    deepStrictEqual(Arr.sortBy()(new Set(xs)), xs)
    deepStrictEqual(sortByNameByAge(new Set([])), [])
    deepStrictEqual(sortByNameByAge(new Set(xs)), [
      { a: "a", b: 1, c: true },
      { a: "b", b: 2, c: true },
      { a: "b", b: 3, c: true },
      { a: "c", b: 2, c: true }
    ])

    const sortByAgeByName = Arr.sortBy(byAge, byName)
    deepStrictEqual(sortByAgeByName(xs), [
      { a: "a", b: 1, c: true },
      { a: "b", b: 2, c: true },
      { a: "c", b: 2, c: true },
      { a: "b", b: 3, c: true }
    ])
  })

  it("copy", () => {
    deepStrictEqual(pipe([], Arr.copy), [])
    deepStrictEqual(pipe([1, 2, 3], Arr.copy), [1, 2, 3])
  })

  it("chop", () => {
    deepStrictEqual(pipe([], Arr.chop((as) => [as[0] * 2, as.slice(1)])), [])
    deepStrictEqual(pipe([1, 2, 3], Arr.chop((as) => [as[0] * 2, as.slice(1)])), [2, 4, 6])
  })

  it("pad", () => {
    deepStrictEqual(pipe([], Arr.pad(0, 0)), [])
    deepStrictEqual(pipe([1, 2, 3], Arr.pad(0, 0)), [])
    deepStrictEqual(pipe([1, 2, 3], Arr.pad(2, 0)), [1, 2])
    deepStrictEqual(pipe([1], Arr.pad(1.5, 0)), [1])
    deepStrictEqual(pipe([1, 2, 3], Arr.pad(6, 0)), [1, 2, 3, 0, 0, 0])
    deepStrictEqual(pipe([1, 2, 3], Arr.pad(-2, 0)), [])
    deepStrictEqual(pipe([1, 2, 3], Arr.pad(Number.NaN, 0)), [])
  })

  describe("chunksOf", () => {
    it("should split a `ReadonlyArray` into length-n pieces", () => {
      deepStrictEqual(Arr.chunksOf(2)([1, 2, 3, 4, 5]), [[1, 2], [3, 4], [5]])
      deepStrictEqual(Arr.chunksOf(2)([1, 2, 3, 4, 5, 6]), [
        [1, 2],
        [3, 4],
        [5, 6]
      ])
      deepStrictEqual(Arr.chunksOf(1)([1, 2, 3, 4, 5]), [[1], [2], [3], [4], [5]])
      deepStrictEqual(Arr.chunksOf(5)([1, 2, 3, 4, 5]), [[1, 2, 3, 4, 5]])
      // out of bounds
      deepStrictEqual(Arr.chunksOf(0)([1, 2, 3, 4, 5]), [[1], [2], [3], [4], [5]])
      deepStrictEqual(Arr.chunksOf(-1)([1, 2, 3, 4, 5]), [[1], [2], [3], [4], [5]])

      const assertSingleChunk = (input: ReadonlyArray<number>, n: number) => {
        const chunks = Arr.chunksOf(n)(input)
        deepStrictEqual(chunks.length, 1)
        deepStrictEqual(chunks[0], input)
      }
      // n = length
      assertSingleChunk([1, 2], 2)
      // n out of bounds
      assertSingleChunk([1, 2], 3)
    })

    it("returns an empty array if provided an empty array", () => {
      const empty: ReadonlyArray<number> = []
      deepStrictEqual(Arr.chunksOf(0)(empty), Arr.empty())
      deepStrictEqual(Arr.chunksOf(0)(Arr.empty()), Arr.empty())
      deepStrictEqual(Arr.chunksOf(1)(empty), Arr.empty())
      deepStrictEqual(Arr.chunksOf(1)(Arr.empty()), Arr.empty())
      deepStrictEqual(Arr.chunksOf(2)(empty), Arr.empty())
      deepStrictEqual(Arr.chunksOf(2)(Arr.empty()), Arr.empty())
    })

    it("should respect the law: chunksOf(n)(xs).concat(chunksOf(n)(ys)) == chunksOf(n)(xs.concat(ys)))", () => {
      const xs: ReadonlyArray<number> = []
      const ys: ReadonlyArray<number> = [1, 2]
      deepStrictEqual(
        Arr.chunksOf(2)(xs).concat(Arr.chunksOf(2)(ys)),
        Arr.chunksOf(2)(xs.concat(ys))
      )
      fc.assert(
        fc.property(
          fc.array(fc.integer()).filter((xs) => xs.length % 2 === 0), // Ensures `xs.length` is even
          fc.array(fc.integer()),
          fc.integer({ min: 1, max: 1 }).map((x) => x * 2), // Generates `n` to be even so that it evenly divides `xs`
          (xs, ys, n) => {
            const as = Arr.chunksOf(n)(xs).concat(Arr.chunksOf(n)(ys))
            const bs = Arr.chunksOf(n)(xs.concat(ys))
            deepStrictEqual(as, bs)
          }
        )
      )
    })
  })

  it("makeBy", () => {
    deepStrictEqual(Arr.makeBy(5, (n) => n * 2), [0, 2, 4, 6, 8])
    deepStrictEqual(Arr.makeBy((n) => n * 2)(5), [0, 2, 4, 6, 8])
    deepStrictEqual(Arr.makeBy(2.2, (n) => n * 2), [0, 2])
    deepStrictEqual(Arr.makeBy((n) => n * 2)(2.2), [0, 2])
    deepStrictEqual(Arr.makeBy(Number.NaN, (n) => n), [0])
  })

  it("replicate", () => {
    deepStrictEqual(Arr.replicate("a", 0), ["a"])
    deepStrictEqual(Arr.replicate("a", -1), ["a"])
    deepStrictEqual(Arr.replicate("a", Number.NaN), ["a"])
    deepStrictEqual(Arr.replicate("a", 3), ["a", "a", "a"])
    deepStrictEqual(Arr.replicate("a", 2.2), ["a", "a"])
  })

  it("range", () => {
    deepStrictEqual(Arr.range(0, 0), [0])
    deepStrictEqual(Arr.range(0, 1), [0, 1])
    deepStrictEqual(Arr.range(1, 5), [1, 2, 3, 4, 5])
    deepStrictEqual(Arr.range(10, 15), [10, 11, 12, 13, 14, 15])
    deepStrictEqual(Arr.range(-1, 0), [-1, 0])
    deepStrictEqual(Arr.range(-5, -1), [-5, -4, -3, -2, -1])
    // out of bound
    deepStrictEqual(Arr.range(2, 1), [2])
    deepStrictEqual(Arr.range(-1, -2), [-1])
  })

  it("unionWith", () => {
    const two: ReadonlyArray<number> = [1, 2]
    deepStrictEqual(pipe(two, Arr.unionWith([3, 4], Equivalence.strictEqual<number>())), [1, 2, 3, 4])
    deepStrictEqual(pipe(two, Arr.unionWith([2, 3], Equivalence.strictEqual<number>())), [1, 2, 3])
    deepStrictEqual(pipe(two, Arr.unionWith([1, 2], Equivalence.strictEqual<number>())), [1, 2])
    deepStrictEqual(pipe(two, Arr.unionWith(Arr.empty(), Equivalence.strictEqual<number>())), two)
    deepStrictEqual(pipe(Arr.empty(), Arr.unionWith(two, Equivalence.strictEqual<number>())), two)
    deepStrictEqual(
      pipe(Arr.empty(), Arr.unionWith(Arr.empty(), Equivalence.strictEqual<number>())),
      Arr.empty()
    )
  })

  it("intersectionWith", () => {
    const intersectionWith = Arr.intersectionWith(Equivalence.strictEqual<number>())
    deepStrictEqual(pipe([1, 2], intersectionWith([3, 4])), [])
    deepStrictEqual(pipe([1, 2], intersectionWith([2, 3])), [2])
    deepStrictEqual(pipe([1, 2], intersectionWith([1, 2])), [1, 2])
    // iterator input
    deepStrictEqual(pipe([1, 2], intersectionWith([3, 4][Symbol.iterator]())), [])
    deepStrictEqual(pipe([1, 2], intersectionWith([2, 3][Symbol.iterator]())), [2])
    deepStrictEqual(pipe([1, 2], intersectionWith([1, 2][Symbol.iterator]())), [1, 2])
  })

  it("differenceWith", () => {
    const differenceWith = Arr.differenceWith(Equivalence.strictEqual<number>())
    deepStrictEqual(pipe([1, 2], differenceWith([3, 4])), [1, 2])
    deepStrictEqual(pipe([1, 2], differenceWith([2, 3])), [1])
    deepStrictEqual(pipe([1, 2], differenceWith([1, 2])), [])
    // iterator input
    deepStrictEqual(pipe([1, 2], differenceWith([3, 4][Symbol.iterator]())), [1, 2])
    deepStrictEqual(pipe([1, 2], differenceWith([2, 3][Symbol.iterator]())), [1])
    deepStrictEqual(pipe([1, 2], differenceWith([1, 2][Symbol.iterator]())), [])
  })

  it("empty", () => {
    deepStrictEqual(Arr.empty.length, 0)
  })

  it("every", () => {
    const isPositive: Predicate.Predicate<number> = (n) => n > 0
    deepStrictEqual(Arr.every([1, 2, 3], isPositive), true)
    deepStrictEqual(Arr.every([1, 2, -3], isPositive), false)
  })

  it("some", () => {
    const isPositive: Predicate.Predicate<number> = (n) => n > 0
    deepStrictEqual(Arr.some([-1, -2, 3], isPositive), true)
    deepStrictEqual(Arr.some([-1, -2, -3], isPositive), false)
  })

  it("length", () => {
    deepStrictEqual(Arr.length(Arr.empty()), 0)
    deepStrictEqual(Arr.length([]), 0)
    deepStrictEqual(Arr.length(["a"]), 1)
  })

  it("fromOption", () => {
    deepStrictEqual(Arr.fromOption(Option.some("hello")), ["hello"])
    deepStrictEqual(Arr.fromOption(Option.none()), [])
  })

  it("forEach", () => {
    const log: Array<string> = []
    Arr.forEach(["a", "b", "c"], (a, i) => log.push(`${a}-${i}`))
    deepStrictEqual(log, ["a-0", "b-1", "c-2"])
  })

  it("sortWith", () => {
    type X = {
      a: string
      b: number
    }
    const arr: ReadonlyArray<X> = [{ a: "a", b: 2 }, { a: "b", b: 1 }]
    deepStrictEqual(Arr.sortWith(arr, (x) => x.b, Order.Number), [{ a: "b", b: 1 }, { a: "a", b: 2 }])
  })

  it("countBy", () => {
    deepStrictEqual(Arr.countBy([1, 2, 3, 4, 5], (n) => n % 2 === 0), 2)
    deepStrictEqual(pipe([1, 2, 3, 4, 5], Arr.countBy((n) => n % 2 === 0)), 2)
  })

  it("isArray", () => {
    strictEqual(Arr.isArray([]), true)
    strictEqual(Arr.isArray([1, 2, 3]), true)
    strictEqual(Arr.isArray("hello"), false)
    strictEqual(Arr.isArray(123), false)
    strictEqual(Arr.isArray(null), false)
    strictEqual(Arr.isArray(undefined), false)
    strictEqual(Arr.isArray({}), false)
    strictEqual(Arr.isArray(new Set([1, 2])), false)
  })

  it("fromRecord", () => {
    deepStrictEqual(Arr.fromRecord({}), [])
    const entries = Arr.fromRecord({ a: 1, b: 2 })
    deepStrictEqual(entries.length, 2)
    deepStrictEqual(entries.sort(([a], [b]) => a.localeCompare(b)), [["a", 1], ["b", 2]])
  })

  it("join", () => {
    deepStrictEqual(Arr.join([], ","), "")
    deepStrictEqual(Arr.join(["a"], ","), "a")
    deepStrictEqual(Arr.join(["a", "b", "c"], ", "), "a, b, c")
    deepStrictEqual(Arr.join(["a", "b", "c"], ""), "abc")
    deepStrictEqual(pipe(["x", "y"], Arr.join("-")), "x-y")
  })

  it("mapAccum", () => {
    deepStrictEqual(Arr.mapAccum([1, 2, 3], 0, (acc, n) => [acc + n, acc + n]), [6, [1, 3, 6]])
    deepStrictEqual(Arr.mapAccum([], 10, (acc, n: number) => [acc + n, n]), [10, []])
    deepStrictEqual(
      pipe([1, 2, 3], Arr.mapAccum(0, (acc, n) => [acc + n, n * 2])),
      [6, [2, 4, 6]]
    )
    deepStrictEqual(
      Arr.mapAccum(["a", "b", "c"], "", (acc, s, i) => [acc + s, `${s}${i}`]),
      ["abc", ["a0", "b1", "c2"]]
    )
  })

  it("partition", () => {
    const f: (n: number, i: number) => Result.Result<number, string> = (n, i) =>
      n > 0 ? Result.succeed(n + i) : Result.fail(`negative: ${n}:${i}`)
    deepStrictEqual(Arr.partition([], f), [[], []])
    deepStrictEqual(Arr.partition([1, -2, 3, -4], f), [[1, 5], ["negative: -2:1", "negative: -4:3"]])
    deepStrictEqual(pipe([5, 10], Arr.partition(f)), [[5, 11], []])
    deepStrictEqual(pipe([-1, -2], Arr.partition(f)), [[], ["negative: -1:0", "negative: -2:1"]])
    deepStrictEqual(
      pipe(new Set([1, -2, 3, -4]), Arr.partition(f)),
      [[1, 5], ["negative: -2:1", "negative: -4:3"]]
    )
    deepStrictEqual(pipe([1, -2, 3][Symbol.iterator](), Arr.partition(f)), [[1, 5], ["negative: -2:1"]])
  })

  it("partition with typed pass/fail outputs", () => {
    const items: Array<string | number> = [1, "a", 2, "b"]
    deepStrictEqual(
      Arr.partition(items, (x) => typeof x === "number" ? Result.succeed(x) : Result.fail(x)),
      [[1, 2], ["a", "b"]]
    )
  })

  it("getFailures", () => {
    deepStrictEqual(Arr.getFailures([]), [])
    deepStrictEqual(
      Arr.getFailures([Result.succeed(1), Result.fail("err"), Result.succeed(2)]),
      ["err"]
    )
    deepStrictEqual(
      Arr.getFailures([Result.fail("a"), Result.fail("b")]),
      ["a", "b"]
    )
    deepStrictEqual(
      Arr.getFailures([Result.succeed(1), Result.succeed(2)]),
      []
    )
  })

  it("getSuccesses", () => {
    deepStrictEqual(Arr.getSuccesses([]), [])
    deepStrictEqual(
      Arr.getSuccesses([Result.succeed(1), Result.fail("err"), Result.succeed(2)]),
      [1, 2]
    )
    deepStrictEqual(
      Arr.getSuccesses([Result.fail("a"), Result.fail("b")]),
      []
    )
    deepStrictEqual(
      Arr.getSuccesses([Result.succeed(1), Result.succeed(2)]),
      [1, 2]
    )
  })

  it("dedupe", () => {
    deepStrictEqual(Arr.dedupe([]), [])
    deepStrictEqual(Arr.dedupe([1, 2, 1, 3, 2, 4]), [1, 2, 3, 4])
    deepStrictEqual(Arr.dedupe([1, 2, 3]), [1, 2, 3])
    deepStrictEqual(Arr.dedupe([1, 1, 1]), [1])
    deepStrictEqual(Arr.dedupe(["a", "b", "a"]), ["a", "b"])
    deepStrictEqual(Arr.dedupe([NaN, NaN]), [NaN])
    deepStrictEqual(Arr.dedupe([0, -0]), [0])
    deepStrictEqual(
      Arr.dedupe([new HashCollision(1), new HashCollision(2), new HashCollision(1)]).map((value) => value.value),
      [1, 2]
    )
    const sparse = globalThis.Array<number>(2)
    sparse[1] = 1
    deepStrictEqual(Arr.dedupe(sparse), [undefined, 1])
    deepStrictEqual(Arr.dedupe(globalThis.Array(1)), [undefined])
  })

  it("dedupe does not hash a single value", () => {
    let value: unknown = null
    for (let index = 0; index < 25_000; index++) {
      value = { value }
    }
    const result = Arr.dedupe([value])
    strictEqual(result.length, 1)
    strictEqual(result[0], value)
  })

  it("dedupeAdjacent", () => {
    deepStrictEqual(Arr.dedupeAdjacent([]), [])
    deepStrictEqual(Arr.dedupeAdjacent([1, 2, 3]), [1, 2, 3])
    deepStrictEqual(Arr.dedupeAdjacent([1, 1, 2, 2, 3, 3]), [1, 2, 3])
    deepStrictEqual(Arr.dedupeAdjacent([1, 2, 1]), [1, 2, 1])
    deepStrictEqual(Arr.dedupeAdjacent([1, 1, 1]), [1])
  })

  it("group", () => {
    deepStrictEqual(Arr.group([1, 1, 2, 2, 2, 3, 1]), [[1, 1], [2, 2, 2], [3], [1]])
    deepStrictEqual(Arr.group([1]), [[1]])
    deepStrictEqual(Arr.group(["a", "a", "b"]), [["a", "a"], ["b"]])
  })

  it("union", () => {
    deepStrictEqual(Arr.union([1, 2], [2, 3]), [1, 2, 3])
    deepStrictEqual(Arr.union([], [1, 2]), [1, 2])
    deepStrictEqual(Arr.union([1, 2], []), [1, 2])
    deepStrictEqual(Arr.union([], []), [])
    deepStrictEqual(Arr.union([1, 2], [1, 2]), [1, 2])
    deepStrictEqual(pipe([1, 2], Arr.union([3, 4])), [1, 2, 3, 4])
    deepStrictEqual(
      Arr.union(
        [new HashCollision(1), new HashCollision(2)],
        [new HashCollision(1), new HashCollision(3)]
      ).map((value) => value.value),
      [1, 2, 3]
    )
  })

  it("intersection", () => {
    deepStrictEqual(Arr.intersection([1, 2, 3], [3, 4, 1]), [1, 3])
    deepStrictEqual(Arr.intersection([1, 2], [3, 4]), [])
    deepStrictEqual(Arr.intersection([1, 2], [1, 2]), [1, 2])
    deepStrictEqual(Arr.intersection([], [1, 2]), [])
    deepStrictEqual(Arr.intersection([1, 2], []), [])
    deepStrictEqual(pipe([1, 2, 3], Arr.intersection([2, 3, 4])), [2, 3])
    deepStrictEqual(Arr.intersection([1, 1, 2], [1]), [1, 1])
    deepStrictEqual(
      Arr.intersection(
        [new HashCollision(1), new HashCollision(2)],
        [new HashCollision(1)]
      ).map((value) => value.value),
      [1]
    )
  })

  it("difference", () => {
    deepStrictEqual(Arr.difference([1, 2, 3], [2, 3, 4]), [1])
    deepStrictEqual(Arr.difference([1, 2], [1, 2]), [])
    deepStrictEqual(Arr.difference([1, 2], []), [1, 2])
    deepStrictEqual(Arr.difference([], [1, 2]), [])
    deepStrictEqual(pipe([1, 2, 3], Arr.difference([3])), [1, 2])
    const sparse = globalThis.Array<number>(2)
    sparse[1] = 1
    deepStrictEqual(Arr.difference(sparse, []), [1])
    deepStrictEqual(
      Arr.difference(
        [new HashCollision(1), new HashCollision(2)],
        [new HashCollision(1)]
      ).map((value) => value.value),
      [2]
    )
  })

  it("cartesianWith", () => {
    deepStrictEqual(
      Arr.cartesianWith([1, 2], ["a", "b"], (n, s) => `${n}-${s}`),
      ["1-a", "1-b", "2-a", "2-b"]
    )
    deepStrictEqual(Arr.cartesianWith([], ["a", "b"], (n: number, s) => `${n}-${s}`), [])
    deepStrictEqual(Arr.cartesianWith([1, 2], [], (n, s: string) => `${n}-${s}`), [])
    deepStrictEqual(
      pipe([1], Arr.cartesianWith(["x"], (n, s) => `${n}${s}`)),
      ["1x"]
    )
  })

  it("cartesian", () => {
    deepStrictEqual(Arr.cartesian([1, 2], ["a", "b"]), [
      [1, "a"],
      [1, "b"],
      [2, "a"],
      [2, "b"]
    ])
    deepStrictEqual(Arr.cartesian([], ["a"]), [])
    deepStrictEqual(Arr.cartesian([1], []), [])
    deepStrictEqual(Arr.cartesian([1], ["a"]), [[1, "a"]])
    deepStrictEqual(pipe([1, 2], Arr.cartesian(["x"])), [[1, "x"], [2, "x"]])
  })

  it("makeEquivalence", () => {
    const eq = Arr.makeEquivalence(Equivalence.strictEqual<number>())
    strictEqual(eq([], []), true)
    strictEqual(eq([1, 2, 3], [1, 2, 3]), true)
    strictEqual(eq([1, 2], [1, 2, 3]), false)
    strictEqual(eq([1, 2, 3], [1, 2]), false)
    strictEqual(eq([1, 2, 3], [1, 3, 2]), false)
    strictEqual(eq([1], [2]), false)
  })

  it("getReadonlyReducerConcat", () => {
    const reducer = Arr.getReadonlyReducerConcat<number>()
    deepStrictEqual(reducer.combine([1, 2], [3, 4]), [1, 2, 3, 4])
    deepStrictEqual(reducer.combine([], [1, 2]), [1, 2])
    deepStrictEqual(reducer.combine([1, 2], []), [1, 2])
    deepStrictEqual(reducer.initialValue, [])
  })

  it("makeReducerConcat", () => {
    const reducer = Arr.makeReducerConcat<string>()
    deepStrictEqual(reducer.combine(["a"], ["b"]), ["a", "b"])
    deepStrictEqual(reducer.initialValue, [])
  })

  it("allocate", () => {
    deepStrictEqual(Arr.allocate(0).length, 0)
    deepStrictEqual(Arr.allocate(Number.NaN).length, 0)
    deepStrictEqual(Arr.allocate(-1).length, 0)
    deepStrictEqual(Arr.allocate(1.5).length, 1)
    deepStrictEqual(Arr.allocate(3).length, 3)
  })

  describe("every - edge cases", () => {
    it("returns true for empty array", () => {
      strictEqual(Arr.every([], (_n: number) => false), true)
    })
    it("with index", () => {
      strictEqual(Arr.every([0, 1, 2], (n, i) => n === i), true)
      strictEqual(Arr.every([0, 1, 3], (n, i) => n === i), false)
    })
  })

  describe("some - edge cases", () => {
    it("returns false for empty array", () => {
      strictEqual(Arr.some([], (_n: number) => true), false)
    })
    it("with index", () => {
      strictEqual(Arr.some([10, 20, 2], (n, i) => n === i), true)
      strictEqual(Arr.some([10, 20, 30], (n, i) => n === i), false)
    })
  })

  describe("copy - edge cases", () => {
    it("returns a new reference", () => {
      const original = [1, 2, 3]
      const copied = Arr.copy(original)
      deepStrictEqual(copied, original)
      strictEqual(copied !== original, true)
    })
  })

  describe("unfold - edge cases", () => {
    it("returns empty when seed produces Option.none", () => {
      deepStrictEqual(Arr.unfold(0, () => Option.none()), [])
    })
  })

  it("bindTo", () => {
    deepStrictEqual(pipe([1, 2, 3], Arr.bindTo("a")), [{ a: 1 }, { a: 2 }, { a: 3 }])
    deepStrictEqual(pipe([], Arr.bindTo("a")), [])
    deepStrictEqual(Arr.bindTo([1], "x"), [{ x: 1 }])
  })

  it("Do notation", () => {
    const _do = Arr.Do
    deepStrictEqual(_do, Arr.of({}))

    const doA = Arr.bind(_do, "a", () => ["a"])
    deepStrictEqual(doA, Arr.of({ a: "a" }))

    const doAB = Arr.bind(doA, "b", (x) => ["b", x.a + "b"])
    deepStrictEqual(doAB, [
      { a: "a", b: "b" },
      { a: "a", b: "ab" }
    ])
    const doABC = Arr.let(doAB, "c", (x) => [x.a, x.b, x.a + x.b])
    deepStrictEqual(doABC, [
      { a: "a", b: "b", c: ["a", "b", "ab"] },
      { a: "a", b: "ab", c: ["a", "ab", "aab"] }
    ])

    const doABCD = Arr.bind(doABC, "d", () => Arr.empty())
    deepStrictEqual(doABCD, [])

    const doAB__proto__C = pipe(
      Arr.let(doAB, "__proto__", (x) => [x.a, x.b, x.a + x.b]),
      Arr.let("c", (x) => [x.a, x.b, x.a + x.b])
    )
    deepStrictEqual(doAB__proto__C, [
      { a: "a", b: "b", c: ["a", "b", "ab"], ["__proto__"]: ["a", "b", "ab"] },
      { a: "a", b: "ab", c: ["a", "ab", "aab"], ["__proto__"]: ["a", "ab", "aab"] }
    ])
  })
})
