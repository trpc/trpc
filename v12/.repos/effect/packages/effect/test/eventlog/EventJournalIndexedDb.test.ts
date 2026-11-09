// oxlint-disable-next-line no-unassigned-import
import "fake-indexeddb/auto"
import { assert, describe, it, vi } from "@effect/vitest"
import { Effect, Exit, Fiber, Option, PubSub } from "effect"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as ConflictsTest from "./EventJournalConflictsTest.ts"

let databaseId = 0
const uniqueName = (prefix: string) => `${prefix}-${databaseId++}`

// `tail` fixes the random id bytes, so entries sharing a millisecond sort in a
// known order by id.
const entry = (
  msecs: number,
  options?: {
    readonly event?: string
    readonly primaryKey?: string
    readonly tail?: number
    readonly payload?: ReadonlyArray<number>
  }
) => {
  const id = EventJournal.makeEntryIdUnsafe({ msecs })
  if (options?.tail !== undefined) id.fill(options.tail, 6)
  return new EventJournal.Entry({
    id,
    event: options?.event ?? "Repro",
    primaryKey: options?.primaryKey ?? "key",
    payload: new Uint8Array(options?.payload ?? [])
  }, { disableChecks: true })
}

const describeEntry = (entry: EventJournal.Entry) =>
  [entry.idString, entry.event, entry.primaryKey, Array.from(entry.payload)] as const

type Batch = ReadonlyArray<
  { readonly entry: EventJournal.Entry; readonly conflicts: ReadonlyArray<EventJournal.Entry> }
>

const describeBatch = (batch: Batch) =>
  batch.map(({ conflicts, entry }) => [entry.idString, conflicts.map(describeEntry)] as const)

const importEntries = (journal: EventJournal.EventJournal["Service"], entries: ReadonlyArray<EventJournal.Entry>) =>
  journal.writeFromRemote({
    remoteId: EventJournal.makeRemoteIdUnsafe(),
    entries: remoteEntries(entries),
    effect: () => Effect.void
  })

// Counts stored entries read from the `entries` store or its indexes, whether
// through a cursor or `getAll`.
const countEntryReads = (database: string) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const reads = { count: 0 }
      const isEntries = (source: IDBObjectStore | IDBIndex) => {
        const store = "objectStore" in source ? source.objectStore : source
        return store.transaction.db.name === database && store.name === "entries"
      }
      const patch = (target: IDBObjectStore | IDBIndex, method: "openCursor" | "getAll") => {
        const original = (target as any)[method]
        ;(target as any)[method] = function(this: IDBObjectStore | IDBIndex, ...args: Array<unknown>) {
          const request: IDBRequest = original.apply(this, args)
          if (isEntries(this)) {
            request.addEventListener("success", () => {
              const result = request.result
              if (method === "getAll") reads.count += (result as Array<unknown>).length
              else if (result) reads.count++
            })
          }
          return request
        }
        return () => {
          ;(target as any)[method] = original
        }
      }
      const restore = [
        patch(IDBObjectStore.prototype, "openCursor"),
        patch(IDBObjectStore.prototype, "getAll"),
        patch(IDBIndex.prototype, "openCursor"),
        patch(IDBIndex.prototype, "getAll")
      ]
      return { reads, restore }
    }),
    ({ restore }) =>
      Effect.sync(() => {
        for (const f of restore) f()
      })
  ).pipe(Effect.map(({ reads }) => reads))

const idbRequest = <A>(request: IDBRequest<A>) =>
  Effect.callback<A, unknown>((resume) => {
    request.onsuccess = () => resume(Effect.succeed(request.result))
    request.onerror = () => resume(Effect.fail(request.error))
  })

const transactionDone = (tx: IDBTransaction) =>
  Effect.callback<void, unknown>((resume) => {
    tx.oncomplete = () => resume(Effect.void)
    tx.onerror = tx.onabort = () => resume(Effect.fail(tx.error))
  })

// Creates a database with the version 1 schema written by `makeIndexedDb`
// before insertion sequences, the conflict index and entry sources.
const openVersion1 = (database: string) => {
  const request = indexedDB.open(database, 1)
  request.onupgradeneeded = () => {
    const db = request.result
    const entries = db.createObjectStore("entries", { keyPath: "id" })
    entries.createIndex("id", "id", { unique: true })
    entries.createIndex("event", "event")
    const remotes = db.createObjectStore("remotes", { keyPath: ["remoteId", "entryId"] })
    remotes.createIndex("id", ["remoteId", "entryId"], { unique: true })
    remotes.createIndex("sequence", ["remoteId", "sequence"], { unique: true })
    const remoteEntryId = db.createObjectStore("remoteEntryId", { keyPath: ["remoteId"] })
    remoteEntryId.createIndex("id", "remoteId", { unique: true })
  }
  return idbRequest(request)
}

const remoteEntries = (entries: ReadonlyArray<EventJournal.Entry>) =>
  entries.map((entry, remoteSequence) => new EventJournal.RemoteEntry({ remoteSequence, entry }))

const countTransactions = (database: string, transactionMode?: IDBTransactionMode) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const transactions = { opened: 0 }
      const original = IDBDatabase.prototype.transaction
      IDBDatabase.prototype.transaction = function(this: IDBDatabase, storeNames, mode, options) {
        if (this.name === database && (transactionMode === undefined || mode === transactionMode)) transactions.opened++
        return original.call(this, storeNames, mode, options)
      }
      return { transactions, original }
    }),
    ({ original }) =>
      Effect.sync(() => {
        IDBDatabase.prototype.transaction = original
      })
  ).pipe(Effect.map(({ transactions }) => transactions))

// Fresh module instances keep their own entry id clock. They load before any
// test runs, so loading them cannot stall running tests.
const isolate = () => {
  vi.resetModules()
  return Promise.all([import("effect/Effect"), import("effect/eventlog/EventJournal")]).then((
    [Effect, EventJournal]
  ) => ({ Effect, EventJournal }))
}
// Stands in for another tab.
const OtherTab = await isolate()
// Importing the maximum timestamp can exhaust the entry id clock of its module.
const IsolatedFailedImport = await isolate()

// Saturated `rand_a` bits sort the imported entry above every local id counter
// in the same millisecond.
const importFromOtherTab = (database: string, msecs: number) => {
  const { Effect, EventJournal } = OtherTab
  const id = EventJournal.makeEntryIdUnsafe({ msecs })
  id[6] = 0x7f
  id[7] = 0xff
  const entry = new EventJournal.Entry({ id, event: "Repro", primaryKey: "key", payload: new Uint8Array() }, {
    disableChecks: true
  })
  return Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const journal = yield* EventJournal.makeIndexedDb({ database })
    yield* journal.writeFromRemote({
      remoteId: EventJournal.makeRemoteIdUnsafe(),
      entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry })],
      effect: () => Effect.void
    })
    return id
  })))
}

describe("EventJournal.makeIndexedDb", () => {
  ConflictsTest.suite(Effect.suspend(() => EventJournal.makeIndexedDb({ database: uniqueName("conflicts") })))

  it.effect("deduplicates overlapping remote entries within one incoming array", () =>
    Effect.gen(function*() {
      const journal = yield* EventJournal.makeIndexedDb({ database: uniqueName("journal") })
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
      const journal = yield* EventJournal.makeIndexedDb({ database: uniqueName("journal") })
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
      const journal = yield* EventJournal.makeIndexedDb({ database: uniqueName("lookup") })
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

  it.effect("withRemoteUncommited does not resend entries after a successful callback without a remote echo", () =>
    Effect.gen(function*() {
      const journal = yield* EventJournal.makeIndexedDb({ database: uniqueName("journal") })
      const remoteId = EventJournal.makeRemoteIdUnsafe()
      yield* journal.write({
        event: "Repro",
        primaryKey: "a",
        payload: new Uint8Array(),
        effect: Effect.succeed
      })
      yield* journal.withRemoteUncommited(remoteId, () => Effect.void)

      const b = yield* journal.write({
        event: "Repro",
        primaryKey: "b",
        payload: new Uint8Array(),
        effect: Effect.succeed
      })
      const second = yield* journal.withRemoteUncommited(
        remoteId,
        (entries) => Effect.succeed(entries.map((entry) => entry.idString))
      )
      assert.deepStrictEqual(second, Option.some([b.idString]))
    }))

  it.effect("withRemoteUncommited forwards older entries imported after a successful upload", () =>
    Effect.gen(function*() {
      const journal = yield* EventJournal.makeIndexedDb({ database: uniqueName("journal") })
      const remoteId = EventJournal.makeRemoteIdUnsafe()
      const local = yield* journal.write({
        event: "Repro",
        primaryKey: "local",
        payload: new Uint8Array(),
        effect: Effect.succeed
      })
      yield* journal.withRemoteUncommited(remoteId, () => Effect.void)

      const older = entry(local.createdAtMillis - 1)
      yield* journal.writeFromRemote({
        remoteId: EventJournal.makeRemoteIdUnsafe(),
        entries: remoteEntries([older]),
        effect: () => Effect.void
      })
      const forwarded = yield* journal.withRemoteUncommited(
        remoteId,
        (entries) => Effect.succeed(entries.map((entry) => entry.idString))
      )
      assert.deepStrictEqual(forwarded, Option.some([older.idString]))
    }))

  it.effect("writeMany commits and publishes a batch in one transaction only when its callback succeeds", () =>
    Effect.gen(function*() {
      const database = uniqueName("journal")
      const journal = yield* EventJournal.makeIndexedDb({ database })
      const changes = yield* journal.changes
      // Clock observations may read separately; the batch must still use one write transaction.
      const transactions = yield* countTransactions(database, "readwrite")
      const local = (primaryKey: string) => ({ event: "Repro", primaryKey, payload: new Uint8Array() })
      const entries = [local("a"), local("b"), local("c")] as const
      const failed = yield* Effect.exit(journal.writeMany({ entries, effect: () => Effect.fail("callback failed") }))
      const afterFailure = {
        failed: Exit.isFailure(failed),
        transactions: transactions.opened,
        published: yield* PubSub.remaining(changes)
      }
      const written = yield* journal.writeMany({ entries, effect: Effect.succeed })
      const ids = written.map((entry) => entry.idString)
      assert.deepStrictEqual({
        afterFailure,
        transactions: transactions.opened,
        committed: (yield* journal.entries).map((entry) => entry.idString),
        published: (yield* PubSub.takeAll(changes)).map((entry) => entry.idString)
      }, {
        afterFailure: { failed: true, transactions: 0, published: 0 },
        transactions: 1,
        committed: ids,
        published: ids
      })
    }))

  it.effect("writeMany generates ids after entries another tab imported into the shared database", () =>
    Effect.gen(function*() {
      const database = uniqueName("journal")
      const journal = yield* EventJournal.makeIndexedDb({ database })
      // This tab's clock lags the entry the other tab imports.
      const millis = EventJournal.entryIdMillis(EventJournal.makeEntryIdUnsafe()) + 60_000
      const imported = yield* Effect.promise(() => importFromOtherTab(database, millis))
      const [local] = yield* journal.writeMany({
        entries: [{ event: "Repro", primaryKey: "key", payload: new Uint8Array() }],
        effect: Effect.succeed
      })
      assert.strictEqual(EventJournal.EntryIdOrder(imported, local.id), -1)
    }))

  it("keeps local writes working after a failed import of an id at the maximum timestamp", async () => {
    const { Effect, EventJournal } = IsolatedFailedImport
    const id = EventJournal.makeEntryIdUnsafe({ msecs: 2 ** 48 - 1 })
    id[6] = 0x7f
    id[7] = 0xff
    const remote = new EventJournal.Entry({ id, event: "Repro", primaryKey: "key", payload: new Uint8Array() }, {
      disableChecks: true
    })
    const { entries, failed, written } = await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const journal = yield* EventJournal.makeIndexedDb({ database: uniqueName("journal") })
      const failed = yield* Effect.exit(journal.writeFromRemote({
        remoteId: EventJournal.makeRemoteIdUnsafe(),
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry: remote })],
        effect: () => Effect.fail(new EventJournal.EventJournalError({ method: "test", cause: "rejected" }))
      }))
      const written = yield* Effect.exit(journal.write({
        event: "Repro",
        primaryKey: "key",
        payload: new Uint8Array(),
        effect: Effect.succeed
      }))
      return { failed, written, entries: (yield* journal.entries).map((entry) => entry.idString) }
    })))
    assert.strictEqual(failed._tag, "Failure")
    if (written._tag === "Failure") return assert.fail("the local write failed after the import was rejected")
    assert.deepStrictEqual(entries, [written.value.idString])
  })

  it.live("writeMany fails when its transaction aborts after the puts succeed", () =>
    Effect.gen(function*() {
      const database = uniqueName("journal")
      const journal = yield* EventJournal.makeIndexedDb({ database })
      const changes = yield* journal.changes
      // Abort once the put has succeeded and no request is pending, so the
      // transaction dispatches `abort` without an `error` event, as a failed
      // commit would.
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const put = IDBObjectStore.prototype.put
          IDBObjectStore.prototype.put = function(this: IDBObjectStore, value, key) {
            const request = put.call(this, value, key)
            if (this.transaction.db.name === database) {
              request.addEventListener("success", () => this.transaction.abort())
            }
            return request
          }
          return put
        }),
        (put) =>
          Effect.sync(() => {
            IDBObjectStore.prototype.put = put
          })
      )
      const write = yield* journal.writeMany({
        entries: [{ event: "Repro", primaryKey: "a", payload: new Uint8Array() }],
        effect: Effect.succeed
      }).pipe(Effect.flip, Effect.forkDetach)
      // The commit is uninterruptible, so bound the wait without interrupting it.
      const error = yield* Fiber.join(write).pipe(Effect.timeoutOption("2 seconds"))
      assert.deepStrictEqual({
        failed: Option.map(error, (error) => (error as EventJournal.EventJournalError)._tag),
        committed: (yield* journal.entries).length,
        published: yield* PubSub.remaining(changes)
      }, {
        failed: Option.some("EventJournalError"),
        committed: 0,
        published: 0
      })
    }))

  it.effect("replays a remote batch in one callback without journal transactions while it runs", () =>
    Effect.gen(function*() {
      const journalName = uniqueName("journal")
      const journal = yield* EventJournal.makeIndexedDb({ database: journalName })

      const newer = entry(2000, { tail: 0xff })
      const otherEvent = entry(3000, { event: "Other" })
      const otherKey = entry(3000, { primaryKey: "other" })
      yield* journal.writeFromRemote({
        remoteId: EventJournal.makeRemoteIdUnsafe(),
        entries: remoteEntries([newer, otherEvent, otherKey]),
        effect: () => Effect.void
      })

      const transactions = yield* countTransactions(journalName)
      const batches: Array<
        ReadonlyArray<{ readonly entry: EventJournal.Entry; readonly conflicts: ReadonlyArray<EventJournal.Entry> }>
      > = []
      const older = entry(1000)
      const sameBatch = entry(1500)
      const sameMillis = entry(2000, { tail: 0x00 })
      yield* journal.writeFromRemote({
        remoteId: EventJournal.makeRemoteIdUnsafe(),
        entries: remoteEntries([older, sameBatch, sameMillis]),
        effect: Effect.fnUntraced(function*(batch) {
          const before = transactions.opened
          batches.push(batch)
          // Give pending journal requests a turn, as a projection transaction would.
          yield* Effect.yieldNow
          assert.strictEqual(transactions.opened, before)
        })
      })
      assert.deepStrictEqual(
        batches.map((batch) => batch.map(({ conflicts, entry }) => [entry.idString, conflicts.map((c) => c.idString)])),
        [[
          [older.idString, [newer.idString]],
          [sameBatch.idString, [newer.idString]],
          [sameMillis.idString, [newer.idString]]
        ]]
      )
      // Duplicate check, conflicts, commit.
      assert.strictEqual(transactions.opened, 3)
    }))

  it.effect("failed remote callbacks persist nothing and allow redelivery", () =>
    Effect.gen(function*() {
      const journal = yield* EventJournal.makeIndexedDb({ database: uniqueName("journal") })
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
      const failed = yield* Effect.exit(journal.writeFromRemote({
        remoteId,
        entries,
        effect: () => Effect.fail(new EventJournal.EventJournalError({ method: "writeFromRemote", cause: "failed" }))
      }))
      const afterFailure = {
        failed: failed._tag === "Failure",
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
      assert.deepStrictEqual({
        afterFailure,
        retried,
        entries: (yield* journal.entries).map((entry) => entry.idString),
        sequence: yield* journal.nextRemoteSequence(remoteId)
      }, {
        afterFailure: { failed: true, entries: [stored.idString], sequence: 0 },
        retried: [added.idString],
        entries: [stored.idString, added.idString],
        sequence: 2
      })
    }))

  it.effect("reports conflicts in entry id order for each event and primary key", () =>
    Effect.gen(function*() {
      const journal = yield* EventJournal.makeIndexedDb({ database: uniqueName("journal") })
      const newest = entry(3000, { tail: 0x10, payload: [3] })
      const otherEvent = entry(3000, { event: "Other", payload: [4] })
      const otherKey = entry(3000, { primaryKey: "other", payload: [5] })
      // Imported after `newest`, so insertion order differs from id order.
      const sameMillisHigh = entry(2000, { tail: 0x20, payload: [2] })
      const sameMillisLow = entry(2000, { tail: 0x01, payload: [1] })
      const oldest = entry(500, { payload: [0] })
      yield* importEntries(journal, [newest, otherEvent, otherKey])
      yield* importEntries(journal, [sameMillisHigh, sameMillisLow, oldest])

      const older = entry(1000)
      const equalMillis = entry(2000, { tail: 0x05 })
      const crossed = entry(1000, { event: "Other", primaryKey: "other", tail: 0xf0 })
      const otherEventOlder = entry(2500, { event: "Other" })
      const batches: Array<Batch> = []
      const { duplicateEntries } = yield* journal.writeFromRemote({
        remoteId: EventJournal.makeRemoteIdUnsafe(),
        entries: remoteEntries([newest, older, equalMillis, crossed, otherEventOlder]),
        effect: (batch) => Effect.sync(() => batches.push(batch))
      })
      assert.deepStrictEqual({
        duplicates: duplicateEntries.map((entry) => entry.idString),
        batches: batches.map(describeBatch)
      }, {
        duplicates: [newest.idString],
        batches: [[
          [older.idString, [sameMillisLow, sameMillisHigh, newest].map(describeEntry)],
          [crossed.idString, []],
          [equalMillis.idString, [sameMillisHigh, newest].map(describeEntry)],
          [otherEventOlder.idString, [describeEntry(otherEvent)]]
        ]]
      })
    }))

  it.effect("reads only stored entries with the event and primary key of a remote batch", () =>
    Effect.gen(function*() {
      const database = uniqueName("journal")
      const journal = yield* EventJournal.makeIndexedDb({ database })
      const conflicts = [entry(2000), entry(2001), entry(2002)]
      yield* importEntries(journal, [
        entry(500),
        ...conflicts,
        ...Array.from({ length: 20 }, (_, i) => entry(2000 + i, { primaryKey: `other-${i}` })),
        ...Array.from({ length: 5 }, (_, i) => entry(2000 + i, { event: "Other" }))
      ])

      const reads = yield* countEntryReads(database)
      const incoming = entry(1000)
      const batches: Array<Batch> = []
      yield* journal.writeFromRemote({
        remoteId: EventJournal.makeRemoteIdUnsafe(),
        entries: remoteEntries([incoming]),
        effect: (batch) => Effect.sync(() => batches.push(batch))
      })
      assert.deepStrictEqual({
        reads: reads.count,
        batches: batches.map(describeBatch)
      }, {
        reads: conflicts.length,
        batches: [[[incoming.idString, conflicts.map(describeEntry)]]]
      })
    }))

  it.effect("upgrades a version 1 database to the current version without losing entries or remote state", () =>
    Effect.gen(function*() {
      const database = uniqueName("journal")
      const source = EventJournal.makeRemoteIdUnsafe()
      const upload = EventJournal.makeRemoteIdUnsafe()
      const stored = [entry(1000, { payload: [1] }), entry(2000, { payload: [2] }), entry(3000, { payload: [3] })]

      const v1 = yield* openVersion1(database)
      const tx = v1.transaction(["entries", "remotes", "remoteEntryId"], "readwrite")
      for (const item of stored) {
        tx.objectStore("entries").put({
          id: item.id,
          event: item.event,
          primaryKey: item.primaryKey,
          payload: item.payload
        })
      }
      // The first two came from `source`. `upload` has sent the first one but
      // not echoed it back yet, so version 1 only recorded it as the last upload.
      stored.slice(0, 2).forEach((item, sequence) =>
        tx.objectStore("remotes").put({ remoteId: source, entryId: item.id, sequence })
      )
      tx.objectStore("remoteEntryId").put({ remoteId: upload, entryId: stored[0].id })
      yield* transactionDone(tx)
      v1.close()

      const journal = yield* EventJournal.makeIndexedDb({ database })
      const entries = (yield* journal.entries).map(describeEntry)
      const nextSequence = yield* journal.nextRemoteSequence(source)
      const uncommitted = yield* journal.withRemoteUncommited(
        upload,
        (entries) => Effect.succeed(entries.map((entry) => entry.idString))
      )
      const batches: Array<Batch> = []
      const incoming = entry(1500)
      yield* journal.writeFromRemote({
        remoteId: EventJournal.makeRemoteIdUnsafe(),
        entries: remoteEntries([incoming]),
        effect: (batch) => Effect.sync(() => batches.push(batch))
      })

      const upgraded = yield* Effect.acquireRelease(
        idbRequest(indexedDB.open(database)),
        (db) => Effect.sync(() => db.close())
      )
      const store = upgraded.transaction("entries", "readonly").objectStore("entries")
      const keyPaths = Array.from(store.indexNames, (name) => store.index(name).keyPath)
      assert.deepStrictEqual({
        version: upgraded.version,
        conflictIndex: keyPaths.some((keyPath) => Array.isArray(keyPath) && keyPath.join() === "event,primaryKey,id"),
        entries,
        nextSequence,
        uncommitted,
        batches: batches.map(describeBatch)
      }, {
        version: 2,
        conflictIndex: true,
        entries: stored.map(describeEntry),
        nextSequence: 2,
        // Version 1 upload progress is an entry id and is dropped, so the
        // unechoed upload is sent again.
        uncommitted: Option.some(stored.map((item) => item.idString)),
        batches: [[[incoming.idString, stored.slice(1).map(describeEntry)]]]
      })
    }))

  it.effect("replaces per-entry remote rows with entry sources in one restartable upgrade", () =>
    Effect.gen(function*() {
      const database = uniqueName("journal")
      const remoteA = EventJournal.makeRemoteIdUnsafe()
      const remoteB = EventJournal.makeRemoteIdUnsafe()
      // Uploaded to A, which has not echoed it back; version 1 recorded it as
      // the last upload.
      const uploaded = entry(1000, { primaryKey: "uploaded" })
      const fromA = entry(2000, { primaryKey: "fromA" })
      // Uploaded to A and echoed back, so A's remotes row is its only record.
      const acked = entry(3000, { primaryKey: "acked" })
      const fromB = entry(4000, { primaryKey: "fromB" })
      // Written offline; no remote has it.
      const pending = entry(5000, { primaryKey: "pending" })

      const v1 = yield* openVersion1(database)
      const tx = v1.transaction(["entries", "remotes", "remoteEntryId"], "readwrite")
      for (const item of [uploaded, fromA, acked, fromB, pending]) {
        tx.objectStore("entries").put({
          id: item.id,
          event: item.event,
          primaryKey: item.primaryKey,
          payload: item.payload
        })
      }
      tx.objectStore("remotes").put({ remoteId: remoteA, entryId: fromA.id, sequence: 0 })
      tx.objectStore("remotes").put({ remoteId: remoteA, entryId: acked.id, sequence: 1 })
      tx.objectStore("remotes").put({ remoteId: remoteB, entryId: fromB.id, sequence: 3 })
      tx.objectStore("remoteEntryId").put({ remoteId: remoteA, entryId: uploaded.id })
      yield* transactionDone(tx)
      v1.close()

      const deleteObjectStore = IDBDatabase.prototype.deleteObjectStore
      IDBDatabase.prototype.deleteObjectStore = () => {
        throw new Error("interrupted upgrade")
      }
      const interrupted = yield* Effect.exit(Effect.scoped(EventJournal.makeIndexedDb({ database })))
      IDBDatabase.prototype.deleteObjectStore = deleteObjectStore

      const ids = (...entries: ReadonlyArray<EventJournal.Entry>) => entries.map((entry) => entry.idString)
      const state = Effect.gen(function*() {
        const journal = yield* EventJournal.makeIndexedDb({ database })
        return {
          entries: ids(...(yield* journal.entries)),
          nextA: yield* journal.nextRemoteSequence(remoteA),
          nextB: yield* journal.nextRemoteSequence(remoteB)
        }
      }).pipe(Effect.scoped)
      const migrated = yield* state
      const reopened = yield* state

      const journal = yield* EventJournal.makeIndexedDb({ database })
      const fresh = entry(6000, { primaryKey: "fresh" })
      yield* journal.writeFromRemote({
        remoteId: remoteB,
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 4, entry: fresh })],
        effect: () => Effect.void
      })
      const upload = (remoteId: EventJournal.RemoteId) =>
        journal.withRemoteUncommited(remoteId, (entries) => Effect.succeed(ids(...entries)))
      const upgraded = yield* Effect.acquireRelease(
        idbRequest(indexedDB.open(database)),
        (db) => Effect.sync(() => db.close())
      )

      const expected = { entries: ids(uploaded, fromA, acked, fromB, pending), nextA: 2, nextB: 4 }
      assert.deepStrictEqual({
        interrupted: Exit.isFailure(interrupted),
        migrated,
        reopened,
        version: upgraded.version,
        stores: Array.from(upgraded.objectStoreNames),
        nextB: yield* journal.nextRemoteSequence(remoteB),
        uploadA: yield* upload(remoteA),
        uploadB: yield* upload(remoteB),
        uploadLate: yield* upload(EventJournal.makeRemoteIdUnsafe())
      }, {
        interrupted: true,
        migrated: expected,
        reopened: expected,
        version: 2,
        stores: ["entries", "entrySequence", "entrySource", "remoteEntryId"],
        nextB: 5,
        // Never back to the source. The version 1 upload record is dropped, so
        // the unechoed upload is sent again.
        uploadA: Option.some(ids(uploaded, fromB, pending, fresh)),
        uploadB: Option.some(ids(uploaded, fromA, acked, pending)),
        uploadLate: Option.some(ids(uploaded, fromA, acked, fromB, pending, fresh))
      })
    }))

  it.effect("advances the remote sequence only across acknowledgements that follow it", () =>
    Effect.gen(function*() {
      const open = EventJournal.makeIndexedDb({ database: uniqueName("journal") })
      const remoteId = EventJournal.makeRemoteIdUnsafe()
      const ack = (sequence: number) => ({ entryId: EventJournal.makeEntryIdUnsafe(), sequence })
      yield* Effect.gen(function*() {
        const journal = yield* open
        // Sequence 0, written by another replica, has not been downloaded.
        yield* journal.writeRemoteAcks({ remoteId, acks: [ack(2), ack(1)] })
        assert.strictEqual(yield* journal.nextRemoteSequence(remoteId), 0)
        yield* journal.writeFromRemote({ remoteId, entries: remoteEntries([entry(1_000)]), effect: () => Effect.void })
        assert.strictEqual(yield* journal.nextRemoteSequence(remoteId), 1)
        yield* journal.writeRemoteAcks({ remoteId, acks: [ack(2), ack(1), ack(0)] })
        assert.strictEqual(yield* journal.nextRemoteSequence(remoteId), 3)
      }).pipe(Effect.scoped)

      const journal = yield* open
      assert.strictEqual(yield* journal.nextRemoteSequence(remoteId), 3)
      // A remote that numbers from 1 can be acknowledged before any download.
      const otherRemoteId = EventJournal.makeRemoteIdUnsafe()
      yield* journal.writeRemoteAcks({ remoteId: otherRemoteId, acks: [ack(1), ack(2)], firstSequence: 1 })
      assert.strictEqual(yield* journal.nextRemoteSequence(otherRemoteId), 3)
    }))
})
