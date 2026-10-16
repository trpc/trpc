import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, PubSub, Queue, Ref, Schema } from "effect"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as EventLogRemote from "effect/eventlog/EventLogRemote"
import { TestClock } from "effect/testing"

const UserPayload = Schema.Struct({
  id: Schema.String
})

const UserGroup = EventGroup.empty.add({
  tag: "UserCreated",
  primaryKey: (payload) => payload.id,
  payload: UserPayload
})

const schema = EventLog.schema(UserGroup)

const handlerLayer = (handled: Ref.Ref<ReadonlyArray<string>>) =>
  EventLog.group(
    UserGroup,
    (handlers) =>
      handlers.handle("UserCreated", ({ payload }) => Ref.update(handled, (values) => [...values, payload.id]))
  ).pipe(
    Layer.provide(EventLog.layerRegistry)
  )

const logLayer = (
  handled: Ref.Ref<ReadonlyArray<string>>,
  journalLayer: Layer.Layer<EventJournal.EventJournal> = EventJournal.layerMemory
) =>
  EventLog.layer(schema, handlerLayer(handled)).pipe(
    Layer.provide(journalLayer),
    Layer.provide(
      Layer.effect(EventLog.Identity, EventLog.makeIdentity).pipe(
        Layer.provide(EventLogEncryption.layerSubtle)
      )
    )
  )

describe("EventLog", () => {
  it.effect("writes a typed event, commits the entry, and runs its handler", () =>
    Effect.gen(function*() {
      const handled = yield* Ref.make<ReadonlyArray<string>>([])
      return yield* Effect.gen(function*() {
        const log = yield* EventLog.EventLog
        yield* log.write({
          schema,
          event: "UserCreated",
          payload: { id: "user-1" }
        })
        const entries = yield* log.entries
        const seen = yield* Ref.get(handled)
        assert.strictEqual(entries.length, 1)
        assert.strictEqual(entries[0].event, "UserCreated")
        assert.deepStrictEqual(seen, ["user-1"])
      }).pipe(Effect.provide(logLayer(handled)))
    }))

  it.effect("retries a failed remote write and flushes changes made during the retry", () =>
    Effect.gen(function*() {
      const handled = yield* Ref.make<ReadonlyArray<string>>([])
      const subscriptions = yield* Queue.unbounded<PubSub.Subscription<EventJournal.Entry>>()
      const journalLayer = Layer.effect(
        EventJournal.EventJournal,
        EventJournal.makeMemory.pipe(
          Effect.map((journal) =>
            EventJournal.EventJournal.of({
              ...journal,
              changes: journal.changes.pipe(Effect.tap((subscription) => Queue.offer(subscriptions, subscription)))
            })
          )
        )
      )
      return yield* Effect.gen(function*() {
        const log = yield* EventLog.EventLog
        const registry = yield* EventLog.Registry
        const attempts = yield* Queue.unbounded<ReadonlyArray<EventJournal.Entry>>()
        const release = yield* Queue.unbounded<void>()
        let attempt = 0
        let failedChangeWrite = false
        const remote = EventLogRemote.EventLogRemote.of({
          id: EventJournal.makeRemoteIdUnsafe(),
          changes: () => Queue.unbounded<EventJournal.RemoteEntry, EventLogRemote.EventLogRemoteError>(),
          write: ({ entries }) =>
            Queue.offer(attempts, entries).pipe(
              Effect.flatMap(() => {
                attempt++
                if (attempt === 1) {
                  return Effect.fail(new EventLogRemote.EventLogRemoteError({ method: "write", cause: "offline" }))
                }
                if (attempt === 2) return Queue.take(release)
                if (!failedChangeWrite && entries.some((entry) => entry.primaryKey === "user-4")) {
                  failedChangeWrite = true
                  return Effect.fail(new EventLogRemote.EventLogRemoteError({ method: "write", cause: "offline" }))
                }
                return Effect.void
              })
            ),
          whenAuthenticated: (effect) => effect
        })

        yield* log.write({ schema, event: "UserCreated", payload: { id: "user-1" } })
        yield* registry.registerRemote(remote)
        const subscription = yield* Queue.take(subscriptions)
        const initial = yield* Queue.take(attempts)
        yield* TestClock.adjust("200 millis")
        const retry = yield* Queue.take(attempts)
        yield* log.write({ schema, event: "UserCreated", payload: { id: "user-2" } })
        yield* log.write({ schema, event: "UserCreated", payload: { id: "user-3" } })
        yield* Effect.yieldNow
        assert.strictEqual(yield* PubSub.remaining(subscription), 0)
        yield* Queue.offer(release, undefined)
        const afterChange = yield* Queue.take(attempts)
        yield* Effect.yieldNow
        assert.strictEqual(yield* Queue.size(attempts), 0)
        yield* log.write({ schema, event: "UserCreated", payload: { id: "user-4" } })
        const changeAttempt = yield* Queue.take(attempts)
        yield* TestClock.adjust("200 millis")
        const changeRetry = yield* Queue.take(attempts)

        assert.deepStrictEqual(retry.map((entry) => entry.idString), initial.map((entry) => entry.idString))
        assert.deepStrictEqual(afterChange.map((entry) => entry.primaryKey), ["user-2", "user-3"])
        assert.deepStrictEqual(changeAttempt.map((entry) => entry.primaryKey), ["user-4"])
        assert.deepStrictEqual(
          changeRetry.map((entry) => entry.idString),
          changeAttempt.map((entry) => entry.idString)
        )
      }).pipe(Effect.provide(logLayer(handled, journalLayer)))
    }))

  it.effect("encrypts and decrypts entries with a distinct IV per entry", () =>
    Effect.gen(function*() {
      const encryption = yield* EventLogEncryption.EventLogEncryption
      const identity = yield* encryption.generateIdentity
      const entries = ["user-1", "user-2"].map((primaryKey, index) =>
        new EventJournal.Entry({
          id: EventJournal.makeEntryIdUnsafe(),
          event: "UserCreated",
          primaryKey,
          payload: new Uint8Array([index])
        }, { disableChecks: true })
      )
      const encrypted = yield* encryption.encrypt(identity, entries)
      assert.notDeepEqual(encrypted[0].iv, encrypted[1].iv)
      const decrypted = yield* encryption.decrypt(
        identity,
        encrypted.map((entry, index) => ({ ...entry, sequence: index, entryId: entries[index].id }))
      )
      assert.deepStrictEqual(
        decrypted.map((remote) => remote.entry.idString),
        entries.map((entry) => entry.idString)
      )
    }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))

  it.effect("publishes local journal changes through a scoped subscription", () =>
    Effect.gen(function*() {
      const remoteId = EventJournal.makeRemoteIdUnsafe()
      const journal = yield* EventJournal.EventJournal
      const entry = new EventJournal.Entry({
        id: EventJournal.makeEntryIdUnsafe(),
        event: "UserCreated",
        primaryKey: "user-1",
        payload: new Uint8Array([1])
      }, { disableChecks: true })

      const first = yield* journal.writeFromRemote({
        remoteId,
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 1, entry })],
        effect: () => Effect.void
      })
      const second = yield* journal.writeFromRemote({
        remoteId,
        entries: [new EventJournal.RemoteEntry({ remoteSequence: 2, entry })],
        effect: () => Effect.void
      })

      assert.deepStrictEqual(first.duplicateEntries, [])
      assert.deepStrictEqual(second.duplicateEntries.map((_) => _.idString), [entry.idString])
    }).pipe(Effect.provide(EventJournal.layerMemory)))
})
