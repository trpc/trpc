import { NodeServices } from "@effect/platform-node"
import { PgMigrator } from "@effect/sql-pg"
import { assert, it } from "@effect/vitest"
import { Deferred, Effect, Fiber } from "effect"
import { SqlClient } from "effect/sql"
import { TestClock } from "effect/testing"
import { PgContainer } from "./utils.ts"

it.layer(PgContainer.layerClient, { timeout: "30 seconds" })("PgMigrator", (it) => {
  it.effect("accepts a history table committed by a concurrent migrator", () =>
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const created = yield* Deferred.make<number>()
      const commit = yield* Deferred.make<void>()
      let migrationRuns = 0
      const creator = yield* sql.withTransaction(Effect.gen(function*() {
        const [session] = yield* sql<{ pid: number }>`SELECT pg_backend_pid() AS pid`
        yield* sql`CREATE TABLE race_migrations (
          migration_id INTEGER PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          name TEXT NOT NULL
        )`
        yield* sql`INSERT INTO race_migrations (migration_id, name) VALUES (1, 'init')`
        yield* Deferred.succeed(created, session.pid)
        yield* Deferred.await(commit)
      })).pipe(Effect.forkScoped)

      yield* Effect.gen(function*() {
        const creatorPid = yield* Deferred.await(created)
        const migrator = yield* PgMigrator.run({
          table: "race_migrations",
          loader: PgMigrator.fromRecord({
            "1_init": Effect.sync(() => {
              migrationRuns++
            })
          })
        }).pipe(Effect.forkScoped)

        // Release the creator only once CREATE has reached PostgreSQL and is blocked on it.
        yield* Effect.gen(function*() {
          while (true) {
            const blocked = yield* sql`SELECT pid FROM pg_stat_activity
              WHERE wait_event_type = 'Lock'
                AND query LIKE 'CREATE TABLE "race_migrations"%'
                AND ${creatorPid} = ANY(pg_blocking_pids(pid))`
            if (blocked.length > 0) return
            yield* Effect.sleep(10)
          }
        }).pipe(Effect.timeout("10 seconds"))

        yield* Deferred.succeed(commit, undefined)
        yield* Fiber.join(creator)
        assert.deepStrictEqual(yield* Fiber.join(migrator), [])
        assert.strictEqual(migrationRuns, 0)
        assert.deepStrictEqual(
          yield* sql`SELECT migration_id, name FROM race_migrations`,
          [{ migration_id: 1, name: "init" }]
        )
      }).pipe(Effect.ensuring(Deferred.succeed(commit, undefined)))
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), TestClock.withLive), 30_000)
})
