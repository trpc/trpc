import { assert, it } from "@effect/vitest"
import { Array as Arr, Clock, Deferred, Effect, Exit, Fiber, Layer, Scope, Stream } from "effect"
import * as Digest from "effect/crypto/Digest"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import type { StoreId } from "effect/eventlog/EventLogMessage"
import type * as EventLogServerEncrypted from "effect/eventlog/EventLogServerEncrypted"
import * as SqlEventLogServerEncrypted from "effect/eventlog/SqlEventLogServerEncrypted"
import { Reactivity } from "effect/reactivity"
import * as SqlClient from "effect/sql/SqlClient"
import * as Statement from "effect/sql/Statement"
import { TestClock } from "effect/testing"

const storeId = "store-a" as StoreId
let nextNamespace = 0

const makeBatch = (...entryIds: Array<EventJournal.EntryId>): EventLogEncryption.EncryptedBatch => ({
  entryIds: entryIds as [EventJournal.EntryId, ...Array<EventJournal.EntryId>],
  iv: new Uint8Array(12),
  encryptedBatch: Uint8Array.of(entryIds.length)
})

const ids = (batches: ReadonlyArray<{ readonly entryIds: ReadonlyArray<EventJournal.EntryId> }>) =>
  batches.map((batch) => batch.entryIds.map((id) => Array.from(id).join(",")))

// Waits until another connection is blocked on a lock held by an open transaction.
const awaitLockWait = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const waiting = sql.onDialectOrElse({
    pg: () =>
      sql<{ n: number }>`
        SELECT COUNT(*)::int AS n FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND datname = current_database()`,
    mysql: () => sql<{ n: number }>`SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits`,
    mssql: () => sql<{ n: number }>`SELECT COUNT(*) AS n FROM sys.dm_exec_requests WHERE blocking_session_id <> 0`,
    orElse: () => Effect.die("competing writers need a server dialect")
  })
  for (let attempt = 0; attempt < 500; attempt++) {
    const [row] = yield* waiting
    if (Number(row.n) > 0) return
    yield* Effect.sleep(10)
  }
  return yield* Effect.die("the competing writer never waited on a lock")
})

// Writer A holds its write open in a transaction until writer B, a separate
// storage standing in for another server process, is blocked on it. B retries
// once if it loses, as a client retries a failed write.
const competingWrites = Effect.fnUntraced(function*(
  first: EventLogEncryption.EncryptedBatch,
  second: EventLogEncryption.EncryptedBatch
) {
  const sql = yield* SqlClient.SqlClient
  const publicKey = crypto.randomUUID()
  // Own tables, so other suites sharing the database don't race on creating them.
  const namespace = `competing_${++nextNamespace}`
  const options = { entryTablePrefix: `${namespace}_events`, remoteIdTable: `${namespace}_remote_id` }
  const storageA = yield* SqlEventLogServerEncrypted.makeStorage(options)
  const storageB = yield* SqlEventLogServerEncrypted.makeStorage(options)
  // Create the scope's tables first, so only the writes compete.
  const setup = makeBatch(EventJournal.makeEntryIdUnsafe())
  yield* storageA.write(publicKey, storeId, [setup])
  yield* storageB.changes(publicKey, storeId, 0).pipe(Stream.take(1), Stream.runDrain)

  const written = yield* Deferred.make<void>()
  const commit = yield* Deferred.make<void>()
  const writerA = yield* sql.withTransaction(Effect.gen(function*() {
    yield* storageA.write(publicKey, storeId, [first])
    yield* Deferred.succeed(written, undefined)
    yield* Deferred.await(commit)
  })).pipe(Effect.forkChild)
  yield* Deferred.await(written)

  const writerB = yield* storageB.write(publicKey, storeId, [second]).pipe(Effect.forkChild)
  yield* awaitLockWait
  yield* Deferred.succeed(commit, undefined)
  yield* Fiber.join(writerA)
  const attempt = yield* Fiber.await(writerB)
  const stored = Exit.isSuccess(attempt) ? attempt.value : yield* storageB.write(publicKey, storeId, [second])

  const persisted = yield* storageA.changes(publicKey, storeId, 0).pipe(Stream.take(3), Stream.runCollect)
  return { stored, persisted: persisted.slice(1) }
})

export const suite = (name: string, layer: Layer.Layer<SqlClient.SqlClient, unknown>) =>
  it.layer(
    Layer.mergeAll(Reactivity.layer, EventLogEncryption.layerSubtle, Digest.layerWebCrypto, layer),
    { timeout: "60 seconds", excludeTestServices: true }
  )(`SqlEventLogServerEncrypted storage (${name})`, (it) => {
    it.effect("stores a batch with more ids than one statement can bind", () =>
      Effect.gen(function*() {
        const publicKey = crypto.randomUUID()
        const namespace = `oversized_${++nextNamespace}`
        const storage = yield* SqlEventLogServerEncrypted.makeStorage({
          entryTablePrefix: `${namespace}_events`,
          remoteIdTable: `${namespace}_remote_id`
        })
        // Above the bind parameter limits: 2100 on SQL Server, 32767 for the
        // PostgreSQL client and 65535 on MySQL.
        const batch: EventLogEncryption.EncryptedBatch = {
          entryIds: Array.from({ length: 65_536 }, () => EventJournal.makeEntryIdUnsafe()) as [
            EventJournal.EntryId,
            ...Array<EventJournal.EntryId>
          ],
          iv: new Uint8Array(12),
          encryptedBatch: Uint8Array.of(1)
        }

        const stored = yield* storage.write(publicKey, storeId, [batch])
        const retried = yield* storage.write(publicKey, storeId, [batch])
        const persisted = yield* storage.changes(publicKey, storeId, 0).pipe(Stream.take(1), Stream.runCollect)

        assert.deepStrictEqual(ids(stored), ids([batch]))
        assert.deepStrictEqual(retried, [])
        assert.deepStrictEqual(ids(persisted), ids([batch]))
        assert.strictEqual(persisted[0].sequence, stored[0].sequence)
      }), { timeout: 60_000 })

    it.effect("stores a competing write after its writer retries", () =>
      Effect.gen(function*() {
        const [a, b] = [EventJournal.makeEntryIdUnsafe(), EventJournal.makeEntryIdUnsafe()]
        const { persisted, stored } = yield* competingWrites(makeBatch(a), makeBatch(b))

        assert.deepStrictEqual(ids(stored), ids([makeBatch(b)]))
        assert.deepStrictEqual(ids(persisted), ids([makeBatch(a), makeBatch(b)]))
        assert.deepStrictEqual(persisted.map((batch) => batch.sequence), [
          persisted[0].sequence,
          persisted[0].sequence + 1
        ])
      }))

    it.effect("stores a competing partly known batch whole, once", () =>
      Effect.gen(function*() {
        const [a, b] = [EventJournal.makeEntryIdUnsafe(), EventJournal.makeEntryIdUnsafe()]
        const { persisted, stored } = yield* competingWrites(makeBatch(a), makeBatch(b, a))

        assert.deepStrictEqual(ids(stored), ids([makeBatch(b, a)]))
        assert.deepStrictEqual(ids(persisted), ids([makeBatch(a), makeBatch(b, a)]))
        assert.deepStrictEqual(persisted.map((batch) => batch.sequence), [
          persisted[0].sequence,
          persisted[0].sequence + 1
        ])
      }))
  })

const makeIds = (count: number) => Array.from({ length: count }, () => EventJournal.makeEntryIdUnsafe())

// Every compaction test gets its own tables, the global ones included, so
// stores and sweeps from other tests stay out of its way.
const makeNamespace = Effect.fnUntraced(function*(compaction?: EventLogServerEncrypted.CompactionOptions) {
  const digest = yield* Digest.Digest
  const publicKey = crypto.randomUUID()
  const namespace = `compaction_${++nextNamespace}`
  const entryTablePrefix = `${namespace}_events`
  const scopeHash = (yield* digest.digestHex(Digest.sha256, new TextEncoder().encode(`${publicKey}/${storeId}`)))
    .slice(0, 16)
  return {
    publicKey,
    options: { entryTablePrefix, remoteIdTable: `${namespace}_remote_id`, compaction },
    // The scope's batch table `T`, named as every version of the storage names it.
    table: `${entryTablePrefix}_${scopeHash}`
  }
})

// `T` and `T_ids` as the storage created them before compaction.
const createLegacyTables = Effect.fnUntraced(function*(table: string) {
  const sql = yield* SqlClient.SqlClient
  const tableSql = sql(table)
  const idsTableSql = sql(`${table}_ids`)
  const indexSql = sql(`${table}_last_sequence`)
  yield* sql.onDialectOrElse({
    pg: () =>
      sql`
        CREATE TABLE ${tableSql} (
          sequence INTEGER PRIMARY KEY,
          last_sequence INTEGER NOT NULL,
          iv BYTEA NOT NULL,
          entry_ids BYTEA NOT NULL,
          encrypted_batch BYTEA NOT NULL
        )`.pipe(
        Effect.andThen(sql`CREATE INDEX ${indexSql} ON ${tableSql} (last_sequence)`),
        Effect.andThen(sql`CREATE TABLE ${idsTableSql} (entry_id BYTEA PRIMARY KEY, sequence INTEGER NOT NULL)`)
      ),
    mysql: () =>
      sql`
        CREATE TABLE ${tableSql} (
          sequence INT PRIMARY KEY,
          last_sequence INT NOT NULL,
          iv BINARY(12) NOT NULL,
          entry_ids LONGBLOB NOT NULL,
          encrypted_batch LONGBLOB NOT NULL,
          INDEX (last_sequence)
        )`.pipe(
        Effect.andThen(sql`CREATE TABLE ${idsTableSql} (entry_id BINARY(16) PRIMARY KEY, sequence INT NOT NULL)`)
      ),
    mssql: () =>
      sql`
        CREATE TABLE ${tableSql} (
          sequence INT PRIMARY KEY,
          last_sequence INT NOT NULL,
          iv VARBINARY(12) NOT NULL,
          entry_ids VARBINARY(MAX) NOT NULL,
          encrypted_batch VARBINARY(MAX) NOT NULL,
          INDEX ${indexSql} NONCLUSTERED (last_sequence)
        )`.pipe(
        Effect.andThen(sql`CREATE TABLE ${idsTableSql} (entry_id VARBINARY(16) PRIMARY KEY, sequence INT NOT NULL)`)
      ),
    orElse: () =>
      sql`
        CREATE TABLE ${tableSql} (
          sequence INTEGER PRIMARY KEY,
          last_sequence INTEGER NOT NULL,
          iv BLOB NOT NULL,
          entry_ids BLOB NOT NULL,
          encrypted_batch BLOB NOT NULL
        )`.pipe(
        Effect.andThen(sql`CREATE INDEX ${indexSql} ON ${tableSql} (last_sequence)`),
        Effect.andThen(sql`CREATE TABLE ${idsTableSql} (entry_id BLOB PRIMARY KEY, sequence INTEGER NOT NULL)`)
      )
  })
})

// Writes a batch of new ids as an instance from before compaction does, at
// MAX(last_sequence) + 1 and without touching the store row or the buckets.
const legacyWrite = Effect.fnUntraced(function*(table: string, batch: EventLogEncryption.EncryptedBatch) {
  const sql = yield* SqlClient.SqlClient
  return yield* sql.withTransaction(Effect.gen(function*() {
    const [last] = yield* sql<{ last_sequence: number | string | null }>`
      SELECT MAX(last_sequence) AS last_sequence FROM ${sql(table)}
    `
    const sequence = Number(last?.last_sequence ?? 0) + 1
    yield* sql`INSERT INTO ${sql(`${table}_ids`)} ${
      sql.insert(Arr.map(batch.entryIds, (entry_id, i) => ({ entry_id, sequence: sequence + i })))
    }`
    yield* sql`INSERT INTO ${sql(table)} ${
      sql.insert({
        sequence,
        last_sequence: sequence + batch.entryIds.length - 1,
        iv: batch.iv,
        entry_ids: new Uint8Array(batch.entryIds.flatMap((id) => Array.from(id))),
        encrypted_batch: batch.encryptedBatch
      })
    }`
    return sequence
  }))
})

const countRows = Effect.fnUntraced(function*(table: string) {
  const sql = yield* SqlClient.SqlClient
  const [row] = yield* sql<{ n: number | string }>`SELECT COUNT(*) AS n FROM ${sql(table)}`
  return Number(row.n)
})

// Advances the clock an hour at a time until `done` holds. A sweep the clock
// wakes finishes its queries in real time, so each hour polls on the live clock.
const sweepUntil = Effect.fnUntraced(function*<A, E, R>(read: Effect.Effect<A, E, R>, done: (value: A) => boolean) {
  for (let hour = 0; hour < 24; hour++) {
    yield* TestClock.adjust("1 hour")
    for (let attempt = 0; attempt < 50; attempt++) {
      const value = yield* read
      if (done(value)) return value
      yield* TestClock.withLive(Effect.sleep(10))
    }
  }
  return yield* read
})

const snapshotMarker = 99

// Commits a snapshot of the whole store that keeps only `kept`, as one batch
// ending at the base.
const commitSnapshot = Effect.fnUntraced(function*(
  storage: EventLogServerEncrypted.Storage["Service"],
  publicKey: string,
  kept: EventJournal.EntryId
) {
  const compaction = storage.compaction ?? assert.fail("Storage does not provide compaction")
  const { head } = yield* compaction.status(publicKey, storeId)
  const begun = yield* compaction.begin(publicKey, storeId, { through: head })
  if (begun._tag !== "Started") return assert.fail(`expected Started, got ${begun._tag}`)
  yield* compaction.stagePart(publicKey, storeId, begun.stageId, 0, [{
    entryIds: [kept],
    iv: new Uint8Array(12),
    encryptedBatch: Uint8Array.of(snapshotMarker)
  }])
  return yield* compaction.commit(publicKey, storeId, begun.stageId, [head])
})

// Hangs the selected statement that deletes from `table`, as a sweeper whose
// process dies mid-prune, and signals that it got there.
const hangOnDelete = (table: string, reached: Deferred.Deferred<void>, deleteNumber = 1): Statement.Transformer => {
  let deletes = 0
  return (statement, sql) => {
    const [text] = statement.compile()
    const [target] = sql`${sql(table)}`.compile()
    if (!/\bDELETE\b/i.test(text) || !text.includes(target) || ++deletes !== deleteNumber) {
      return Effect.succeed(statement)
    }
    return Effect.andThen(Deferred.succeed(reached, undefined), Effect.never)
  }
}

const served = (batches: ReadonlyArray<EventLogEncryption.EncryptedRemoteBatch>) =>
  batches.map((batch) => ({ sequence: batch.sequence, marker: batch.encryptedBatch[0] }))

// Follows `changes` from `startSequence` up to the batch carrying `last`,
// returning once the live subscription is open.
const followChanges = Effect.fnUntraced(function*(
  storage: EventLogServerEncrypted.Storage["Service"],
  publicKey: string,
  startSequence: number,
  last: EventJournal.EntryId
) {
  const subscribed = yield* Deferred.make<void>()
  const lastKey = Array.from(last).join(",")
  const fiber = yield* storage.changes(publicKey, storeId, startSequence).pipe(
    Stream.tap(() => Deferred.succeed(subscribed, undefined)),
    Stream.takeUntil((batch) => ids([batch])[0].includes(lastKey)),
    Stream.runCollect,
    Effect.forkChild
  )
  // The first batch comes from the initial query, which runs after subscribing.
  yield* Deferred.await(subscribed)
  return fiber
})

// SQL-only compaction scenarios, run under the TestClock.
export const compactionSuite = (name: string, layer: Layer.Layer<SqlClient.SqlClient, unknown>) =>
  it.layer(
    Layer.mergeAll(
      Reactivity.layer,
      EventLogEncryption.layerSubtle,
      Digest.layerWebCrypto,
      // Only the SQL client uses real time; storage still observes TestClock.
      Layer.provide(layer, Layer.succeed(Clock.Clock)(Clock.Clock.defaultValue()))
    ),
    // Tests share TestClock, so advancing one must not expire another test's stage.
    { concurrent: false, timeout: "60 seconds" }
  )(`SqlEventLogServerEncrypted compaction storage (${name})`, (it) => {
    it.effect("seeds a store written before the upgrade once when two instances open it together", () =>
      Effect.gen(function*() {
        const { options, publicKey, table } = yield* makeNamespace()
        const entries = makeIds(4)
        yield* createLegacyTables(table)
        yield* legacyWrite(table, makeBatch(entries[0], entries[1]))
        const legacyLast = yield* legacyWrite(table, makeBatch(entries[2]))
        // Startup creates the global tables, so only opening the store races.
        const storageA = yield* SqlEventLogServerEncrypted.makeStorage(options)
        const storageB = yield* SqlEventLogServerEncrypted.makeStorage(options)
        const nothing = (storageA.firstSequence ?? 0) - 1
        const instances = [storageA, storageB].map((storage) =>
          storage.compaction ?? assert.fail("Storage does not provide compaction")
        )

        const opened = yield* Effect.all(
          instances.map((compaction) => compaction.status(publicKey, storeId)),
          { concurrency: "unbounded" }
        )
        const histories = yield* Effect.forEach(instances, (compaction) => compaction.history(publicKey, storeId))
        // The seed bucket is in the hour the store was first opened.
        yield* TestClock.adjust("25 hours")
        const lagHeads = yield* Effect.forEach(
          instances,
          (compaction) => Effect.map(compaction.status(publicKey, storeId), (status) => status.lagHead)
        )
        const next = yield* storageB.write(publicKey, storeId, [makeBatch(entries[3])])

        const expected = { head: legacyLast, base: nothing, lagHead: nothing }
        assert.deepStrictEqual(opened.map(({ base, head, lagHead }) => ({ head, base, lagHead })), [expected, expected])
        assert.strictEqual(histories[0].length, 1)
        assert.isTrue(histories[0][0].active)
        assert.deepStrictEqual(histories[1], histories[0])
        assert.deepStrictEqual(lagHeads, [legacyLast, legacyLast])
        assert.deepStrictEqual(next.map((batch) => batch.sequence), [legacyLast + 1])
      }))

    it.effect("allocates sequences after an old instance's writes during a rolling deploy", () =>
      Effect.gen(function*() {
        const { options, publicKey, table } = yield* makeNamespace()
        const storage = yield* SqlEventLogServerEncrypted.makeStorage(options)
        const entries = makeIds(6)
        const write = (batch: EventLogEncryption.EncryptedBatch) =>
          Effect.map(storage.write(publicKey, storeId, [batch]), (stored) => stored[0].sequence)

        const sequences = [
          yield* write(makeBatch(entries[0])),
          yield* legacyWrite(table, makeBatch(entries[1], entries[2])),
          yield* write(makeBatch(entries[3])),
          yield* legacyWrite(table, makeBatch(entries[4])),
          yield* write(makeBatch(entries[5]))
        ]
        const persisted = yield* storage.changes(publicKey, storeId, 0).pipe(Stream.take(5), Stream.runCollect)

        const first = sequences[0]
        assert.deepStrictEqual(sequences, [first, first + 1, first + 3, first + 4, first + 5])
        assert.deepStrictEqual(persisted.map((batch) => batch.sequence), sequences)
        assert.deepStrictEqual(
          ids(persisted),
          ids([
            makeBatch(entries[0]),
            makeBatch(entries[1], entries[2]),
            makeBatch(entries[3]),
            makeBatch(entries[4]),
            makeBatch(entries[5])
          ])
        )
      }))

    it.effect("keeps sequences increasing after every original is pruned", () =>
      Effect.gen(function*() {
        const { options, publicKey, table } = yield* makeNamespace({ grace: "2 hours", lag: "1 hour" })
        const storage = yield* SqlEventLogServerEncrypted.makeStorage(options)
        const entries = makeIds(5)
        const written = yield* storage.write(publicKey, storeId, [
          makeBatch(entries[0], entries[1]),
          makeBatch(entries[2])
        ])
        yield* commitSnapshot(storage, publicKey, entries[2])

        const remaining = yield* sweepUntil(countRows(table), (count) => count === 0)
        const afterPrune = yield* storage.write(publicKey, storeId, [makeBatch(entries[3])])
        // A second instance learns the next sequence from the store row.
        const other = yield* SqlEventLogServerEncrypted.makeStorage(options)
        const fromOther = yield* other.write(publicKey, storeId, [makeBatch(entries[4])])
        const acks = yield* storage.entrySequences(publicKey, storeId, entries)
        const persisted = yield* storage.changes(publicKey, storeId, 0).pipe(Stream.take(3), Stream.runCollect)

        const first = written[0].sequence
        assert.strictEqual(remaining, 0)
        assert.deepStrictEqual(afterPrune.map((batch) => batch.sequence), [first + 3])
        assert.deepStrictEqual(fromOther.map((batch) => batch.sequence), [first + 4])
        // `T_ids` keeps the pruned ids as tombstones.
        assert.sameDeepMembers(
          acks.map((ack) => ack.sequence),
          [first, first + 1, first + 2, first + 3, first + 4]
        )
        assert.deepStrictEqual(served(persisted), [
          { sequence: first + 2, marker: snapshotMarker },
          { sequence: first + 3, marker: 1 },
          { sequence: first + 4, marker: 1 }
        ])
      }))

    it.effect("re-appends the withdrawn input in order at the head, before later writes", () =>
      Effect.gen(function*() {
        const { options, publicKey } = yield* makeNamespace()
        const storage = yield* SqlEventLogServerEncrypted.makeStorage(options)
        const compaction = storage.compaction ?? assert.fail("Storage does not provide compaction")
        const snapshotBatch = (marker: number, ...entryIds: Array<EventJournal.EntryId>) => ({
          ...makeBatch(...entryIds),
          encryptedBatch: Uint8Array.of(marker)
        })
        const commit = Effect.fnUntraced(function*(
          batches: ReadonlyArray<EventLogEncryption.EncryptedBatch>,
          virtualSequences: ReadonlyArray<number>
        ) {
          const { head } = yield* compaction.status(publicKey, storeId)
          const begun = yield* compaction.begin(publicKey, storeId, { through: head })
          if (begun._tag !== "Started") {
            return assert.fail(`expected Started, got ${begun._tag}`)
          }
          yield* compaction.stagePart(
            publicKey,
            storeId,
            begun.stageId,
            0,
            batches as Arr.NonEmptyReadonlyArray<EventLogEncryption.EncryptedBatch>
          )
          return yield* compaction.commit(publicKey, storeId, begun.stageId, virtualSequences)
        })
        // More than one 500-row page, each kept by g+1 as its own snapshot batch.
        const entries = makeIds(501)
        const originals = entries.map((id) => makeBatch(id))
        const written = yield* storage.write(publicKey, storeId, originals)
        yield* commit(
          entries.map((id) => snapshotBatch(snapshotMarker, id)),
          written.map((batch) => batch.sequence)
        )
        const [t1, t2, after] = makeIds(3)
        const [tail] = yield* storage.write(publicKey, storeId, [makeBatch(t1, t2)])
        const head = tail.sequence + 1
        yield* commit([snapshotBatch(snapshotMarker + 1, t2)], [head])
        const active = (yield* compaction.history(publicKey, storeId)).find((activation) => activation.active)!

        // Withdraws g+2, whose input is g+1's batches, then the original [t1, t2].
        yield* compaction.rollback(publicKey, storeId, active.activationId)
        const [later] = yield* storage.write(publicKey, storeId, [makeBatch(after)])
        const reappended = yield* storage.changes(publicKey, storeId, head + 1).pipe(
          Stream.takeUntil((batch) => batch.sequence === later.sequence),
          Stream.runCollect
        )

        assert.deepStrictEqual(served(reappended), [
          ...entries.map((_, i) => ({ sequence: head + 1 + i, marker: snapshotMarker })),
          { sequence: head + entries.length + 1, marker: 2 },
          { sequence: head + entries.length + 3, marker: 1 }
        ])
        assert.deepStrictEqual(ids(reappended), ids([...originals, tail, makeBatch(after)]))
      }), { timeout: 60_000 })

    it.effect("publishes nothing from a write whose outer transaction aborts", () =>
      Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient
        const { options, publicKey } = yield* makeNamespace()
        const storage = yield* SqlEventLogServerEncrypted.makeStorage(options)
        const [first, reverted, after] = makeIds(3)
        const [written] = yield* storage.write(publicKey, storeId, [makeBatch(first)])
        const live = yield* followChanges(storage, publicKey, written.sequence, after)

        const aborted = yield* sql.withTransaction(
          Effect.andThen(storage.write(publicKey, storeId, [makeBatch(reverted)]), Effect.fail("abort"))
        ).pipe(Effect.exit)
        const next = yield* storage.write(publicKey, storeId, [makeBatch(after)])
        const published = yield* Fiber.join(live)

        assert.isTrue(Exit.isFailure(aborted))
        assert.deepStrictEqual(next.map((batch) => batch.sequence), [written.sequence + 1])
        assert.deepStrictEqual(ids(published), ids([makeBatch(first), makeBatch(after)]))
        assert.deepStrictEqual(published.map((batch) => batch.sequence), [written.sequence, written.sequence + 1])
      }))

    it.effect("publishes nothing from a rollback whose outer transaction aborts", () =>
      Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient
        const { options, publicKey } = yield* makeNamespace()
        const storage = yield* SqlEventLogServerEncrypted.makeStorage(options)
        const compaction = storage.compaction ?? assert.fail("Storage does not provide compaction")
        const [first, kept, after] = makeIds(3)
        yield* storage.write(publicKey, storeId, [makeBatch(first), makeBatch(kept)])
        yield* commitSnapshot(storage, publicKey, kept)
        const { head } = yield* compaction.status(publicKey, storeId)
        const snapshot = (yield* compaction.history(publicKey, storeId)).find((activation) => activation.active)!
        const live = yield* followChanges(storage, publicKey, head, after)

        const aborted = yield* sql.withTransaction(
          Effect.andThen(compaction.rollback(publicKey, storeId, snapshot.activationId), Effect.fail("abort"))
        ).pipe(Effect.exit)
        const next = yield* storage.write(publicKey, storeId, [makeBatch(after)])
        const published = yield* Fiber.join(live)
        const history = yield* compaction.history(publicKey, storeId)

        assert.isTrue(Exit.isFailure(aborted))
        assert.deepStrictEqual(next.map((batch) => batch.sequence), [head + 1])
        assert.deepStrictEqual(served(published), [
          { sequence: head, marker: snapshotMarker },
          { sequence: head + 1, marker: 1 }
        ])
        assert.isTrue(history.find((activation) => activation.activationId === snapshot.activationId)!.active)
      }))

    it.effect("resumes a partially pruned snapshot after its sweeper dies without deleting originals", () =>
      Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient
        const { options, publicKey, table } = yield* makeNamespace({ grace: "2 hours", lag: "1 hour" })
        const snapshotTable = `${table}_snapshot`
        const reached = yield* Deferred.make<void>()
        // Registered first, so a failing test still stops the sweeper and
        // releases the transaction its hung DELETE holds.
        const scopeA = yield* Effect.acquireRelease(Scope.make(), (scope) =>
          Scope.close(scope, Exit.void))
        const storageA = yield* SqlEventLogServerEncrypted.makeStorage(options).pipe(
          Effect.provideService(Statement.CurrentTransformer, hangOnDelete(snapshotTable, reached, 2)),
          Scope.provide(scopeA)
        )
        const compactionA = storageA.compaction ?? assert.fail("Storage does not provide compaction")
        // More than two 200-row chunks, with one entry per snapshot row.
        const batches = makeIds(401).map((id) => makeBatch(id))
        const written = yield* storageA.write(publicKey, storeId, batches)
        const begun = yield* compactionA.begin(publicKey, storeId, { through: written[400].sequence })
        if (begun._tag !== "Started") return assert.fail(`expected Started, got ${begun._tag}`)
        yield* compactionA.stagePart(publicKey, storeId, begun.stageId, 0, [batches[0], ...batches.slice(1)])
        assert.strictEqual(
          yield* compactionA.commit(publicKey, storeId, begun.stageId, written.map((batch) => batch.sequence)),
          "Committed"
        )
        const snapshot = (yield* compactionA.history(publicKey, storeId)).find((activation) => activation.active)!
        yield* compactionA.rollback(publicKey, storeId, snapshot.activationId)

        // Poll only the signal while A holds a transaction (SQLite cannot query
        // through that lock). sweepUntil bounds the missing-second-delete case.
        const interrupted = yield* sweepUntil(Deferred.isDone(reached), (done) => done)
        yield* Scope.close(scopeA, Exit.void)
        assert.isTrue(interrupted, "snapshot pruning never reached a second DELETE")

        const storageB = yield* SqlEventLogServerEncrypted.makeStorage(options)
        const compactionB = storageB.compaction ?? assert.fail("Storage does not provide compaction")
        const withdrawn = (yield* compactionB.history(publicKey, storeId)).find((activation) =>
          activation.activationId === snapshot.activationId
        )!
        const remainingRows = Effect.map(
          sql<{ n: number | string }>`
            SELECT COUNT(*) AS n FROM ${sql(snapshotTable)} WHERE batch_set = ${begun.stageId}`,
          ([row]) => Number(row.n)
        )
        const beforeB = yield* remainingRows
        assert.isFalse(withdrawn.restorable)
        assert.isAbove(beforeB, 0)
        assert.isBelow(beforeB, batches.length)
        // The originals, and their copies the rollback re-appended.
        assert.strictEqual(yield* countRows(table), 2 * batches.length)

        assert.strictEqual(yield* sweepUntil(remainingRows, (count) => count === 0), 0)
        assert.strictEqual(yield* countRows(table), 2 * batches.length)
        const persisted = yield* storageB.changes(publicKey, storeId, storageB.firstSequence ?? 0).pipe(
          Stream.take(batches.length),
          Stream.runCollect
        )
        assert.deepStrictEqual(ids(persisted), ids(batches))
        assert.deepStrictEqual(served(persisted), served(written))
      }), { timeout: 60_000 })

    it.effect("finishes the prune of a sweeper that died in the middle of it", () =>
      Effect.gen(function*() {
        const { options, publicKey, table } = yield* makeNamespace({ grace: "2 hours", lag: "1 hour" })
        const reached = yield* Deferred.make<void>()
        const scopeA = yield* Scope.make()
        const storageA = yield* SqlEventLogServerEncrypted.makeStorage(options).pipe(
          Effect.provideService(Statement.CurrentTransformer, hangOnDelete(table, reached)),
          Scope.provide(scopeA)
        )
        const entries = makeIds(3)
        const written = yield* storageA.write(publicKey, storeId, [
          makeBatch(entries[0], entries[1]),
          makeBatch(entries[2])
        ])
        yield* commitSnapshot(storageA, publicKey, entries[2])

        const died = yield* sweepUntil(Deferred.isDone(reached), (done) =>
          done)
        yield* Scope.close(scopeA, Exit.void)
        const storageB = yield* SqlEventLogServerEncrypted.makeStorage(options)
        const compaction = storageB.compaction ?? assert.fail("Storage does not provide compaction")
        const [originals] = yield* compaction.history(publicKey, storeId)
        const beforeB = yield* countRows(table)
        const afterB = yield* sweepUntil(countRows(table), (count) =>
          count === 0)
        const persisted = yield* storageB.changes(publicKey, storeId, 0).pipe(Stream.take(1), Stream.runCollect)

        assert.isTrue(died)
        assert.isFalse(originals.restorable)
        assert.strictEqual(beforeB, 2)
        assert.strictEqual(afterB, 0)
        assert.deepStrictEqual(served(persisted), [{ sequence: written[1].sequence, marker: snapshotMarker }])
      }))
  })
