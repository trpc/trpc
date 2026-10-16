import { SqliteClient } from "@effect/sql-sqlite-node"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as SqlEventJournal from "effect/eventlog/SqlEventJournal"
import { Reactivity } from "effect/reactivity"
import * as SqlClient from "effect/sql/SqlClient"

const makeJournal = Effect.gen(function*() {
  const sql = yield* SqliteClient.make({ filename: ":memory:" })
  return yield* SqlEventJournal.make().pipe(
    Effect.provideService(SqlClient.SqlClient, sql)
  )
}).pipe(Effect.provide(Reactivity.layer))

describe("SqlEventJournal", () => {
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
        effect: ({ conflicts }) =>
          Effect.sync(() => {
            seenConflicts.push(conflicts)
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
      assert.strictEqual(seenConflicts.length, 2)
      assert.strictEqual(seenConflicts[0][0]?.idString, entryA.idString)
      assert.strictEqual(seenConflicts[1][0]?.idString, entryB.idString)
    }))
})
