import { PgClient } from "@effect/sql-pg"
import { assert, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Option, Redacted } from "effect"
import * as SqlEventJournalSharedTest from "effect-test/eventlog/SqlEventJournalSharedTest"
import * as Arr from "effect/Array"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLogMessage from "effect/eventlog/EventLogMessage"
import * as SqlEventJournal from "effect/eventlog/SqlEventJournal"
import { Reactivity } from "effect/reactivity"
import * as SqlClient from "effect/sql/SqlClient"
import * as Crypto from "node:crypto"
import { PgContainer, realSleep } from "./utils.ts"

const localEntry = (primaryKey: string) => ({ event: "Repro", primaryKey, payload: new Uint8Array() })

const remoteEntry = (primaryKey: string, msecs?: number) =>
  new EventJournal.RemoteEntry({
    remoteSequence: 0,
    entry: new EventJournal.Entry({
      id: EventJournal.makeEntryIdUnsafe(msecs === undefined ? {} : { msecs }),
      event: "Repro",
      primaryKey,
      payload: new Uint8Array()
    }, { disableChecks: true })
  })

const backendPid = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const [{ pid }] = yield* sql<{ pid: number }>`SELECT pg_backend_pid() AS pid`
  return pid
})

// Fails unless, within ten seconds, `count` backends are blocked by `holder`
// directly or behind one that is, or `fiber` succeeds.
const waitUntilBlockedBy = Effect.fnUntraced(function*<A, E>(holder: number, count: number, fiber?: Fiber.Fiber<A, E>) {
  const sql = yield* SqlClient.SqlClient
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const exit = fiber?.pollUnsafe()
    if (exit !== undefined) return yield* exit
    const [{ blocked }] = yield* sql<{ blocked: number }>`
        SELECT count(*)::int4 AS blocked FROM pg_stat_activity waiter
        WHERE ${holder} = ANY(pg_blocking_pids(waiter.pid)) OR EXISTS (
          SELECT 1 FROM pg_stat_activity other
          WHERE other.pid = ANY(pg_blocking_pids(waiter.pid)) AND ${holder} = ANY(pg_blocking_pids(other.pid))
        )
      `
    if (blocked >= count) return
    yield* realSleep
  }
  return yield* Effect.die(new Error(`Expected ${count} backends blocked by ${holder} within 10 seconds`))
})

// Exposes the container so tests can open a read-only client.
const TestLayer = Layer.merge(PgContainer.layerClient, PgContainer.layer)

it.layer(TestLayer, { timeout: "30 seconds" })("SqlEventJournal", (it) => {
  it.effect("round-trips a local entry", () =>
    Effect.gen(function*() {
      const journal = yield* SqlEventJournal.make({
        entryTable: "local_entries",
        remotesTable: "local_remotes"
      })
      const written = yield* journal.write({
        event: "UserCreated",
        primaryKey: "user-1",
        payload: new Uint8Array([1]),
        effect: (entry) => Effect.succeed(entry)
      })
      const entries = yield* journal.entries
      assert.strictEqual(entries.length, 1)
      assert.strictEqual(entries[0].idString, written.idString)
      assert.strictEqual(entries[0].event, "UserCreated")
      assert.strictEqual(entries[0].primaryKey, "user-1")
      assert.deepStrictEqual(entries[0].payload, new Uint8Array([1]))
      assert.strictEqual(entries[0].createdAtMillis, written.createdAtMillis)
    }))

  it.effect("round-trips a remote entry and advances its sequence", () =>
    Effect.gen(function*() {
      const journal = yield* SqlEventJournal.make({
        entryTable: "remote_entries",
        remotesTable: "remote_remotes"
      })
      const remoteId = EventJournal.makeRemoteIdUnsafe()
      const remoteEntry = new EventJournal.Entry({
        id: EventJournal.makeEntryIdUnsafe({ msecs: 1_700_000_000_000 }),
        event: "UserCreated",
        primaryKey: "user-2",
        payload: new Uint8Array([2])
      }, { disableChecks: true })
      assert.strictEqual(yield* journal.nextRemoteSequence(remoteId), 0)
      yield* journal.writeFromRemote({
        remoteId,
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry: remoteEntry })],
        effect: () => Effect.void
      })

      const entries = yield* journal.entries
      assert.strictEqual(entries.length, 1)
      assert.strictEqual(entries[0].idString, remoteEntry.idString)
      assert.strictEqual(entries[0].event, "UserCreated")
      assert.strictEqual(entries[0].primaryKey, "user-2")
      assert.deepStrictEqual(entries[0].payload, new Uint8Array([2]))
      assert.strictEqual(entries[0].createdAtMillis, 1_700_000_000_000)
      assert.strictEqual(yield* journal.nextRemoteSequence(remoteId), 1)
    }))

  it.effect("reopens a migrated journal read-only", () =>
    Effect.gen(function*() {
      const container = yield* PgContainer
      const readonly = yield* PgClient.make({
        url: Redacted.make(container.getConnectionUri()),
        startupParameters: { default_transaction_read_only: "on" }
      })
      const options = { entryTable: "readonly_entries", remotesTable: "readonly_remotes" }
      const journal = yield* SqlEventJournal.make(options)
      const written = yield* journal.write({ ...localEntry("a"), effect: Effect.succeed })
      const reopened = yield* SqlEventJournal.make(options).pipe(Effect.provideService(SqlClient.SqlClient, readonly))
      assert.deepStrictEqual((yield* reopened.entries).map((entry) => entry.idString), [written.idString])
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect("writes and finds conflicts for primary keys beyond the index tuple limit", () =>
    Effect.gen(function*() {
      const journal = yield* SqlEventJournal.make({ entryTable: "long_key_entries", remotesTable: "long_key_remotes" })
      // Random text barely compresses, so the key stays above the ~2.7 KB B-tree tuple limit.
      const primaryKey = Crypto.randomBytes(6000).toString("base64")
      const written = yield* journal.write({ ...localEntry(primaryKey), effect: Effect.succeed })
      const conflicts: Array<string> = []
      yield* journal.writeFromRemote({
        remoteId: EventJournal.makeRemoteIdUnsafe(),
        entries: [remoteEntry(primaryKey, written.createdAtMillis - 1)],
        effect: (batch) => Effect.sync(() => conflicts.push(...batch[0].conflicts.map((entry) => entry.idString)))
      })
      assert.deepStrictEqual(conflicts, [written.idString])
    }))

  it.effect("concurrent opens migrate a legacy database once", () =>
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const options = { entryTable: "concurrent_open_entries", remotesTable: "concurrent_open_remotes" }
      // The entry table as created by the first release of SqlEventJournal.
      yield* sql`
        CREATE TABLE concurrent_open_entries (
          id BYTEA PRIMARY KEY,
          event TEXT NOT NULL,
          primary_key TEXT NOT NULL,
          payload BYTEA NOT NULL,
          timestamp BIGINT NOT NULL
        )`
      const remoteA = EventJournal.makeRemoteIdUnsafe()
      const remoteB = EventJournal.makeRemoteIdUnsafe()
      const entries = Arr.make(remoteEntry("pending").entry, remoteEntry("fromA").entry, remoteEntry("fromB").entry)
      yield* sql`INSERT INTO concurrent_open_entries ${
        sql.insert(Arr.map(entries, (entry) => ({
          id: entry.id,
          event: entry.event,
          primary_key: entry.primaryKey,
          payload: entry.payload,
          timestamp: entry.createdAtMillis
        })))
      }`
      yield* sql`
        CREATE TABLE concurrent_open_remotes (
          remote_id BYTEA NOT NULL,
          entry_id BYTEA NOT NULL,
          sequence INT NOT NULL,
          PRIMARY KEY (remote_id, entry_id)
        )`
      yield* sql`INSERT INTO concurrent_open_remotes ${
        sql.insert([
          { remote_id: remoteA, entry_id: entries[1].id, sequence: 1 },
          { remote_id: remoteB, entry_id: entries[2].id, sequence: 7 }
        ])
      }`
      yield* sql`
        CREATE TABLE concurrent_open_remotes_cursors (
          remote_id BYTEA PRIMARY KEY,
          next_sequence INT NOT NULL
        )`
      yield* sql`INSERT INTO concurrent_open_remotes_cursors ${sql.insert({ remote_id: remoteA, next_sequence: 9 })}`
      const warmed = yield* Deferred.make<void>()
      const startWaiting = yield* Deferred.make<void>()
      const migrated = yield* Deferred.make<number>()
      const release = yield* Deferred.make<void>()
      const waiting = yield* Effect.gen(function*() {
        // Pin this backend and cache both old names before the other opener changes them.
        const [before] = yield* sql<{ legacy: string | null; sources: string | null }>`
          SELECT to_regclass('concurrent_open_remotes')::text AS legacy,
                 to_regclass('concurrent_open_entries_sources')::text AS sources
        `
        assert.strictEqual(before.legacy, "concurrent_open_remotes")
        assert.isNull(before.sources)
        yield* Deferred.succeed(warmed, undefined)
        yield* Deferred.await(startWaiting)
        return yield* SqlEventJournal.make(options)
      }).pipe(sql.withTransaction, Effect.forkChild)
      yield* Deferred.await(warmed)
      const first = yield* SqlEventJournal.make(options).pipe(
        Effect.tap(() => backendPid.pipe(Effect.flatMap((pid) => Deferred.succeed(migrated, pid)))),
        Effect.tap(Deferred.await(release)),
        sql.withTransaction,
        Effect.forkChild
      )
      const holder = yield* Deferred.await(migrated)
      yield* Deferred.succeed(startWaiting, undefined)
      yield* waitUntilBlockedBy(holder, 1, waiting)
      yield* Deferred.succeed(release, undefined)
      const journals = [yield* Fiber.join(first), yield* Fiber.join(waiting)]
      for (const journal of journals) {
        assert.strictEqual(yield* journal.nextRemoteSequence(remoteA), 9)
        assert.strictEqual(yield* journal.nextRemoteSequence(remoteB), 8)
        assert.deepStrictEqual(
          (yield* journal.entries).map((entry) => entry.idString).sort(),
          entries.map((entry) => entry.idString).sort()
        )
      }
      const upload = (remoteId: EventJournal.RemoteId) =>
        journals[0].withRemoteUncommited(remoteId, (entries) =>
          Effect.succeed(entries.map((entry) => entry.primaryKey).sort()))
      assert.deepStrictEqual(yield* upload(remoteA), Option.some(["fromB", "pending"]))
      assert.deepStrictEqual(yield* upload(remoteB), Option.some(["fromA", "pending"]))
      const [{ legacy }] = yield* sql<{ legacy: string | null }>`
        SELECT to_regclass('concurrent_open_remotes')::text AS legacy
      `
      assert.isNull(legacy)
    }))

  it.effect("withRemoteUncommited uploads entries whose commits finish out of order", () =>
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const journal = yield* SqlEventJournal.make({ entryTable: "ordering_entries", remotesTable: "ordering_remotes" })
      const remoteId = EventJournal.makeRemoteIdUnsafe()
      const upload = journal.withRemoteUncommited(remoteId, (entries) => Effect.succeed(entries.map((e) => e.idString)))
      const written = yield* Deferred.make<number>()
      const release = yield* Deferred.make<void>()
      // The first write stays uncommitted until released.
      const first = yield* journal.write({ ...localEntry("first"), effect: Effect.succeed }).pipe(
        Effect.tap(Effect.flatMap(backendPid, (pid) => Deferred.succeed(written, pid))),
        Effect.tap(Deferred.await(release)),
        sql.withTransaction,
        Effect.forkChild
      )
      const holder = yield* Deferred.await(written)
      const second = yield* Effect.forkChild(journal.write({ ...localEntry("second"), effect: Effect.succeed }))
      yield* waitUntilBlockedBy(holder, 1, second)
      const beforeCommit = yield* upload
      yield* Deferred.succeed(release, undefined)
      const ids = [(yield* Fiber.join(first)).idString, (yield* Fiber.join(second)).idString]
      const afterCommit = yield* upload
      const uploaded = [...Option.getOrElse(beforeCommit, () => []), ...Option.getOrElse(afterCommit, () => [])]
      assert.deepStrictEqual(uploaded.sort(), ids.sort())
    }))

  it.effect("an outer transaction can import an entry that another remote is importing", () =>
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const journal = yield* SqlEventJournal.make({
        entryTable: "overlapping_entries",
        remotesTable: "overlapping_remotes"
      })
      const b = remoteEntry("b")
      const importEntry = (remoteId: EventJournal.RemoteId, entry: EventJournal.RemoteEntry) =>
        journal.writeFromRemote({ remoteId, entries: [entry], effect: () => Effect.void })
      const imported = yield* Deferred.make<number>()
      const proceed = yield* Deferred.make<void>()
      const remoteId = EventJournal.makeRemoteIdUnsafe()
      const outer = yield* importEntry(remoteId, remoteEntry("a")).pipe(
        Effect.andThen(backendPid),
        Effect.flatMap((pid) => Deferred.succeed(imported, pid)),
        Effect.andThen(Deferred.await(proceed)),
        Effect.andThen(importEntry(remoteId, b)),
        sql.withTransaction,
        Effect.forkChild
      )
      const holder = yield* Deferred.await(imported)
      const other = yield* Effect.forkChild(importEntry(EventJournal.makeRemoteIdUnsafe(), b))
      yield* waitUntilBlockedBy(holder, 1, other)
      yield* Deferred.succeed(proceed, undefined)
      yield* Fiber.join(outer)
      yield* Fiber.join(other)
    }))

  it.effect("a local write and a remote import updating the same projection row both commit", () =>
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const journal = yield* SqlEventJournal.make({
        entryTable: "projection_entries",
        remotesTable: "projection_remotes"
      })
      // EventLog runs handlers inside the journal lock's transaction.
      const withLock = journal.withLock(EventLogMessage.StoreId.make("store"))
      yield* sql`CREATE TABLE callback_projection (id TEXT PRIMARY KEY, count INT NOT NULL)`
      yield* sql`INSERT INTO callback_projection (id, count) VALUES ('p', 0)`
      const project = Effect.orDie(sql`UPDATE callback_projection SET count = count + 1 WHERE id = 'p'`)
      const updated = yield* Deferred.make<number>()
      const proceed = yield* Deferred.make<void>()
      // The local handler keeps the projection row locked until released.
      const local = yield* journal.write({
        ...localEntry("local"),
        effect: () =>
          project.pipe(
            Effect.andThen(backendPid),
            Effect.flatMap((pid) => Deferred.succeed(updated, pid)),
            Effect.andThen(Deferred.await(proceed))
          )
      }).pipe(withLock, Effect.forkChild)
      const holder = yield* Deferred.await(updated)
      const remote = yield* journal.writeFromRemote({
        remoteId: EventJournal.makeRemoteIdUnsafe(),
        entries: [remoteEntry("imported")],
        effect: () => Effect.asVoid(project)
      }).pipe(withLock, Effect.forkChild)
      yield* waitUntilBlockedBy(holder, 1, remote)
      yield* Deferred.succeed(proceed, undefined)
      yield* Fiber.join(local)
      yield* Fiber.join(remote)
      const [{ count }] = yield* sql<{ count: number }>`SELECT count FROM callback_projection WHERE id = 'p'`
      assert.strictEqual(count, 2)
    }))

  it.effect("a write without an outer transaction rolls back its callback's SQL when the callback fails", () =>
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const journal = yield* SqlEventJournal.make({ entryTable: "rollback_entries", remotesTable: "rollback_remotes" })
      yield* sql`CREATE TABLE rollback_projection (id TEXT PRIMARY KEY)`
      yield* Effect.flip(journal.write({
        ...localEntry("failed"),
        effect: () => Effect.andThen(sql`INSERT INTO rollback_projection (id) VALUES ('failed')`, Effect.fail("failed"))
      }))
      assert.deepStrictEqual(yield* sql`SELECT id FROM rollback_projection`, [])
    }))
})

SqlEventJournalSharedTest.suite("pg", PgContainer.layerClient)
