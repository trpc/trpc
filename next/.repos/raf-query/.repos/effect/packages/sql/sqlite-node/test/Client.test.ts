import { NodeFileSystem } from "@effect/platform-node"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Duration, Effect, Exit, Fiber, FileSystem, Option } from "effect"
import { Reactivity } from "effect/reactivity"
import { ConnectionError, SqlError } from "effect/sql/SqlError"
import { TestClock } from "effect/testing"
import { DatabaseSync } from "node:sqlite"

const makeClient = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const dir = yield* fs.makeTempDirectoryScoped()
  return yield* SqliteClient.make({
    filename: dir + "/test.db"
  })
}).pipe(Effect.provide([NodeFileSystem.layer, Reactivity.layer]))

const makeClients = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const dir = yield* fs.makeTempDirectoryScoped()
  const filename = dir + "/test.db"
  return {
    client: yield* SqliteClient.make({ filename }),
    contender: yield* SqliteClient.make({ filename })
  }
}).pipe(Effect.provide([NodeFileSystem.layer, Reactivity.layer]))

const makeLockedDatabase = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const dir = yield* fs.makeTempDirectoryScoped()
  const filename = dir + "/test.db"
  const lock = yield* Effect.acquireRelease(
    Effect.sync(() => new DatabaseSync(filename)),
    (db) => Effect.sync(() => db.close())
  )
  lock.exec("BEGIN IMMEDIATE")
  return { filename, unlock: () => lock.exec("ROLLBACK") }
}).pipe(Effect.provide(NodeFileSystem.layer))

describe("Client", () => {
  it.effect("releases completed nested savepoints", () =>
    Effect.gen(function*() {
      const sql = yield* makeClient
      yield* sql`CREATE TABLE savepoint_release (value INTEGER)`
      yield* sql.withTransaction(Effect.gen(function*() {
        for (const rollback of [false, true]) {
          yield* sql.withTransaction(
            sql`INSERT INTO savepoint_release VALUES (1)`.pipe(
              Effect.andThen(rollback ? Effect.fail("rollback") : Effect.void)
            )
          ).pipe(Effect.ignore)
          const error = yield* sql`RELEASE SAVEPOINT effect_sql_1`.unprepared.pipe(Effect.flip)
          assert.strictEqual(error._tag, "SqlError")
        }
      }))
      assert.deepStrictEqual(yield* sql`SELECT value FROM savepoint_release`, [{ value: 1 }])
      const error = yield* sql.withTransaction(
        sql.withTransaction(sql`INSERT INTO savepoint_release VALUES (2)`).pipe(
          Effect.andThen(Effect.fail("outer rollback"))
        )
      ).pipe(Effect.flip)
      assert.strictEqual(error, "outer rollback")
      assert.deepStrictEqual(yield* sql`SELECT value FROM savepoint_release`, [{ value: 1 }])
    }))

  it.effect("should work", () =>
    Effect.gen(function*() {
      const sql = yield* makeClient
      let response
      response = yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`
      assert.deepStrictEqual(response, [])
      response = yield* sql`INSERT INTO test (name) VALUES ('hello')`
      assert.deepStrictEqual(response, [])
      response = yield* sql`SELECT * FROM test`
      assert.deepStrictEqual(response, [{ id: 1, name: "hello" }])
      response = yield* sql`SELECT * FROM test`.valuesUnprepared
      assert.deepStrictEqual(response, [[1, "hello"]])
      response = yield* sql`INSERT INTO test (name) VALUES ('world')`.pipe(sql.withTransaction)
      assert.deepStrictEqual(response, [])
      response = yield* sql`SELECT * FROM test`
      assert.deepStrictEqual(response, [
        { id: 1, name: "hello" },
        { id: 2, name: "world" }
      ])
      response = yield* sql`INSERT INTO test (name) VALUES ('unprepared')`.valuesUnprepared
      assert.deepStrictEqual(response, [])
      assert.deepStrictEqual(yield* sql`SELECT * FROM test WHERE id = 3`, [{ id: 3, name: "unprepared" }])
    }))

  it.effect.each(["rows", "values"] as const)(
    "returns cached INSERT %s across count_changes OFF → ON → OFF",
    (mode) =>
      Effect.gen(function*() {
        const sql = yield* makeClient
        yield* sql`CREATE TABLE count_changes (value INTEGER)`
        yield* sql`PRAGMA count_changes = OFF`
        const insert = sql`INSERT INTO count_changes VALUES (1)`
        const execute = mode === "values" ? insert.values : insert

        assert.deepStrictEqual(yield* execute, [])
        yield* sql`PRAGMA count_changes = ON`
        // Node may omit fields after recompilation; check only the row count.
        assert.lengthOf(yield* execute, 1)
        yield* sql`PRAGMA count_changes = OFF`
        assert.deepStrictEqual(yield* execute, [])
        assert.deepStrictEqual(yield* sql`SELECT COUNT(*) AS count FROM count_changes`, [{ count: 3 }])
      })
  )

  it.effect.each(["rows", "values"] as const)(
    "retries %s queries after a missing table is created",
    (mode) =>
      Effect.gen(function*() {
        const sql = yield* makeClient
        const select = sql`SELECT value FROM created_later`
        const execute: Effect.Effect<ReadonlyArray<unknown>, SqlError> = mode === "values" ? select.values : select

        const error = yield* Effect.flip(execute)
        assert.strictEqual(error._tag, "SqlError")
        yield* sql`CREATE TABLE created_later (value INTEGER)`
        yield* sql`INSERT INTO created_later VALUES (1)`

        assert.deepStrictEqual(yield* execute, mode === "values" ? [[1]] : [{ value: 1 }])
      })
  )

  it.effect("should work with raw", () =>
    Effect.gen(function*() {
      const sql = yield* makeClient
      let response
      response = yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`.raw
      assert.deepStrictEqual(response, { changes: 0, lastInsertRowid: 0 })
      response = yield* sql`INSERT INTO test (name) VALUES ('hello')`.raw
      assert.deepStrictEqual(response, { changes: 1, lastInsertRowid: 1 })
      response = yield* sql`SELECT * FROM test`.raw
      assert.deepStrictEqual(response, [{ id: 1, name: "hello" }])
      response = yield* sql`INSERT INTO test (name) VALUES ('world')`.raw.pipe(sql.withTransaction)
      assert.deepStrictEqual(response, { changes: 1, lastInsertRowid: 2 })
      response = yield* sql`SELECT * FROM test`
      assert.deepStrictEqual(response, [
        { id: 1, name: "hello" },
        { id: 2, name: "world" }
      ])
    }))

  for (const mode of ["unprepared", "valuesUnprepared"] as const) {
    it.effect(`captures ${mode} preparation errors`, () =>
      Effect.gen(function*() {
        const sql = yield* makeClient
        yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY)`

        const statement = sql`CREATE TABLE test (id INTEGER PRIMARY KEY)`
        const execution = mode === "unprepared"
          ? Effect.as(statement.unprepared, false)
          : Effect.as(statement.valuesUnprepared, false)
        const recovered = yield* execution.pipe(Effect.catchTag("SqlError", () => Effect.succeed(true)))

        assert.isTrue(recovered)
      }))
  }

  it.effect("withTransaction", () =>
    Effect.gen(function*() {
      const sql = yield* makeClient
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`
      yield* sql.withTransaction(sql`INSERT INTO test (name) VALUES ('hello')`)
      const rows = yield* sql`SELECT * FROM test`
      assert.deepStrictEqual(rows, [{ id: 1, name: "hello" }])
    }))

  it.effect("recovers a failed deferred commit without losing an in-memory database", () =>
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename: ":memory:" }).pipe(Effect.provide(Reactivity.layer))
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
    }))

  it.effect("poisons the connection when failed-commit cleanup fails", () =>
    Effect.gen(function*() {
      const sql = yield* makeClient
      yield* sql`PRAGMA foreign_keys = ON`
      yield* sql`CREATE TABLE parent (id INTEGER PRIMARY KEY)`
      yield* sql`CREATE TABLE child (parent_id INTEGER REFERENCES parent(id) DEFERRABLE INITIALLY DEFERRED)`
      yield* sql`INSERT INTO parent VALUES (1)`

      // Reserve lends the same SQLite connection used by transactions. Fail only
      // the cleanup ROLLBACK, leaving the deferred constraint failure real.
      const conn = yield* Effect.scoped(sql.reserve)
      const executeUnprepared = conn.executeUnprepared
      let failRollback = true
      Object.defineProperty(conn, "executeUnprepared", {
        configurable: true,
        value: (...args: Parameters<typeof executeUnprepared>) => {
          if (args[0] === "ROLLBACK" && failRollback) {
            return Effect.fail(
              new SqlError({
                reason: new ConnectionError({
                  message: "injected rollback failure",
                  operation: "rollback",
                  cause: new Error("injected rollback failure")
                })
              })
            )
          }
          return executeUnprepared(...args)
        }
      })

      const failedCommit = yield* Effect.exit(sql.withTransaction(sql`INSERT INTO child VALUES (999)`))
      assert.isTrue(Exit.isFailure(failedCommit))
      if (!Exit.isFailure(failedCommit)) return
      const cause = Cause.pretty(failedCommit.cause)
      assert.match(cause, /foreign key constraint failed/i)
      assert.match(cause, /injected rollback failure/i)

      const query = yield* Effect.exit(sql`SELECT * FROM parent`)
      assert.isTrue(Exit.isFailure(query))
      if (Exit.isFailure(query)) {
        assert.match(Cause.pretty(query.cause), /cannot be reused after failed COMMIT cleanup/i)
      }
      const transaction = yield* Effect.exit(sql.withTransaction(Effect.die("transaction body ran")))
      assert.isTrue(Exit.isFailure(transaction))
      const queryAfterTransaction = yield* Effect.exit(sql`SELECT * FROM parent`)
      assert.isTrue(Exit.isFailure(queryAfterTransaction))
      // Retry cleanup after the transient failure clears, without replacing the database.
      failRollback = false
      assert.deepStrictEqual(yield* sql`SELECT * FROM parent`, [{ id: 1 }])
      assert.deepStrictEqual(yield* sql`SELECT * FROM child`, [])
    }))

  it.effect("does not poison a connection already rolled back before failed commit cleanup", () =>
    Effect.gen(function*() {
      const sql = yield* makeClient
      yield* sql`CREATE TABLE items (id INTEGER PRIMARY KEY)`

      const failedCommit = yield* Effect.exit(sql.withTransaction(Effect.gen(function*() {
        yield* sql`INSERT INTO items VALUES (1)`
        const insert = yield* Effect.exit(sql`INSERT OR ROLLBACK INTO items VALUES (1)`)
        assert.isTrue(Exit.isFailure(insert))
      })))
      assert.isTrue(Exit.isFailure(failedCommit))
      if (Exit.isFailure(failedCommit)) {
        assert.match(Cause.pretty(failedCommit.cause), /no transaction is active/i)
      }

      assert.deepStrictEqual(yield* sql`SELECT * FROM items`, [])
    }))

  it.effect("withTransaction rollback", () =>
    Effect.gen(function*() {
      const sql = yield* makeClient
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`
      yield* sql`INSERT INTO test (name) VALUES ('hello')`.pipe(
        Effect.andThen(Effect.fail("boom")),
        sql.withTransaction,
        Effect.ignore
      )
      const rows = yield* sql`SELECT * FROM test`
      assert.deepStrictEqual(rows, [])
    }))

  it.effect("uses a 5 second busy timeout", () =>
    Effect.gen(function*() {
      const sql = yield* makeClient
      assert.deepStrictEqual(yield* sql`PRAGMA busy_timeout`, [{ timeout: 5000 }])

      const custom = yield* SqliteClient.make({ filename: ":memory:", busyTimeout: "1 second" }).pipe(
        Effect.provide(Reactivity.layer)
      )
      assert.deepStrictEqual(yield* custom`PRAGMA busy_timeout`, [{ timeout: 1000 }])

      const infinite = yield* SqliteClient.make({ filename: ":memory:", busyTimeout: Duration.infinity }).pipe(
        Effect.provide(Reactivity.layer)
      )
      assert.deepStrictEqual(yield* infinite`PRAGMA busy_timeout`, [{ timeout: 2_147_483_647 }])
    }))

  it.effect("starts transactions immediately", () =>
    Effect.gen(function*() {
      const { client, contender } = yield* makeClients
      yield* contender`PRAGMA busy_timeout = 1`

      yield* client.withTransaction(
        Effect.gen(function*() {
          const error = yield* Effect.flip(contender`BEGIN IMMEDIATE`)
          assert.strictEqual(error._tag, "SqlError")
          assert(error.reason.cause instanceof Error)
          assert.match(error.reason.cause.message, /database is locked/i)
        })
      )
    }))

  it.effect("fails a contended transaction with a typed error", () =>
    Effect.gen(function*() {
      const { client, contender } = yield* makeClients
      yield* contender`PRAGMA busy_timeout = 1`

      const exit = yield* client.withTransaction(
        Effect.exit(contender.withTransaction(Effect.void))
      )

      assert.isTrue(Exit.isFailure(exit))
      if (!Exit.isFailure(exit)) {
        return
      }
      // `BEGIN IMMEDIATE` cannot take the write lock, so it fails before a
      // transaction exists. The failure has to stay a typed, retryable
      // `SqlError` instead of being replaced by a rollback defect.
      assert.isFalse(
        Cause.hasDies(exit.cause),
        `expected a typed failure but the cause contains a defect:\n${Cause.pretty(exit.cause)}`
      )
      const error = Option.getOrThrow(Cause.findErrorOption(exit.cause))
      assert.strictEqual(error._tag, "SqlError")
      assert(error.reason.cause instanceof Error)
      assert.match(error.reason.cause.message, /database is locked/i)
    }))

  it.effect("supports transactions on readonly clients", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const dir = yield* fs.makeTempDirectoryScoped()
      const filename = dir + "/test.db"

      yield* Effect.scoped(
        Effect.gen(function*() {
          const sql = yield* SqliteClient.make({ filename })
          yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY)`
        })
      )

      const sql = yield* SqliteClient.make({ filename, readonly: true })
      yield* sql`PRAGMA query_only = ON`
      assert.deepStrictEqual(yield* sql.withTransaction(sql`SELECT * FROM test`), [])
    }).pipe(Effect.provide([NodeFileSystem.layer, Reactivity.layer])))

  it.effect("supports backup and export", () =>
    Effect.gen(function*() {
      const sql = yield* makeClient
      yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`
      yield* sql`INSERT INTO test (name) VALUES ('hello')`

      const metadata = yield* sql.backup(sql.config.filename + ".backup")
      assert(metadata.totalPages > 0)
      assert.strictEqual(metadata.remainingPages, 0)
    }))

  it.effect("retries enabling WAL while the database is locked", () =>
    Effect.gen(function*() {
      const { filename, unlock } = yield* makeLockedDatabase
      const fiber = yield* SqliteClient.make({ filename }).pipe(Effect.forkChild({ startImmediately: true }))
      unlock()
      yield* TestClock.adjust("10 millis")
      const sql = yield* Fiber.join(fiber)
      assert.deepStrictEqual(yield* sql`PRAGMA journal_mode`, [{ journal_mode: "wal" }])
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect("fails to enable WAL with a typed error after busyTimeout", () =>
    Effect.gen(function*() {
      const { filename } = yield* makeLockedDatabase
      const fiber = yield* SqliteClient.make({ filename, busyTimeout: "1 second" }).pipe(
        Effect.forkChild({ startImmediately: true })
      )
      yield* TestClock.adjust("2 seconds")
      const error = yield* Effect.flip(Fiber.join(fiber))
      assert.strictEqual(error.reason._tag, "LockTimeoutError")
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect("does not enable WAL on readonly clients", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const dir = yield* fs.makeTempDirectoryScoped()
      const filename = dir + "/test.db"

      yield* Effect.scoped(
        Effect.gen(function*() {
          const sql = yield* SqliteClient.make({ filename, disableWAL: true })
          yield* sql`CREATE TABLE test (id INTEGER PRIMARY KEY)`
        })
      )

      const sql = yield* SqliteClient.make({ filename, readonly: true })
      assert.deepStrictEqual(yield* sql`PRAGMA journal_mode`, [{ journal_mode: "delete" }])
    }).pipe(Effect.provide([NodeFileSystem.layer, Reactivity.layer])))
})
