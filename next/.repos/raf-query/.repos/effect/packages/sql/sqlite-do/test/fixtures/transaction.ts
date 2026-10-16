import type { DurableObjectNamespace, DurableObjectState } from "@cloudflare/workers-types"
import * as SqliteClient from "@effect/sql-sqlite-do/SqliteClient"
import { Effect, Exit, Fiber, Scheduler } from "effect"
import * as SqlClient from "effect/sql/SqlClient"

export class TransactionObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request) {
    const mode = new URL(request.url).pathname
    const program = Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE writes (id INTEGER PRIMARY KEY)`
      // Queue an outside timer before the transaction closes the input gate.
      const outside = yield* Effect.forkScoped(sql`SELECT count(*) AS n FROM writes`)
      // Exhaust the operation budget using synchronous SQL, not explicit yieldNow.
      const writes = Effect.forEach(
        Array.from({ length: 64 }, (_, id) => id),
        (id) => sql`INSERT INTO writes VALUES (${id})`,
        { discard: true }
      ).pipe(Effect.provideService(Scheduler.MaxOpsBeforeYield, 32))
      const body = mode === "/nested"
        ? sql.withTransaction(writes)
        : mode === "/rollback"
        ? Effect.andThen(writes, Effect.fail("rollback"))
        : writes
      const exit = yield* Effect.exit(sql.withTransaction(body))
      const outsideRows = yield* Fiber.join(outside)
      const rows = yield* sql`SELECT count(*) AS n FROM writes`
      return { success: Exit.isSuccess(exit), outsideRows, rows }
    }).pipe(Effect.scoped, Effect.provide(SqliteClient.layer({ storage: this.state.storage })))
    return Response.json(await Effect.runPromise(program))
  }
}

export default {
  fetch(request: Request, env: { TEST: DurableObjectNamespace }) {
    return env.TEST.get(env.TEST.idFromName(new URL(request.url).pathname)).fetch(request.url)
  }
}
