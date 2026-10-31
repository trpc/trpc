import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import * as EventJournal from "effect/eventlog/EventJournal"
import type * as Scope from "effect/Scope"

// `tail` fixes the random id bytes, so entries sharing a millisecond sort in a
// known order by id.
const entry = (msecs: number, tail: number, payload: number) => {
  const id = EventJournal.makeEntryIdUnsafe({ msecs })
  id.fill(tail, 6)
  return new EventJournal.Entry({
    id,
    event: "Repro",
    primaryKey: "key",
    payload: new Uint8Array([payload])
  }, { disableChecks: true })
}

const remoteEntries = (entries: ReadonlyArray<EventJournal.Entry>) =>
  entries.map((entry, remoteSequence) => new EventJournal.RemoteEntry({ remoteSequence, entry }))

// A last-writer-wins handler: an entry is applied only when no stored entry
// for its key is newer.
const lastWriterWins = (journal: EventJournal.EventJournal["Service"]) => {
  const state = new Map<string, Array<number>>()
  const deliver = (entries: ReadonlyArray<EventJournal.Entry>) =>
    journal.writeFromRemote({
      remoteId: EventJournal.makeRemoteIdUnsafe(),
      entries: remoteEntries(entries),
      effect: (batch) =>
        Effect.sync(() => {
          for (const { conflicts, entry } of batch) {
            if (conflicts.length === 0) state.set(entry.primaryKey, Array.from(entry.payload))
          }
        })
    })
  return { state, deliver }
}

export const suite = (
  makeJournal: Effect.Effect<EventJournal.EventJournal["Service"], unknown, Scope.Scope>
) => {
  it.effect("converges when same-key entries arrive in one batch out of id order", () =>
    Effect.gen(function*() {
      const newer = entry(2_000, 0x10, 2)
      const older = entry(1_000, 0x10, 1)

      const batched = lastWriterWins(yield* makeJournal)
      yield* batched.deliver([newer, older])

      const separate = lastWriterWins(yield* makeJournal)
      yield* separate.deliver([newer])
      yield* separate.deliver([older])

      assert.deepStrictEqual({
        batched: batched.state.get("key"),
        separate: separate.state.get("key")
      }, {
        batched: [2],
        separate: [2]
      })
    }))

  it.effect("reports a newer id in the same millisecond as a conflict, and not an older one", () =>
    Effect.gen(function*() {
      const journal = yield* makeJournal
      const lower = entry(1_000, 0x01, 1)
      const higher = entry(1_000, 0x30, 3)
      yield* journal.writeFromRemote({
        remoteId: EventJournal.makeRemoteIdUnsafe(),
        entries: remoteEntries([lower, higher]),
        effect: () => Effect.void
      })

      const incoming = entry(1_000, 0x10, 2)
      const conflicts: Array<string> = []
      yield* journal.writeFromRemote({
        remoteId: EventJournal.makeRemoteIdUnsafe(),
        entries: remoteEntries([incoming]),
        effect: (batch) =>
          Effect.sync(() => {
            for (const item of batch) conflicts.push(...item.conflicts.map((entry) => entry.idString))
          })
      })

      assert.deepStrictEqual(conflicts, [higher.idString])
    }))
}
