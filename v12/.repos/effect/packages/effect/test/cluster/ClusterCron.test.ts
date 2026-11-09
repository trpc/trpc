import { assert, describe, it } from "@effect/vitest"
import { Cron, DateTime, Effect, Layer, PrimaryKey, Schema } from "effect"
import {
  ClusterCron,
  ClusterError,
  ClusterSchema,
  DeliverAt,
  Entity,
  MessageStorage,
  RunnerHealth,
  Runners,
  RunnerStorage,
  Sharding,
  ShardingConfig
} from "effect/cluster"
import { Rpc } from "effect/rpc"
import { TestClock } from "effect/testing"

// Each deploy is a fresh Sharding instance over the same message storage
const deploy = Effect.fnUntraced(function*(entities: Layer.Layer<never, never, Sharding.Sharding>, millis: number) {
  const driver = yield* MessageStorage.MemoryDriver
  yield* Layer.build(entities.pipe(
    Layer.provideMerge(Sharding.layer),
    Layer.provide([RunnerStorage.layerMemory, RunnerHealth.layerNoop, Runners.layerNoop]),
    Layer.provide(Layer.succeed(MessageStorage.MessageStorage, driver.storage)),
    Layer.provide(ShardingConfig.layer({
      entityRegistrationTimeout: 1000,
      entityTerminationTimeout: 0,
      entityMessagePollInterval: 100
    }))
  ))
  for (let i = 0; i < millis / 100; i++) {
    yield* TestClock.adjust(100)
  }
}, Effect.scoped)

class LegacyCronPayload extends Schema.Class<LegacyCronPayload>("LegacyCronPayload")({
  dateTime: Schema.DateTimeUtc
}) {
  [PrimaryKey.symbol]() {
    return ""
  }
  [DeliverAt.symbol]() {
    return this.dateTime
  }
}

const LegacyCronEntity = Entity.make("ClusterCron/test", [
  Rpc.make("run", { payload: LegacyCronPayload }).annotate(ClusterSchema.Persisted, true)
])

describe("ClusterCron", { concurrent: false }, () => {
  it.effect("recovers from a transient failure to schedule the initial run", () => {
    let failed = false
    let runs = 0
    const ShardingLayer = Sharding.layer.pipe(
      Layer.provide([RunnerStorage.layerMemory, RunnerHealth.layerNoop, Runners.layerNoop]),
      Layer.updateService(MessageStorage.MessageStorage, (storage) => ({
        ...storage,
        saveRequest: (message) =>
          Effect.suspend(() => {
            if (!failed && message.envelope.address.entityType === "ClusterCron/test") {
              failed = true
              return Effect.fail(new ClusterError.PersistenceError({ cause: new Error("connection reset") }))
            }
            return storage.saveRequest(message)
          })
      })),
      Layer.provide(MessageStorage.layerMemory),
      Layer.provide(ShardingConfig.layer({ entityMessagePollInterval: 100 }))
    )
    const layer = ClusterCron.make({
      name: "test",
      cron: Cron.parseUnsafe("* * * * * *", "UTC"),
      execute: Effect.sync(() => {
        runs++
      })
    }).pipe(Layer.provide(ShardingLayer))

    return Effect.gen(function*() {
      for (let i = 0; i < 20; i++) {
        yield* TestClock.adjust(100)
      }
      assert.isTrue(failed)
      assert.strictEqual(runs, 2)
    }).pipe(Effect.provide(layer))
  })

  it.effect("keeps the initial run's instant while scheduling it is retried across a cron boundary", () => {
    const attempts: Array<string> = []
    let recovered = false
    const ShardingLayer = Sharding.layer.pipe(
      Layer.provide([RunnerStorage.layerMemory, RunnerHealth.layerNoop, Runners.layerNoop]),
      Layer.updateService(MessageStorage.MessageStorage, (storage) => ({
        ...storage,
        saveRequest: (message) =>
          Effect.flatMap(DateTime.now, (now) => {
            if (recovered || message.envelope.address.entityType !== "ClusterCron/test") {
              return storage.saveRequest(message)
            }
            attempts.push(String(message.envelope.address.entityId))
            // storage stays down until the first scheduled instant has passed
            if (now.epochMilliseconds < 1000) {
              return Effect.fail(new ClusterError.PersistenceError({ cause: new Error("connection reset") }))
            }
            recovered = true
            return storage.saveRequest(message)
          })
      })),
      Layer.provide(MessageStorage.layerMemory),
      Layer.provide(ShardingConfig.layer({ entityMessagePollInterval: 100 }))
    )
    const layer = ClusterCron.make({
      name: "test",
      cron: Cron.parseUnsafe("* * * * * *", "UTC"),
      execute: Effect.void
    }).pipe(Layer.provide(ShardingLayer))

    return Effect.gen(function*() {
      for (let i = 0; i < 25; i++) {
        yield* TestClock.adjust(100)
      }
      assert.isTrue(recovered)
      assert.isAbove(attempts.length, 1)
      assert.deepStrictEqual(attempts, attempts.map(() => "1970-01-01T00:00:01.000Z"))
    }).pipe(Effect.provide(layer))
  })

  it.effect("resumes with calculateNextRunFromPrevious after its pending run fails", () =>
    Effect.gen(function*() {
      let runs = 0
      const cron = ClusterCron.make({
        name: "test",
        cron: Cron.parseUnsafe("* * * * * *", "UTC"),
        calculateNextRunFromPrevious: true,
        execute: Effect.sync(() => {
          runs++
        })
      })
      const Other = Entity.make("Other", [Rpc.make("Ping")])
      const OtherLayer = Other.toLayer({ Ping: () => Effect.void })

      yield* deploy(Layer.merge(cron, OtherLayer), 3500)
      const beforeRemoval = runs
      assert.isAbove(beforeRemoval, 0)

      // the pending run fails once the cron entity misses its registration timeout
      yield* deploy(OtherLayer, 3000)
      assert.strictEqual(runs, beforeRemoval)

      yield* deploy(Layer.merge(cron, OtherLayer), 3500)
      assert.isAbove(runs, beforeRemoval)
    }).pipe(Effect.provide(MessageStorage.MemoryDriver.layer)))

  it.effect("catches up in order with calculateNextRunFromPrevious after a restart", () =>
    Effect.gen(function*() {
      const scheduled: Array<string> = []
      let running = 0
      let overlapped = false
      let slow = false
      const cron = ClusterCron.make({
        name: "test",
        cron: Cron.parseUnsafe("* * * * * *", "UTC"),
        calculateNextRunFromPrevious: true,
        execute: Effect.gen(function*() {
          scheduled.push(DateTime.formatIso(yield* ClusterCron.CurrentScheduledTime))
          if (++running > 1) overlapped = true
          if (slow) yield* Effect.sleep(2000)
          running--
        })
      })

      yield* deploy(cron, 1500)
      // the pending run falls behind while no runner is up
      yield* TestClock.adjust(3000)
      slow = true
      scheduled.length = 0
      yield* deploy(cron, 6000)

      assert.isAbove(scheduled.length, 1)
      assert.isFalse(overlapped)
      assert.deepStrictEqual(scheduled, [...scheduled].sort())
    }).pipe(Effect.provide(MessageStorage.MemoryDriver.layer)))

  it.effect("retries a failed run with calculateNextRunFromPrevious before later instants", () =>
    Effect.gen(function*() {
      const attempts: Array<string> = []
      const cron = ClusterCron.make({
        name: "test",
        cron: Cron.parseUnsafe("* * * * * *", "UTC"),
        calculateNextRunFromPrevious: true,
        execute: Effect.gen(function*() {
          attempts.push(DateTime.formatIso(yield* ClusterCron.CurrentScheduledTime))
          if (attempts.length === 1) {
            return yield* Effect.fail("boom")
          }
        })
      })

      yield* deploy(cron, 3500)

      assert.isAbove(attempts.length, 2)
      assert.strictEqual(attempts[1], attempts[0])
      assert.deepStrictEqual(attempts, [...attempts].sort())
    }).pipe(Effect.provide(MessageStorage.MemoryDriver.layer)))

  it.effect("replays an interrupted run with calculateNextRunFromPrevious when its finalizer fails", () =>
    Effect.gen(function*() {
      const attempts: Array<string> = []
      const cron = ClusterCron.make({
        name: "test",
        cron: Cron.parseUnsafe("* * * * * *", "UTC"),
        calculateNextRunFromPrevious: true,
        execute: Effect.gen(function*() {
          attempts.push(DateTime.formatIso(yield* ClusterCron.CurrentScheduledTime))
          if (attempts.length === 1) {
            return yield* Effect.interrupt.pipe(Effect.ensuring(Effect.die("cleanup failed")))
          }
        })
      })

      yield* deploy(cron, 3500)

      assert.isAbove(attempts.length, 2)
      assert.strictEqual(attempts[1], attempts[0])
    }).pipe(Effect.provide(MessageStorage.MemoryDriver.layer)))

  it.effect("runs each instant once across a legacy pending run and a redeploy", () =>
    Effect.gen(function*() {
      const everySecond = Cron.parseUnsafe("* * * * * *", "UTC")
      const scheduled: Array<string> = []
      const cron = ClusterCron.make({
        name: "test",
        cron: everySecond,
        calculateNextRunFromPrevious: true,
        execute: Effect.gen(function*() {
          scheduled.push(DateTime.formatIso(yield* ClusterCron.CurrentScheduledTime))
        })
      })
      const assertEachInstantOnce = (first: string) => {
        assert.isAbove(scheduled.length, 1)
        assert.strictEqual(scheduled[0], first)
        for (let i = 1; i < scheduled.length; i++) {
          assert.strictEqual(
            scheduled[i],
            DateTime.formatIso(DateTime.fromDateUnsafe(Cron.next(everySecond, scheduled[i - 1])))
          )
        }
      }

      // a pending run written by an earlier release, at a per-instant address with an empty primary key
      const legacy = DateTime.fromDateUnsafe(Cron.next(everySecond, yield* DateTime.now))
      yield* deploy(
        Layer.effectDiscard(Effect.gen(function*() {
          const client = yield* LegacyCronEntity.client
          yield* client(DateTime.formatIso(legacy)).run({ dateTime: legacy }, { discard: true }).pipe(Effect.orDie)
        })),
        0
      )

      yield* deploy(cron, 2500)
      assertEachInstantOnce(DateTime.formatIso(legacy))

      // redeploy while the chain has a healthy pending run
      yield* deploy(cron, 2500)
      assertEachInstantOnce(DateTime.formatIso(legacy))
    }).pipe(Effect.provide(MessageStorage.MemoryDriver.layer)))
})
