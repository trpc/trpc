import { describe, expect, it } from "@effect/vitest"
import { Cause, Equal, Hash, Option } from "effect"
import { AsyncResult } from "effect/reactivity"

describe("AsyncResult", () => {
  it("waiting dispatches with optional options", () => {
    const result = AsyncResult.success(1)

    expect(AsyncResult.waiting(result).waiting).toBe(true)
    expect(AsyncResult.waiting(result, { touch: false }).waiting).toBe(true)
    expect(AsyncResult.waiting()(result).waiting).toBe(true)
    expect(AsyncResult.waiting({ touch: false })(result).waiting).toBe(true)
  })

  it("is not equal to an unrelated Equal value with the same tag and hash", () => {
    const result = AsyncResult.initial()
    const lookalike = {
      _tag: "Initial",
      waiting: false,
      [Equal.symbol]: () => false,
      [Hash.symbol]: () => Hash.hash(result)
    }

    expect(Equal.equals(result, lookalike)).toBe(false)
  })

  describe("all", () => {
    const cause = Cause.fail("offline")
    const refetchFailed = AsyncResult.failure<number, string>(cause, {
      previousSuccess: Option.some(AsyncResult.success(1)),
      waiting: true
    })

    it("rebuilds a failed input's previous success in the combined record shape", () => {
      const result = AsyncResult.all({
        a: refetchFailed,
        b: AsyncResult.success("x"),
        c: 2,
        d: AsyncResult.failure(Cause.fail("later"), { previousSuccess: Option.some(AsyncResult.success(3)) })
      })

      expect(AsyncResult.isFailure(result) && result.cause).toEqual(cause)
      expect(result.waiting).toBe(true)
      expect(AsyncResult.value(result)).toEqual(Option.some({ a: 1, b: "x", c: 2, d: 3 }))
    })

    it("rebuilds a failed input's previous success in the combined tuple shape", () => {
      const result = AsyncResult.all([AsyncResult.success("x"), refetchFailed])

      expect(AsyncResult.value(result)).toEqual(Option.some(["x", 1]))
    })

    it("drops the previous success when another input has no value", () => {
      const result = AsyncResult.all({ a: refetchFailed, b: AsyncResult.initial() })

      expect(AsyncResult.isFailure(result) && result.cause).toEqual(cause)
      expect(result.waiting).toBe(true)
      expect(AsyncResult.value(result)).toEqual(Option.none())
    })
  })

  describe("builder", () => {
    it("onDefect handles defects", () => {
      const defect = new Error("boom")
      const result = AsyncResult.failure<number, string>(Cause.die(defect))

      const handled = AsyncResult.builder(result)
        .onDefect((received) => received)
        .orElse(() => null)

      expect(handled).toBe(defect)
    })

    it("onDefect does not handle typed errors", () => {
      const handled = AsyncResult.builder(AsyncResult.fail("error"))
        .onDefect(() => "defect")
        .orElse(() => "fallback")

      expect(handled).toEqual("fallback")
    })

    it("exhaustive returns output when typed errors are handled", () => {
      const handled = AsyncResult.builder(
        AsyncResult.fail<{ readonly _tag: "NotFoundError"; readonly resource: string }>({
          _tag: "NotFoundError",
          resource: "user"
        })
      )
        .onErrorTag("NotFoundError", (error) => `missing:${error.resource}`)
        .onDefect(() => "failure")
        .onInterrupt(() => "interrupt")
        .exhaustive()

      expect(handled).toEqual("missing:user")
    })
  })
})
