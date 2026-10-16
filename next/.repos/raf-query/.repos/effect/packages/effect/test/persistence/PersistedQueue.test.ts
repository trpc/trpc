import { assert, it } from "@effect/vitest"
import { Effect, Fiber, Layer, Schedule, Schema } from "effect"
import { PersistedQueue } from "effect/persistence"
import { TestClock } from "effect/testing"
import * as PersistedQueueTest from "./PersistedQueueTest.ts"

PersistedQueueTest.suite("memory", PersistedQueue.layerStoreMemory)

const Item = Schema.Struct({
  n: Schema.BigInt
})

it.layer(
  PersistedQueue.layer.pipe(Layer.provideMerge(PersistedQueue.layerStoreMemory))
)("PersistedQueue.retrySchedule", (it) => {
  it.effect("derives growing delays from the persisted attempt count", () =>
    Effect.gen(function*() {
      const queue = yield* PersistedQueue.make({
        name: "retry-schedule-state",
        schema: Item,
        retrySchedule: Schedule.exponential(1000)
      })
      const attempts: Array<number> = []
      const takeFail = queue.take((_val, metadata) => {
        attempts.push(metadata.attempts)
        return Effect.fail("boom")
      }).pipe(Effect.flip)

      yield* queue.offer({ n: 1n })

      // attempt 1 at t=0 schedules the retry for t=1s
      yield* takeFail

      const fiber = yield* takeFail.pipe(Effect.forkScoped)
      yield* TestClock.adjust(500)
      assert.isUndefined(fiber.pollUnsafe())
      yield* TestClock.adjust(500)
      assert.strictEqual(yield* Fiber.join(fiber), "boom")

      // attempt 2 failed at t=1s: the schedule must not restart at 1s, the
      // next delay is 2s
      const fiber2 = yield* takeFail.pipe(Effect.forkScoped)
      yield* TestClock.adjust(1500)
      assert.isUndefined(fiber2.pollUnsafe())
      yield* TestClock.adjust(600)
      assert.strictEqual(yield* Fiber.join(fiber2), "boom")

      assert.deepStrictEqual(attempts, [1, 2, 3])
    }))
})

it.layer(
  PersistedQueue.layer.pipe(Layer.provideMerge(PersistedQueue.layerStoreMemory))
)("PersistedQueue.layerCleanup", (it) => {
  it.effect("prunes completed elements on the configured interval", () =>
    Effect.gen(function*() {
      const queue = yield* PersistedQueue.make({ name: "cleanup-layer", schema: Item })
      yield* queue.offer({ n: 1n }, { id: "cleanup-layer-id" })
      yield* queue.take(Effect.succeed)

      yield* Layer.build(PersistedQueue.layerCleanup({
        interval: "1 minute",
        timeToLive: "1 hour"
      }))

      // within the ttl the id stays deduplicated
      yield* TestClock.adjust("2 minutes")
      yield* queue.offer({ n: 2n }, { id: "cleanup-layer-id" })
      const fiber = yield* queue.take(Effect.succeed).pipe(Effect.forkScoped)
      yield* TestClock.adjust(1000)
      assert.isUndefined(fiber.pollUnsafe())

      // after the ttl a cleanup run prunes the entry and the id can be reused
      yield* TestClock.adjust("2 hours")
      yield* queue.offer({ n: 3n }, { id: "cleanup-layer-id" })
      yield* TestClock.adjust(1000)
      assert.deepStrictEqual(yield* Fiber.join(fiber), { n: 3n })
    }))
})
