import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, Fiber, Option, Result, TxDeferred } from "effect"

describe("TxDeferred", () => {
  describe("constructors", () => {
    it.effect("make creates a deferred that polls as None", () =>
      Effect.tx(Effect.gen(function*() {
        const deferred = yield* TxDeferred.make<number>()
        const state = yield* TxDeferred.poll(deferred)
        assert.isTrue(Option.isNone(state))
      })))
  })

  describe("getters", () => {
    it.effect("poll returns None on fresh deferred", () =>
      Effect.tx(Effect.gen(function*() {
        const deferred = yield* TxDeferred.make<string>()
        const state = yield* TxDeferred.poll(deferred)
        assert.isTrue(Option.isNone(state))
      })))

    it.effect("poll returns Some(Success(value)) after succeed", () =>
      Effect.tx(Effect.gen(function*() {
        const deferred = yield* TxDeferred.make<number>()
        yield* TxDeferred.succeed(deferred, 42)
        const state = yield* TxDeferred.poll(deferred)
        assert.isTrue(Option.isSome(state))
        if (Option.isSome(state)) {
          assert.isTrue(Result.isSuccess(state.value))
          if (Result.isSuccess(state.value)) {
            assert.strictEqual(state.value.success, 42)
          }
        }
      })))

    it.effect("poll returns Some(Failure(error)) after fail", () =>
      Effect.tx(Effect.gen(function*() {
        const deferred = yield* TxDeferred.make<number, string>()
        yield* TxDeferred.fail(deferred, "boom")
        const state = yield* TxDeferred.poll(deferred)
        assert.isTrue(Option.isSome(state))
        if (Option.isSome(state)) {
          assert.isTrue(Result.isFailure(state.value))
          if (Result.isFailure(state.value)) {
            assert.strictEqual(state.value.failure, "boom")
          }
        }
      })))

    it.effect("await returns value after succeed", () =>
      Effect.tx(Effect.gen(function*() {
        const deferred = yield* TxDeferred.make<number>()
        yield* TxDeferred.succeed(deferred, 42)
        const value = yield* TxDeferred.await(deferred)
        assert.strictEqual(value, 42)
      })))

    it.effect("await fails with error after fail", () =>
      Effect.tx(Effect.gen(function*() {
        const deferred = yield* TxDeferred.make<number, string>()
        yield* TxDeferred.fail(deferred, "boom")
        const exit = yield* Effect.exit(TxDeferred.await(deferred))
        assert.isTrue(Exit.isFailure(exit))
      })))

    it.effect("await retries until completed", () =>
      Effect.tx(Effect.gen(function*() {
        const deferred = yield* TxDeferred.make<number>()
        const fiber = yield* Effect.forkChild(TxDeferred.await(deferred))
        yield* TxDeferred.succeed(deferred, 99)
        const value = yield* Fiber.join(fiber)
        assert.strictEqual(value, 99)
      })))
  })

  describe("mutations", () => {
    it.effect("succeed returns true on fresh deferred", () =>
      Effect.tx(Effect.gen(function*() {
        const deferred = yield* TxDeferred.make<number>()
        const result = yield* TxDeferred.succeed(deferred, 42)
        assert.isTrue(result)
      })))

    it.effect("succeed returns false if already completed", () =>
      Effect.tx(Effect.gen(function*() {
        const deferred = yield* TxDeferred.make<number>()
        yield* TxDeferred.succeed(deferred, 42)
        const result = yield* TxDeferred.succeed(deferred, 99)
        assert.isFalse(result)
      })))

    it.effect("fail returns true on fresh deferred", () =>
      Effect.tx(Effect.gen(function*() {
        const deferred = yield* TxDeferred.make<number, string>()
        const result = yield* TxDeferred.fail(deferred, "error")
        assert.isTrue(result)
      })))

    it.effect("fail returns false if already completed", () =>
      Effect.tx(Effect.gen(function*() {
        const deferred = yield* TxDeferred.make<number, string>()
        yield* TxDeferred.succeed(deferred, 42)
        const result = yield* TxDeferred.fail(deferred, "error")
        assert.isFalse(result)
      })))

    it.effect("done with Result.succeed behaves like succeed", () =>
      Effect.tx(Effect.gen(function*() {
        const deferred = yield* TxDeferred.make<number>()
        const result = yield* TxDeferred.done(deferred, Result.succeed(42))
        assert.isTrue(result)
        const value = yield* TxDeferred.await(deferred)
        assert.strictEqual(value, 42)
      })))

    it.effect("done with Result.fail behaves like fail", () =>
      Effect.tx(Effect.gen(function*() {
        const deferred = yield* TxDeferred.make<number, string>()
        const result = yield* TxDeferred.done(deferred, Result.fail("error"))
        assert.isTrue(result)
        const exit = yield* Effect.exit(TxDeferred.await(deferred))
        assert.isTrue(Exit.isFailure(exit))
      })))
  })

  describe("guards", () => {
    it.effect("isTxDeferred returns true for deferred, false for others", () =>
      Effect.tx(Effect.gen(function*() {
        const deferred = yield* TxDeferred.make<number>()
        assert.isTrue(TxDeferred.isTxDeferred(deferred))
        assert.isFalse(TxDeferred.isTxDeferred({ some: "object" }))
        assert.isFalse(TxDeferred.isTxDeferred(null))
        assert.isFalse(TxDeferred.isTxDeferred(undefined))
        assert.isFalse(TxDeferred.isTxDeferred([1]))
      })))
  })

  describe("transactional behavior", () => {
    it.effect("await observes completion made earlier in the same transaction", () =>
      Effect.gen(function*() {
        const deferred = yield* TxDeferred.make<number>()
        const value = yield* Effect.tx(
          Effect.gen(function*() {
            yield* TxDeferred.succeed(deferred, 42)
            return yield* TxDeferred.await(deferred)
          })
        )
        assert.strictEqual(value, 42)
      }))

    it.effect("two deferreds modified atomically", () =>
      Effect.gen(function*() {
        const d1 = yield* TxDeferred.make<number>()
        const d2 = yield* TxDeferred.make<string>()
        yield* Effect.tx(
          Effect.gen(function*() {
            yield* TxDeferred.succeed(d1, 42)
            yield* TxDeferred.succeed(d2, "hello")
          })
        )
        const v1 = yield* TxDeferred.await(d1)
        const v2 = yield* TxDeferred.await(d2)
        assert.strictEqual(v1, 42)
        assert.strictEqual(v2, "hello")
      }))
  })

  describe("concurrency", () => {
    it.effect("multiple fibers awaiting same deferred all unblock", () =>
      Effect.tx(Effect.gen(function*() {
        const deferred = yield* TxDeferred.make<number>()
        const f1 = yield* Effect.forkChild(TxDeferred.await(deferred))
        const f2 = yield* Effect.forkChild(TxDeferred.await(deferred))
        const f3 = yield* Effect.forkChild(TxDeferred.await(deferred))
        yield* TxDeferred.succeed(deferred, 42)
        const [v1, v2, v3] = yield* Effect.all([
          Fiber.join(f1),
          Fiber.join(f2),
          Fiber.join(f3)
        ])
        assert.strictEqual(v1, 42)
        assert.strictEqual(v2, 42)
        assert.strictEqual(v3, 42)
      })))

    it.effect("race between succeed and fail: only first wins", () =>
      Effect.tx(Effect.gen(function*() {
        const deferred = yield* TxDeferred.make<number, string>()
        const first = yield* TxDeferred.succeed(deferred, 42)
        const second = yield* TxDeferred.fail(deferred, "error")
        assert.isTrue(first)
        assert.isFalse(second)
        const value = yield* TxDeferred.await(deferred)
        assert.strictEqual(value, 42)
      })))
  })
})
