import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, Fiber, Option, Scope, TxPubSub, TxQueue } from "effect"

describe("TxPubSub", () => {
  describe("constructors", () => {
    it.effect("bounded creates pubsub with specified capacity", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.bounded<number>(16))
        assert.strictEqual(TxPubSub.capacity(hub), 16)
        assert.strictEqual(yield* Effect.tx(TxPubSub.isShutdown(hub)), false)
      }))

    it.effect("unbounded creates pubsub with unlimited capacity", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.unbounded<string>())
        assert.strictEqual(TxPubSub.capacity(hub), Number.POSITIVE_INFINITY)
      }))

    it.effect("dropping creates pubsub with dropping strategy", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.dropping<number>(4))
        assert.strictEqual(TxPubSub.capacity(hub), 4)
      }))

    it.effect("sliding creates pubsub with sliding strategy", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.sliding<number>(4))
        assert.strictEqual(TxPubSub.capacity(hub), 4)
      }))
  })

  describe("publish and subscribe", () => {
    it.effect("publish with no subscribers is a no-op", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.unbounded<string>())
        const result = yield* Effect.tx(TxPubSub.publish(hub, "hello"))
        assert.strictEqual(result, true)
      }))

    it.effect("subscribe then publish then take", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.unbounded<string>())

        yield* Effect.scoped(
          Effect.gen(function*() {
            const sub = yield* TxPubSub.subscribe(hub)
            yield* Effect.tx(TxPubSub.publish(hub, "hello"))
            const msg = yield* Effect.tx(TxQueue.take(sub))
            assert.strictEqual(msg, "hello")
          })
        )
      }))

    it.effect("multiple subscribers each receive all messages", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.unbounded<number>())

        yield* Effect.scoped(
          Effect.gen(function*() {
            const sub1 = yield* TxPubSub.subscribe(hub)
            const sub2 = yield* TxPubSub.subscribe(hub)

            yield* Effect.tx(TxPubSub.publish(hub, 1))
            yield* Effect.tx(TxPubSub.publish(hub, 2))

            const v1a = yield* Effect.tx(TxQueue.take(sub1))
            const v1b = yield* Effect.tx(TxQueue.take(sub1))
            const v2a = yield* Effect.tx(TxQueue.take(sub2))
            const v2b = yield* Effect.tx(TxQueue.take(sub2))

            assert.strictEqual(v1a, 1)
            assert.strictEqual(v1b, 2)
            assert.strictEqual(v2a, 1)
            assert.strictEqual(v2b, 2)
          })
        )
      }))

    it.effect("publishAll delivers all messages", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.unbounded<number>())

        yield* Effect.scoped(
          Effect.gen(function*() {
            const sub = yield* TxPubSub.subscribe(hub)
            yield* Effect.tx(TxPubSub.publishAll(hub, [1, 2, 3]))

            const v1 = yield* Effect.tx(TxQueue.take(sub))
            const v2 = yield* Effect.tx(TxQueue.take(sub))
            const v3 = yield* Effect.tx(TxQueue.take(sub))
            assert.strictEqual(v1, 1)
            assert.strictEqual(v2, 2)
            assert.strictEqual(v3, 3)
          })
        )
      }))

    it.effect("publishAll preserves a one-shot iterable across retries", () =>
      Effect.gen(function*() {
        const hub = yield* TxPubSub.bounded<number>(1)

        yield* Effect.scoped(
          Effect.gen(function*() {
            const sub = yield* TxPubSub.subscribe(hub)
            yield* TxPubSub.publish(hub, 1)

            let iterations = 0
            const hasIterated = () => iterations > 0
            const values = (function*() {
              iterations++
              yield 2
            })()
            const fiber = yield* Effect.forkChild(TxPubSub.publishAll(hub, values))
            while (!hasIterated()) {
              yield* Effect.yieldNow
            }

            assert.strictEqual(yield* TxQueue.take(sub), 1)
            assert.strictEqual(yield* Fiber.join(fiber), true)
            assert.deepStrictEqual(yield* TxQueue.poll(sub), Option.some(2))
          })
        )
      }))

    it.effect("subscriber only receives messages published after subscription", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.unbounded<number>())

        // Publish before subscription
        yield* Effect.tx(TxPubSub.publish(hub, 1))

        yield* Effect.scoped(
          Effect.gen(function*() {
            const sub = yield* TxPubSub.subscribe(hub)
            yield* Effect.tx(TxPubSub.publish(hub, 2))
            yield* Effect.tx(TxPubSub.publish(hub, 3))

            const v1 = yield* Effect.tx(TxQueue.take(sub))
            const v2 = yield* Effect.tx(TxQueue.take(sub))
            assert.strictEqual(v1, 2)
            assert.strictEqual(v2, 3)
          })
        )
      }))
  })

  describe("strategies", () => {
    it.effect("bounded publisher blocks when subscriber queue is full", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.bounded<number>(2))

        yield* Effect.scoped(
          Effect.gen(function*() {
            const sub = yield* TxPubSub.subscribe(hub)

            yield* Effect.tx(TxPubSub.publish(hub, 1))
            yield* Effect.tx(TxPubSub.publish(hub, 2))

            // Publisher should block since subscriber queue is full
            const fiber = yield* Effect.forkChild(Effect.tx(TxPubSub.publish(hub, 3)))

            // Take one to make space, unblocking the publisher
            const v1 = yield* Effect.tx(TxQueue.take(sub))
            assert.strictEqual(v1, 1)

            // Publisher should now complete
            yield* Fiber.join(fiber)

            const v2 = yield* Effect.tx(TxQueue.take(sub))
            const v3 = yield* Effect.tx(TxQueue.take(sub))
            assert.strictEqual(v2, 2)
            assert.strictEqual(v3, 3)
          })
        )
      }))

    it.effect("dropping strategy drops messages when subscriber queue is full", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.dropping<number>(2))

        yield* Effect.scoped(
          Effect.gen(function*() {
            const sub = yield* TxPubSub.subscribe(hub)

            yield* Effect.tx(TxPubSub.publish(hub, 1))
            yield* Effect.tx(TxPubSub.publish(hub, 2))
            const accepted = yield* Effect.tx(TxPubSub.publish(hub, 3)) // should be dropped
            assert.strictEqual(accepted, false)

            const v1 = yield* Effect.tx(TxQueue.take(sub))
            const v2 = yield* Effect.tx(TxQueue.take(sub))
            assert.strictEqual(v1, 1)
            assert.strictEqual(v2, 2)
          })
        )
      }))

    it.effect("sliding strategy drops oldest messages when subscriber queue is full", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.sliding<number>(2))

        yield* Effect.scoped(
          Effect.gen(function*() {
            const sub = yield* TxPubSub.subscribe(hub)

            yield* Effect.tx(TxPubSub.publish(hub, 1))
            yield* Effect.tx(TxPubSub.publish(hub, 2))
            yield* Effect.tx(TxPubSub.publish(hub, 3)) // evicts 1

            const v1 = yield* Effect.tx(TxQueue.take(sub))
            const v2 = yield* Effect.tx(TxQueue.take(sub))
            assert.strictEqual(v1, 2)
            assert.strictEqual(v2, 3)
          })
        )
      }))

    it.effect("unbounded strategy always accepts", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.unbounded<number>())

        yield* Effect.scoped(
          Effect.gen(function*() {
            const sub = yield* TxPubSub.subscribe(hub)

            for (let i = 0; i < 100; i++) {
              const accepted = yield* Effect.tx(TxPubSub.publish(hub, i))
              assert.strictEqual(accepted, true)
            }

            for (let i = 0; i < 100; i++) {
              const v = yield* Effect.tx(TxQueue.take(sub))
              assert.strictEqual(v, i)
            }
          })
        )
      }))
  })

  describe("getters", () => {
    it.effect("size returns max subscriber queue size", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.unbounded<number>())

        assert.strictEqual(yield* Effect.tx(TxPubSub.size(hub)), 0)

        yield* Effect.scoped(
          Effect.gen(function*() {
            const sub = yield* TxPubSub.subscribe(hub)
            yield* Effect.tx(TxPubSub.publish(hub, 1))
            yield* Effect.tx(TxPubSub.publish(hub, 2))
            assert.strictEqual(yield* Effect.tx(TxPubSub.size(hub)), 2)

            yield* Effect.tx(TxQueue.take(sub))
            assert.strictEqual(yield* Effect.tx(TxPubSub.size(hub)), 1)
          })
        )
      }))

    it.effect("isEmpty and isNonEmpty reflect subscriber queues", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.unbounded<number>())
        assert.strictEqual(yield* Effect.tx(TxPubSub.isEmpty(hub)), true)
        assert.strictEqual(yield* Effect.tx(TxPubSub.isNonEmpty(hub)), false)

        yield* Effect.scoped(
          Effect.gen(function*() {
            const sub = yield* TxPubSub.subscribe(hub)

            yield* Effect.tx(TxPubSub.publish(hub, 1))
            assert.strictEqual(yield* Effect.tx(TxPubSub.isEmpty(hub)), false)
            assert.strictEqual(yield* Effect.tx(TxPubSub.isNonEmpty(hub)), true)

            yield* Effect.tx(TxQueue.take(sub))
            assert.strictEqual(yield* Effect.tx(TxPubSub.isEmpty(hub)), true)
            assert.strictEqual(yield* Effect.tx(TxPubSub.isNonEmpty(hub)), false)
          })
        )
      }))

    it.effect("isFull checks if any subscriber queue is at capacity", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.bounded<number>(2))
        assert.strictEqual(yield* Effect.tx(TxPubSub.isFull(hub)), false)

        yield* Effect.scoped(
          Effect.gen(function*() {
            yield* TxPubSub.subscribe(hub)
            yield* Effect.tx(TxPubSub.publish(hub, 1))
            assert.strictEqual(yield* Effect.tx(TxPubSub.isFull(hub)), false)

            yield* Effect.tx(TxPubSub.publish(hub, 2))
            assert.strictEqual(yield* Effect.tx(TxPubSub.isFull(hub)), true)
          })
        )
      }))
  })

  describe("shutdown", () => {
    it.effect("shutdown prevents further publishes", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.unbounded<number>())
        yield* Effect.tx(TxPubSub.shutdown(hub))

        assert.strictEqual(yield* Effect.tx(TxPubSub.isShutdown(hub)), true)
        const accepted = yield* Effect.tx(TxPubSub.publish(hub, 1))
        assert.strictEqual(accepted, false)
      }))

    it.effect("shutdown is idempotent", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.unbounded<number>())
        yield* Effect.tx(TxPubSub.shutdown(hub))
        yield* Effect.tx(TxPubSub.shutdown(hub)) // second call should not throw
        assert.strictEqual(yield* Effect.tx(TxPubSub.isShutdown(hub)), true)
      }))

    it.effect("awaitShutdown blocks until shutdown", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.unbounded<number>())

        const fiber = yield* Effect.forkChild(Effect.tx(TxPubSub.awaitShutdown(hub)))
        yield* Effect.tx(TxPubSub.shutdown(hub))
        yield* Fiber.join(fiber)
      }))

    it.effect("awaitShutdown returns immediately if already shutdown", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.unbounded<number>())
        yield* Effect.tx(TxPubSub.shutdown(hub))
        yield* Effect.tx(TxPubSub.awaitShutdown(hub)) // should not block
      }))
  })

  describe("scope cleanup", () => {
    it.effect("releases a subscriber after hub shutdown without interruption", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.unbounded<number>())
        const scope = yield* Scope.make()
        yield* TxPubSub.subscribe(hub).pipe(Scope.provide(scope))
        yield* Effect.tx(TxPubSub.shutdown(hub))

        const release = yield* Effect.exit(Scope.close(scope, Exit.void))
        assert(Exit.isSuccess(release))
      }))

    it.effect("closing scope removes subscriber", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.unbounded<number>())

        // Subscribe inside a scope then close it
        yield* Effect.scoped(
          Effect.gen(function*() {
            yield* TxPubSub.subscribe(hub)
          })
        )

        // Publish should succeed with no subscribers
        const result = yield* Effect.tx(TxPubSub.publish(hub, 1))
        assert.strictEqual(result, true)
        assert.strictEqual(yield* Effect.tx(TxPubSub.size(hub)), 0)
      }))

    it.effect("subscriber receives messages only while scope is open", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.unbounded<number>())
        const results: Array<number> = []

        yield* Effect.scoped(
          Effect.gen(function*() {
            const sub = yield* TxPubSub.subscribe(hub)
            yield* Effect.tx(TxPubSub.publish(hub, 1))
            yield* Effect.tx(TxPubSub.publish(hub, 2))
            results.push(yield* Effect.tx(TxQueue.take(sub)))
            results.push(yield* Effect.tx(TxQueue.take(sub)))
          })
        )

        // After scope closes, new messages should not accumulate
        yield* Effect.tx(TxPubSub.publish(hub, 3))
        assert.strictEqual(yield* Effect.tx(TxPubSub.size(hub)), 0)
        assert.deepStrictEqual(results, [1, 2])
      }))
  })

  describe("guards", () => {
    it.effect("isTxPubSub returns true for TxPubSub instances", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.unbounded<number>())
        assert.strictEqual(TxPubSub.isTxPubSub(hub), true)
        assert.strictEqual(TxPubSub.isTxPubSub({}), false)
        assert.strictEqual(TxPubSub.isTxPubSub(null), false)
        assert.strictEqual(TxPubSub.isTxPubSub(42), false)
      }))
  })

  describe("concurrency", () => {
    it.effect("concurrent publishers and subscribers", () =>
      Effect.gen(function*() {
        const hub = yield* Effect.tx(TxPubSub.unbounded<number>())

        yield* Effect.scoped(
          Effect.gen(function*() {
            const sub1 = yield* TxPubSub.subscribe(hub)
            const sub2 = yield* TxPubSub.subscribe(hub)

            // Fork publishers
            const f1 = yield* Effect.forkChild(Effect.tx(TxPubSub.publishAll(hub, [1, 2, 3])))
            const f2 = yield* Effect.forkChild(Effect.tx(TxPubSub.publishAll(hub, [4, 5, 6])))

            yield* Fiber.join(f1)
            yield* Fiber.join(f2)

            // Each subscriber should get all 6 messages
            const items1: Array<number> = []
            const items2: Array<number> = []
            for (let i = 0; i < 6; i++) {
              items1.push(yield* Effect.tx(TxQueue.take(sub1)))
              items2.push(yield* Effect.tx(TxQueue.take(sub2)))
            }

            assert.strictEqual(items1.length, 6)
            assert.strictEqual(items2.length, 6)
            // Both should have the same items (though order across publishers may vary)
            assert.deepStrictEqual(items1.sort(), [1, 2, 3, 4, 5, 6])
            assert.deepStrictEqual(items2.sort(), [1, 2, 3, 4, 5, 6])
          })
        )
      }))
  })
})
