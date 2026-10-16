import { assert, it } from "@effect/vitest"
import { Duration, Effect, Fiber, Latch, Layer, Schema } from "effect"
import * as PersistedCacheTest from "effect-test/persistence/PersistedCacheTest"
import * as PersistedQueueTest from "effect-test/persistence/PersistedQueueTest"
import * as SqlCleanupTest from "effect-test/persistence/SqlCleanupTest"
import { PersistedQueue, Persistence } from "effect/persistence"
import { SqlClient } from "effect/sql"
import { TestClock } from "effect/testing"
import { PgContainer } from "./utils.ts"

PersistedCacheTest.suite(
  "sql-pg-multi",
  Persistence.layerSqlMultiTable.pipe(Layer.provide(PgContainer.layerClient))
)

PersistedCacheTest.suite(
  "sql-pg-single",
  Persistence.layerSql.pipe(Layer.provide(PgContainer.layerClient))
)

PersistedQueueTest.suite(
  "sql-pg",
  PersistedQueue.layerStoreSql().pipe(Layer.provide(PgContainer.layerClient))
)

it.layer(PgContainer.layerClient, { timeout: "30 seconds" })("PersistedQueue SQL locks", (it) => {
  it.effect("refreshes locks for acquired elements", () =>
    Effect.gen(function*() {
      const options = {
        tableName: "effect_queue_lock_refresh",
        pollInterval: "10 millis",
        lockRefreshInterval: "100 millis",
        lockExpiration: "1 second"
      } as const
      const store1 = yield* PersistedQueue.makeStoreSql(options)
      const store2 = yield* PersistedQueue.makeStoreSql(options)
      const element = { message: "hello" }

      yield* store1.offer({
        name: "lock-refresh",
        id: crypto.randomUUID(),
        element,
        isCustomId: false
      })

      const takeOptions = {
        name: "lock-refresh",
        maxAttempts: 10,
        retryDelay: () => Effect.succeed(Duration.zero)
      }
      const acquired = Latch.makeUnsafe()
      const first = yield* Effect.scoped(Effect.gen(function*() {
        yield* store1.take(takeOptions)
        yield* acquired.open
        return yield* Effect.never
      })).pipe(Effect.forkScoped)

      yield* acquired.await

      const second = yield* Effect.scoped(
        store2.take(takeOptions)
      ).pipe(Effect.forkScoped)

      yield* Effect.sleep("1500 millis")
      assert.isUndefined(second.pollUnsafe())

      yield* Fiber.interrupt(first)
      const received = yield* Fiber.join(second)
      assert.deepStrictEqual(received.element, element)
    }).pipe(TestClock.withLive))

  it.effect("dead-letters malformed JSON and continues", () =>
    Effect.gen(function*() {
      const tableName = "effect_queue_invalid_json"
      const store = yield* PersistedQueue.makeStoreSql({
        tableName,
        pollInterval: "10 millis"
      })
      const factory = yield* PersistedQueue.makeFactory.pipe(
        Effect.provideService(PersistedQueue.PersistedQueueStore, store)
      )
      const queue = yield* factory.make({
        name: "invalid-json",
        schema: Schema.String
      })
      const sql = (yield* SqlClient.SqlClient).withoutTransforms()
      const table = sql(tableName)
      const poisonId = crypto.randomUUID()

      yield* store.offer({
        name: "invalid-json",
        id: poisonId,
        element: "poison",
        isCustomId: false
      })
      yield* sql`UPDATE ${table} SET element = ${"{"} WHERE id = ${poisonId}`
      yield* queue.offer("valid")

      // the malformed element is skipped and the next one is delivered
      const value = yield* queue.take(Effect.succeed)
      assert.strictEqual(value, "valid")

      const rows = yield* sql<{
        readonly state: string
        readonly attempts: number
        readonly last_failure: string | null
      }>`SELECT state, attempts, last_failure FROM ${table} WHERE id = ${poisonId}`
      assert.strictEqual(rows[0].state, "failed")
      assert.strictEqual(Number(rows[0].attempts), 1)
      assert.isNotNull(rows[0].last_failure)
    }).pipe(TestClock.withLive))

  it.effect("processes elements exactly once across two workers", () =>
    Effect.gen(function*() {
      const options = {
        tableName: "effect_queue_two_workers",
        pollInterval: "10 millis"
      } as const
      const makeQueue = Effect.fnUntraced(function*(store: PersistedQueue.PersistedQueueStore["Service"]) {
        const factory = yield* PersistedQueue.makeFactory.pipe(
          Effect.provideService(PersistedQueue.PersistedQueueStore, store)
        )
        return yield* factory.make({ name: "two-workers", schema: Schema.Number })
      })
      const queue1 = yield* makeQueue(yield* PersistedQueue.makeStoreSql(options))
      const queue2 = yield* makeQueue(yield* PersistedQueue.makeStoreSql(options))

      const total = 20
      yield* Effect.forEach(
        Array.from({ length: total }, (_, i) => i),
        (n) => queue1.offer(n),
        { concurrency: 8, discard: true }
      )

      const seen = new Map<number, number>()
      const worker = (queue: typeof queue1) =>
        queue.take((n) =>
          Effect.sync(() => {
            seen.set(n, (seen.get(n) ?? 0) + 1)
          })
        ).pipe(Effect.forever, Effect.forkScoped)
      yield* worker(queue1)
      yield* worker(queue1)
      yield* worker(queue2)
      yield* worker(queue2)

      yield* waitFor(() => Effect.sync(() => seen.size === total))

      assert.strictEqual(seen.size, total)
      for (const [n, count] of seen) {
        assert.strictEqual(count, 1, `deliveries for element ${n}`)
      }
    }).pipe(TestClock.withLive), { timeout: 30000 })

  it.effect("recovers elements from crashed workers after lock expiration", () =>
    Effect.gen(function*() {
      const tableName = "effect_queue_crash_recovery"
      const store = yield* PersistedQueue.makeStoreSql({
        tableName,
        pollInterval: "10 millis",
        lockExpiration: "1 second"
      })
      const factory = yield* PersistedQueue.makeFactory.pipe(
        Effect.provideService(PersistedQueue.PersistedQueueStore, store)
      )
      const queue = yield* factory.make({ name: "crash-recovery", schema: Schema.Number })
      const sql = (yield* SqlClient.SqlClient).withoutTransforms()
      const table = sql(tableName)

      const id = yield* queue.offer(1)
      // simulate a worker that claimed the element and then crashed: the lock
      // is held by a dead worker and the claim consumed an attempt
      yield* sql`
        UPDATE ${table}
        SET acquired_by = ${crypto.randomUUID()}, acquired_at = NOW(), attempts = 1
        WHERE id = ${id}
      `

      const attempts = yield* queue.take((_n, metadata) => Effect.succeed(metadata.attempts))
      assert.strictEqual(attempts, 2)
    }).pipe(TestClock.withLive), { timeout: 20000 })

  it.effect("dead-letters elements from workers that crashed on the final attempt", () =>
    Effect.gen(function*() {
      const tableName = "effect_queue_crash_exhausted"
      const store = yield* PersistedQueue.makeStoreSql({
        tableName,
        pollInterval: "10 millis",
        lockExpiration: "500 millis",
        lockRefreshInterval: "200 millis"
      })
      const factory = yield* PersistedQueue.makeFactory.pipe(
        Effect.provideService(PersistedQueue.PersistedQueueStore, store)
      )
      const queue = yield* factory.make({ name: "crash-exhausted", schema: Schema.Number, maxAttempts: 1 })
      const sql = (yield* SqlClient.SqlClient).withoutTransforms()
      const table = sql(tableName)

      const id = yield* queue.offer(1)
      // the final attempt was claimed by a worker that crashed, so no
      // finalizer will ever settle this element
      yield* sql`
        UPDATE ${table}
        SET acquired_by = ${crypto.randomUUID()}, acquired_at = NOW(), attempts = 1
        WHERE id = ${id}
      `

      // an active taker runs the periodic pass that flips such rows to failed
      const fiber = yield* queue.take(Effect.succeed).pipe(Effect.forkScoped)

      const state = () =>
        sql<{ readonly state: string; readonly last_failure: string | null }>`
          SELECT state, last_failure FROM ${table} WHERE id = ${id}
        `.pipe(Effect.map((rows) => rows[0]))
      yield* waitFor(() => state().pipe(Effect.map((row) => row.state === "failed")))

      const row = yield* state()
      assert.strictEqual(row.state, "failed")
      assert.include(row.last_failure ?? "", "Lock expired after final attempt")
      assert.isUndefined(fiber.pollUnsafe())
    }).pipe(TestClock.withLive), { timeout: 20000 })
})

// polls a condition on the live clock until it holds or the rounds run out
const waitFor = <E>(condition: () => Effect.Effect<boolean, E>) =>
  Effect.gen(function*() {
    for (let i = 0; i < 100; i++) {
      if (yield* condition()) return
      yield* Effect.sleep(100)
    }
  })

it.layer(PgContainer.layerClient, { timeout: "30 seconds" })("Persistence SQL cleanup", (it) => {
  it.effect("deletes expired entries in batches", () =>
    Effect.gen(function*() {
      const sql = (yield* SqlClient.SqlClient).withoutTransforms()
      const table = sql("effect_persistence")
      const expiredCount = sql<{ readonly count: number }>`
        SELECT COUNT(*)::INT AS count FROM ${table} WHERE store_id = 'expired'
      `.pipe(Effect.map((rows) => rows[0].count))
      yield* sql`
        CREATE TABLE ${table} (
          store_id TEXT NOT NULL,
          id TEXT NOT NULL,
          value TEXT NOT NULL,
          expires BIGINT,
          PRIMARY KEY (store_id, id)
        )
      `

      const entries = Array.from({ length: SqlCleanupTest.expiredEntryCount }, (_, i) => ({
        store_id: "expired",
        id: String(i),
        value: "{}",
        expires: SqlCleanupTest.expiredAtEpoch
      }))
      yield* sql`INSERT INTO ${table} ${sql.insert(entries)}`.unprepared
      yield* sql`
        INSERT INTO ${table} (store_id, id, value, expires)
        VALUES ('live', 'live', '{}', NULL), ('live', 'future', '{}', ${BigInt(SqlCleanupTest.futureExpiresAt)})
      `

      yield* Layer.build(Persistence.layerBackingSql).pipe(TestClock.withLive)

      const expired = yield* SqlCleanupTest.waitForCount(expiredCount, (count) => count === 0)
      assert.strictEqual(expired, 0)
      const live = yield* sql<{ readonly count: number }>`
        SELECT COUNT(*)::INT AS count FROM ${table} WHERE store_id = 'live'
      `
      assert.strictEqual(live[0].count, 2)

      const indexes = yield* sql<{ readonly count: number }>`
        SELECT COUNT(*)::INT AS count FROM pg_indexes
        WHERE tablename = 'effect_persistence'
          AND indexname = 'effect_persistence_expires_idx'
      `
      assert.strictEqual(indexes[0].count, 1)
    }), { timeout: SqlCleanupTest.testTimeout })
})
