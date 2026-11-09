import { NodeFileSystem } from "@effect/platform-node"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { assert, describe, it, vi } from "@effect/vitest"
import { Array as Arr, Effect, Exit, FileSystem, Layer, Option, PubSub, Queue, Schema } from "effect"
import * as ConflictsTest from "effect-test/eventlog/EventJournalConflictsTest"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as EventLogRemote from "effect/eventlog/EventLogRemote"
import * as SqlEventJournal from "effect/eventlog/SqlEventJournal"
import { Reactivity } from "effect/reactivity"
import * as SqlClient from "effect/sql/SqlClient"
import * as SqlError from "effect/sql/SqlError"
import * as Statement from "effect/sql/Statement"
import { TestClock } from "effect/testing"

const makeJournal = Effect.gen(function*() {
  const sql = yield* SqliteClient.make({ filename: ":memory:" })
  return yield* SqlEventJournal.make().pipe(
    Effect.provideService(SqlClient.SqlClient, sql)
  )
}).pipe(Effect.provide(Reactivity.layer))

// `tail` fixes the random id bytes, so entries sharing a millisecond sort in a
// known order by id.
const entry = (msecs: number, event = "Repro", primaryKey = "key", tail?: number) => {
  const id = EventJournal.makeEntryIdUnsafe({ msecs })
  if (tail !== undefined) id.fill(tail, 6)
  return new EventJournal.Entry({
    id,
    event,
    primaryKey,
    payload: new Uint8Array()
  }, { disableChecks: true })
}

const localEntry = (primaryKey: string) => ({ event: "Repro", primaryKey, payload: new Uint8Array() })

const remoteEntries = (entries: ReadonlyArray<EventJournal.Entry>) =>
  entries.map((entry, remoteSequence) => new EventJournal.RemoteEntry({ remoteSequence, entry }))

// Durable Object SQLite binds at most 100 parameters per statement. Rejecting
// larger statements makes oversized batches fail whatever the local SQLite build.
const limitParameters = Effect.provideService(
  Statement.CurrentTransformer,
  (statement) => statement.compile()[1].length > 100 ? Effect.die("too many parameters") : Effect.succeed(statement)
)

// Fresh module instances keep their own entry id clock. They load before any
// test runs, so loading them cannot stall running tests.
const isolate = () => {
  vi.resetModules()
  return Promise.all([
    import("effect/Effect"),
    import("effect/eventlog/EventJournal"),
    import("effect/eventlog/SqlEventJournal"),
    import("effect/sql/SqlClient"),
    import("@effect/sql-sqlite-node/SqliteClient"),
    import("effect/reactivity/Reactivity")
  ]).then(([Effect, EventJournal, SqlEventJournal, SqlClient, SqliteClient, Reactivity]) => ({
    Effect,
    EventJournal,
    SqlEventJournal,
    SqlClient,
    SqliteClient,
    Reactivity
  }))
}
// Stands in for another process.
const OtherProcess = await isolate()
// Importing the maximum timestamp can exhaust the entry id clock of its module.
const IsolatedRolledBackImport = await isolate()

// Saturated `rand_a` bits sort the imported entry above every local id counter
// in the same millisecond.
const importFromOtherProcess = (filename: string, msecs: number) => {
  const { Effect, EventJournal, Reactivity, SqlClient, SqlEventJournal, SqliteClient } = OtherProcess
  const id = EventJournal.makeEntryIdUnsafe({ msecs })
  id[6] = 0x7f
  id[7] = 0xff
  const entry = new EventJournal.Entry({ id, event: "Repro", primaryKey: "key", payload: new Uint8Array() }, {
    disableChecks: true
  })
  return Effect.runPromise(
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename })
      const journal = yield* SqlEventJournal.make().pipe(Effect.provideService(SqlClient.SqlClient, sql))
      yield* journal.writeFromRemote({
        remoteId: EventJournal.makeRemoteIdUnsafe(),
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry })],
        effect: () => Effect.void
      })
      return id
    }).pipe(Effect.scoped, Effect.provide(Reactivity.layer))
  )
}

describe("SqlEventJournal", () => {
  ConflictsTest.suite(makeJournal)

  it.effect("deduplicates overlapping remote entries within one incoming array", () =>
    Effect.gen(function*() {
      const journal = yield* makeJournal
      const remoteId = EventJournal.makeRemoteIdUnsafe()
      const a = entry(1_000)
      const b = entry(2_000)
      const handled: Array<string> = []
      // Flattened overlapping batches [A] and [A, B], not separate journal writes.
      const repeatedA = new EventJournal.Entry({ ...a, id: a.id.slice() as EventJournal.EntryId })
      yield* journal.writeFromRemote({
        remoteId,
        entries: [a, repeatedA, b].map((entry, remoteSequence) =>
          new EventJournal.RemoteEntry({ remoteSequence, entry })
        ),
        effect: (batch) =>
          Effect.sync(() => {
            handled.push(...batch.map(({ entry }) => entry.idString))
          })
      })

      assert.deepStrictEqual({
        handled,
        stored: (yield* journal.entries).map((entry) => entry.idString),
        nextSequence: yield* journal.nextRemoteSequence(remoteId)
      }, {
        handled: [a.idString, b.idString],
        stored: [a.idString, b.idString],
        nextSequence: 3
      })
    }))

  it.effect("advances remote progress past a trailing known entry in a partly known batch", () =>
    Effect.gen(function*() {
      const journal = yield* makeJournal
      const remoteId = EventJournal.makeRemoteIdUnsafe()
      const a = entry(1_000)
      const b = entry(2_000)
      const handled: Array<string> = []
      const effect = (batch: ReadonlyArray<{ readonly entry: EventJournal.Entry }>) =>
        Effect.sync(() => {
          handled.push(...batch.map(({ entry }) => entry.idString))
        })
      yield* journal.writeFromRemote({
        remoteId,
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry: a })],
        effect
      })
      yield* journal.writeFromRemote({
        remoteId,
        entries: [
          new EventJournal.RemoteEntry({ remoteSequence: 1, entry: b }),
          new EventJournal.RemoteEntry({ remoteSequence: 2, entry: a })
        ],
        effect
      })

      assert.deepStrictEqual({
        handled,
        stored: (yield* journal.entries).map((entry) => entry.idString),
        nextSequence: yield* journal.nextRemoteSequence(remoteId)
      }, {
        handled: [a.idString, b.idString],
        stored: [a.idString, b.idString],
        nextSequence: 3
      })
    }))

  it.effect("entriesById preserves order, repeated ids and missing entries", () =>
    Effect.gen(function*() {
      const journal = yield* makeJournal
      const entries: Array<EventJournal.Entry> = []
      for (const primaryKey of ["first", "second"]) {
        entries.push(
          yield* journal.write({
            event: "Repro",
            primaryKey,
            payload: new Uint8Array([entries.length + 1]),
            effect: Effect.succeed
          })
        )
      }
      const [first, second] = entries
      const missing = EventJournal.makeEntryIdUnsafe()
      const found = yield* journal.entriesById([
        second.id.slice() as EventJournal.EntryId,
        missing,
        first.id.slice() as EventJournal.EntryId,
        second.id.slice() as EventJournal.EntryId
      ])
      assert.deepStrictEqual(found, [second, undefined, first, second])
      assert.deepStrictEqual(yield* journal.entriesById([]), [])
    }))

  it.effect("replay invalidation observes committed entries from another connection", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const filename = directory + "/journal.db"
      const writer = yield* SqliteClient.make({ filename })
      const journal = yield* SqlEventJournal.make().pipe(Effect.provideService(SqlClient.SqlClient, writer))
      const reader = yield* SqliteClient.make({ filename, readonly: true })
      // A separate connection cannot see the replay transaction's uncommitted rows.
      const readJournal = yield* SqlEventJournal.make().pipe(Effect.provideService(SqlClient.SqlClient, reader))
      const group = EventGroup.empty.add({
        tag: "UserCreated",
        primaryKey: (payload) => payload.id,
        payload: Schema.Struct({ id: Schema.String })
      })
      const handlers = EventLog.group(group, (handlers) => handlers.handle("UserCreated", () => Effect.void)).pipe(
        Layer.merge(EventLog.groupReactivity(group, ["users"])),
        Layer.provide(EventLog.layerRegistry)
      )
      const layer = EventLog.layer(EventLog.schema(group), handlers).pipe(
        Layer.provide(Layer.succeed(EventJournal.EventJournal, journal)),
        Layer.provide(
          Layer.effect(EventLog.Identity, EventLog.makeIdentity).pipe(
            Layer.provide(EventLogEncryption.layerSubtle)
          )
        )
      )
      const reactivity = yield* Reactivity.Reactivity
      const results = yield* reactivity.query(["users"], readJournal.entries)
      assert.deepStrictEqual(yield* Queue.take(results), [])
      const entry = new EventJournal.Entry({
        id: EventJournal.makeEntryIdUnsafe(),
        event: "UserCreated",
        primaryKey: "user-1",
        payload: yield* Schema.encodeUnknownEffect(group.events.UserCreated.payloadSchemaBinary)({ id: "user-1" })
      }, { disableChecks: true })
      const changes = yield* Queue.unbounded<EventJournal.RemoteEntry, EventLogRemote.EventLogRemoteError>()
      yield* Queue.offer(changes, new EventJournal.RemoteEntry({ remoteSequence: 0, entry }))
      yield* Effect.gen(function*() {
        const registry = yield* EventLog.Registry
        yield* registry.registerRemote(EventLogRemote.EventLogRemote.of({
          id: EventJournal.makeRemoteIdUnsafe(),
          changes: () => Effect.succeed(changes),
          write: () => Effect.void,
          whenAuthenticated: (effect) => effect
        }))
        assert.deepStrictEqual((yield* Queue.take(results)).map((entry) => entry.idString), [entry.idString])
      }).pipe(Effect.provide(layer))
    }).pipe(Effect.provide([NodeFileSystem.layer, Reactivity.layer])))

  it.effect("writeMany generates ids after entries another process imported into the shared database", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const filename = (yield* fs.makeTempDirectoryScoped()) + "/journal.db"
      const sql = yield* SqliteClient.make({ filename })
      const journal = yield* SqlEventJournal.make().pipe(Effect.provideService(SqlClient.SqlClient, sql))
      // This process's clock lags the entry the other process imports.
      const millis = EventJournal.entryIdMillis(EventJournal.makeEntryIdUnsafe()) + 60_000
      const imported = yield* Effect.promise(() => importFromOtherProcess(filename, millis))
      const [local] = yield* journal.writeMany({ entries: [localEntry("key")], effect: Effect.succeed })
      assert.strictEqual(EventJournal.EntryIdOrder(imported, local.id), -1)
    }).pipe(Effect.provide([NodeFileSystem.layer, Reactivity.layer])))

  it("keeps local writes working after an enclosing transaction rolls back an import at the maximum timestamp and a write after it", async () => {
    const { Effect, EventJournal, Reactivity, SqlClient, SqlEventJournal, SqliteClient } = IsolatedRolledBackImport
    const id = EventJournal.makeEntryIdUnsafe({ msecs: 2 ** 48 - 1 })
    id[6] = 0x7f
    id[7] = 0xff
    const remote = new EventJournal.Entry({ id, event: "Repro", primaryKey: "key", payload: new Uint8Array() }, {
      disableChecks: true
    })
    const { entries, rolledBack, written } = await Effect.runPromise(
      Effect.gen(function*() {
        const sql = yield* SqliteClient.make({ filename: ":memory:" })
        const journal = yield* SqlEventJournal.make().pipe(Effect.provideService(SqlClient.SqlClient, sql))
        // The import itself succeeds, and a local write in the same transaction
        // reads it before it commits. The transaction around both then fails.
        const rolledBack = yield* journal.writeFromRemote({
          remoteId: EventJournal.makeRemoteIdUnsafe(),
          entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry: remote })],
          effect: () => Effect.void
        }).pipe(
          Effect.andThen(Effect.exit(journal.write({ ...localEntry("key"), effect: Effect.succeed }))),
          Effect.andThen(Effect.fail("rolled back")),
          sql.withTransaction,
          Effect.exit
        )
        const written = yield* Effect.exit(journal.write({ ...localEntry("key"), effect: Effect.succeed }))
        return { rolledBack, written, entries: (yield* journal.entries).map((entry) => entry.idString) }
      }).pipe(Effect.scoped, Effect.provide(Reactivity.layer))
    )
    assert.strictEqual(rolledBack._tag, "Failure")
    if (written._tag === "Failure") return assert.fail("the local write failed after the import was rolled back")
    assert.deepStrictEqual(entries, [written.value.idString])
  })

  it.effect("orders a local write after an import earlier in the same transaction", () =>
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename: ":memory:" })
      const journal = yield* SqlEventJournal.make().pipe(Effect.provideService(SqlClient.SqlClient, sql))
      // Ahead of this process's clock, with saturated `rand_a` bits.
      const id = EventJournal.makeEntryIdUnsafe({
        msecs: EventJournal.entryIdMillis(EventJournal.makeEntryIdUnsafe()) + 60_000
      })
      id[6] = 0x7f
      id[7] = 0xff
      const remote = new EventJournal.Entry({ id, event: "Repro", primaryKey: "key", payload: new Uint8Array() }, {
        disableChecks: true
      })
      const local = yield* journal.writeFromRemote({
        remoteId: EventJournal.makeRemoteIdUnsafe(),
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry: remote })],
        effect: () => Effect.void
      }).pipe(
        Effect.andThen(journal.write({ ...localEntry("key"), effect: Effect.succeed })),
        sql.withTransaction
      )
      assert.strictEqual(EventJournal.EntryIdOrder(remote.id, local.id), -1)
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect("rolls back a failed same-client handler transaction with the journal and redelivers the batch", () =>
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename: ":memory:" })
      yield* sql`CREATE TABLE projection (id TEXT PRIMARY KEY)`
      const journal = yield* SqlEventJournal.make().pipe(Effect.provideService(SqlClient.SqlClient, sql))
      const group = EventGroup.empty.add({
        tag: "UserCreated",
        primaryKey: (payload) => payload.id,
        payload: Schema.Struct({ id: Schema.String })
      })
      const handlers = EventLog.group(group, (handlers) =>
        handlers.handle("UserCreated", ({ payload }) =>
          // The primary key turns a missing rollback into a failed redelivery.
          sql`INSERT INTO projection (id) VALUES (${payload.id})`.pipe(Effect.orDie))).pipe(
          Layer.merge(EventLog.groupReactivity(group, ["users"])),
          Layer.provide(EventLog.layerRegistry)
        )
      let attempts = 0
      const layer = EventLog.layer(EventLog.schema(group), handlers).pipe(
        Layer.provide([
          Layer.succeed(EventJournal.EventJournal, journal),
          Layer.effect(EventLog.Identity, EventLog.makeIdentity).pipe(Layer.provide(EventLogEncryption.layerSubtle)),
          Layer.succeed(EventLog.HandlerTransaction, (effect) =>
            sql.withTransaction(effect).pipe(
              Effect.catchIf(SqlError.isSqlError, Effect.die),
              // Abort the first attempt after the handler transaction completes,
              // so only the enclosing journal transaction can roll it back.
              Effect.tap(() => attempts++ === 0 ? Effect.die("aborted") : Effect.void)
            ))
        ])
      )
      const reactivity = yield* Reactivity.Reactivity
      // Queries re-run after the replay releases the journal lock and transaction.
      const results = yield* reactivity.query(
        ["users"],
        Effect.all({
          projection: sql<{ id: string }>`SELECT id FROM projection ORDER BY id`.pipe(
            Effect.map((rows) => rows.map((row) => row.id))
          ),
          journal: Effect.map(journal.entries, (entries) => entries.map((entry) => entry.primaryKey))
        })
      )
      assert.deepStrictEqual(yield* Queue.take(results), { projection: [], journal: [] })
      const encode = Schema.encodeUnknownEffect(group.events.UserCreated.payloadSchemaBinary)
      const entries: Array<EventJournal.RemoteEntry> = []
      for (const id of ["user-1", "user-2"]) {
        entries.push(
          new EventJournal.RemoteEntry({
            remoteSequence: entries.length,
            entry: new EventJournal.Entry({
              id: EventJournal.makeEntryIdUnsafe(),
              event: "UserCreated",
              primaryKey: id,
              payload: yield* encode({ id })
            }, { disableChecks: true })
          })
        )
      }
      yield* Effect.gen(function*() {
        const registry = yield* EventLog.Registry
        yield* registry.registerRemote(EventLogRemote.EventLogRemote.of({
          id: EventJournal.makeRemoteIdUnsafe(),
          // Every subscription redelivers from the requested sequence.
          changes: ({ startSequence }) =>
            Effect.tap(
              Queue.unbounded<EventJournal.RemoteEntry, EventLogRemote.EventLogRemoteError>(),
              (queue) => Queue.offerAll(queue, entries.filter((entry) => entry.remoteSequence >= startSequence))
            ),
          write: () => Effect.void,
          whenAuthenticated: (effect) => effect
        }))
        const afterFailure = yield* Queue.take(results)
        yield* TestClock.adjust("200 millis")
        const afterRedelivery = yield* Queue.take(results)
        assert.deepStrictEqual({ afterFailure, afterRedelivery, attempts }, {
          afterFailure: { projection: [], journal: [] },
          afterRedelivery: { projection: ["user-1", "user-2"], journal: ["user-1", "user-2"] },
          attempts: 2
        })
      }).pipe(Effect.provide(layer))
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect("replays each remote batch in one callback with same-event-and-key conflicts that have greater ids", () =>
    Effect.gen(function*() {
      const journal = yield* makeJournal
      const newer = entry(2000, "Repro", "key", 0x80)
      const otherEvent = entry(3000, "Other", "key", 0x10)
      const otherKey = entry(3000, "Repro", "other", 0x20)
      const older = entry(1000)
      const sameBatch = entry(1500)
      const sameMillis = entry(2000, "Repro", "key", 0x10)
      const batches: Array<
        ReadonlyArray<{ readonly entry: EventJournal.Entry; readonly conflicts: ReadonlyArray<EventJournal.Entry> }>
      > = []
      const writeBatch = (entries: ReadonlyArray<EventJournal.Entry>) =>
        journal.writeFromRemote({
          remoteId: EventJournal.makeRemoteIdUnsafe(),
          entries: remoteEntries(entries),
          effect: (batch) =>
            Effect.sync(() => {
              batches.push(batch)
            })
        })
      yield* writeBatch([newer, otherEvent, otherKey])
      yield* writeBatch([older, sameBatch, sameMillis])

      assert.strictEqual(batches.length, 2)
      // Conflicts exclude the incoming batch and other event/key pairs. A
      // stored entry in the same millisecond with a greater id conflicts.
      assert.deepStrictEqual(
        batches.map((batch) => batch.map(({ conflicts, entry }) => [entry.idString, conflicts.map((c) => c.idString)])),
        [
          [[newer.idString, []], [otherEvent.idString, []], [otherKey.idString, []]],
          [
            [older.idString, [newer.idString]],
            [sameBatch.idString, [newer.idString]],
            [sameMillis.idString, [newer.idString]]
          ]
        ]
      )
    }))

  it.effect("journal queries use indexes", () =>
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename: ":memory:" })
      yield* SqlEventJournal.make().pipe(Effect.provideService(SqlClient.SqlClient, sql))
      const plan = (query: string) =>
        sql.unsafe<{ detail: string }>(`EXPLAIN QUERY PLAN ${query}`).pipe(
          Effect.map((rows) => rows.map((row) => row.detail.replace(/INDEX \S+/, "INDEX <index>")))
        )
      assert.deepStrictEqual({
        conflicts: yield* plan(
          "SELECT * FROM effect_event_journal WHERE event IN ('a', 'b') AND primary_key IN ('a', 'b') AND timestamp > 0"
        ),
        entries: yield* plan("SELECT * FROM effect_event_journal ORDER BY timestamp ASC"),
        source: yield* plan("SELECT remote_id FROM effect_event_journal_sources WHERE entry_id = x'00'")
      }, {
        conflicts: ["SEARCH effect_event_journal USING INDEX <index> (event=? AND primary_key=? AND timestamp>?)"],
        entries: ["SCAN effect_event_journal USING INDEX <index>"],
        source: ["SEARCH effect_event_journal_sources USING INDEX <index> (entry_id=?)"]
      })
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect("opens and keeps working on a database created before upload checkpoints", () =>
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename: ":memory:" })
      // The schema as created by the first release of SqlEventJournal.
      yield* sql`
        CREATE TABLE effect_event_journal (
          id BLOB PRIMARY KEY,
          event TEXT NOT NULL,
          primary_key TEXT NOT NULL,
          payload BLOB NOT NULL,
          timestamp INTEGER NOT NULL
        )`
      yield* sql`
        CREATE TABLE effect_event_remotes (
          remote_id BLOB NOT NULL,
          entry_id BLOB NOT NULL,
          sequence INT NOT NULL,
          PRIMARY KEY (remote_id, entry_id)
        )`
      const remoteId = EventJournal.makeRemoteIdUnsafe()
      const local = entry(1000, "Repro", "local")
      const imported = entry(2000, "Repro", "imported")
      for (const { event, id, primaryKey, payload, createdAtMillis } of [local, imported]) {
        yield* sql`INSERT INTO effect_event_journal ${
          sql.insert({ id, event, primary_key: primaryKey, payload, timestamp: createdAtMillis })
        }`
      }
      yield* sql`INSERT INTO effect_event_remotes ${
        sql.insert({ remote_id: remoteId, entry_id: imported.id, sequence: 0 })
      }`

      const journal = yield* SqlEventJournal.make().pipe(Effect.provideService(SqlClient.SqlClient, sql))
      const upload = (remoteId: EventJournal.RemoteId) =>
        journal.withRemoteUncommited(remoteId, (entries) => Effect.succeed(entries.map((entry) => entry.idString)))
      assert.deepStrictEqual({
        remote: yield* upload(remoteId),
        otherRemote: yield* upload(EventJournal.makeRemoteIdUnsafe())
      }, {
        remote: Option.some([local.idString]),
        otherRemote: Option.some([local.idString, imported.idString])
      })
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect("replaces per-entry remote rows with entry sources in one restartable migration", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const filename = (yield* fs.makeTempDirectoryScoped()) + "/journal.db"
      const sql = yield* SqliteClient.make({ filename })
      // A journal written by an unreleased build with upload checkpoints and cursors.
      yield* sql`
        CREATE TABLE effect_event_journal (
          id BLOB PRIMARY KEY,
          event TEXT NOT NULL,
          primary_key TEXT NOT NULL,
          payload BLOB NOT NULL,
          timestamp INTEGER NOT NULL
        )`
      yield* sql`
        CREATE TABLE effect_event_remotes (
          remote_id BLOB NOT NULL,
          entry_id BLOB NOT NULL,
          sequence INT NOT NULL,
          PRIMARY KEY (remote_id, entry_id)
        )`
      yield* sql`CREATE TABLE effect_event_journal_sequence (sequence INTEGER PRIMARY KEY, entry_id BLOB NOT NULL UNIQUE)`
      yield* sql`CREATE TABLE effect_event_remotes_checkpoints (remote_id BLOB PRIMARY KEY, sequence INTEGER NOT NULL)`
      yield* sql`CREATE TABLE effect_event_remotes_cursors (remote_id BLOB PRIMARY KEY, next_sequence INT NOT NULL)`
      yield* sql`CREATE INDEX effect_event_journal_event_idx ON effect_event_journal (event, primary_key, timestamp)`
      yield* sql`CREATE INDEX effect_event_journal_timestamp_idx ON effect_event_journal (timestamp)`
      yield* sql`CREATE INDEX effect_event_remotes_sequence_idx ON effect_event_remotes (remote_id, sequence)`

      const remoteA = EventJournal.makeRemoteIdUnsafe()
      const remoteB = EventJournal.makeRemoteIdUnsafe()
      const uploaded = entry(1000, "Repro", "uploaded")
      const fromA = entry(2000, "Repro", "fromA")
      // Acknowledged by A, but the upload checkpoint was not saved before a restart.
      const acked = entry(3000, "Repro", "acked")
      const fromB = entry(4000, "Repro", "fromB")
      // Written offline; no remote has it.
      const pending = entry(5000, "Repro", "pending")
      for (const { createdAtMillis, event, id, payload, primaryKey } of [uploaded, fromA, acked, fromB, pending]) {
        yield* sql`INSERT INTO effect_event_journal ${
          sql.insert({ id, event, primary_key: primaryKey, payload, timestamp: createdAtMillis })
        }`
        yield* sql`INSERT INTO effect_event_journal_sequence ${sql.insert({ entry_id: id })}`
      }
      yield* sql`INSERT INTO effect_event_remotes ${
        sql.insert([
          { remote_id: remoteA, entry_id: fromA.id, sequence: 0 },
          { remote_id: remoteA, entry_id: acked.id, sequence: 1 },
          { remote_id: remoteB, entry_id: fromB.id, sequence: 3 }
        ])
      }`
      yield* sql`INSERT INTO effect_event_remotes_checkpoints ${sql.insert({ remote_id: remoteA, sequence: 1 })}`
      // B has no cursor row, so its download progress is only in the remotes table.
      yield* sql`INSERT INTO effect_event_remotes_cursors ${sql.insert({ remote_id: remoteA, next_sequence: 2 })}`

      const open = (client: SqlClient.SqlClient) =>
        SqlEventJournal.make().pipe(Effect.provideService(SqlClient.SqlClient, client))
      const failDrop: Statement.Transformer = (statement) =>
        statement.compile()[0].includes("DROP TABLE")
          ? Effect.die("interrupted migration")
          : Effect.succeed(statement)
      const interrupted = yield* Effect.exit(
        open(sql).pipe(Effect.provideService(Statement.CurrentTransformer, failDrop))
      )

      const journal = yield* open(sql)
      const readonly = yield* open(yield* SqliteClient.make({ filename, readonly: true }))
      const state = (journal: EventJournal.EventJournal["Service"]) =>
        Effect.all({
          entries: Effect.map(journal.entries, (entries) => entries.map((entry) => entry.idString)),
          nextA: journal.nextRemoteSequence(remoteA),
          nextB: journal.nextRemoteSequence(remoteB)
        })
      const migrated = yield* state(journal)
      const reopened = yield* state(readonly)
      const tables = yield* sql<{ name: string }>`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`

      const fresh = entry(6000, "Repro", "fresh")
      yield* journal.writeFromRemote({
        remoteId: remoteB,
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 4, entry: fresh })],
        effect: () => Effect.void
      })
      const upload = (remoteId: EventJournal.RemoteId) =>
        journal.withRemoteUncommited(remoteId, (entries) => Effect.succeed(entries.map((entry) => entry.idString)))
      const ids = (...entries: ReadonlyArray<EventJournal.Entry>) => entries.map((entry) => entry.idString)

      const expected = {
        entries: ids(uploaded, fromA, acked, fromB, pending),
        nextA: 2,
        nextB: 4
      }
      assert.deepStrictEqual({
        interrupted: Exit.isFailure(interrupted),
        migrated,
        reopened,
        tables: tables.map((table) => table.name),
        nextB: yield* journal.nextRemoteSequence(remoteB),
        uploadA: yield* upload(remoteA),
        uploadB: yield* upload(remoteB),
        uploadLate: yield* upload(EventJournal.makeRemoteIdUnsafe())
      }, {
        interrupted: true,
        migrated: expected,
        reopened: expected,
        tables: [
          "effect_event_journal",
          "effect_event_journal_sequence",
          "effect_event_journal_sources",
          "effect_event_remotes_checkpoints",
          "effect_event_remotes_cursors"
        ],
        nextB: 5,
        // Never back to the source, and nothing at or below a checkpoint.
        uploadA: Option.some(ids(fromB, pending, fresh)),
        uploadB: Option.some(ids(uploaded, fromA, acked, pending)),
        uploadLate: Option.some(ids(uploaded, fromA, acked, fromB, pending, fresh))
      })
    }).pipe(Effect.provide([NodeFileSystem.layer, Reactivity.layer])))

  for (const [name, make] of [["SQL", makeJournal], ["memory", EventJournal.makeMemory]] as const) {
    describe(name, () => {
      it.effect("withRemoteUncommited uploads each entry once, retries failures and forwards older imports", () =>
        Effect.gen(function*() {
          const journal = yield* make
          const remoteId = EventJournal.makeRemoteIdUnsafe()
          const upload = journal.withRemoteUncommited(
            remoteId,
            (entries) => Effect.succeed(entries.map((entry) => entry.idString))
          )
          const a = yield* journal.write({ ...localEntry("a"), effect: Effect.succeed })
          const failed = yield* Effect.exit(journal.withRemoteUncommited(remoteId, () => Effect.fail("upload failed")))
          const retried = yield* upload
          // No echo from the remote: a successful upload alone must advance it.
          const b = yield* journal.write({ ...localEntry("b"), effect: Effect.succeed })
          const next = yield* upload
          const older = entry(a.createdAtMillis - 1)
          yield* journal.writeFromRemote({
            remoteId: EventJournal.makeRemoteIdUnsafe(),
            entries: remoteEntries([older]),
            effect: () => Effect.void
          })
          const forwarded = yield* upload
          const idle = yield* upload
          assert.deepStrictEqual({ failed: Exit.isFailure(failed), retried, next, forwarded, idle }, {
            failed: true,
            retried: Option.some([a.idString]),
            next: Option.some([b.idString]),
            forwarded: Option.some([older.idString]),
            idle: Option.none()
          })
        }))

      it.effect("writeMany commits and publishes a batch in order only when its callback succeeds", () =>
        Effect.gen(function*() {
          const journal = yield* make
          const changes = yield* journal.changes
          const entries = [localEntry("a"), localEntry("b"), localEntry("c")] as const
          const failed = yield* Effect.exit(
            journal.writeMany({ entries, effect: () => Effect.fail("callback failed") })
          )
          const afterFailure = {
            failed: Exit.isFailure(failed),
            entries: (yield* journal.entries).length,
            published: yield* PubSub.remaining(changes)
          }
          const written = yield* journal.writeMany({ entries, effect: Effect.succeed })
          const ids = written.map((entry) => entry.idString)
          assert.deepStrictEqual({
            afterFailure,
            keys: written.map((entry) => entry.primaryKey),
            ascending: written.every((entry, i) =>
              i === 0 || EventJournal.EntryIdOrder(written[i - 1].id, entry.id) < 0
            ),
            committed: (yield* journal.entries).map((entry) => entry.idString),
            uncommitted: yield* journal.withRemoteUncommited(
              EventJournal.makeRemoteIdUnsafe(),
              (entries) => Effect.succeed(entries.map((entry) => entry.idString))
            ),
            published: (yield* PubSub.takeAll(changes)).map((entry) => entry.idString)
          }, {
            afterFailure: { failed: true, entries: 0, published: 0 },
            keys: ["a", "b", "c"],
            ascending: true,
            committed: ids,
            uncommitted: Option.some(ids),
            published: ids
          })
        }))

      it.effect("failed remote callbacks persist nothing and allow redelivery", () =>
        Effect.gen(function*() {
          const journal = yield* make
          const remoteId = EventJournal.makeRemoteIdUnsafe()
          const stored = entry(500)
          yield* journal.writeFromRemote({
            remoteId: EventJournal.makeRemoteIdUnsafe(),
            entries: remoteEntries([stored]),
            effect: () => Effect.void
          })
          const added = entry(1000)
          // A new entry followed by an echo of an entry the journal already has.
          const entries = remoteEntries([added, stored])
          const exit = yield* Effect.exit(journal.writeFromRemote({
            remoteId,
            entries,
            effect: () =>
              Effect.fail(
                new EventJournal.EventJournalError({
                  method: "writeFromRemote",
                  cause: "callback failed"
                })
              )
          }))
          assert.isTrue(Exit.isFailure(exit))
          const afterFailure = {
            entries: (yield* journal.entries).map((entry) => entry.idString),
            sequence: yield* journal.nextRemoteSequence(remoteId)
          }
          const retried: Array<string> = []
          yield* journal.writeFromRemote({
            remoteId,
            entries,
            effect: (batch) =>
              Effect.sync(() => {
                for (const { entry } of batch) retried.push(entry.idString)
              })
          })
          assert.deepStrictEqual({ afterFailure, retried }, {
            afterFailure: { entries: [stored.idString], sequence: 0 },
            retried: [added.idString]
          })
          assert.deepStrictEqual((yield* journal.entries).map((entry) => entry.idString), [
            stored.idString,
            added.idString
          ])
          assert.strictEqual(yield* journal.nextRemoteSequence(remoteId), 2)
        }))
    })
  }

  it.effect("preserves write callback error identity", () =>
    Effect.gen(function*() {
      const journal = yield* makeJournal
      const error = new Error("callback failed")
      const actual = yield* Effect.flip(journal.write({
        event: "Repro",
        primaryKey: "key",
        payload: new Uint8Array([1]),
        effect: () => Effect.fail(error)
      }))
      assert.strictEqual(actual, error)
    }))

  it.effect("preserves remote callback error identity", () =>
    Effect.gen(function*() {
      const journal = yield* makeJournal
      yield* journal.write({
        event: "Repro",
        primaryKey: "key",
        payload: new Uint8Array([1]),
        effect: () => Effect.void
      })
      const error = new Error("callback failed")
      const actual = yield* Effect.flip(
        journal.withRemoteUncommited(EventJournal.makeRemoteIdUnsafe(), () => Effect.fail(error))
      )
      assert.strictEqual(actual, error)
    }))

  it.effect("commits only after the write callback succeeds", () =>
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename: ":memory:" })
      const journal = yield* SqlEventJournal.make().pipe(Effect.provideService(SqlClient.SqlClient, sql))
      yield* Effect.exit(journal.write({
        event: "Repro",
        primaryKey: "key",
        payload: new Uint8Array([1]),
        effect: () => Effect.fail("callback failed")
      }))
      assert.deepStrictEqual(yield* journal.entries, [])
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect("writeMany commits a batch over the statement parameter limit", () =>
    Effect.gen(function*() {
      const journal = yield* makeJournal
      const written = yield* journal.writeMany({
        entries: Arr.makeBy(101, (i) => localEntry(String(i))),
        effect: Effect.succeed
      })
      assert.deepStrictEqual(
        (yield* journal.entries).map((entry) => entry.idString),
        written.map((entry) => entry.idString)
      )
    }).pipe(limitParameters))

  it.effect("writeFromRemote reports each conflict once for a batch over the statement parameter limit", () =>
    Effect.gen(function*() {
      const journal = yield* makeJournal
      const remoteId = EventJournal.makeRemoteIdUnsafe()
      // Two events sharing 101 keys: as 101 is prime, conflict lookups split
      // into chunks that mix both events, so a stored row matches several.
      const incoming = ["A", "B"].flatMap((event, e) =>
        Arr.makeBy(101, (i) => entry(1_000 + e * 101 + i, event, String(i)))
      )
      const newer = incoming.map((stored) => entry(stored.createdAtMillis + 1_000, stored.event, stored.primaryKey))
      yield* journal.writeFromRemote({
        remoteId: EventJournal.makeRemoteIdUnsafe(),
        entries: remoteEntries(newer),
        effect: () => Effect.void
      })
      const batches: Array<ReadonlyArray<readonly [string, ReadonlyArray<string>]>> = []
      yield* journal.writeFromRemote({
        remoteId,
        entries: remoteEntries(incoming),
        effect: (batch) =>
          Effect.sync(() => {
            batches.push(
              batch.map(({ conflicts, entry }) => [entry.idString, conflicts.map((c) => c.idString)] as const)
            )
          })
      })
      assert.deepStrictEqual({ batches, nextSequence: yield* journal.nextRemoteSequence(remoteId) }, {
        batches: [incoming.map((entry, i) => [entry.idString, [newer[i].idString]] as const)],
        nextSequence: 202
      })
    }).pipe(limitParameters))

  it.effect("writes and reads entries", () =>
    Effect.gen(function*() {
      const journal = yield* makeJournal
      let createdAt = 0
      yield* journal.write({
        event: "UserCreated",
        primaryKey: "user-1",
        payload: new Uint8Array([1]),
        effect: (entry) =>
          Effect.sync(() => {
            createdAt = entry.createdAtMillis
          })
      })
      const entries = yield* journal.entries
      assert.strictEqual(entries.length, 1)
      assert.strictEqual(entries[0].event, "UserCreated")
      assert.strictEqual(entries[0].createdAtMillis, createdAt)
    }))

  it.effect("writes remote entries and sequences", () =>
    Effect.gen(function*() {
      const journal = yield* makeJournal
      const remoteId = EventJournal.makeRemoteIdUnsafe()
      const initial = yield* journal.nextRemoteSequence(remoteId)
      assert.strictEqual(initial, 0)

      const entryA = new EventJournal.Entry({
        id: EventJournal.makeEntryIdUnsafe(),
        event: "UserCreated",
        primaryKey: "user-2",
        payload: new Uint8Array([2])
      }, { disableChecks: true })
      const entryB = new EventJournal.Entry({
        id: EventJournal.makeEntryIdUnsafe(),
        event: "UserCreated",
        primaryKey: "user-3",
        payload: new Uint8Array([3])
      }, { disableChecks: true })
      const remoteEntries = [
        new EventJournal.RemoteEntry({ remoteSequence: 0, entry: entryA }),
        new EventJournal.RemoteEntry({ remoteSequence: 1, entry: entryB })
      ]
      const seenConflicts: Array<ReadonlyArray<EventJournal.Entry>> = []
      yield* journal.writeFromRemote({
        remoteId,
        entries: remoteEntries,
        effect: (batch) =>
          Effect.sync(() => {
            for (const { conflicts } of batch) seenConflicts.push(conflicts)
          })
      })
      const next = yield* journal.nextRemoteSequence(remoteId)
      assert.strictEqual(next, 2)

      let emptyCalls = 0
      const emptyResult = yield* journal.withRemoteUncommited(remoteId, () =>
        Effect.sync(() => {
          emptyCalls++
          return "called"
        }))
      assert.isTrue(Option.isNone(emptyResult))
      assert.strictEqual(emptyCalls, 0)

      yield* journal.write({
        event: "LocalCreated",
        primaryKey: "local-1",
        payload: new Uint8Array([4]),
        effect: () => Effect.void
      })
      let uncommittedCalls = 0
      const uncommitted = yield* journal.withRemoteUncommited(remoteId, (entries) =>
        Effect.sync(() => {
          uncommittedCalls++
          return entries
        }))
      if (Option.isNone(uncommitted)) assert.fail("Expected the callback result")
      assert.strictEqual(uncommitted.value.length, 1)
      assert.strictEqual(uncommitted.value[0].event, "LocalCreated")
      assert.strictEqual(uncommittedCalls, 1)
      assert.deepStrictEqual(seenConflicts, [[], []])
    }))

  it.effect("advances the remote sequence only across acknowledgements that follow it", () =>
    Effect.gen(function*() {
      const sql = yield* SqliteClient.make({ filename: ":memory:" })
      const open = SqlEventJournal.make().pipe(Effect.provideService(SqlClient.SqlClient, sql))
      const remoteId = EventJournal.makeRemoteIdUnsafe()
      const ack = (sequence: number, entryId = EventJournal.makeEntryIdUnsafe()) => ({ entryId, sequence })
      // A database from before the cursors table: every remote row was downloaded.
      yield* sql`CREATE TABLE effect_event_remotes (
        remote_id BLOB NOT NULL,
        entry_id BLOB NOT NULL,
        sequence INT NOT NULL,
        PRIMARY KEY (remote_id, entry_id)
      )`
      yield* sql`INSERT INTO effect_event_remotes ${
        sql.insert({ remote_id: remoteId, entry_id: EventJournal.makeEntryIdUnsafe(), sequence: 4 })
      }`
      const journal = yield* open
      assert.strictEqual(yield* journal.nextRemoteSequence(remoteId), 5)

      // Sequence 5, written by another replica, has not been downloaded.
      const local = yield* journal.write({ ...localEntry("local-1"), effect: Effect.succeed })
      yield* journal.writeRemoteAcks({ remoteId, acks: [ack(6, local.id)] })
      assert.strictEqual(yield* journal.nextRemoteSequence(remoteId), 5)
      yield* journal.writeFromRemote({
        remoteId,
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 5, entry: entry(1_000) })],
        effect: () => Effect.void
      })
      assert.strictEqual(yield* journal.nextRemoteSequence(remoteId), 6)
      yield* journal.writeRemoteAcks({ remoteId, acks: [ack(7), ack(6, local.id), ack(3)] })
      assert.strictEqual(yield* journal.nextRemoteSequence(remoteId), 8)
      assert.strictEqual(yield* (yield* open).nextRemoteSequence(remoteId), 8)

      // A remote that numbers from 1 can be acknowledged before any download.
      const otherRemoteId = EventJournal.makeRemoteIdUnsafe()
      yield* journal.writeRemoteAcks({ remoteId: otherRemoteId, acks: [ack(2), ack(1)], firstSequence: 1 })
      assert.strictEqual(yield* journal.nextRemoteSequence(otherRemoteId), 3)
    }).pipe(Effect.provide(Reactivity.layer)))
})
