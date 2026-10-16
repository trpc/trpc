import { assert, it } from "@effect/vitest"
import type { Vitest } from "@effect/vitest"
import { Duration, Effect, Fiber, Latch, Layer, Schedule, Schema } from "effect"
import { PersistedQueue } from "effect/persistence"
import { TestClock } from "effect/testing"

const Item = Schema.Struct({
  n: Schema.BigInt
})

// advance the virtual clock one poll cycle, give real-time stores a moment,
// then check the forked take is still waiting
const assertNotDelivered = <A, E>(fiber: Fiber.Fiber<A, E>) =>
  Effect.gen(function*() {
    yield* TestClock.adjust(1000)
    yield* Effect.sleep(1000).pipe(TestClock.withLive)
    assert.isUndefined(fiber.pollUnsafe())
  })

// move both the virtual clock and real time past a 1 second ttl. The virtual
// jump is kept small: a large jump can fire the SQL clients' pool timers and
// time out in-flight connection acquisitions
const advancePastTtl = Effect.gen(function*() {
  yield* TestClock.adjust("2 seconds")
  yield* Effect.sleep(1500).pipe(TestClock.withLive)
})

export const suiteWith = <R>(
  name: string,
  layer: Layer.Layer<PersistedQueue.PersistedQueueStore, unknown, R>,
  testApi: Vitest.MethodsNonLive<R>,
  timeout: Duration.Input = "30 seconds",
  hookTimeout: Duration.Input = timeout
) => {
  // Tests share and advance the same TestClock.
  const testOptions = { timeout: Duration.toMillis(timeout) }
  return testApi.layer(
    PersistedQueue.layer.pipe(
      Layer.provideMerge(layer)
    ),
    { timeout: hookTimeout, concurrent: false }
  )(`PersistedQueue (${name})`, (it) => {
    it.effect("offer + take", () =>
      Effect.gen(function*() {
        const queue = yield* PersistedQueue.make({
          name: "test-queue-a",
          schema: Item
        })

        yield* queue.offer({ n: 42n })
        yield* queue.take(Effect.fnUntraced(function*(value, metadata) {
          assert.strictEqual(value.n, 42n)
          assert.strictEqual(metadata.attempts, 1)
        }))
      }), testOptions)

    it.effect("interrupt", () =>
      Effect.gen(function*() {
        const queue = yield* PersistedQueue.make({
          name: "test-queue-b",
          schema: Item
        })

        yield* queue.offer({ n: 42n })

        const latch = Latch.makeUnsafe()
        const fiber = yield* queue.take(Effect.fnUntraced(function*(_value) {
          yield* latch.open
          return yield* Effect.never
        })).pipe(Effect.forkScoped)

        const fiber2 = yield* queue.take((val) => Effect.succeed(val)).pipe(Effect.forkScoped)

        yield* latch.await

        // the second take really waits while the element is being processed
        yield* assertNotDelivered(fiber2)

        yield* Fiber.interrupt(fiber)

        yield* TestClock.adjust(1000)

        assert.strictEqual((yield* Fiber.join(fiber2)).n, 42n)
      }), testOptions)

    it.effect("failure", () =>
      Effect.gen(function*() {
        const queue = yield* PersistedQueue.make({
          name: "test-queue-c",
          schema: Item,
          retrySchedule: Schedule.spaced(0)
        })

        yield* queue.offer({ n: 42n })

        const error = yield* queue.take(() => Effect.fail("boom")).pipe(Effect.flip)
        assert.strictEqual(error, "boom")

        const value = yield* queue.take((val, { attempts }) => {
          assert.strictEqual(attempts, 2)
          return Effect.succeed(val)
        })
        assert.strictEqual(value.n, 42n)
      }), testOptions)

    it.effect("delays retries with the retry schedule", () =>
      Effect.gen(function*() {
        const queue = yield* PersistedQueue.make({
          name: "test-queue-retry-schedule",
          schema: Item,
          // MySQL and SQLite truncate retry timestamps to whole seconds.
          // Leave room for that truncation before the real-time assertion below.
          retrySchedule: Schedule.spaced("2 seconds")
        })

        yield* queue.offer({ n: 42n })

        const error = yield* queue.take(() => Effect.fail("boom")).pipe(Effect.flip)
        assert.strictEqual(error, "boom")

        const fiber = yield* queue.take((_val, { attempts }) => Effect.succeed(attempts)).pipe(
          Effect.forkScoped
        )

        // not redelivered before the retry delay elapses
        yield* TestClock.adjust(100)
        yield* Effect.sleep(100).pipe(TestClock.withLive)
        assert.isUndefined(fiber.pollUnsafe())

        // Keep advancing while the take is pending: an SQL poll can still be
        // in flight during an adjust and miss that virtual-clock wakeup.
        for (let i = 0; i < 8 && fiber.pollUnsafe() === undefined; i++) {
          yield* TestClock.adjust(1000)
          yield* Effect.sleep(700).pipe(TestClock.withLive)
        }
        assert.isDefined(fiber.pollUnsafe())
        assert.strictEqual(yield* Fiber.join(fiber), 2)
      }), testOptions)

    it.effect("idempotent offer", () =>
      Effect.gen(function*() {
        const queue = yield* PersistedQueue.make({
          name: "idempotent-offer",
          schema: Item
        })

        yield* queue.offer({ n: 42n }, { id: "custom-id" })
        yield* queue.offer({ n: 42n }, { id: "custom-id" })
        yield* queue.take(Effect.fnUntraced(function*(value) {
          assert.strictEqual(value.n, 42n)
        }))
        const fiber = yield* queue.take(Effect.fnUntraced(function*(value) {
          assert.strictEqual(value.n, 42n)
        })).pipe(Effect.forkScoped)

        yield* assertNotDelivered(fiber)
      }), testOptions)

    it.effect("deduplicates custom ids independently in each queue", () =>
      Effect.gen(function*() {
        const first = yield* PersistedQueue.make({ name: "custom-id-first", schema: Item })
        const second = yield* PersistedQueue.make({ name: "custom-id-second", schema: Item })

        yield* first.offer({ n: 1n }, { id: "shared-custom-id" })
        yield* second.offer({ n: 2n }, { id: "shared-custom-id" })

        const fiber = yield* second.take(Effect.succeed).pipe(Effect.forkScoped)
        yield* TestClock.adjust(1000)
        yield* Effect.sleep(1000).pipe(TestClock.withLive)

        assert.isDefined(fiber.pollUnsafe())
        assert.deepStrictEqual(yield* Fiber.join(fiber), { n: 2n })
      }), testOptions)

    it.effect("does not redeliver in-flight elements", () =>
      Effect.gen(function*() {
        const queue = yield* PersistedQueue.make({
          name: "test-queue-reset",
          schema: Item
        })

        yield* queue.offer({ n: 42n })

        const taken = Latch.makeUnsafe()
        const release = Latch.makeUnsafe()
        const fiber = yield* queue.take(() => Effect.andThen(taken.open, release.await)).pipe(Effect.forkScoped)
        yield* taken.await

        const fiber2 = yield* queue.take((val) => Effect.succeed(val)).pipe(Effect.forkScoped)

        // allow any periodic reset in the store to run while the element is
        // still being processed
        yield* assertNotDelivered(fiber2)

        // after a successful take the element should not be delivered again
        yield* release.open
        yield* Fiber.join(fiber)
        yield* assertNotDelivered(fiber2)

        yield* Fiber.interrupt(fiber2)
      }), testOptions)

    it.effect("stops delivering when maxAttempts is exhausted", () =>
      Effect.gen(function*() {
        const queue = yield* PersistedQueue.make({
          name: "test-queue-exhausted",
          schema: Item,
          maxAttempts: 1,
          retrySchedule: Schedule.spaced(0)
        })

        yield* queue.offer({ n: 42n })

        const error = yield* queue.take(() => Effect.fail("boom")).pipe(Effect.flip)
        assert.strictEqual(error, "boom")

        const fiber = yield* queue.take((val) => Effect.succeed(val)).pipe(Effect.forkScoped)

        yield* assertNotDelivered(fiber)
      }), testOptions)

    it.effect("dead-letters elements that fail to decode", () =>
      Effect.gen(function*() {
        const store = yield* PersistedQueue.PersistedQueueStore
        const queue = yield* PersistedQueue.make({
          name: "test-queue-decode-failure",
          schema: Item,
          retrySchedule: Schedule.spaced(0)
        })

        yield* store.offer({
          name: "test-queue-decode-failure",
          id: "poison",
          element: { n: null },
          isCustomId: true
        })
        yield* queue.offer({ n: 42n })

        // the poison element is marked as failed and skipped
        const value = yield* queue.take(Effect.succeed)
        assert.deepStrictEqual(value, { n: 42n })

        // the poison element is not delivered again
        const fiber = yield* queue.take(Effect.succeed).pipe(Effect.forkScoped)
        yield* assertNotDelivered(fiber)
      }), testOptions)

    it.effect("cleanup removes expired completed elements", () =>
      Effect.gen(function*() {
        const store = yield* PersistedQueue.PersistedQueueStore
        const queue = yield* PersistedQueue.make({
          name: "test-queue-cleanup",
          schema: Item
        })

        yield* queue.offer({ n: 1n }, { id: "cleanup-id" })
        yield* queue.take(Effect.succeed)

        // within the ttl the dedupe entry survives, so re-offers are ignored
        yield* store.cleanup({ timeToLive: Duration.days(30), failedTimeToLive: undefined })
        yield* queue.offer({ n: 2n }, { id: "cleanup-id" })
        const fiber = yield* queue.take(Effect.succeed).pipe(Effect.forkScoped)
        yield* assertNotDelivered(fiber)

        // after the ttl the completed element and its dedupe entry go away
        yield* advancePastTtl
        yield* store.cleanup({ timeToLive: Duration.seconds(1), failedTimeToLive: undefined })
        yield* queue.offer({ n: 3n }, { id: "cleanup-id" })
        yield* TestClock.adjust(1000)
        assert.deepStrictEqual(yield* Fiber.join(fiber), { n: 3n })
      }), testOptions)

    it.effect("cleanup removes failed elements only with failedTimeToLive", () =>
      Effect.gen(function*() {
        const store = yield* PersistedQueue.PersistedQueueStore
        const queue = yield* PersistedQueue.make({
          name: "test-queue-cleanup-failed",
          schema: Item,
          maxAttempts: 1,
          retrySchedule: Schedule.spaced(0)
        })

        yield* queue.offer({ n: 1n }, { id: "failed-cleanup-id" })
        const error = yield* queue.take(() => Effect.fail("boom")).pipe(Effect.flip)
        assert.strictEqual(error, "boom")

        // without failedTimeToLive the failed element is the dead-letter
        // record and is kept, so its id stays deduplicated
        yield* advancePastTtl
        yield* store.cleanup({ timeToLive: Duration.seconds(1), failedTimeToLive: undefined })
        yield* queue.offer({ n: 2n }, { id: "failed-cleanup-id" })
        const fiber = yield* queue.take(Effect.succeed).pipe(Effect.forkScoped)
        yield* assertNotDelivered(fiber)

        // with failedTimeToLive the failed element and its dedupe entry go away
        yield* store.cleanup({ timeToLive: Duration.days(30), failedTimeToLive: Duration.seconds(1) })
        yield* queue.offer({ n: 3n }, { id: "failed-cleanup-id" })
        yield* TestClock.adjust(1000)
        assert.deepStrictEqual(yield* Fiber.join(fiber), { n: 3n })
      }), testOptions)

    it.effect("cleanup keeps dedupe entries for unprocessed elements", () =>
      Effect.gen(function*() {
        const store = yield* PersistedQueue.PersistedQueueStore
        const queue = yield* PersistedQueue.make({
          name: "test-queue-cleanup-pending",
          schema: Item
        })

        yield* queue.offer({ n: 1n }, { id: "pending-cleanup-id" })

        // an element older than the ttl that was never processed keeps its
        // dedupe entry, so the re-offer does not enqueue a duplicate
        yield* advancePastTtl
        yield* store.cleanup({ timeToLive: Duration.seconds(1), failedTimeToLive: undefined })
        yield* queue.offer({ n: 2n }, { id: "pending-cleanup-id" })

        const value = yield* queue.take(Effect.succeed)
        assert.deepStrictEqual(value, { n: 1n })

        const fiber = yield* queue.take(Effect.succeed).pipe(Effect.forkScoped)
        yield* assertNotDelivered(fiber)
      }), testOptions)

    it.effect("processes concurrent elements exactly once with retries", () =>
      Effect.gen(function*() {
        const queue = yield* PersistedQueue.make({
          name: "test-queue-soak",
          schema: Item,
          retrySchedule: Schedule.spaced(0)
        })

        const total = 24
        const deliveries = new Map<bigint, number>()
        const succeeded = new Set<bigint>()
        const completed = Latch.makeUnsafe()

        yield* Effect.forEach(
          Array.from({ length: total }, (_, i) => BigInt(i)),
          (n) => queue.offer({ n }),
          { concurrency: 8, discard: true }
        )

        const worker = queue.take(({ n }) =>
          Effect.suspend(() => {
            const count = (deliveries.get(n) ?? 0) + 1
            deliveries.set(n, count)
            // every third element fails on its first delivery
            if (n % 3n === 0n && count === 1) {
              return Effect.fail("transient")
            }
            succeeded.add(n)
            if (succeeded.size === total) {
              completed.openUnsafe()
            }
            return Effect.void
          })
        ).pipe(Effect.ignore, Effect.forever)

        yield* Effect.forkScoped(worker)
        yield* Effect.forkScoped(worker)
        yield* Effect.forkScoped(worker)

        while (!completed.isOpen()) {
          yield* TestClock.adjust(1000)
          yield* Effect.sleep(250).pipe(TestClock.withLive)
        }

        assert.strictEqual(succeeded.size, total)
        for (const [n, count] of deliveries) {
          assert.strictEqual(count, n % 3n === 0n ? 2 : 1, `deliveries for element ${n}`)
        }
      }), testOptions)
  })
}

export const suite = (name: string, layer: Layer.Layer<PersistedQueue.PersistedQueueStore, unknown>) =>
  suiteWith(name, layer, it)
