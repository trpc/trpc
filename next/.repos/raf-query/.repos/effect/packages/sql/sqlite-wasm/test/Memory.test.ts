import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Exit } from "effect"
import { Reactivity } from "effect/reactivity"
import { ConnectionError, SqlError } from "effect/sql/SqlError"

// The wa-sqlite loader fetches its wasm from a file URL, which Node's fetch
// does not support.
const isBun = "bun" in process.versions

describe("Memory", () => {
  it.effect.skipIf(!isBun)("export does not bypass failed-commit cleanup", () =>
    Effect.gen(function*() {
      const { SqliteClient } = yield* Effect.promise(() => import("@effect/sql-sqlite-wasm"))
      const sql = yield* SqliteClient.makeMemory({})
      yield* sql`PRAGMA foreign_keys = ON`
      yield* sql`CREATE TABLE parent (id INTEGER PRIMARY KEY)`
      yield* sql`CREATE TABLE child (parent_id INTEGER REFERENCES parent(id) DEFERRABLE INITIALLY DEFERRED)`

      // Fail only the cleanup ROLLBACK, leaving the deferred constraint failure real.
      const conn = yield* Effect.scoped(sql.reserve)
      const executeUnprepared = conn.executeUnprepared
      let failRollback = true
      Object.defineProperty(conn, "executeUnprepared", {
        configurable: true,
        value: (...args: Parameters<typeof executeUnprepared>) =>
          args[0] === "ROLLBACK" && failRollback
            ? Effect.fail(
              new SqlError({
                reason: new ConnectionError({
                  message: "injected rollback failure",
                  operation: "rollback",
                  cause: new Error("injected rollback failure")
                })
              })
            )
            : executeUnprepared.apply(conn, args)
      })
      const failedCommit = yield* Effect.exit(sql.withTransaction(sql`INSERT INTO child VALUES (999)`))
      assert.isTrue(Exit.isFailure(failedCommit))

      const rejected = yield* Effect.exit(sql.export)
      assert.isTrue(Exit.isFailure(rejected), "export bypassed the rejected connection")
      if (Exit.isFailure(rejected)) {
        assert.match(Cause.pretty(rejected.cause), /cannot be reused after failed COMMIT cleanup/i)
      }

      failRollback = false
      const snapshot = yield* SqliteClient.makeMemory({})
      yield* snapshot.import(yield* sql.export)
      assert.deepStrictEqual(yield* snapshot`SELECT * FROM child`, [])
    }).pipe(Effect.provide(Reactivity.layer)))
})
