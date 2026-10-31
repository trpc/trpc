import { MssqlClient } from "@effect/sql-mssql"
import { assert, it } from "@effect/vitest"
import { Effect, Fiber, Redacted } from "effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import { MssqlContainer } from "./utils.ts"

it.layer(MssqlContainer.layer, { timeout: "90 seconds" })((it) => {
  it.effect("can query after interrupting a request in a single-connection pool", () =>
    Effect.gen(function*() {
      const container = yield* MssqlContainer
      const client = yield* MssqlClient.make({
        server: container.getHost(),
        port: container.getPort(),
        database: container.getDatabase(),
        username: container.getUsername(),
        password: Redacted.make(container.getPassword()),
        encrypt: !("Deno" in globalThis),
        trustServer: true,
        minConnections: 1,
        maxConnections: 1
      })
      // Start the request before interrupting it; do not wait for the server
      // delay or give the cancellation acknowledgement time to arrive.
      const pending = yield* client`WAITFOR DELAY '00:00:10'`.pipe(Effect.forkScoped({ startImmediately: true }))
      yield* Fiber.interrupt(pending)
      const rows = yield* client<{ value: number }>`SELECT 42 AS value`
      assert.deepStrictEqual(rows, [{ value: 42 }])
    }).pipe(Effect.provide(Reactivity.layer)))
})
