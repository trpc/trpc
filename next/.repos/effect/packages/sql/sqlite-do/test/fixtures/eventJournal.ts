import type { DurableObjectNamespace, DurableObjectState } from "@cloudflare/workers-types"
import * as SqliteClient from "@effect/sql-sqlite-do/SqliteClient"
import { Effect } from "effect"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as SqlEventJournal from "effect/eventlog/SqlEventJournal"
import * as SqlClient from "effect/sql/SqlClient"

export class JournalObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch() {
    const program = Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const journal = yield* SqlEventJournal.make()
      // Saturated `rand_a` bits at the maximum timestamp leave no later local id.
      const id = EventJournal.makeEntryIdUnsafe({ msecs: 2 ** 48 - 1 })
      id[6] = 0x7f
      id[7] = 0xff
      const remote = new EventJournal.Entry({ id, event: "Repro", primaryKey: "key", payload: new Uint8Array() }, {
        disableChecks: true
      })
      // The import itself succeeds; the transaction around it then fails.
      const rolledBack = yield* journal.writeFromRemote({
        remoteId: EventJournal.makeRemoteIdUnsafe(),
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry: remote })],
        effect: () => Effect.void
      }).pipe(Effect.andThen(Effect.fail("rolled back")), sql.withTransaction, Effect.exit)
      const written = yield* Effect.exit(journal.write({
        event: "Repro",
        primaryKey: "key",
        payload: new Uint8Array(),
        effect: Effect.succeed
      }))
      return {
        rolledBack: rolledBack._tag,
        written: written._tag === "Success" ? [written.value.idString] : written._tag,
        entries: (yield* journal.entries).map((entry) => entry.idString)
      }
    }).pipe(Effect.scoped, Effect.provide(SqliteClient.layer({ storage: this.state.storage })))
    return Response.json(await Effect.runPromise(program))
  }
}

export default {
  fetch(request: Request, env: { JOURNAL: DurableObjectNamespace }) {
    return env.JOURNAL.get(env.JOURNAL.idFromName("journal")).fetch(request.url)
  }
}
