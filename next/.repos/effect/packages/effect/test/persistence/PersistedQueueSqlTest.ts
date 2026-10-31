import { assert } from "@effect/vitest"
import type { Vitest } from "@effect/vitest"
import { Clock, type Duration, Effect, Fiber, Latch, Layer, Option, Schedule, Schema } from "effect"
import { PersistedQueue } from "effect/persistence"
import { SqlClient } from "effect/sql"
import { TestClock } from "effect/testing"

const makeQueue = Effect.fnUntraced(function*(tableName: string, pollInterval: Duration.Input = "10 millis") {
  const store = yield* PersistedQueue.makeStoreSql({ tableName, pollInterval })
  const factory = yield* PersistedQueue.makeFactory.pipe(
    Effect.provideService(PersistedQueue.PersistedQueueStore, store)
  )
  return yield* factory.make({ name: tableName, schema: Schema.String })
})

// allowed lag of the database clock, far below the half-second and
// multi-second errors these tests guard against
const clockTolerance = 100

// Delayed-offer timing checks that depend on how each SQL dialect reads the
// database clock. They measure with the test process's clock, which the
// database clock can trail by a few milliseconds: SQL Server's SYSDATETIME()
// advances in coarse ticks, for example. The tests run one at a time, since a
// transaction on a single-connection database would hold up the other test's
// offer.
export const suiteWith = (testApi: Vitest.MethodsNonLive<SqlClient.SqlClient>) => {
  testApi.layer(Layer.empty, { concurrent: false, timeout: "90 seconds" })("PersistedQueue SQL delays", (it) => {
    it.effect("never delivers a delayed offer early at a second boundary", () =>
      Effect.gen(function*() {
        const queue = yield* makeQueue("effect_queue_delay_boundary")

        // offer mid-way through a wall-clock second, so a whole-second database
        // clock drops about half a second from the start of the delay while a
        // slow insert still lands in the same second
        while (true) {
          const millis = (yield* Clock.currentTimeMillis) % 1000
          if (millis >= 500 && millis < 600) break
          yield* Effect.sleep(10)
        }

        const offeredAt = yield* Clock.currentTimeMillis
        yield* queue.offer("delayed", { delay: "1 second" })
        yield* queue.take(Effect.succeed)

        assert.isAtLeast((yield* Clock.currentTimeMillis) - offeredAt, 1000 - clockTolerance)
      }).pipe(TestClock.withLive), { timeout: 30000 })

    it.effect("measures the delay from an offer made inside a transaction", () =>
      Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient
        const queue = yield* makeQueue("effect_queue_delay_transaction")

        // the transaction starts well before the offer
        const offeredAt = yield* Effect.gen(function*() {
          yield* Effect.sleep("2 seconds")
          const offeredAt = yield* Clock.currentTimeMillis
          yield* queue.offer("delayed", { delay: "3 seconds" })
          return offeredAt
        }).pipe(sql.withTransaction)
        yield* queue.take(Effect.succeed)

        assert.isAtLeast((yield* Clock.currentTimeMillis) - offeredAt, 3000 - clockTolerance)
      }).pipe(TestClock.withLive), { timeout: 30000 })

    it.effect("wakes a waiting taker once an offer made inside a transaction commits", () =>
      Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient
        // no test waits out this poll interval: only the offer's wake-up can
        // deliver the element
        const queue = yield* makeQueue("effect_queue_commit_wake", "1 hour")
        const taken = yield* queue.take(Effect.succeed).pipe(Effect.forkScoped)

        // the transaction stays open after the offer, long enough for a wake-up
        // sent before the commit to find nothing
        yield* queue.offer("committed").pipe(
          Effect.andThen(Effect.sleep("500 millis")),
          sql.withTransaction
        )

        const value = yield* Fiber.join(taken).pipe(Effect.timeoutOption("5 seconds"))
        assert.deepStrictEqual(value, Option.some("committed"))
      }).pipe(TestClock.withLive), { timeout: 30000 })
  })

  testApi.layer(Layer.empty, { concurrent: false, timeout: "90 seconds" })("PersistedQueue SQL claims", (it) => {
    const makeOwnershipQueue = Effect.fnUntraced(function*(tableName: string) {
      const store = yield* PersistedQueue.makeStoreSql({
        tableName,
        pollInterval: "100 millis",
        lockRefreshInterval: "100 millis",
        lockExpiration: "1 second"
      })
      const factory = yield* PersistedQueue.makeFactory.pipe(
        Effect.provideService(PersistedQueue.PersistedQueueStore, store)
      )
      return yield* factory.make({ name: tableName, schema: Schema.String, retrySchedule: Schedule.spaced(0) })
    })

    for (const [settlement, sameStore] of [["failure", true], ["failure", false], ["success", true]] as const) {
      it.effect(
        `a stale ${settlement} preserves a newer claim from ${sameStore ? "the same" : "another"} store`,
        () =>
          Effect.gen(function*() {
            const tableName = `effect_queue_stale_${settlement}_${sameStore ? "same" : "other"}`
            const stale = yield* makeOwnershipQueue(tableName)
            const queue = sameStore ? stale : yield* makeOwnershipQueue(tableName)
            yield* stale.offer("job", { id: "job-1" })

            const aTaken = Latch.makeUnsafe()
            const aRelease = Latch.makeUnsafe()
            const aFiber = yield* stale.take(() =>
              aTaken.open.pipe(
                Effect.andThen(aRelease.await),
                Effect.andThen(settlement === "failure" ? Effect.fail("boom") : Effect.void)
              )
            ).pipe(Effect.forkScoped)
            yield* aTaken.await.pipe(Effect.timeout("5 seconds"), TestClock.withLive)

            // Refreshes stay paused on TestClock while the live database clock
            // expires the lock, including dialects with whole-second timestamps.
            yield* Effect.sleep("2500 millis").pipe(TestClock.withLive)

            const bTaken = Latch.makeUnsafe()
            const replacement = yield* queue.take((value, { attempts }) =>
              Effect.gen(function*() {
                assert.strictEqual(value, "job")
                assert.strictEqual(attempts, 2)
                yield* bTaken.open
                return yield* Effect.never
              })
            ).pipe(Effect.forkScoped)
            yield* bTaken.await.pipe(Effect.timeout("5 seconds"), TestClock.withLive)

            // Resume refreshes for the replacement before the stale settlement.
            yield* Effect.sleep("100 millis").pipe(
              TestClock.withLive,
              Effect.andThen(TestClock.adjust("100 millis")),
              Effect.forever,
              Effect.forkScoped
            )
            yield* aRelease.open
            yield* Fiber.await(aFiber)

            const duplicate = yield* queue.take((value, metadata) => Effect.succeed({ value, ...metadata })).pipe(
              Effect.forkScoped
            )
            // Longer than lockExpiration: stale settlement must neither release
            // the replacement nor unregister its lock refresh.
            yield* Effect.sleep("1500 millis").pipe(TestClock.withLive)
            assert.isUndefined(duplicate.pollUnsafe())

            yield* Fiber.interrupt(replacement)
            const redelivered = yield* Fiber.join(duplicate).pipe(Effect.timeout("5 seconds"), TestClock.withLive)
            assert.deepStrictEqual(redelivered, { value: "job", id: "job-1", attempts: 2 })
          }),
        { timeout: 30000 }
      )
    }
  })
}
