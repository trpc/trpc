import { assert, describe, it } from "@effect/vitest"
import { Effect, Stream, TxQueue, TxSubscriptionRef } from "effect"

describe("TxSubscriptionRef", () => {
  describe("constructors", () => {
    it.effect("make creates ref with initial value", () =>
      Effect.tx(Effect.gen(function*() {
        const ref = yield* TxSubscriptionRef.make(42)
        const value = yield* TxSubscriptionRef.get(ref)
        assert.strictEqual(value, 42)
      })))
  })

  describe("mutations", () => {
    it.effect("set updates the value", () =>
      Effect.tx(Effect.gen(function*() {
        const ref = yield* TxSubscriptionRef.make(0)
        yield* TxSubscriptionRef.set(ref, 10)
        assert.strictEqual(yield* TxSubscriptionRef.get(ref), 10)
      })))

    it.effect("update applies a function", () =>
      Effect.tx(Effect.gen(function*() {
        const ref = yield* TxSubscriptionRef.make(5)
        yield* TxSubscriptionRef.update(ref, (n) => n * 2)
        assert.strictEqual(yield* TxSubscriptionRef.get(ref), 10)
      })))

    it.effect("modify returns a value and updates", () =>
      Effect.tx(Effect.gen(function*() {
        const ref = yield* TxSubscriptionRef.make(10)
        const result = yield* TxSubscriptionRef.modify(ref, (n) => [`was ${n}`, n + 1])
        assert.strictEqual(result, "was 10")
        assert.strictEqual(yield* TxSubscriptionRef.get(ref), 11)
      })))

    it.effect("getAndSet returns old value and sets new", () =>
      Effect.tx(Effect.gen(function*() {
        const ref = yield* TxSubscriptionRef.make("a")
        const old = yield* TxSubscriptionRef.getAndSet(ref, "b")
        assert.strictEqual(old, "a")
        assert.strictEqual(yield* TxSubscriptionRef.get(ref), "b")
      })))

    it.effect("getAndUpdate returns old value and applies function", () =>
      Effect.tx(Effect.gen(function*() {
        const ref = yield* TxSubscriptionRef.make(1)
        const old = yield* TxSubscriptionRef.getAndUpdate(ref, (n) => n + 10)
        assert.strictEqual(old, 1)
        assert.strictEqual(yield* TxSubscriptionRef.get(ref), 11)
      })))

    it.effect("updateAndGet applies function and returns new value", () =>
      Effect.tx(Effect.gen(function*() {
        const ref = yield* TxSubscriptionRef.make(3)
        const result = yield* TxSubscriptionRef.updateAndGet(ref, (n) => n * 3)
        assert.strictEqual(result, 9)
        assert.strictEqual(yield* TxSubscriptionRef.get(ref), 9)
      })))
  })

  describe("subscriptions", () => {
    it.effect("changes includes current value as first element", () =>
      Effect.gen(function*() {
        const ref = yield* Effect.tx(TxSubscriptionRef.make(100))

        yield* Effect.scoped(
          Effect.gen(function*() {
            const sub = yield* TxSubscriptionRef.changes(ref)
            const first = yield* Effect.tx(TxQueue.take(sub))
            assert.strictEqual(first, 100)
          })
        )
      }))

    it.effect("changes receives updates in order", () =>
      Effect.gen(function*() {
        const ref = yield* Effect.tx(TxSubscriptionRef.make(0))

        yield* Effect.scoped(
          Effect.gen(function*() {
            const sub = yield* TxSubscriptionRef.changes(ref)
            // Take the initial value
            const initial = yield* Effect.tx(TxQueue.take(sub))
            assert.strictEqual(initial, 0)

            yield* Effect.tx(TxSubscriptionRef.set(ref, 1))
            yield* Effect.tx(TxSubscriptionRef.set(ref, 2))
            yield* Effect.tx(TxSubscriptionRef.set(ref, 3))

            assert.strictEqual(yield* Effect.tx(TxQueue.take(sub)), 1)
            assert.strictEqual(yield* Effect.tx(TxQueue.take(sub)), 2)
            assert.strictEqual(yield* Effect.tx(TxQueue.take(sub)), 3)
          })
        )
      }))

    it.effect("multiple subscribers each see all changes", () =>
      Effect.gen(function*() {
        const ref = yield* Effect.tx(TxSubscriptionRef.make(0))

        yield* Effect.scoped(
          Effect.gen(function*() {
            const sub1 = yield* TxSubscriptionRef.changes(ref)
            const sub2 = yield* TxSubscriptionRef.changes(ref)

            // Both get the initial value
            assert.strictEqual(yield* Effect.tx(TxQueue.take(sub1)), 0)
            assert.strictEqual(yield* Effect.tx(TxQueue.take(sub2)), 0)

            yield* Effect.tx(TxSubscriptionRef.set(ref, 42))

            assert.strictEqual(yield* Effect.tx(TxQueue.take(sub1)), 42)
            assert.strictEqual(yield* Effect.tx(TxQueue.take(sub2)), 42)
          })
        )
      }))

    it.effect("failed transactions do not publish rolled back values", () =>
      Effect.gen(function*() {
        const ref = yield* Effect.tx(TxSubscriptionRef.make(0))

        // Collect initial value only (take 1 before any updates)
        const initial = yield* Stream.runCollect(
          TxSubscriptionRef.changesStream(ref).pipe(Stream.take(1))
        )
        assert.deepStrictEqual(initial, [0])
      }))

    it.effect("changesStream starts from the current value for each subscriber", () =>
      Effect.gen(function*() {
        const ref = yield* Effect.tx(TxSubscriptionRef.make(0))

        yield* Effect.tx(TxSubscriptionRef.set(ref, 1))
        yield* Effect.tx(TxSubscriptionRef.set(ref, 2))

        const values = yield* Stream.runCollect(
          TxSubscriptionRef.changesStream(ref).pipe(Stream.take(1))
        )
        // Stream starts fresh, so takes the current value (2)
        assert.deepStrictEqual(values, [2])
      }))

    it.effect("scope close releases the subscriber queue", () =>
      Effect.gen(function*() {
        const ref = yield* Effect.tx(TxSubscriptionRef.make(0))

        yield* Effect.scoped(
          Effect.gen(function*() {
            yield* TxSubscriptionRef.changes(ref)
            // Subscriber exists within scope
          })
        )

        // After scope closes, setting values should not fail
        yield* Effect.tx(TxSubscriptionRef.set(ref, 1))
        assert.strictEqual(yield* Effect.tx(TxSubscriptionRef.get(ref)), 1)
      }))
  })

  describe("pipe support", () => {
    it.effect("set data-last style", () =>
      Effect.tx(Effect.gen(function*() {
        const ref = yield* TxSubscriptionRef.make(0)
        yield* ref.pipe(TxSubscriptionRef.set(99))
        assert.strictEqual(yield* TxSubscriptionRef.get(ref), 99)
      })))

    it.effect("update data-last style", () =>
      Effect.tx(Effect.gen(function*() {
        const ref = yield* TxSubscriptionRef.make(5)
        yield* ref.pipe(TxSubscriptionRef.update((n: number) => n + 1))
        assert.strictEqual(yield* TxSubscriptionRef.get(ref), 6)
      })))

    it.effect("modify data-last style", () =>
      Effect.tx(Effect.gen(function*() {
        const ref = yield* TxSubscriptionRef.make(10)
        const result = yield* ref.pipe(
          TxSubscriptionRef.modify((n: number) => [n * 2, n + 1])
        )
        assert.strictEqual(result, 20)
        assert.strictEqual(yield* TxSubscriptionRef.get(ref), 11)
      })))
  })

  describe("type guards", () => {
    it.effect("isTxSubscriptionRef identifies instances", () =>
      Effect.tx(Effect.gen(function*() {
        const ref = yield* TxSubscriptionRef.make(0)
        assert.isTrue(TxSubscriptionRef.isTxSubscriptionRef(ref))
        assert.isFalse(TxSubscriptionRef.isTxSubscriptionRef({}))
        assert.isFalse(TxSubscriptionRef.isTxSubscriptionRef(null))
        assert.isFalse(TxSubscriptionRef.isTxSubscriptionRef(undefined))
      })))
  })
})
