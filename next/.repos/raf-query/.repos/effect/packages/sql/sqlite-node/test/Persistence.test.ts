import { NodeFileSystem } from "@effect/platform-node"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { assert, expect, it } from "@effect/vitest"
import { Duration, Effect, FileSystem, Layer } from "effect"
import * as PersistedQueueTest from "effect-test/persistence/PersistedQueueTest"
import * as SqlCleanupTest from "effect-test/persistence/SqlCleanupTest"
import { PersistedQueue, Persistence } from "effect/persistence"
import { Reactivity } from "effect/reactivity"
import * as SqlClient from "effect/sql/SqlClient"
import { TestClock } from "effect/testing"

const ClientLayer = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const dir = yield* fs.makeTempDirectoryScoped()
  return SqliteClient.layer({
    filename: dir + "/test.db"
  })
}).pipe(
  Layer.unwrap,
  Layer.provide([NodeFileSystem.layer, Reactivity.layer])
)

const testLayer = (layer: Layer.Layer<Persistence.BackingPersistence, never, SqlClient.SqlClient>) =>
  layer.pipe(Layer.provideMerge(ClientLayer))

const suite = (
  name: string,
  layer: Layer.Layer<Persistence.BackingPersistence, never, SqlClient.SqlClient>,
  options: {
    /**
     * A crafted `getMany` key which, if request keys are interpolated into SQL
     * without parameterization, escapes the `IN` list and
     * reads the `sqli_victim` store's entries from the `sqli_attacker` store.
     */
    readonly injectionProbe: string
  }
) =>
  it.layer(testLayer(layer))(`Persistence (${name})`, (it) => {
    it.effect("set + get", () =>
      Effect.gen(function*() {
        const persistence = yield* Persistence.BackingPersistence
        const store = yield* persistence.make("test_store")
        yield* store.set("key1", { name: "Alice" }, undefined)
        const value = yield* store.get("key1")
        expect(value).toEqual({ name: "Alice" })

        // test upsert
        yield* store.set("key1", { name: "Alice" }, undefined)
      }))

    it.effect("setMany + getMany", () =>
      Effect.gen(function*() {
        const persistence = yield* Persistence.BackingPersistence
        const store = yield* persistence.make("test_store_2")
        yield* store.setMany([
          ["key1", { name: "Alice" }, undefined],
          ["key2", { name: "Bob" }, undefined],
          ["key3", { name: "Charlie" }, undefined]
        ])
        const values = yield* store.getMany(["key1", "key2", "key3", "key4"])
        expect(values).toEqual([
          { name: "Alice" },
          { name: "Bob" },
          { name: "Charlie" },
          undefined
        ])
      }))

    it.effect("getMany with duplicate keys", () =>
      Effect.gen(function*() {
        const persistence = yield* Persistence.BackingPersistence
        const store = yield* persistence.make("test_store_duplicate_keys")
        yield* store.set("key", { value: 1 }, undefined)

        expect(yield* store.getMany(["key", "key"])).toEqual([{ value: 1 }, { value: 1 }])
      }))

    it.effect("remove", () =>
      Effect.gen(function*() {
        const persistence = yield* Persistence.BackingPersistence
        const store = yield* persistence.make("test_store_2")
        yield* store.setMany([
          ["key1", { name: "Alice" }, undefined],
          ["key2", { name: "Bob" }, undefined],
          ["key3", { name: "Charlie" }, undefined]
        ])
        yield* store.remove("key2")
        const valuesAfter = yield* store.getMany(["key1", "key2", "key3"])
        expect(valuesAfter).toEqual([{ name: "Alice" }, undefined, { name: "Charlie" }])
      }))

    it.effect("expires", () =>
      Effect.gen(function*() {
        const persistence = yield* Persistence.BackingPersistence
        const store = yield* persistence.make("test_store_3")
        yield* store.setMany([
          ["key1", { name: "Alice" }, undefined],
          ["key2", { name: "Bob" }, undefined],
          ["key3", { name: "Charlie" }, Duration.seconds(10)]
        ])
        let values = yield* store.getMany(["key1", "key2", "key3"])
        expect(values).toEqual([{ name: "Alice" }, { name: "Bob" }, { name: "Charlie" }])
        yield* TestClock.adjust(Duration.seconds(5))
        values = yield* store.getMany(["key1", "key2", "key3"])
        expect(values).toEqual([{ name: "Alice" }, { name: "Bob" }, { name: "Charlie" }])
        yield* TestClock.adjust(Duration.seconds(5))
        values = yield* store.getMany(["key1", "key2", "key3"])
        expect(values).toEqual([{ name: "Alice" }, { name: "Bob" }, undefined])
      }))

    it.effect("isolation between stores", () =>
      Effect.gen(function*() {
        const persistence = yield* Persistence.BackingPersistence
        const storeA = yield* persistence.make("test_store_a")
        const storeB = yield* persistence.make("test_store_b")

        yield* storeA.set("shared-key", { name: "Alice" }, undefined)
        yield* storeB.set("shared-key", { name: "Bob" }, undefined)

        expect(yield* storeA.get("shared-key")).toEqual({ name: "Alice" })
        expect(yield* storeB.get("shared-key")).toEqual({ name: "Bob" })

        yield* storeA.clear

        expect(yield* storeA.get("shared-key")).toEqual(undefined)
        expect(yield* storeB.get("shared-key")).toEqual({ name: "Bob" })
      }))

    it.effect("getMany treats keys containing single quotes as data", () =>
      Effect.gen(function*() {
        const persistence = yield* Persistence.BackingPersistence
        const store = yield* persistence.make("test_store_quotes")
        yield* store.set("it's-a-key", { name: "Alice" }, undefined)

        // Keys must be bound as parameters, not
        // interpolated into the `IN` list as raw string literals.
        const values = yield* store.getMany(["it's-a-key", "missing'key"])
        expect(values).toEqual([{ name: "Alice" }, undefined])
      }))

    it.effect("getMany preserves store isolation for crafted keys", () =>
      Effect.gen(function*() {
        const persistence = yield* Persistence.BackingPersistence
        const victim = yield* persistence.make("sqli_victim")
        yield* victim.set("secret", { secret: "victim-data" }, undefined)

        const attacker = yield* persistence.make("sqli_attacker")
        yield* attacker.set("innocent", { name: "Mallory" }, undefined)

        // The probe is a no-op key when keys are parameterized. If keys are
        // interpolated into raw SQL it escapes the `IN` list and exfiltrates
        // the victim store's `secret` entry into the attacker's results.
        const values = yield* attacker.getMany(["secret", options.injectionProbe])
        expect(values).toEqual([undefined, undefined])
        expect(yield* attacker.get("secret")).toEqual(undefined)
      }))
  })

suite("table-per-store", Persistence.layerBackingSqlMultiTable, {
  // Expands to `... WHERE id IN ('secret', '') UNION SELECT id, value FROM
  // effect_persistence_sqli_victim WHERE ('1'='1') AND (expires IS NULL OR
  // expires > ?)`, appending every victim row to the attacker's result set.
  injectionProbe: `') UNION SELECT id, value FROM effect_persistence_sqli_victim WHERE ('1'='1`
})
suite("single-table", Persistence.layerBackingSql, {
  // Expands to `... WHERE store_id = 'sqli_attacker' AND id IN ('secret', '')
  // OR store_id='sqli_victim' AND ('1'='1') AND (expires IS NULL OR expires >
  // ?)`, bypassing the store isolation filter.
  injectionProbe: `') OR store_id='sqli_victim' AND ('1'='1`
})

PersistedQueueTest.suite(
  "sql-sqlite-node",
  PersistedQueue.layerStoreSql().pipe(Layer.provide(ClientLayer))
)

it.layer(ClientLayer)("Persistence SQL cleanup", (it) => {
  it.effect("deletes expired entries in batches", () =>
    Effect.gen(function*() {
      const sql = (yield* SqlClient.SqlClient).withoutTransforms()
      const table = sql("effect_persistence")
      const expiredCount = sql<{ readonly count: number }>`
        SELECT COUNT(*) AS count FROM ${table} WHERE store_id = 'expired'
      `.pipe(Effect.map((rows) => rows[0].count))
      yield* sql`
        CREATE TABLE ${table} (
          store_id TEXT NOT NULL,
          id TEXT NOT NULL,
          value TEXT NOT NULL,
          expires INTEGER,
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
        VALUES ('live', 'live', '{}', NULL), ('live', 'future', '{}', ${SqlCleanupTest.futureExpiresAt})
      `

      yield* Layer.build(Persistence.layerBackingSql).pipe(TestClock.withLive)

      const expired = yield* SqlCleanupTest.waitForCount(expiredCount, (count) => count === 0)
      assert.strictEqual(expired, 0)
      const live = yield* sql<{ readonly count: number }>`
        SELECT COUNT(*) AS count FROM ${table} WHERE store_id = 'live'
      `
      assert.strictEqual(live[0].count, 2)

      const indexes = yield* sql<{ readonly count: number }>`
        SELECT COUNT(*) AS count FROM sqlite_master
        WHERE type = 'index'
          AND name = 'effect_persistence_expires_idx'
      `
      assert.strictEqual(indexes[0].count, 1)
    }), { timeout: SqlCleanupTest.testTimeout })
})
