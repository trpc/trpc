import * as F from "effect/Function"
import assert from "node:assert/strict"
import { describe, it } from "vitest"

describe("Function", () => {
  describe("dual", () => {
    it("arity 2 - data-first", () => {
      const sum = F.dual<
        (that: number) => (self: number) => number,
        (self: number, that: number) => number
      >(2, (self: number, that: number) => self + that)
      assert.strictEqual(sum(2, 3), 5)
    })

    it("arity 2 - data-last", () => {
      const sum = F.dual<
        (that: number) => (self: number) => number,
        (self: number, that: number) => number
      >(2, (self: number, that: number) => self + that)
      assert.strictEqual(F.pipe(2, sum(3)), 5)
    })

    it("arity 3 - data-first", () => {
      const add3 = F.dual<
        (b: number, c: number) => (a: number) => number,
        (a: number, b: number, c: number) => number
      >(3, (a: number, b: number, c: number) => a + b + c)
      assert.strictEqual(add3(1, 2, 3), 6)
    })

    it("arity 3 - data-last", () => {
      const add3 = F.dual<
        (b: number, c: number) => (a: number) => number,
        (a: number, b: number, c: number) => number
      >(3, (a: number, b: number, c: number) => a + b + c)
      assert.strictEqual(F.pipe(1, add3(2, 3)), 6)
    })

    it("arity 4 (default branch) - data-first", () => {
      const add4 = F.dual(4, (a: number, b: number, c: number, d: number) => a + b + c + d)
      assert.strictEqual(add4(1, 2, 3, 4), 10)
    })

    it("arity 4 (default branch) - data-last", () => {
      const add4 = F.dual(4, (a: number, b: number, c: number, d: number) => a + b + c + d)
      assert.strictEqual(F.pipe(1, add4(2, 3, 4)), 10)
    })

    it("throws RangeError for arity 0", () => {
      assert.throws(() => F.dual(0 as any, () => {}), RangeError)
    })

    it("throws RangeError for arity 1", () => {
      assert.throws(() => F.dual(1 as any, (_a: any) => {}), RangeError)
    })

    it("predicate-based - data-first", () => {
      const sum = F.dual<
        (that: number) => (self: number) => number,
        (self: number, that: number) => number
      >(
        (args) => args.length === 2,
        (self: number, that: number) => self + that
      )
      assert.strictEqual(sum(2, 3), 5)
    })

    it("predicate-based - data-last", () => {
      const sum = F.dual<
        (that: number) => (self: number) => number,
        (self: number, that: number) => number
      >(
        (args) => args.length === 2,
        (self: number, that: number) => self + that
      )
      assert.strictEqual(F.pipe(2, sum(3)), 5)
    })
  })

  describe("apply", () => {
    it("applies a value to a function", () => {
      const len = (s: string) => s.length
      assert.strictEqual(F.apply("hello")(len), 5)
    })

    it("works with pipe", () => {
      const double = (n: number) => n * 2
      assert.strictEqual(F.pipe(double, F.apply(3)), 6)
    })
  })

  describe("identity", () => {
    it("returns the same value for primitives", () => {
      assert.strictEqual(F.identity(5), 5)
      assert.strictEqual(F.identity("hello"), "hello")
      assert.strictEqual(F.identity(true), true)
      assert.strictEqual(F.identity(null), null)
      assert.strictEqual(F.identity(undefined), undefined)
    })

    it("returns the same reference for objects", () => {
      const obj = { a: 1 }
      assert.strictEqual(F.identity(obj), obj)
    })
  })

  describe("satisfies", () => {
    it("returns value unchanged", () => {
      assert.strictEqual(F.satisfies<number>()(5), 5)
    })
  })

  describe("cast", () => {
    it("returns value unchanged at runtime", () => {
      assert.strictEqual(F.cast(42), 42)
    })
  })

  describe("constant", () => {
    it("returns the same value every time", () => {
      const c = F.constant(42)
      assert.strictEqual(c(), 42)
      assert.strictEqual(c(), 42)
    })

    it("returns reference-equal objects", () => {
      const obj = { a: 1 }
      const c = F.constant(obj)
      assert.strictEqual(c(), obj)
      assert.strictEqual(c() === c(), true)
    })
  })

  describe("constTrue", () => {
    it("returns true", () => {
      assert.strictEqual(F.constTrue(), true)
    })
  })

  describe("constFalse", () => {
    it("returns false", () => {
      assert.strictEqual(F.constFalse(), false)
    })
  })

  describe("constNull", () => {
    it("returns null", () => {
      assert.strictEqual(F.constNull(), null)
    })
  })

  describe("constUndefined", () => {
    it("returns undefined", () => {
      assert.strictEqual(F.constUndefined(), undefined)
    })
  })

  describe("constVoid", () => {
    it("returns undefined", () => {
      assert.strictEqual(F.constVoid(), undefined)
    })
  })

  describe("flip", () => {
    it("reverses the order of curried arguments", () => {
      const f = (a: number) => (b: string) => a - b.length
      assert.strictEqual(F.flip(f)("aaa")(2), -1)
    })
  })

  describe("compose", () => {
    const increment = (n: number) => n + 1
    const double = (n: number) => n * 2

    it("data-first: composes left-to-right", () => {
      assert.strictEqual(F.compose(increment, double)(2), 6)
    })

    it("data-last: composes with pipe", () => {
      assert.strictEqual(F.pipe(increment, F.compose(double))(2), 6)
    })
  })

  describe("absurd", () => {
    it("throws an error when called", () => {
      assert.throws(() => F.absurd(undefined as never), {
        message: "Called `absurd` function which should be uncallable"
      })
    })
  })

  describe("tupled", () => {
    it("converts a multi-arg function to accept a tuple", () => {
      const add = (a: number, b: number) => a + b
      const addTupled = F.tupled(add)
      assert.strictEqual(addTupled([1, 2]), 3)
    })
  })

  describe("untupled", () => {
    it("converts a tuple-accepting function to multi-arg", () => {
      const first = (tuple: [number, string]) => tuple[0]
      const firstUntupled = F.untupled(first)
      assert.strictEqual(firstUntupled(1, "a"), 1)
    })
  })

  describe("pipe", () => {
    it("returns value with no functions", () => {
      assert.strictEqual(F.pipe(5), 5)
    })

    it("applies one function", () => {
      assert.strictEqual(F.pipe(5, (n) => n + 1), 6)
    })

    it("applies two functions", () => {
      assert.strictEqual(F.pipe(5, (n) => n + 1, (n) => n * 2), 12)
    })

    it("applies a long chain", () => {
      assert.strictEqual(
        F.pipe(
          1,
          (n) => n + 1,
          (n) => n + 1,
          (n) => n + 1,
          (n) => n + 1,
          (n) => n + 1,
          (n) => n + 1,
          (n) => n + 1,
          (n) => n + 1,
          (n) => n + 1
        ),
        10
      )
    })

    it("transforms types through the chain", () => {
      const result = F.pipe(
        5,
        (n) => n.toString(),
        (s) => s.length
      )
      assert.strictEqual(result, 1)
    })
  })

  describe("flow", () => {
    it("single function returns it unchanged", () => {
      const f = (n: number) => n + 1
      assert.strictEqual(F.flow(f)(1), 2)
    })

    it("composes two functions", () => {
      const len = (s: string) => s.length
      const double = (n: number) => n * 2
      assert.strictEqual(F.flow(len, double)("aaa"), 6)
    })

    it("composes three functions", () => {
      assert.strictEqual(
        F.flow(
          (s: string) => s.length,
          (n) => n * 2,
          (n) => n + 1
        )("ab"),
        5
      )
    })

    it("composes up to nine functions", () => {
      const result = F.flow(
        (n: number) => n + 1,
        (n) => n + 1,
        (n) => n + 1,
        (n) => n + 1,
        (n) => n + 1,
        (n) => n + 1,
        (n) => n + 1,
        (n) => n + 1,
        (n) => n + 1
      )(0)
      assert.strictEqual(result, 9)
    })

    it("first function can accept multiple arguments", () => {
      const f = F.flow(
        (a: number, b: number) => a + b,
        (n) => n * 2
      )
      assert.strictEqual(f(1, 2), 6)
    })
  })

  describe("hole", () => {
    it("throws when called", () => {
      assert.throws(() => F.hole<string>())
    })
  })

  describe("SK", () => {
    it("returns the second argument", () => {
      assert.strictEqual(F.SK(0, "hello"), "hello")
      assert.strictEqual(F.SK("a", 42), 42)
    })
  })

  describe("memoize", () => {
    it("caches results for the same object reference", () => {
      let callCount = 0
      const f = F.memoize((obj: { n: number }) => {
        callCount++
        return obj.n * 2
      })
      const key = { n: 5 }
      assert.strictEqual(f(key), 10)
      assert.strictEqual(f(key), 10)
      assert.strictEqual(callCount, 1)
    })

    it("recomputes for different object references", () => {
      let callCount = 0
      const f = F.memoize((obj: { n: number }) => {
        callCount++
        return obj.n * 2
      })
      assert.strictEqual(f({ n: 5 }), 10)
      assert.strictEqual(f({ n: 5 }), 10)
      assert.strictEqual(callCount, 2)
    })
  })

  describe("memoizeIdempotent", () => {
    it("caches the output as a fixed point", () => {
      let callCount = 0
      const input = { id: "input" }
      const output = { id: "output" }
      const f = F.memoizeIdempotent((obj: { id: string }) => {
        callCount++
        return obj === input ? output : obj
      })

      assert.strictEqual(f(input), output)
      assert.strictEqual(f(output), output)
      assert.strictEqual(callCount, 1)
    })

    it("caches an input that is already a fixed point", () => {
      let callCount = 0
      const f = F.memoizeIdempotent((obj: object) => {
        callCount++
        return obj
      })
      const input = {}

      assert.strictEqual(f(input), input)
      assert.strictEqual(f(input), input)
      assert.strictEqual(callCount, 1)
    })
  })
})
