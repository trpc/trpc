import { assert, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer } from "effect"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as SqlEventJournal from "effect/eventlog/SqlEventJournal"
import { Reactivity } from "effect/reactivity"
import * as SqlClient from "effect/sql/SqlClient"

let nextNamespace = 0

// Counts connections waiting on a lock of any kind: row and table locks, and
// advisory, user-level or application locks.
const lockWaits = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const [row] = yield* sql.onDialectOrElse({
    pg: () =>
      sql<{ n: number }>`
        SELECT COUNT(*)::int AS n FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND datname = current_database()`,
    mysql: () =>
      sql<{ n: number }>`
        SELECT
          (SELECT COUNT(*) FROM performance_schema.data_lock_waits) +
          (SELECT COUNT(*) FROM performance_schema.metadata_locks WHERE LOCK_STATUS = 'PENDING') AS n`,
    mssql: () => sql<{ n: number }>`SELECT COUNT(*) AS n FROM sys.dm_exec_requests WHERE blocking_session_id <> 0`,
    orElse: () => Effect.die("competing journal writers need a server dialect")
  })
  return Number(row.n)
})

export const suite = (name: string, layer: Layer.Layer<SqlClient.SqlClient, unknown>) =>
  it.layer(Layer.merge(Reactivity.layer, layer), { timeout: "60 seconds", excludeTestServices: true })(
    `SqlEventJournal shared by processes (${name})`,
    (it) => {
      // Process B's local write stays open in its callback while process A
      // imports a newer entry. If A commits first, B then commits an entry that
      // sorts before one committed ahead of it, and B's callback never saw it.
      it.effect("an import waits for a local write in flight on another connection", () =>
        Effect.gen(function*() {
          const namespace = `shared_${++nextNamespace}`
          const options = { entryTable: `${namespace}_entries`, remotesTable: `${namespace}_remotes` }
          const journalA = yield* SqlEventJournal.make(options)
          const journalB = yield* SqlEventJournal.make(options)

          const started = yield* Deferred.make<EventJournal.Entry>()
          const release = yield* Deferred.make<void>()
          const writeB = yield* journalB.writeMany({
            entries: [{ event: "Repro", primaryKey: "key", payload: new Uint8Array() }],
            effect: ([entry]) => Effect.andThen(Deferred.succeed(started, entry), Deferred.await(release))
          }).pipe(Effect.forkChild)
          const local = yield* Deferred.await(started)

          const newer = new EventJournal.Entry({
            id: EventJournal.makeEntryIdUnsafe({ msecs: EventJournal.entryIdMillis(local.id) + 60_000 }),
            event: "Repro",
            primaryKey: "key",
            payload: new Uint8Array()
          }, { disableChecks: true })
          const importA = yield* journalA.writeFromRemote({
            remoteId: EventJournal.makeRemoteIdUnsafe(),
            entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry: newer })],
            effect: () => Effect.void
          }).pipe(Effect.forkChild)

          let waited = false
          for (let attempt = 0; attempt < 500 && !waited; attempt++) {
            if (importA.pollUnsafe() !== undefined) break
            waited = (yield* lockWaits) > 0
            if (!waited) yield* Effect.sleep(10)
          }
          yield* Deferred.succeed(release, undefined)
          yield* Fiber.join(writeB)
          yield* Fiber.join(importA)

          assert.isTrue(waited, "the import committed while an older local write was in flight")
          assert.deepStrictEqual((yield* journalA.entries).map((entry) => entry.idString), [
            local.idString,
            newer.idString
          ])
        }))
    }
  )
