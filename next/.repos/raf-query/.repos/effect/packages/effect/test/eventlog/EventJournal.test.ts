import { assert, describe, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import * as EventJournal from "effect/eventlog/EventJournal"

const entry = (msecs: number) =>
  new EventJournal.Entry({
    id: EventJournal.makeEntryIdUnsafe({ msecs }),
    event: "Repro",
    primaryKey: "key",
    payload: new Uint8Array()
  }, { disableChecks: true })

describe("EventJournal", () => {
  it.effect("relays an imported entry to another remote", () =>
    Effect.gen(function*() {
      const journal = yield* EventJournal.makeMemory
      const source = EventJournal.makeRemoteIdUnsafe()
      const target = EventJournal.makeRemoteIdUnsafe()
      yield* journal.nextRemoteSequence(target)
      const entry = new EventJournal.Entry({
        id: EventJournal.makeEntryIdUnsafe(),
        event: "Repro",
        primaryKey: "key",
        payload: new Uint8Array()
      }, { disableChecks: true })
      yield* journal.writeFromRemote({
        remoteId: source,
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry })],
        effect: () => Effect.void
      })
      let targetCalls = 0
      const missing = yield* journal.withRemoteUncommited(target, (entries) =>
        Effect.sync(() => {
          targetCalls++
          return entries
        }))
      if (Option.isNone(missing)) assert.fail("Expected the callback result")
      assert.deepStrictEqual(missing.value.map((item) => item.idString), [entry.idString])
      assert.strictEqual(targetCalls, 1)

      let sourceCalls = 0
      const sourceMissing = yield* journal.withRemoteUncommited(source, () =>
        Effect.sync(() => {
          sourceCalls++
          return "called"
        }))
      assert.isTrue(Option.isNone(sourceMissing))
      assert.strictEqual(sourceCalls, 0)
    }))

  it.effect("returns the next unused remote sequence", () =>
    Effect.gen(function*() {
      const journal = yield* EventJournal.makeMemory
      const remoteId = EventJournal.makeRemoteIdUnsafe()
      const entry = new EventJournal.Entry({
        id: EventJournal.makeEntryIdUnsafe(),
        event: "Repro",
        primaryKey: "key",
        payload: new Uint8Array()
      }, { disableChecks: true })

      assert.strictEqual(yield* journal.nextRemoteSequence(remoteId), 0)
      yield* journal.writeFromRemote({
        remoteId,
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry })],
        effect: () => Effect.void
      })
      assert.strictEqual(yield* journal.nextRemoteSequence(remoteId), 1)
      yield* journal.writeFromRemote({
        remoteId,
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 5, entry })],
        effect: () => Effect.void
      })
      assert.strictEqual(yield* journal.nextRemoteSequence(remoteId), 6)
    }))

  it.effect("reports the first newer conflicting entry", () =>
    Effect.gen(function*() {
      const journal = yield* EventJournal.makeMemory
      const newer = entry(2_000)
      yield* journal.writeFromRemote({
        remoteId: EventJournal.makeRemoteIdUnsafe(),
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry: newer })],
        effect: () => Effect.void
      })
      let conflicts: ReadonlyArray<EventJournal.Entry> = []
      yield* journal.writeFromRemote({
        remoteId: EventJournal.makeRemoteIdUnsafe(),
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry: entry(1_000) })],
        effect: (options) => Effect.sync(() => conflicts = options.conflicts)
      })
      assert.deepStrictEqual(conflicts.map((item) => item.idString), [newer.idString])
    }))

  it.effect("records entries in memory and publishes local changes", () =>
    Effect.gen(function*() {
      const journal = yield* EventJournal.EventJournal
      let created = 0
      yield* journal.write({
        event: "test",
        primaryKey: "pk-1",
        payload: new Uint8Array([1, 2, 3]),
        effect: (entry) =>
          Effect.sync(() => {
            created = entry.createdAtMillis
          })
      })
      const entries = yield* journal.entries
      assert.strictEqual(entries.length, 1)
      assert.strictEqual(entries[0].event, "test")
      assert.strictEqual(entries[0].primaryKey, "pk-1")
      assert.strictEqual(entries[0].createdAtMillis, created)
    }).pipe(Effect.provide(EventJournal.layerMemory)))
})
