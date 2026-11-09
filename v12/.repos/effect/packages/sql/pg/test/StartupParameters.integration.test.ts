import { PgPool } from "@effect/sql-pg"
import { assert, it } from "@effect/vitest"
import { Effect, Redacted } from "effect"
import { PgContainer } from "./utils.ts"

it.layer(PgContainer.layer, { timeout: "30 seconds" })("PostgreSQL startup defaults", (it) => {
  it.effect("preserves named and opaque defaults across replacement and RESET ALL", () =>
    Effect.gen(function*() {
      const container = yield* PgContainer
      const pool = yield* PgPool.make({
        url: Redacted.make(container.getConnectionUri()),
        startupParameters: { statement_timeout: "1234ms" },
        startupOptions: "-c lock_timeout=2345",
        maxConnections: 1
      })
      const query = "SELECT current_setting('statement_timeout') AS timeout, " +
        "current_setting('lock_timeout') AS lock"
      const defaults = [{ timeout: "1234ms", lock: "2345ms" }]
      const firstPid = yield* Effect.scoped(Effect.gen(function*() {
        const connection = yield* pool.get
        assert.deepStrictEqual((yield* connection.query(query)).rows, defaults)
        yield* pool.invalidate(connection)
        return connection.processId
      }))
      const replacement = yield* pool.get
      assert.notStrictEqual(replacement.processId, firstPid)
      assert.deepStrictEqual((yield* replacement.query(query)).rows, defaults)

      yield* replacement.query("SET statement_timeout = '5678ms'")
      yield* replacement.query("SET lock_timeout = '6789ms'")
      assert.deepStrictEqual((yield* replacement.query(query)).rows, [{
        timeout: "5678ms",
        lock: "6789ms"
      }])
      yield* replacement.query("RESET ALL")
      assert.deepStrictEqual((yield* replacement.query(query)).rows, defaults)
    }))
})
