import { assert, it } from "@effect/vitest"
import { Context, Effect, Exit, Layer, Redacted, Schema } from "effect"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as EventLogMessage from "effect/eventlog/EventLogMessage"
import * as EventLogServerUnencrypted from "effect/eventlog/EventLogServerUnencrypted"
import * as EventLogSessionAuth from "effect/eventlog/EventLogSessionAuth"
import { makeGetIdentityRootSecretMaterial } from "effect/eventlog/internal/identityRootSecretDerivation"
import * as RpcTest from "effect/rpc/RpcTest"

const group = EventGroup.empty.add({
  tag: "Set",
  primaryKey: (payload) => payload.key,
  payload: Schema.Struct({ key: Schema.String })
}).add({
  tag: "Other",
  primaryKey: (payload) => payload.key,
  payload: Schema.Struct({ key: Schema.String })
})
export const makeEntry = Effect.fnUntraced(function*(msecs: number, key: string, tag: "Set" | "Other" = "Set") {
  return new EventJournal.Entry({
    id: EventJournal.makeEntryIdUnsafe({ msecs }),
    event: tag,
    primaryKey: key,
    payload: yield* Schema.encodeUnknownEffect(group.events[tag].payloadSchemaBinary)({ key })
  }, { disableChecks: true })
})

export const makeClient = Effect.fnUntraced(function*(name: string) {
  const storage = yield* EventLogServerUnencrypted.Storage
  const registry = yield* EventLog.Registry.pipe(Effect.provide(EventLog.layerRegistry))
  const handled: Array<{ key: string; conflicts: ReadonlyArray<string> }> = []
  for (const event of [group.events.Set, group.events.Other]) {
    registry.registerHandlerUnsafe({
      event: event.tag,
      handler: {
        event,
        context: Context.empty() as Context.Context<any>,
        handler: ({ entry, conflicts }) =>
          Effect.sync(() => {
            handled.push({ key: entry.primaryKey, conflicts: conflicts.map(({ entry }) => entry.idString) })
          })
      }
    })
  }
  const client = yield* RpcTest.makeClient(EventLogMessage.EventLogRemoteRpcs).pipe(
    Effect.provide(EventLogServerUnencrypted.layerRpcHandlers.pipe(
      Layer.provide(Layer.succeed(EventLogServerUnencrypted.Storage, storage)),
      Layer.provide(Layer.succeed(EventLog.Registry, registry)),
      Layer.provide(Layer.succeed(EventLogServerUnencrypted.StoreMapping, {
        resolve: ({ storeId }) => Effect.succeed(storeId),
        hasStore: () => Effect.succeed(true)
      })),
      Layer.provide(Layer.succeed(EventLogServerUnencrypted.EventLogServerAuthorization, {
        authorizeWrite: () => Effect.void,
        authorizeRead: () => Effect.void,
        authorizeIdentity: () => Effect.void
      }))
    ))
  )
  const identity = yield* EventLog.makeIdentity
  const hello = yield* client["EventLog.Hello"]()
  const material = yield* makeGetIdentityRootSecretMaterial(globalThis.crypto)(identity)
  const signature = yield* EventLogSessionAuth.signSessionAuthPayload({
    remoteId: hello.remoteId,
    challenge: hello.challenge,
    publicKey: identity.publicKey,
    signingPublicKey: material.signingPublicKey,
    signingPrivateKey: Redacted.value(material.signingPrivateKey)
  })
  yield* client["EventLog.Authenticate"](
    new EventLogMessage.Authenticate({
      publicKey: identity.publicKey,
      signingPublicKey: material.signingPublicKey,
      signature,
      algorithm: "Ed25519"
    })
  )
  const write = Effect.fnUntraced(function*(entries: [EventJournal.Entry, ...Array<EventJournal.Entry>]) {
    const data = yield* new EventLogMessage.WriteEntriesUnencrypted({
      publicKey: identity.publicKey,
      storeId: EventLogMessage.StoreId.make(name),
      entries
    }).encoded
    yield* client["EventLog.WriteSingle"]({ data })
  })
  return { write, handled }
})

export const suite = (name: string, storage: Layer.Layer<EventLogServerUnencrypted.Storage, unknown>) =>
  it.layer(Layer.merge(storage, EventLogEncryption.layerSubtle), { timeout: "30 seconds" })(
    `Unencrypted write ordering (${name})`,
    (it) => {
      it.effect("returns full at-or-after history when batch is omitted", () =>
        Effect.gen(function*() {
          const storage = yield* EventLogServerUnencrypted.Storage
          const storeId = EventLogMessage.StoreId.make("history-without-batch")
          const older = yield* makeEntry(1_000, "key")
          const boundary = yield* makeEntry(2_000, "key")
          const otherEvent = yield* makeEntry(3_000, "key", "Other")
          const otherKey = yield* makeEntry(4_000, "unrelated")
          const newer = yield* makeEntry(5_000, "key")
          yield* storage.write(storeId, [older, otherKey, boundary, otherEvent, newer])

          const history = yield* storage.entriesAfter(storeId, boundary)

          assert.deepStrictEqual(history.map((entry) => entry.entry.idString), [
            otherKey.idString,
            boundary.idString,
            otherEvent.idString,
            newer.idString
          ])
        }))

      it.effect("acknowledges an out-of-order duplicate without invoking its handler", () =>
        Effect.gen(function*() {
          const { write, handled } = yield* makeClient("out-of-order")
          const older = yield* makeEntry(1_000, "older")
          const newer = yield* makeEntry(2_000, "newer")
          yield* write([newer])
          yield* write([older])
          const result = yield* Effect.exit(write([older]))
          assert.deepStrictEqual({ acknowledged: Exit.isSuccess(result), calls: handled.length }, {
            acknowledged: true,
            calls: 2
          })
        }))

      it.effect("skips all equal-timestamp duplicates in a retried batch", () =>
        Effect.gen(function*() {
          const { write, handled } = yield* makeClient("equal-timestamps")
          const entries = [yield* makeEntry(1_000, "a"), yield* makeEntry(1_000, "b")]
            .sort(EventJournal.Entry.Order)
          assert.notStrictEqual(entries[0].idString, entries[1].idString)
          yield* write([entries[0], entries[1]])
          const result = yield* Effect.exit(write([entries[0], entries[1]]))
          assert.deepStrictEqual({ acknowledged: Exit.isSuccess(result), calls: handled.length }, {
            acknowledged: true,
            calls: 2
          })
        }))

      it.effect("reports only newer same-key conflicts regardless of storage order", () =>
        Effect.gen(function*() {
          const x = yield* makeEntry(1_200, "a")
          const y = yield* makeEntry(2_000, "b")
          const z = yield* makeEntry(2_500, "a")
          const v = yield* makeEntry(1_100, "c")
          const w = yield* makeEntry(1_500, "a")
          const results = []
          for (const [index, history] of [[x, y, z], [y, x, z]].entries()) {
            const { write, handled } = yield* makeClient(`conflicts-${index}`)
            for (const entry of history) yield* write([entry])
            handled.length = 0
            yield* write([v, w])
            results.push(handled)
          }
          assert.deepStrictEqual(results, [
            [{ key: "c", conflicts: [] }, { key: "a", conflicts: [z.idString] }],
            [{ key: "c", conflicts: [] }, { key: "a", conflicts: [z.idString] }]
          ])
        }))

      it.effect("ignores same-key entries from a different event", () =>
        Effect.gen(function*() {
          const { write, handled } = yield* makeClient("different-event")
          const storedOther = yield* makeEntry(2_000, "a", "Other")
          const storedSet = yield* makeEntry(3_000, "a")
          yield* write([storedOther])
          yield* write([storedSet])
          handled.length = 0
          yield* write([yield* makeEntry(1_000, "a"), yield* makeEntry(1_500, "a", "Other")])
          assert.deepStrictEqual(handled, [
            { key: "a", conflicts: [storedSet.idString] },
            { key: "a", conflicts: [storedOther.idString] }
          ])
        }))

      it.effect("reports equal-timestamp conflicts only for stored entries with a greater id", () =>
        Effect.gen(function*() {
          const [lower, stored, higher] = [
            yield* makeEntry(1_000, "a"),
            yield* makeEntry(1_000, "a"),
            yield* makeEntry(1_000, "a")
          ].sort(EventJournal.Entry.Order)
          const results = []
          const batches: Array<[EventJournal.Entry, ...Array<EventJournal.Entry>]> = [[lower], [higher], [
            lower,
            higher
          ]]
          for (const [index, batch] of batches.entries()) {
            const { write, handled } = yield* makeClient(`equal-timestamp-conflicts-${index}`)
            yield* write([stored])
            handled.length = 0
            yield* write(batch)
            results.push(handled.map(({ conflicts }) => conflicts))
          }
          // `stored` has the same timestamp as `higher` but a lower id, so it
          // never conflicts with `higher`, whatever else is in the batch.
          assert.deepStrictEqual(results, [
            [[stored.idString]],
            [[]],
            [[stored.idString], []]
          ])
        }))

      it.effect("applies the batch's lowest id to every lookup in a large batch", () =>
        Effect.gen(function*() {
          const { write, handled } = yield* makeClient("large-batch")
          const entries: Array<EventJournal.Entry> = []
          for (let i = 0; i < 252; i++) entries.push(yield* makeEntry(1_000, "x"))
          entries.sort(EventJournal.Entry.Order)
          // `stored` sorts between the batch's first and last entries and only
          // shares a key with the batch's second entry, so the history must
          // start from the batch's lowest id.
          const withKeyB = ({ event, id, payload }: EventJournal.Entry) =>
            new EventJournal.Entry({ id, event, primaryKey: "b", payload }, { disableChecks: true })
          const second = withKeyB(entries[1])
          const stored = withKeyB(entries[2])
          yield* write([stored])
          handled.length = 0
          yield* write([entries[0], second, ...entries.slice(3)])
          assert.deepStrictEqual(handled[1], { key: "b", conflicts: [stored.idString] })
        }))

      it.effect("matches long primary keys exactly", () =>
        Effect.gen(function*() {
          const { write, handled } = yield* makeClient("long-keys")
          const prefix = Array.from({ length: 125 }, () => crypto.randomUUID()).join("")
          const stored = yield* makeEntry(2_000, `${prefix}a`)
          yield* write([stored])
          handled.length = 0
          yield* write([yield* makeEntry(1_000, `${prefix}a`), yield* makeEntry(1_500, `${prefix}b`)])
          assert.deepStrictEqual(handled.map(({ conflicts }) => conflicts), [[stored.idString], []])
        }))

      it.effect("skips a stored duplicate inside a mixed batch and persists the rest", () =>
        Effect.gen(function*() {
          const { write, handled } = yield* makeClient("mixed-duplicate")
          const stored = yield* makeEntry(2_000, "a")
          const before = yield* makeEntry(1_000, "a")
          const after = yield* makeEntry(2_500, "a")
          yield* write([stored])
          handled.length = 0
          yield* write([before, stored, after])
          yield* write([yield* makeEntry(500, "a")])
          // Conflicts are reported in id order, not upload order.
          assert.deepStrictEqual(handled, [
            { key: "a", conflicts: [stored.idString] },
            { key: "a", conflicts: [] },
            { key: "a", conflicts: [before.idString, stored.idString, after.idString] }
          ])
        }))

      it.effect("does not report conflicts between entries of the same batch", () =>
        Effect.gen(function*() {
          const { write, handled } = yield* makeClient("same-batch")
          const sameMillis = [yield* makeEntry(1_000, "a"), yield* makeEntry(1_000, "a")]
          yield* write([yield* makeEntry(2_000, "a"), ...sameMillis])
          assert.deepStrictEqual(handled.map(({ conflicts }) => conflicts), [[], [], []])
        }))
    }
  )
