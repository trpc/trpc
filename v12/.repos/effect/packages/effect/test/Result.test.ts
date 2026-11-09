import { Chunk, Equal, Equivalence, flow, identity, Option, pipe, Result, String as Str } from "effect"
import { inspect } from "node:util"
import { describe, it } from "vitest"
import {
  assertFailure,
  assertFalse,
  assertNone,
  assertSome,
  assertSuccess,
  assertTrue,
  deepStrictEqual,
  strictEqual,
  throws
} from "./utils/assert.ts"

describe("Result", () => {
  describe("Constructors", () => {
    it("succeed creates a Success value", () => {
      const result = Result.succeed(42)
      assertTrue(Result.isSuccess(result))
      strictEqual(result.success, 42)
    })

    it("fail creates a Failure value", () => {
      const result = Result.fail("err")
      assertTrue(Result.isFailure(result))
      strictEqual(result.failure, "err")
    })

    it("void", () => {
      deepStrictEqual(Result.void, Result.succeed(undefined))
    })

    it("try", () => {
      deepStrictEqual(Result.try(() => 1), Result.succeed(1))
      deepStrictEqual(
        Result.try(() => {
          throw "b"
        }),
        Result.fail("b")
      )
      deepStrictEqual(Result.try({ try: () => 1, catch: (e) => new Error(String(e)) }), Result.succeed(1))
      deepStrictEqual(
        Result.try({
          try: () => {
            throw "b"
          },
          catch: (e) => new Error(String(e))
        }),
        Result.fail(new Error("b"))
      )
    })

    it("fromNullishOr", () => {
      deepStrictEqual(Result.fromNullishOr(null, () => "fallback"), Result.fail("fallback"))
      deepStrictEqual(Result.fromNullishOr(undefined, () => "fallback"), Result.fail("fallback"))
      deepStrictEqual(Result.fromNullishOr(1, () => "fallback"), Result.succeed(1))
      // data-last
      deepStrictEqual(pipe(null as string | null, Result.fromNullishOr(() => "fallback")), Result.fail("fallback"))
      deepStrictEqual(pipe(1 as number | null, Result.fromNullishOr(() => "fallback")), Result.succeed(1))
    })

    it("fromOption", () => {
      deepStrictEqual(Result.fromOption(Option.none(), () => "none"), Result.fail("none"))
      deepStrictEqual(Result.fromOption(Option.some(1), () => "none"), Result.succeed(1))
      // data-last
      deepStrictEqual(pipe(Option.none(), Result.fromOption(() => "none")), Result.fail("none"))
      deepStrictEqual(pipe(Option.some(1), Result.fromOption(() => "none")), Result.succeed(1))
    })

    it("succeedNone", () => {
      deepStrictEqual(Result.succeedNone, Result.succeed(Option.none()))
    })

    it("succeedSome", () => {
      deepStrictEqual(Result.succeedSome(1), Result.succeed(Option.some(1)))
    })
  })

  describe("Methods", () => {
    it("toString", () => {
      strictEqual(
        String(Result.succeed(1)),
        `success(1)`
      )
      strictEqual(
        String(Result.fail("e")),
        `failure("e")`
      )
      strictEqual(
        String(Result.succeed(Chunk.make(1, 2, 3))),
        `success(Chunk([1,2,3]))`
      )
      strictEqual(
        String(Result.fail(Chunk.make(1, 2, 3))),
        `failure(Chunk([1,2,3]))`
      )
      strictEqual(
        String(Result.succeed(Option.some(1))),
        `success(some(1))`
      )
      strictEqual(
        String(Result.fail(Option.none())),
        `failure(none())`
      )
    })

    it("toJSON", () => {
      deepStrictEqual(Result.succeed(1).toJSON(), { _id: "Result", _tag: "Success", value: 1 })
      deepStrictEqual(Result.fail("e").toJSON(), { _id: "Result", _tag: "Failure", failure: "e" })
    })

    it("inspect", () => {
      deepStrictEqual(inspect(Result.succeed(1)), inspect({ _id: "Result", _tag: "Success", value: 1 }))
      deepStrictEqual(inspect(Result.fail("e")), inspect({ _id: "Result", _tag: "Failure", failure: "e" }))
    })

    it("Equal trait compares matching tags and values", () => {
      assertTrue(Equal.equals(Result.succeed(1), Result.succeed(1)))
      assertTrue(Equal.equals(Result.fail("e"), Result.fail("e")))
      assertFalse(Equal.equals(Result.succeed(1), Result.fail("e")))
      assertFalse(Equal.equals(Result.fail("e"), Result.succeed(1)))
    })

    it("pipe composes Result operations", () => {
      assertSuccess(Result.succeed(1).pipe(Result.map((n) => n + 1)), 2)
    })
  })

  describe("Type Guards", () => {
    it("isResult", () => {
      assertTrue(pipe(Result.succeed(1), Result.isResult))
      assertTrue(pipe(Result.fail("e"), Result.isResult))
      assertFalse(pipe(Option.some(1), Result.isResult))
    })

    it("isFailure", () => {
      assertFalse(Result.isFailure(Result.succeed(1)))
      assertTrue(Result.isFailure(Result.fail(1)))
    })

    it("isSuccess", () => {
      assertTrue(Result.isSuccess(Result.succeed(1)))
      assertFalse(Result.isSuccess(Result.fail(1)))
    })
  })

  describe("Getters", () => {
    it("getSuccess", () => {
      assertSome(pipe(Result.succeed(1), Result.getSuccess), 1)
      assertNone(pipe(Result.fail("a"), Result.getSuccess))
    })

    it("getFailure", () => {
      assertNone(pipe(Result.succeed(1), Result.getFailure))
      assertSome(pipe(Result.fail("e"), Result.getFailure), "e")
    })

    it("getOrElse", () => {
      strictEqual(Result.getOrElse(Result.succeed(1), (error) => error + "!"), 1)
      strictEqual(Result.getOrElse(Result.fail("not a number"), (error) => error + "!"), "not a number!")
      // data-last
      strictEqual(pipe(Result.succeed(1), Result.getOrElse((error) => error + "!")), 1)
      strictEqual(pipe(Result.fail("not a number"), Result.getOrElse((error) => error + "!")), "not a number!")
    })

    it("getOrNull", () => {
      strictEqual(Result.getOrNull(Result.succeed(1)), 1)
      strictEqual(Result.getOrNull(Result.fail("a")), null)
    })

    it("getOrUndefined", () => {
      strictEqual(Result.getOrUndefined(Result.succeed(1)), 1)
      strictEqual(Result.getOrUndefined(Result.fail("a")), undefined)
    })

    it("getOrThrowWith", () => {
      strictEqual(pipe(Result.succeed(1), Result.getOrThrowWith((e) => new Error(`Unexpected Err: ${e}`))), 1)
      throws(() => pipe(Result.fail("e"), Result.getOrThrowWith((e) => new Error(`Unexpected Err: ${e}`))))
      // data-first
      strictEqual(Result.getOrThrowWith(Result.succeed(1), (e) => new Error(`Unexpected Err: ${e}`)), 1)
      throws(() => Result.getOrThrowWith(Result.fail("e"), (e) => new Error(`Unexpected Err: ${e}`)))
    })

    it("getOrThrow", () => {
      strictEqual(pipe(Result.succeed(1), Result.getOrThrow), 1)
      throws(() => pipe(Result.fail(new Error("e")), Result.getOrThrow), new Error("e"))
    })

    it("merge", () => {
      deepStrictEqual(Result.merge(Result.succeed(1)), 1)
      deepStrictEqual(Result.merge(Result.fail("a")), "a")
    })
  })

  describe("Mapping", () => {
    it("map", () => {
      const f = Result.map(Str.length)
      const failure = Result.fail("s")
      assertSuccess(pipe(Result.succeed("abc"), f), 3)
      strictEqual(pipe(failure, f), failure)
      // data-first
      assertSuccess(Result.map(Result.succeed("abc"), Str.length), 3)
      strictEqual(Result.map(failure, Str.length), failure)
    })

    it("mapBoth", () => {
      const f = Result.mapBoth({
        onFailure: Str.length,
        onSuccess: (n: number) => n > 2
      })
      assertSuccess(pipe(Result.succeed(1), f), false)
      assertFailure(pipe(Result.fail("a"), f), 1)
      // data-first
      assertSuccess(
        Result.mapBoth(Result.succeed(1), {
          onFailure: Str.length,
          onSuccess: (n: number) => n > 2
        }),
        false
      )
      assertFailure(
        Result.mapBoth(Result.fail("a"), {
          onFailure: Str.length,
          onSuccess: (n: number) => n > 2
        }),
        1
      )
    })

    it("mapError", () => {
      const f = Result.mapError((n: number) => n * 2)
      const success = Result.succeed("a")
      strictEqual(pipe(success, f), success)
      assertFailure(pipe(Result.fail(1), f), 2)
      // data-first
      strictEqual(Result.mapError(success, (n: number) => n * 2), success)
      assertFailure(Result.mapError(Result.fail(1), (n) => n * 2), 2)
    })

    it("tap", () => {
      let sideEffect = 0
      const success = pipe(
        Result.succeed(42),
        Result.tap((n) => {
          sideEffect = n
        })
      )
      assertSuccess(success, 42)
      strictEqual(sideEffect, 42)

      // failure path: side effect should not run
      let failureSideEffect = 0
      const failure = pipe(
        Result.fail("err") as Result.Result<number, string>,
        Result.tap((n) => {
          failureSideEffect = n
        })
      )
      assertFailure(failure, "err")
      strictEqual(failureSideEffect, 0)

      // data-first
      let sideEffect2 = 0
      const success2 = Result.tap(Result.succeed(10), (n) => {
        sideEffect2 = n
      })
      assertSuccess(success2, 10)
      strictEqual(sideEffect2, 10)
    })
  })

  describe("Pattern Matching", () => {
    it("match handles failure and success cases", () => {
      const onFailure = (s: string) => `failure${s.length}`
      const onSuccess = (s: string) => `success${s.length}`
      const match = Result.match({ onFailure, onSuccess })
      strictEqual(match(Result.fail("abc")), "failure3")
      strictEqual(match(Result.succeed("abc")), "success3")
      // data-first
      strictEqual(Result.match(Result.fail("abc"), { onFailure, onSuccess }), "failure3")
      strictEqual(Result.match(Result.succeed("abc"), { onFailure, onSuccess }), "success3")
    })
  })

  describe("Utils", () => {
    it("flip", () => {
      assertFailure(Result.flip(Result.succeed("a")), "a")
      assertSuccess(Result.flip(Result.fail("b")), "b")
    })

    it("liftPredicate", () => {
      const isPositivePredicate = (n: number) => n > 0
      const onPositivePredicateError = (n: number) => `${n} is not positive`
      const isNumberRefinement = (n: string | number): n is number => typeof n === "number"
      const onNumberRefinementError = (n: string | number) => `${n} is not a number`

      assertSuccess(
        pipe(1, Result.liftPredicate(isPositivePredicate, onPositivePredicateError)),
        1
      )
      assertFailure(
        pipe(-1, Result.liftPredicate(isPositivePredicate, onPositivePredicateError)),
        "-1 is not positive"
      )
      assertSuccess(
        pipe(1, Result.liftPredicate(isNumberRefinement, onNumberRefinementError)),
        1
      )
      assertFailure(
        pipe("string", Result.liftPredicate(isNumberRefinement, onNumberRefinementError)),
        "string is not a number"
      )

      assertSuccess(
        Result.liftPredicate(1, isPositivePredicate, onPositivePredicateError),
        1
      )
      assertFailure(
        Result.liftPredicate(-1, isPositivePredicate, onPositivePredicateError),
        "-1 is not positive"
      )
      assertSuccess(
        Result.liftPredicate(1, isNumberRefinement, onNumberRefinementError),
        1
      )
      assertFailure(
        Result.liftPredicate("string", isNumberRefinement, onNumberRefinementError),
        "string is not a number"
      )
    })
  })

  describe("Filtering", () => {
    it("filterOrFail", () => {
      deepStrictEqual(Result.filterOrFail(Result.succeed(1), (n) => n > 0, () => "a"), Result.succeed(1))
      deepStrictEqual(Result.filterOrFail(Result.succeed(1), (n) => n > 1, () => "a"), Result.fail("a"))
      deepStrictEqual(Result.filterOrFail(Result.fail(1), (n) => n > 0, () => "a"), Result.fail(1))

      deepStrictEqual(Result.succeed(1).pipe(Result.filterOrFail((n) => n > 0, () => "a")), Result.succeed(1))
      deepStrictEqual(Result.succeed(1).pipe(Result.filterOrFail((n) => n > 1, () => "a")), Result.fail("a"))
      deepStrictEqual(Result.fail(1).pipe(Result.filterOrFail((n) => n > 0, () => "a")), Result.fail(1))
    })
  })

  describe("Equivalence", () => {
    it("makeEquivalence compares successes and failures by channel", () => {
      const isEquivalent = Result.makeEquivalence(
        Equivalence.strictEqual<number>(),
        Equivalence.strictEqual<string>()
      )
      deepStrictEqual(isEquivalent(Result.succeed(1), Result.succeed(1)), true)
      deepStrictEqual(isEquivalent(Result.succeed(1), Result.succeed(2)), false)
      deepStrictEqual(isEquivalent(Result.succeed(1), Result.fail("foo")), false)
      deepStrictEqual(isEquivalent(Result.fail("foo"), Result.fail("foo")), true)
      deepStrictEqual(isEquivalent(Result.fail("foo"), Result.fail("bar")), false)
      deepStrictEqual(isEquivalent(Result.fail("foo"), Result.succeed(1)), false)
    })
  })

  describe("Sequencing", () => {
    it("flatMap", () => {
      const f = Result.flatMap(flow(Str.length, Result.succeed))
      assertSuccess(pipe(Result.succeed("abc"), f), 3)
      assertFailure(pipe(Result.fail("maError"), f), "maError")
      // data-first
      assertSuccess(Result.flatMap(Result.succeed("abc"), flow(Str.length, Result.succeed)), 3)
      assertFailure(Result.flatMap(Result.fail("maError"), flow(Str.length, Result.succeed)), "maError")
    })

    it("andThen replaces successes with Result or plain values", () => {
      assertSuccess(pipe(Result.succeed(1), Result.andThen(() => Result.succeed(2))), 2)
      assertSuccess(pipe(Result.succeed(1), Result.andThen(Result.succeed(2))), 2)
      assertSuccess(pipe(Result.succeed(1), Result.andThen(2)), 2)
      assertSuccess(pipe(Result.succeed(1), Result.andThen(() => 2)), 2)
      assertSuccess(pipe(Result.succeed(1), Result.andThen((a) => a)), 1)
      assertSuccess(Result.andThen(Result.succeed(1), () => Result.succeed(2)), 2)
      assertSuccess(Result.andThen(Result.succeed(1), Result.succeed(2)), 2)
      assertSuccess(Result.andThen(Result.succeed(1), () => 2), 2)
      assertSuccess(Result.andThen(Result.succeed(1), 2), 2)
      assertSuccess(Result.andThen(Result.succeed(1), (a) => a), 1)
    })

    it("all", () => {
      // tuples and arrays
      assertSuccess(Result.all([]), [])
      assertSuccess(Result.all([Result.succeed(1)]), [1])
      assertSuccess(Result.all([Result.succeed(1), Result.succeed(true)]), [1, true])
      assertFailure(Result.all([Result.succeed(1), Result.fail("e")]), "e")
      // structs and records
      assertSuccess(Result.all({}), {})
      assertSuccess(Result.all({ a: Result.succeed(1) }), { a: 1 })
      assertSuccess(Result.all({ a: Result.succeed(1), b: Result.succeed(true) }), { a: 1, b: true })
      assertFailure(Result.all({ a: Result.succeed(1), b: Result.fail("e") }), "e")
      // iterables
      const iterable = function*() {
        yield Result.succeed(1)
        yield Result.succeed(2)
        yield Result.succeed(3)
      }
      assertSuccess(Result.all(iterable()), [1, 2, 3])

      const iterableWithFailure = function*() {
        yield Result.succeed(1)
        yield Result.fail("e")
        yield Result.succeed(3)
      }
      assertFailure(Result.all(iterableWithFailure()), "e")
    })
  })

  describe("Error Handling", () => {
    it("orElse recovers failures and preserves successes", () => {
      assertSuccess(pipe(Result.succeed(1), Result.orElse(() => Result.succeed(2))), 1)
      assertSuccess(pipe(Result.succeed(1), Result.orElse(() => Result.fail("b"))), 1)
      assertSuccess(pipe(Result.fail("a"), Result.orElse(() => Result.succeed(2))), 2)
      assertFailure(pipe(Result.fail("a"), Result.orElse(() => Result.fail("b"))), "b")
      // data-first
      assertSuccess(Result.orElse(Result.succeed(1), () => Result.succeed(2)), 1)
      assertSuccess(Result.orElse(Result.fail("a"), () => Result.succeed(2)), 2)
      assertFailure(Result.orElse(Result.fail("a"), () => Result.fail("b")), "b")
    })
  })

  describe("Do Notation", () => {
    it("Do", () => {
      assertSuccess(Result.Do, {})
    })

    it("bindTo", () => {
      assertSuccess(pipe(Result.succeed(1), Result.bindTo("a")), { a: 1 })
      assertFailure(pipe(Result.fail("left"), Result.bindTo("a")), "left")

      assertSuccess(pipe(Result.succeed(1), Result.bindTo("__proto__")), { ["__proto__"]: 1 })
    })

    it("bind", () => {
      assertSuccess(pipe(Result.succeed(1), Result.bindTo("a"), Result.bind("b", ({ a }) => Result.succeed(a + 1))), {
        a: 1,
        b: 2
      })
      assertFailure(
        pipe(Result.succeed(1), Result.bindTo("a"), Result.bind("b", () => Result.fail("left"))),
        "left"
      )
      assertFailure(
        pipe(Result.fail("left"), Result.bindTo("a"), Result.bind("b", () => Result.succeed(2))),
        "left"
      )
      assertSuccess(pipe(Result.Do, Result.bind("__proto__", () => Result.succeed(1))), { ["__proto__"]: 1 })
    })

    it("let", () => {
      assertSuccess(pipe(Result.succeed(1), Result.bindTo("a"), Result.let("b", ({ a }) => a + 1)), { a: 1, b: 2 })
      assertFailure(
        pipe(Result.fail("left"), Result.bindTo("a"), Result.let("b", () => 2)),
        "left"
      )
      assertSuccess(pipe(Result.Do, Result.let("__proto__", () => 1)), { ["__proto__"]: 1 })
    })
  })

  describe("Generators", () => {
    it("gen", () => {
      const a = Result.gen(function*() {
        const x = yield* Result.succeed(1)
        const y = yield* Result.succeed(2)
        return x + y
      })
      const b = Result.gen(function*() {
        return 10
      })
      const c = Result.gen(function*() {
        yield* Result.succeed(1)
        yield* Result.succeed(2)
      })
      const d = Result.gen(function*() {
        yield* Result.succeed(1)
        return yield* Result.succeed(2)
      })
      const e = Result.gen(function*() {
        yield* Result.succeed(1)
        yield* Result.fail("err")
        return yield* Result.succeed(2)
      })
      const f = Result.gen(function*() {
        yield* Result.fail("err")
      })
      const g = Result.gen({ context: "testContext" as const }, function*() {
        return yield* Result.succeed(this.context)
      })

      assertSuccess(a, 3)
      assertSuccess(b, 10)
      assertSuccess(c, undefined)
      assertSuccess(d, 2)
      assertFailure(e, "err")
      assertFailure(f, "err")
      assertSuccess(g, "testContext")
    })
  })

  describe("Transposing", () => {
    it("transposeOption", () => {
      assertSuccess(Result.transposeOption(Option.some(Result.succeed(1))), Option.some(1))
      assertSuccess(Result.transposeOption(Option.none()), Option.none())
      assertFailure(Result.transposeOption(Option.some(Result.fail("e"))), "e")
    })

    it("transposeMapOption", () => {
      assertSuccess(Result.transposeMapOption(Option.some(Result.succeed(1)), identity), Option.some(1))
      assertSuccess(Result.transposeMapOption(Option.none(), identity), Option.none())
      assertFailure(Result.transposeMapOption(Option.some(Result.fail("e")), identity), "e")
      // data-last
      assertSuccess(pipe(Option.some(1), Result.transposeMapOption(Result.succeed)), Option.some(1))
      assertSuccess(pipe(Option.none<number>(), Result.transposeMapOption(Result.succeed)), Option.none())
    })
  })
})
