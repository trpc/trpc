import { assert, it } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import * as SqlClient from "effect/sql/SqlClient"
import { MssqlContainer } from "./utils.ts"

// One connection, so the statement after the interruption runs on the
// connection whose request was cancelled.
it.layer(MssqlContainer.layerClientWith({ maxConnections: 1 }), {
  timeout: "120 seconds",
  excludeTestServices: true
})("MssqlClient (integration)", (it) => {
  it.effect(
    "runs the next statement on a connection whose running statement was interrupted",
    () =>
      Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient
        const running = yield* Effect.forkChild(sql`WAITFOR DELAY '00:00:05'`)
        yield* Effect.sleep("200 millis")
        yield* Fiber.interrupt(running)

        const rows = yield* sql<{ n: number }>`SELECT 1 AS n`

        assert.deepStrictEqual(rows, [{ n: 1 }])
      }),
    { timeout: 30_000 }
  )
})
