import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber, Option, Order, TxPriorityQueue } from "effect"

describe("TxPriorityQueue", () => {
  describe("constructors", () => {
    it.effect("empty creates an empty queue", () =>
      Effect.tx(Effect.gen(function*() {
        const pq = yield* TxPriorityQueue.empty<number>(Order.Number)
        const s = yield* TxPriorityQueue.size(pq)
        assert.strictEqual(s, 0)
        assert.isTrue(yield* TxPriorityQueue.isEmpty(pq))
      })))

    it.effect("fromIterable creates a sorted queue", () =>
      Effect.tx(Effect.gen(function*() {
        const pq = yield* TxPriorityQueue.fromIterable(Order.Number, [3, 1, 2])
        const all = yield* TxPriorityQueue.toArray(pq)
        assert.deepStrictEqual(all, [1, 2, 3])
      })))

    it.effect("fromIterable supports the curried call", () =>
      Effect.tx(Effect.gen(function*() {
        const pq = yield* TxPriorityQueue.fromIterable(Order.Number)([3, 1, 2])
        const all = yield* TxPriorityQueue.toArray(pq)
        assert.deepStrictEqual(all, [1, 2, 3])
      })))

    it.effect("make creates from variadic args", () =>
      Effect.tx(Effect.gen(function*() {
        const pq = yield* TxPriorityQueue.make(Order.Number)(5, 3, 1, 4, 2)
        const all = yield* TxPriorityQueue.toArray(pq)
        assert.deepStrictEqual(all, [1, 2, 3, 4, 5])
      })))
  })

  describe("getters", () => {
    it.effect("size returns number of elements", () =>
      Effect.tx(Effect.gen(function*() {
        const pq = yield* TxPriorityQueue.fromIterable(Order.Number, [1, 2, 3])
        assert.strictEqual(yield* TxPriorityQueue.size(pq), 3)
      })))

    it.effect("isEmpty/isNonEmpty", () =>
      Effect.tx(Effect.gen(function*() {
        const pq = yield* TxPriorityQueue.empty<number>(Order.Number)
        assert.isTrue(yield* TxPriorityQueue.isEmpty(pq))
        assert.isFalse(yield* TxPriorityQueue.isNonEmpty(pq))
        yield* TxPriorityQueue.offer(pq, 1)
        assert.isFalse(yield* TxPriorityQueue.isEmpty(pq))
        assert.isTrue(yield* TxPriorityQueue.isNonEmpty(pq))
      })))

    it.effect("peek returns smallest without removing", () =>
      Effect.tx(Effect.gen(function*() {
        const pq = yield* TxPriorityQueue.fromIterable(Order.Number, [3, 1, 2])
        const top = yield* TxPriorityQueue.peek(pq)
        assert.strictEqual(top, 1)
        assert.strictEqual(yield* TxPriorityQueue.size(pq), 3)
      })))

    it.effect("peekOption returns None when empty", () =>
      Effect.tx(Effect.gen(function*() {
        const pq = yield* TxPriorityQueue.empty<number>(Order.Number)
        const result = yield* TxPriorityQueue.peekOption(pq)
        assert.isTrue(Option.isNone(result))
      })))

    it.effect("peekOption returns Some when non-empty", () =>
      Effect.tx(Effect.gen(function*() {
        const pq = yield* TxPriorityQueue.fromIterable(Order.Number, [3, 1])
        const result = yield* TxPriorityQueue.peekOption(pq)
        assert.isTrue(Option.isSome(result))
        if (Option.isSome(result)) {
          assert.strictEqual(result.value, 1)
        }
      })))
  })

  describe("mutations", () => {
    it.effect("offer + take returns elements in priority order", () =>
      Effect.tx(Effect.gen(function*() {
        const pq = yield* TxPriorityQueue.empty<number>(Order.Number)
        yield* TxPriorityQueue.offer(pq, 3)
        yield* TxPriorityQueue.offer(pq, 1)
        yield* TxPriorityQueue.offer(pq, 2)
        assert.strictEqual(yield* TxPriorityQueue.take(pq), 1)
        assert.strictEqual(yield* TxPriorityQueue.take(pq), 2)
        assert.strictEqual(yield* TxPriorityQueue.take(pq), 3)
      })))

    it.effect("duplicate priorities are all returned", () =>
      Effect.tx(Effect.gen(function*() {
        const pq = yield* TxPriorityQueue.fromIterable(Order.Number, [2, 1, 2, 1, 3])
        const all = yield* TxPriorityQueue.takeAll(pq)
        assert.deepStrictEqual(all, [1, 1, 2, 2, 3])
      })))

    it.effect("take on empty retries until offer", () =>
      Effect.tx(Effect.gen(function*() {
        const pq = yield* TxPriorityQueue.empty<number>(Order.Number)
        const fiber = yield* Effect.forkChild(TxPriorityQueue.take(pq))
        yield* TxPriorityQueue.offer(pq, 42)
        const value = yield* Fiber.join(fiber)
        assert.strictEqual(value, 42)
      })))

    it.effect("takeOption returns None when empty", () =>
      Effect.tx(Effect.gen(function*() {
        const pq = yield* TxPriorityQueue.empty<number>(Order.Number)
        const result = yield* TxPriorityQueue.takeOption(pq)
        assert.isTrue(Option.isNone(result))
      })))

    it.effect("takeUpTo returns min(n, size) elements in order", () =>
      Effect.tx(Effect.gen(function*() {
        const pq = yield* TxPriorityQueue.fromIterable(Order.Number, [5, 3, 1, 4, 2])
        const top3 = yield* TxPriorityQueue.takeUpTo(pq, 3)
        assert.deepStrictEqual(top3, [1, 2, 3])
        assert.strictEqual(yield* TxPriorityQueue.size(pq), 2)
      })))

    it.effect("takeUpTo with n > size returns all", () =>
      Effect.tx(Effect.gen(function*() {
        const pq = yield* TxPriorityQueue.fromIterable(Order.Number, [2, 1])
        const all = yield* TxPriorityQueue.takeUpTo(pq, 10)
        assert.deepStrictEqual(all, [1, 2])
        assert.strictEqual(yield* TxPriorityQueue.size(pq), 0)
      })))

    it.effect("offerAll inserts multiple elements", () =>
      Effect.tx(Effect.gen(function*() {
        const pq = yield* TxPriorityQueue.empty<number>(Order.Number)
        yield* TxPriorityQueue.offerAll(pq, [3, 1, 2])
        const all = yield* TxPriorityQueue.toArray(pq)
        assert.deepStrictEqual(all, [1, 2, 3])
      })))

    it.effect("offerAll does not compare every queued element for one new value", () =>
      Effect.tx(Effect.gen(function*() {
        let comparisons = 0
        const order: Order.Order<number> = (a, b) => {
          comparisons++
          return Order.Number(a, b)
        }
        const pq = yield* TxPriorityQueue.fromIterable(order, Array.from({ length: 128 }, (_, i) => i * 2))
        comparisons = 0
        yield* TxPriorityQueue.offerAll(pq, [127])
        assert.isBelow(comparisons, 32)
        assert.deepStrictEqual(yield* TxPriorityQueue.toArray(pq), [
          ...Array.from({ length: 64 }, (_, i) => i * 2),
          127,
          ...Array.from({ length: 64 }, (_, i) => (i + 64) * 2)
        ])
      })))

    it.effect("offerAll avoids repeated full-range searches for an interleaved batch", () =>
      Effect.tx(Effect.gen(function*() {
        let comparisons = 0
        const order: Order.Order<number> = (a, b) => {
          comparisons++
          return Order.Number(a, b)
        }
        const queued = Array.from({ length: 256 }, (_, i) => i * 2)
        const incoming = Array.from({ length: 256 }, (_, i) => i * 2 + 1)
        const pq = yield* TxPriorityQueue.fromIterable(order, queued)
        comparisons = 0
        yield* TxPriorityQueue.offerAll(pq, incoming)
        assert.isBelow(comparisons, 900)
        assert.deepStrictEqual(yield* TxPriorityQueue.toArray(pq), Array.from({ length: 512 }, (_, i) => i))
      })))
  })

  describe("filtering", () => {
    it.effect("removeIf removes matching elements", () =>
      Effect.tx(Effect.gen(function*() {
        const pq = yield* TxPriorityQueue.fromIterable(Order.Number, [1, 2, 3, 4, 5])
        yield* TxPriorityQueue.removeIf(pq, (n) => n % 2 === 0)
        const all = yield* TxPriorityQueue.takeAll(pq)
        assert.deepStrictEqual(all, [1, 3, 5])
      })))

    it.effect("retainIf keeps only matching elements", () =>
      Effect.tx(Effect.gen(function*() {
        const pq = yield* TxPriorityQueue.fromIterable(Order.Number, [1, 2, 3, 4, 5])
        yield* TxPriorityQueue.retainIf(pq, (n) => n % 2 === 0)
        const all = yield* TxPriorityQueue.takeAll(pq)
        assert.deepStrictEqual(all, [2, 4])
      })))
  })

  describe("guards", () => {
    it.effect("isTxPriorityQueue", () =>
      Effect.tx(Effect.gen(function*() {
        const pq = yield* TxPriorityQueue.empty<number>(Order.Number)
        assert.isTrue(TxPriorityQueue.isTxPriorityQueue(pq))
        assert.isFalse(TxPriorityQueue.isTxPriorityQueue(null))
        assert.isFalse(TxPriorityQueue.isTxPriorityQueue({ some: "object" }))
        assert.isFalse(TxPriorityQueue.isTxPriorityQueue([1, 2, 3]))
      })))
  })

  describe("concurrency", () => {
    it.effect("concurrent offer and take", () =>
      Effect.tx(Effect.gen(function*() {
        const pq = yield* TxPriorityQueue.empty<number>(Order.Number)
        const fiber = yield* Effect.forkChild(
          Effect.all([
            TxPriorityQueue.take(pq),
            TxPriorityQueue.take(pq),
            TxPriorityQueue.take(pq)
          ])
        )
        yield* TxPriorityQueue.offerAll(pq, [3, 1, 2])
        const results = yield* Fiber.join(fiber)
        assert.deepStrictEqual(results, [1, 2, 3])
      })))
  })

  describe("custom ordering", () => {
    it.effect("reverse order (max-first)", () =>
      Effect.tx(Effect.gen(function*() {
        const reverseNumber: Order.Order<number> = (a, b) => (a < b ? 1 : a > b ? -1 : 0)
        const pq = yield* TxPriorityQueue.fromIterable(reverseNumber, [1, 3, 2])
        const first = yield* TxPriorityQueue.take(pq)
        assert.strictEqual(first, 3)
      })))
  })
})
