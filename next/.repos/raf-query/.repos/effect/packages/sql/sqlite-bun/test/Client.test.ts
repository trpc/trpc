import { assert, describe, it } from "@effect/vitest"
import { Cause, Duration, Effect, Exit, Fiber } from "effect"
import { Reactivity } from "effect/reactivity"
import { TestClock } from "effect/testing"
import { rejects } from "node:assert/strict"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const isBun = "bun" in process.versions

const makeLockedDatabase = Effect.gen(function*() {
  const { Database } = yield* Effect.promise(() => import("bun:sqlite"))
  const dir = yield* Effect.acquireRelease(
    Effect.promise(() => mkdtemp(join(tmpdir(), "effect-sqlite-bun-"))),
    (dir) => Effect.promise(() => rm(dir, { recursive: true, force: true }))
  )
  const filename = join(dir, "test.db")
  const lock = yield* Effect.acquireRelease(
    Effect.sync(() => new Database(filename)),
    (db) => Effect.sync(() => db.close())
  )
  lock.run("BEGIN IMMEDIATE")
  return { filename, unlock: () => lock.run("ROLLBACK") }
})

describe("Client", () => {
  it.effect("should work", () => Effect.void)

  it.effect.skipIf(!isBun)("uses a 5 second busy timeout", () =>
    Effect.gen(function*() {
      const { SqliteClient } = yield* Effect.promise(() => import("@effect/sql-sqlite-bun"))
      const sql = yield* SqliteClient.make({ filename: ":memory:" })
      assert.deepStrictEqual(yield* sql`PRAGMA busy_timeout`, [{ timeout: 5000 }])

      const custom = yield* SqliteClient.make({ filename: ":memory:", busyTimeout: "1 second" })
      assert.deepStrictEqual(yield* custom`PRAGMA busy_timeout`, [{ timeout: 1000 }])

      const infinite = yield* SqliteClient.make({ filename: ":memory:", busyTimeout: Duration.infinity })
      assert.deepStrictEqual(yield* infinite`PRAGMA busy_timeout`, [{ timeout: 2_147_483_647 }])
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect.skipIf(!isBun)("starts transactions immediately", () =>
    Effect.gen(function*() {
      const { SqliteClient } = yield* Effect.promise(() => import("@effect/sql-sqlite-bun"))
      const filename = `/tmp/effect-sqlite-bun-transaction-${crypto.randomUUID()}.db`
      yield* Effect.acquireRelease(
        Effect.void,
        () => Effect.promise(() => rm(filename, { force: true }))
      )

      const client = yield* SqliteClient.make({ filename })
      const contender = yield* SqliteClient.make({ filename })
      yield* contender`PRAGMA busy_timeout = 1`

      yield* client.withTransaction(
        Effect.gen(function*() {
          const error = yield* Effect.flip(contender`BEGIN IMMEDIATE`)
          assert.strictEqual(error._tag, "SqlError")
          assert(error.reason.cause instanceof Error)
          assert.match(error.reason.cause.message, /database is locked/i)
        })
      )
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect.skipIf(!isBun)("exports inside transactions", () =>
    Effect.gen(function*() {
      const { SqliteClient } = yield* Effect.promise(() => import("@effect/sql-sqlite-bun"))
      const { Database } = yield* Effect.promise(() => import("bun:sqlite"))
      const sql = yield* SqliteClient.make({ filename: ":memory:" })
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY)`

      const bytes = yield* sql.withTransaction(
        sql`INSERT INTO test DEFAULT VALUES`.pipe(Effect.andThen(sql.export))
      )
      const snapshot = Database.deserialize(bytes)
      try {
        assert.deepStrictEqual(snapshot.query("SELECT * FROM test").all(), [{ id: 1 }])
      } finally {
        snapshot.close()
      }
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect.skipIf(!isBun)(
    "recovers a failed deferred commit without losing an in-memory database",
    () =>
      Effect.gen(function*() {
        const { SqliteClient } = yield* Effect.promise(() => import("@effect/sql-sqlite-bun"))
        const sql = yield* SqliteClient.make({ filename: ":memory:" })
        yield* sql`PRAGMA foreign_keys = ON`
        yield* sql`CREATE TABLE parent (id INTEGER PRIMARY KEY)`
        yield* sql`CREATE TABLE child (parent_id INTEGER REFERENCES parent(id) DEFERRABLE INITIALLY DEFERRED)`
        yield* sql`INSERT INTO parent VALUES (1)`

        const failedCommit = yield* Effect.exit(sql.withTransaction(sql`INSERT INTO child VALUES (999)`))
        assert.isTrue(Exit.isFailure(failedCommit))
        if (!Exit.isFailure(failedCommit)) return
        assert.match(Cause.pretty(failedCommit.cause), /foreign key constraint failed/i)

        assert.deepStrictEqual(yield* sql`SELECT * FROM parent`, [{ id: 1 }])
        assert.deepStrictEqual(yield* sql`SELECT * FROM child`, [])
        yield* sql.withTransaction(sql`INSERT INTO child VALUES (1)`)
        assert.deepStrictEqual(yield* sql`SELECT * FROM child`, [{ parent_id: 1 }])
      }).pipe(Effect.provide(Reactivity.layer))
  )

  it.effect.skipIf(!isBun)("readonly clients reject writes", () =>
    Effect.gen(function*() {
      const { SqliteClient } = yield* Effect.promise(() => import("@effect/sql-sqlite-bun"))
      const filename = `/tmp/effect-sqlite-bun-readonly-${crypto.randomUUID()}.db`
      yield* Effect.acquireRelease(
        Effect.void,
        () => Effect.promise(() => rm(filename, { force: true }))
      )

      yield* Effect.scoped(
        Effect.gen(function*() {
          const sql = yield* SqliteClient.make({ filename })
          yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY)`
        })
      )

      const sql = yield* SqliteClient.make({ filename, readonly: true })
      assert.deepStrictEqual(yield* sql`SELECT * FROM test`, [])

      const error = yield* Effect.flip(sql`INSERT INTO test DEFAULT VALUES`)
      assert.strictEqual(error._tag, "SqlError")
      assert(error.reason.cause instanceof Error)
      assert.match(error.reason.cause.message, /attempt to write a readonly database/i)

      yield* sql`PRAGMA query_only = ON`
      assert.deepStrictEqual(yield* sql.withTransaction(sql`SELECT * FROM test`), [])
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect.skipIf(!isBun)("opens file: URIs in readonly mode", () =>
    Effect.gen(function*() {
      const { SqliteClient } = yield* Effect.promise(() => import("@effect/sql-sqlite-bun"))
      const filename = `/tmp/effect-sqlite-bun-uri-${crypto.randomUUID()}.db`
      yield* Effect.acquireRelease(
        Effect.void,
        () => Effect.promise(() => rm(filename, { force: true }))
      )

      yield* Effect.scoped(
        Effect.gen(function*() {
          const sql = yield* SqliteClient.make({ filename })
          yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY)`
          yield* sql`INSERT INTO test (id) VALUES (1)`
        })
      )

      const uri = `${pathToFileURL(filename).href}?immutable=1`
      const sql = yield* SqliteClient.make({ filename: uri, readonly: true })
      assert.deepStrictEqual(yield* sql`SELECT * FROM test`, [{ id: 1 }])
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect.skipIf(!isBun)("rejects writes to a plain readonly file: URI", () =>
    Effect.gen(function*() {
      const { SqliteClient } = yield* Effect.promise(() => import("@effect/sql-sqlite-bun"))
      const filename = `/tmp/effect-sqlite-bun-uri-readonly-${crypto.randomUUID()}.db`
      yield* Effect.acquireRelease(Effect.void, () => Effect.promise(() => rm(filename, { force: true })))

      yield* Effect.scoped(Effect.gen(function*() {
        const sql = yield* SqliteClient.make({ filename })
        yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY)`
      }))

      const sql = yield* SqliteClient.make({ filename: pathToFileURL(filename).href, readonly: true })
      assert.deepStrictEqual(yield* sql`SELECT * FROM test`, [])
      const error = yield* Effect.flip(sql`INSERT INTO test (id) VALUES (1)`)
      assert.strictEqual(error._tag, "SqlError")
      assert(error.reason.cause instanceof Error)
      assert.match(error.reason.cause.message, /attempt to write a readonly database/i)
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect.skipIf(!isBun)("does not create a missing file: URI with create: false", () =>
    Effect.gen(function*() {
      const { SqliteClient } = yield* Effect.promise(() => import("@effect/sql-sqlite-bun"))
      const filename = `/tmp/effect-sqlite-bun-uri-missing-${crypto.randomUUID()}.db`
      yield* Effect.acquireRelease(Effect.void, () => Effect.promise(() => rm(filename, { force: true })))

      const error = yield* Effect.flip(
        Effect.scoped(SqliteClient.make({ filename: pathToFileURL(filename).href, create: false }))
      )
      assert.strictEqual(error.reason._tag, "ConnectionError")
      yield* Effect.promise(() => rejects(stat(filename), { code: "ENOENT" }))
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect.skipIf(!isBun)("create implies readwrite for file: URIs", () =>
    Effect.gen(function*() {
      const { SqliteClient } = yield* Effect.promise(() => import("@effect/sql-sqlite-bun"))
      const filename = `/tmp/effect-sqlite-bun-uri-create-${crypto.randomUUID()}.db`
      yield* Effect.acquireRelease(Effect.void, () => Effect.promise(() => rm(filename, { force: true })))
      const sql = yield* SqliteClient.make({ filename: pathToFileURL(filename).href, readwrite: false })
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY)`
      yield* sql`INSERT INTO test (id) VALUES (1)`
      assert.deepStrictEqual(yield* sql`SELECT * FROM test`, [{ id: 1 }])
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect.skipIf(!isBun)("retries enabling WAL while the database is locked", () =>
    Effect.gen(function*() {
      const { SqliteClient } = yield* Effect.promise(() => import("@effect/sql-sqlite-bun"))
      const { filename, unlock } = yield* makeLockedDatabase
      const fiber = yield* SqliteClient.make({ filename }).pipe(Effect.forkChild({ startImmediately: true }))
      unlock()
      yield* TestClock.adjust("10 millis")
      const sql = yield* Fiber.join(fiber)
      assert.deepStrictEqual(yield* sql`PRAGMA journal_mode`, [{ journal_mode: "wal" }])
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect.skipIf(!isBun)("fails to enable WAL with a typed error after busyTimeout", () =>
    Effect.gen(function*() {
      const { SqliteClient } = yield* Effect.promise(() => import("@effect/sql-sqlite-bun"))
      const { filename } = yield* makeLockedDatabase
      const fiber = yield* SqliteClient.make({ filename, busyTimeout: "1 second" }).pipe(
        Effect.forkChild({ startImmediately: true })
      )
      yield* TestClock.adjust("2 seconds")
      const error = yield* Effect.flip(Fiber.join(fiber))
      assert.strictEqual(error.reason._tag, "LockTimeoutError")
    }).pipe(Effect.provide(Reactivity.layer)))
})
