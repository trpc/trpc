import { assert, it } from "@effect/vitest"
import type { Vitest } from "@effect/vitest"
import { Duration, Effect, Fiber, Latch, Layer, Schedule, Schema } from "effect"
import { PersistedQueue } from "effect/persistence"
import { TestClock } from "effect/testing"

const Item = Schema.Struct({
  n: Schema.BigInt
})

export const suiteWith = <R>(
  name: string,
  layer: Layer.Layer<PersistedQueue.PersistedQueueStore, unknown, R>,
  testApi: Vitest.MethodsNonLive<R>,
  options?: {
    readonly timeout?: Duration.Input | undefined
    readonly hookTimeout?: Duration.Input | undefined
    /**
     * Set when the store reads time only from the `Clock` service, so the
     * tests can skip the wall-clock waits that real-time stores need.
     */
    readonly virtualTime?: boolean | undefined
  }
) => {
  const timeout = options?.timeout ?? "30 seconds"
  const hookTimeout = options?.hookTimeout ?? timeout
  // Tests share and advance the same TestClock.
  const testOptions = { timeout: Duration.toMillis(timeout) }

  // give real-time stores a moment of wall-clock time
  const liveSleep = (millis: number) =>
    options?.virtualTime ? Effect.yieldNow : Effect.sleep(millis).pipe(TestClock.withLive)

  // advance the virtual clock one poll cycle, give real-time stores a moment,
  // then check the forked take is still waiting
  const assertNotDelivered = Effect.fnUntraced(function*<A, E>(fiber: Fiber.Fiber<A, E>) {
    yield* TestClock.adjust(1000)
    yield* liveSleep(1000)
    assert.isUndefined(fiber.pollUnsafe())
  })

  // advance both clocks until the forked take completes, including acknowledgement.
  // Keep advancing while it is pending: an SQL poll can miss a virtual-clock
  // wakeup, and acknowledgement retries also sleep on the virtual clock.
  const awaitDelivery = Effect.fnUntraced(function*<A, E>(fiber: Fiber.Fiber<A, E>) {
    for (let i = 0; i < 8 && fiber.pollUnsafe() === undefined; i++) {
      yield* TestClock.adjust(1000)
      yield* liveSleep(700)
    }
    assert.isDefined(fiber.pollUnsafe())
    return yield* Fiber.join(fiber)
  })

  // move both the virtual clock and real time past a 1 second ttl. The virtual
  // jump is kept small: a large jump can fire the SQL clients' pool timers and
  // time out in-flight connection acquisitions
  const advancePastTtl = Effect.gen(function*() {
    yield* TestClock.adjust("2 seconds")
    yield* liveSleep(1500)
  })

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

    it.effect("delivers lone surrogates without losing concurrent elements", () =>
      Effect.gen(function*() {
        const queue = yield* PersistedQueue.make({
          name: "test-queue-lone-surrogate-batch",
          schema: Schema.Struct({ s: Schema.String })
        })
        const surrogate = "😀".slice(0, 1)
        yield* queue.offer({ s: surrogate })
        yield* queue.offer({ s: "ok" })

        const fiber = yield* Effect.all([queue.take(Effect.succeed), queue.take(Effect.succeed)], {
          concurrency: 2
        }).pipe(Effect.forkScoped)

        const values = yield* awaitDelivery(fiber)
        assert.deepStrictEqual(values.map(({ s }) => s).sort(), [surrogate, "ok"].sort())
      }), testOptions)

    it.effect("delivers elements with lone-surrogate custom ids", () =>
      Effect.gen(function*() {
        const queue = yield* PersistedQueue.make({
          name: "test-queue-lone-surrogate-custom-id",
          schema: Item
        })
        yield* queue.offer({ n: 42n }, { id: "😀".slice(0, 1) })

        const fiber = yield* queue.take(Effect.succeed).pipe(Effect.forkScoped)
        assert.deepStrictEqual(yield* awaitDelivery(fiber), { n: 42n })
      }), testOptions)

    it.effect(
      "cleanup retains failed lone surrogates until the failed TTL releases their custom ids",
      () =>
        Effect.gen(function*() {
          const store = yield* PersistedQueue.PersistedQueueStore
          const queue = yield* PersistedQueue.make({
            name: "test-queue-lone-surrogate-failed-id",
            schema: Schema.Struct({ s: Schema.String }),
            maxAttempts: 1
          })
          const id = "lone-surrogate-failed-custom-id"
          yield* queue.offer({ s: "😀".slice(0, 1) }, { id })
          const failed = yield* queue.take(() => Effect.fail("boom")).pipe(Effect.flip, Effect.forkScoped)
          assert.strictEqual(yield* awaitDelivery(failed), "boom")

          // An unexpired dead letter must keep its custom id deduplicated.
          yield* store.cleanup({ timeToLive: Duration.seconds(1), failedTimeToLive: Duration.days(30) })
          yield* queue.offer({ s: "duplicate" }, { id })
          const fiber = yield* queue.take(Effect.succeed).pipe(Effect.forkScoped)
          yield* assertNotDelivered(fiber)

          // Expiring that dead letter releases the id even with an opaque surrogate payload.
          yield* advancePastTtl
          yield* store.cleanup({ timeToLive: Duration.days(30), failedTimeToLive: Duration.seconds(1) })
          yield* queue.offer({ s: "reoffered" }, { id })
          assert.deepStrictEqual(yield* awaitDelivery(fiber), { s: "reoffered" })
        }),
      testOptions
    )

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
        yield* liveSleep(100)
        assert.isUndefined(fiber.pollUnsafe())

        assert.strictEqual(yield* awaitDelivery(fiber), 2)
      }), testOptions)

    it.effect("delays first delivery with the offer delay", () =>
      Effect.gen(function*() {
        const queue = yield* PersistedQueue.make({
          name: "test-queue-offer-delay",
          schema: Item
        })

        // SQL stores round to whole seconds, so keep the delay well clear of
        // the one second checked by assertNotDelivered
        yield* queue.offer({ n: 42n }, { delay: "3 seconds" })

        const fiber = yield* queue.take((value, { attempts }) => Effect.succeed({ value, attempts })).pipe(
          Effect.forkScoped
        )

        yield* assertNotDelivered(fiber)

        // the delay does not consume an attempt
        assert.deepStrictEqual(yield* awaitDelivery(fiber), { value: { n: 42n }, attempts: 1 })
      }), testOptions)

    it.effect("delivers zero and negative offer delays immediately", () =>
      Effect.gen(function*() {
        const queue = yield* PersistedQueue.make({
          name: "test-queue-offer-delay-immediate",
          schema: Item
        })

        yield* queue.offer({ n: 1n }, { delay: 0 })
        yield* queue.offer({ n: 2n }, { delay: Duration.seconds(-5) })

        const first = yield* queue.take(Effect.succeed)
        const second = yield* queue.take(Effect.succeed)
        assert.deepStrictEqual([first.n, second.n].sort(), [1n, 2n])
      }), testOptions)

    it.effect("an infinite offer delay writes nothing", () =>
      Effect.gen(function*() {
        const queue = yield* PersistedQueue.make({
          name: "test-queue-offer-delay-infinite",
          schema: Item
        })

        const id = yield* queue.offer({ n: 1n }, { id: "infinite-delay-id", delay: Duration.infinity })
        assert.strictEqual(id, "infinite-delay-id")
        const generatedId = yield* queue.offer({ n: 2n }, { delay: Duration.infinity })
        assert.isNotEmpty(generatedId)

        // no dedupe record was written, so the id can be offered again
        yield* queue.offer({ n: 3n }, { id: "infinite-delay-id" })
        assert.deepStrictEqual(yield* queue.take(Effect.succeed), { n: 3n })

        const fiber = yield* queue.take(Effect.succeed).pipe(Effect.forkScoped)
        yield* assertNotDelivered(fiber)
      }), testOptions)

    it.effect("ignores the delay of a duplicate offer", () =>
      Effect.gen(function*() {
        const queue = yield* PersistedQueue.make({
          name: "test-queue-offer-delay-duplicate",
          schema: Item
        })

        yield* queue.offer({ n: 1n }, { id: "delayed-duplicate-id", delay: "3 seconds" })
        yield* queue.offer({ n: 2n }, { id: "delayed-duplicate-id" })

        // the undelayed duplicate does not make the element available early
        const fiber = yield* queue.take(Effect.succeed).pipe(Effect.forkScoped)
        yield* assertNotDelivered(fiber)
        assert.deepStrictEqual(yield* awaitDelivery(fiber), { n: 1n })

        const fiber2 = yield* queue.take(Effect.succeed).pipe(Effect.forkScoped)
        yield* assertNotDelivered(fiber2)
      }), testOptions)

    it.effect("settling a custom id does not release the same id in another queue", () =>
      Effect.gen(function*() {
        const emails = yield* PersistedQueue.make({ name: "isolated-emails", schema: Item })
        const invoices = yield* PersistedQueue.make({ name: "isolated-invoices", schema: Item })
        yield* emails.offer({ n: 1n }, { id: "order-1" })
        yield* invoices.offer({ n: 2n }, { id: "order-1" })

        // each queue deduplicates its own ids, so the invoice is delivered
        const taken = Latch.makeUnsafe()
        let invoice: typeof Item.Type | undefined
        yield* invoices.take((value) => {
          invoice = value
          return Effect.andThen(taken.open, Effect.never)
        }).pipe(Effect.forkScoped)
        yield* taken.await
        assert.deepStrictEqual(invoice, { n: 2n })

        yield* emails.take(Effect.succeed)
        const duplicate = yield* invoices.take(Effect.succeed).pipe(Effect.forkScoped)
        yield* assertNotDelivered(duplicate)
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
        assert.deepStrictEqual(yield* awaitDelivery(fiber), { n: 3n })
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
        assert.deepStrictEqual(yield* awaitDelivery(fiber), { n: 3n })
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
          yield* liveSleep(250)
        }

        assert.strictEqual(succeeded.size, total)
        for (const [n, count] of deliveries) {
          assert.strictEqual(count, n % 3n === 0n ? 2 : 1, `deliveries for element ${n}`)
        }
      }), testOptions)
  })
}

export const suite = (
  name: string,
  layer: Layer.Layer<PersistedQueue.PersistedQueueStore, unknown>,
  options?: { readonly virtualTime?: boolean | undefined }
) => suiteWith(name, layer, it, options)
