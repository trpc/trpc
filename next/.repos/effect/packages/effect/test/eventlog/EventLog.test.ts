import { assert, describe, it } from "@effect/vitest"
import {
  Array,
  Context,
  Effect,
  Exit,
  Layer,
  Logger,
  Option,
  PubSub,
  Queue,
  Redacted,
  Ref,
  References,
  Schema,
  SchemaGetter,
  Scope,
  Stream
} from "effect"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as EventLogMessage from "effect/eventlog/EventLogMessage"
import * as EventLogRemote from "effect/eventlog/EventLogRemote"
import * as EventLogServerEncrypted from "effect/eventlog/EventLogServerEncrypted"
import { Reactivity } from "effect/reactivity"
import * as RpcClient from "effect/rpc/RpcClient"
import type * as RpcGroup from "effect/rpc/RpcGroup"
import type { FromServer } from "effect/rpc/RpcMessage"
import * as RpcServer from "effect/rpc/RpcServer"
import * as RpcTest from "effect/rpc/RpcTest"
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

const ItemPayload = Schema.Struct({ list: Schema.String, item: Schema.Number })
const ItemGroup = EventGroup.empty.add({
  tag: "ItemAdded",
  primaryKey: (payload) => payload.list,
  payload: ItemPayload
})
const UncompactedItemGroup = EventGroup.empty.add({
  tag: "ItemObserved",
  primaryKey: (payload) => payload.list,
  payload: ItemPayload
})
// Replay handlers also understand older payloads that the compactor cannot decode.
const CompactableItemGroup = EventGroup.empty.add({
  tag: "ItemAdded",
  primaryKey: (payload) => payload.list,
  payload: Schema.Struct({ ...ItemPayload.fields, compactable: Schema.Literal(true) })
})
const replayItems = Effect.fnUntraced(function*(
  events: ReadonlyArray<{
    readonly event: "ItemAdded" | "ItemObserved"
    readonly list?: string
    readonly opaque?: boolean
  }>
) {
  const handled = yield* Queue.unbounded<number>()
  const changes = yield* Queue.unbounded<EventJournal.RemoteEntry, EventLogRemote.EventLogRemoteError>()
  const entries = yield* Effect.forEach(events, ({ event, list = "list-1", opaque }, item) =>
    Effect.gen(function*() {
      const id = EventJournal.makeEntryIdUnsafe({ msecs: 1000 })
      // Same-millisecond UUIDs sort opposite to remote sequence order.
      id.fill(0, 6)
      id[6] = 0x70
      id[8] = 0x80
      id[15] = events.length - item
      return new EventJournal.RemoteEntry({
        remoteSequence: item,
        entry: new EventJournal.Entry({
          id,
          event,
          primaryKey: list,
          payload: opaque
            ? yield* Schema.encodeUnknownEffect(ItemGroup.events.ItemAdded.payloadSchemaBinary)({ list, item })
            : yield* Schema.encodeUnknownEffect(CompactableItemGroup.events.ItemAdded.payloadSchemaBinary)({
              list,
              item,
              compactable: true
            })
        }, { disableChecks: true })
      })
    }))
  yield* Queue.offerAll(changes, entries)
  const remote = EventLogRemote.EventLogRemote.of({
    id: EventJournal.makeRemoteIdUnsafe(),
    changes: () => Effect.succeed(changes),
    write: () => Effect.void,
    whenAuthenticated: (effect) => effect
  })
  const handlers = Layer.mergeAll(
    EventLog.group(
      ItemGroup,
      (handlers) => handlers.handle("ItemAdded", ({ payload }) => Queue.offer(handled, payload.item))
    ),
    EventLog.group(
      UncompactedItemGroup,
      (handlers) => handlers.handle("ItemObserved", ({ payload }) => Queue.offer(handled, payload.item))
    ),
    EventLog.groupCompaction(
      CompactableItemGroup,
      ({ events, write }) =>
        Effect.forEach(
          events,
          (event) => write(event._tag, { ...event.payload, list: "replacement" }),
          { discard: true }
        )
    )
  ).pipe(Layer.provide(EventLog.layerRegistry))
  const layer = EventLog.layer(EventLog.schema(ItemGroup, UncompactedItemGroup), handlers).pipe(
    Layer.provide(EventJournal.layerMemory),
    Layer.provide(
      Layer.effect(EventLog.Identity, EventLog.makeIdentity).pipe(Layer.provide(EventLogEncryption.layerSubtle))
    )
  )
  return yield* Effect.gen(function*() {
    const registry = yield* EventLog.Registry
    return yield* registry.registerRemote(remote).pipe(
      Effect.andThen(Effect.forEach(events, () => Queue.take(handled)))
    )
  }).pipe(Effect.provide(layer))
})

const CurrentUserGroup = EventGroup.empty.add({
  tag: "UserCreated",
  primaryKey: (payload) => payload.id,
  payload: Schema.Struct({ id: Schema.String, name: Schema.String })
})

const MenuGroup = EventGroup.empty.add({
  tag: "MenuItemAdded",
  primaryKey: (payload) => payload.item,
  payload: Schema.Struct({ menu: Schema.String, item: Schema.String })
}).add({
  tag: "MenuRemoved",
  primaryKey: (payload) => payload.menu,
  payload: Schema.Struct({ menu: Schema.String })
})

const makeCompactionEntry = Effect.fnUntraced(function*(payload: { readonly id: string; readonly name?: string }) {
  const payloadSchema = payload.name === undefined
    ? UserGroup.events.UserCreated.payloadSchemaBinary
    : CurrentUserGroup.events.UserCreated.payloadSchemaBinary
  return new EventJournal.Entry({
    id: EventJournal.makeEntryIdUnsafe(),
    event: "UserCreated",
    primaryKey: payload.id,
    payload: yield* Schema.encodeUnknownEffect(payloadSchema)(payload)
  }, { disableChecks: true })
})

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

class ReplayLabel extends Context.Service<ReplayLabel, string>()("test/ReplayLabel") {}
class ReplayMarker extends Context.Service<ReplayMarker, string>()("test/ReplayMarker") {}

const testIdentity = (publicKey: string) =>
  EventLog.Identity.of({ publicKey, privateKey: Redacted.make(new Uint8Array(32)) })

// Records the services visible while a replayed payload is decoded or handled.
const observeReplay = (seen: Array<string>, step: string) =>
  Effect.all([
    Effect.serviceOption(ReplayLabel),
    Effect.serviceOption(ReplayMarker),
    Effect.serviceOption(EventLog.Identity)
  ]).pipe(
    Effect.map(([label, marker, identity]) => {
      seen.push(
        `${step} label=${Option.getOrUndefined(label)} marker=${Option.getOrUndefined(marker)} identity=${
          Option.getOrUndefined(Option.map(identity, (_) => _.publicKey))
        }`
      )
    })
  )

const makeObservedGroup = <const Tag extends string>(tag: Tag, seen: Array<string>) =>
  EventGroup.empty.add({
    tag,
    primaryKey: (payload) => payload.id,
    payload: UserPayload.pipe(Schema.decode({
      decode: SchemaGetter.transformEffect((payload) =>
        Effect.as(observeReplay(seen, `decode ${tag} ${payload.id}`), payload)
      ),
      encode: SchemaGetter.passthrough()
    }))
  })

const makeObservedEntry = Effect.fnUntraced(function*(event: string, id: string, msecs: number) {
  return new EventJournal.Entry({
    id: EventJournal.makeEntryIdUnsafe({ msecs }),
    event,
    primaryKey: "key",
    payload: yield* Schema.encodeUnknownEffect(UserGroup.events.UserCreated.payloadSchemaBinary)({ id })
  }, { disableChecks: true })
})

describe("EventLog", () => {
  it.effect("does not acknowledge undecodable remote entries before a compatible handler can replay them", () =>
    Effect.gen(function*() {
      const journal = yield* EventJournal.makeMemory
      const remoteId = EventJournal.makeRemoteIdUnsafe()
      const entry = yield* makeCompactionEntry({ id: "user-1" })
      const handled: Array<string> = []
      const snapshots: Array<{ readonly stored: Array<string>; readonly nextSequence: number }> = []
      const requested: Array<number> = []

      // The first app requires a name; the second can decode the stored payload.
      for (const compatible of [false, true]) {
        const group = EventGroup.empty.add({
          tag: "UserCreated",
          primaryKey: (payload) => payload.id,
          payload: Schema.Struct({
            id: Schema.String,
            name: compatible ? Schema.optionalKey(Schema.String) : Schema.String
          })
        })
        const done = yield* Queue.unbounded<void>()
        const subscribed = yield* Queue.unbounded<number>()
        const handlers = EventLog.group(
          group,
          (handlers) =>
            handlers.handle("UserCreated", ({ payload }) =>
              Effect.sync(() => {
                handled.push(payload.id)
              }))
        ).pipe(Layer.provide(EventLog.layerRegistry))
        const layer = EventLog.layer(EventLog.schema(group), handlers).pipe(
          Layer.provide([
            Layer.succeed(EventJournal.EventJournal, journal),
            Layer.succeed(EventLog.Identity, testIdentity("log")),
            Layer.succeed(
              EventLog.HandlerTransaction,
              (effect) => Effect.ensuring(effect, Queue.offer(done, undefined))
            )
          ])
        )

        yield* Effect.gen(function*() {
          const registry = yield* EventLog.Registry
          yield* registry.registerRemote(EventLogRemote.EventLogRemote.of({
            id: remoteId,
            changes: Effect.fnUntraced(function*({ startSequence }) {
              const changes = yield* Queue.unbounded<EventJournal.RemoteEntry, EventLogRemote.EventLogRemoteError>()
              if (startSequence === 0) {
                yield* Queue.offer(changes, new EventJournal.RemoteEntry({ remoteSequence: 0, entry }))
              }
              yield* Queue.offer(subscribed, startSequence)
              return changes
            }),
            write: () => Effect.void,
            whenAuthenticated: (effect) => effect
          }))
          const startSequence = yield* Queue.take(subscribed)
          requested.push(startSequence)
          if (startSequence === 0) yield* Queue.take(done)
          // Wait for the journal transaction, not merely the handler, to finish.
          snapshots.push(
            yield* journal.withLock(EventLogMessage.StoreId.make("default"))(
              Effect.all({
                stored: Effect.map(journal.entries, (entries) => entries.map((entry) => entry.idString)),
                nextSequence: journal.nextRemoteSequence(remoteId)
              })
            )
          )
        }).pipe(Effect.provide(layer), Effect.scoped)
      }

      assert.deepStrictEqual({ snapshots, requested, handled }, {
        snapshots: [
          { stored: [], nextSequence: 0 },
          { stored: [entry.idString], nextSequence: 1 }
        ],
        requested: [0, 0],
        handled: ["user-1"]
      })
    }))

  it.effect("decodes shared conflicts once per remote replay batch", () =>
    Effect.gen(function*() {
      const decoded: Array<number> = []
      const group = EventGroup.empty.add({
        tag: "ItemAdded",
        primaryKey: (payload) => payload.list,
        payload: ItemPayload.pipe(Schema.decode({
          decode: SchemaGetter.transformEffect((payload) =>
            Effect.sync(() => {
              decoded.push(payload.item)
              return payload
            })
          ),
          encode: SchemaGetter.passthrough()
        }))
      })
      const handled = yield* Queue.unbounded<{ readonly item: number; readonly conflicts: ReadonlyArray<number> }>()
      const handlers = EventLog.group(group, (handlers) =>
        handlers.handle("ItemAdded", ({ conflicts, payload }) =>
          Queue.offer(handled, {
            item: payload.item,
            conflicts: conflicts.map(({ payload }) =>
              payload.item
            )
          }))).pipe(Layer.provide(EventLog.layerRegistry))
      const layer = EventLog.layer(EventLog.schema(group), handlers).pipe(
        Layer.provideMerge(EventJournal.layerMemory),
        Layer.provide(
          Layer.effect(EventLog.Identity, EventLog.makeIdentity).pipe(Layer.provide(EventLogEncryption.layerSubtle))
        )
      )
      const makeEntry = Effect.fnUntraced(function*(item: number, msecs: number) {
        return new EventJournal.Entry({
          id: EventJournal.makeEntryIdUnsafe({ msecs }),
          event: "ItemAdded",
          primaryKey: "list-1",
          payload: yield* Schema.encodeUnknownEffect(ItemGroup.events.ItemAdded.payloadSchemaBinary)({
            list: "list-1",
            item
          })
        }, { disableChecks: true })
      })

      yield* Effect.gen(function*() {
        const journal = yield* EventJournal.EventJournal
        const registry = yield* EventLog.Registry
        const remoteId = EventJournal.makeRemoteIdUnsafe()
        // Both stored entries are newer than every incoming entry.
        yield* journal.writeFromRemote({
          remoteId,
          entries: [
            new EventJournal.RemoteEntry({ remoteSequence: 0, entry: yield* makeEntry(10, 2000) }),
            new EventJournal.RemoteEntry({ remoteSequence: 1, entry: yield* makeEntry(11, 3000) })
          ],
          effect: () => Effect.void
        })
        const changes = yield* Queue.unbounded<EventJournal.RemoteEntry, EventLogRemote.EventLogRemoteError>()
        // Enqueue before registration so these entries are consumed as one batch.
        yield* Queue.offerAll(changes, [
          new EventJournal.RemoteEntry({ remoteSequence: 2, entry: yield* makeEntry(0, 1000) }),
          new EventJournal.RemoteEntry({ remoteSequence: 3, entry: yield* makeEntry(1, 1001) })
        ])
        yield* registry.registerRemote(EventLogRemote.EventLogRemote.of({
          id: remoteId,
          changes: () => Effect.succeed(changes),
          write: () => Effect.void,
          whenAuthenticated: (effect) => effect
        }))
        const first = [yield* Queue.take(handled), yield* Queue.take(handled)]
        const firstDecodes = decoded.splice(0).sort((a, b) => a - b)

        yield* Queue.offer(
          changes,
          new EventJournal.RemoteEntry({
            remoteSequence: 4,
            entry: yield* makeEntry(2, 1002)
          })
        )
        const second = yield* Queue.take(handled)
        assert.deepStrictEqual([...first, second], [
          { item: 0, conflicts: [10, 11] },
          { item: 1, conflicts: [10, 11] },
          { item: 2, conflicts: [10, 11] }
        ])
        // Reuse within a batch, but decode again in the next batch.
        assert.deepStrictEqual([firstDecodes, decoded.sort((a, b) => a - b)], [
          [0, 1, 10, 11],
          [2, 10, 11]
        ])
      }).pipe(Effect.provide(layer))
    }))

  it.effect("replays compacted outputs in compactor write order", () =>
    Effect.gen(function*() {
      const handled = yield* replayItems([{ event: "ItemAdded" }, { event: "ItemAdded" }])
      assert.deepStrictEqual(handled, [0, 1])
    }), { concurrent: false })

  it.effect(
    "replays a mixed same-millisecond batch in id order even when replacement keys change",
    () =>
      Effect.gen(function*() {
        const handled = yield* replayItems([
          { event: "ItemAdded", list: "a" },
          { event: "ItemAdded", list: "b", opaque: true },
          { event: "ItemObserved" },
          { event: "ItemObserved" },
          { event: "ItemAdded", list: "b" }
        ])
        // Replacements reuse their source's id, so the batch replays in id
        // order, the reverse of remote order here. The b replacement takes the
        // first decoded b source's id, not the opaque entry's or the group start's.
        assert.deepStrictEqual(handled, [4, 3, 2, 1, 0])
      }),
    { concurrent: false }
  )

  it.effect("compacts valid events while preserving undecodable entries unchanged", () =>
    Effect.gen(function*() {
      const first = yield* makeCompactionEntry({ id: "user-1", name: "before" })
      const opaque = yield* makeCompactionEntry({ id: "user-1" })
      const last = yield* makeCompactionEntry({ id: "user-1", name: "after" })
      const seen = yield* Ref.make<ReadonlyArray<unknown>>([])
      const compaction = EventLog.groupCompaction(CurrentUserGroup, ({ events, write }) =>
        Ref.update(seen, (values) => [...values, events]).pipe(
          Effect.andThen(write("UserCreated", events[events.length - 1].payload))
        ))

      yield* Effect.gen(function*() {
        const registry = yield* EventLog.Registry
        const compactor = registry.compactors.get("UserCreated")!
        const output: Array<EventJournal.Entry> = []
        yield* compactor.effect({
          entries: [first, opaque, last],
          write: (entry) =>
            Effect.sync(() => {
              output.push(entry)
            })
        })

        assert.deepStrictEqual(yield* Ref.get(seen), [[
          { _tag: "UserCreated", payload: { id: "user-1", name: "before" } },
          { _tag: "UserCreated", payload: { id: "user-1", name: "after" } }
        ]])
        assert.strictEqual(output.length, 2)
        const preserved = output.find((entry) =>
          entry.idString === opaque.idString
        )
        assert.strictEqual(preserved, opaque)
        assert.deepStrictEqual(preserved?.payload, opaque.payload)
        const replacement = output.find((entry) => entry !== opaque)!
        assert.strictEqual(replacement.event, "UserCreated")
        assert.strictEqual(replacement.primaryKey, "user-1")
        assert.deepStrictEqual(
          yield* Schema.decodeUnknownEffect(CurrentUserGroup.events.UserCreated.payloadSchemaBinary)(
            replacement.payload
          ),
          { id: "user-1", name: "after" }
        )
      }).pipe(Effect.provide(compaction.pipe(Layer.provideMerge(EventLog.layerRegistry))))
    }))

  it.effect("gives replacements fresh ids in their anchor's millisecond", () =>
    Effect.gen(function*() {
      const first = yield* makeCompactionEntry({ id: "user-1", name: "before" })
      const last = yield* makeCompactionEntry({ id: "user-1", name: "after" })
      const compaction = EventLog.groupCompaction(CurrentUserGroup, ({ events, write }) =>
        Effect.forEach(events, (event) => write("UserCreated", event.payload), { discard: true }))

      yield* Effect.gen(function*() {
        const registry = yield* EventLog.Registry
        const compactor = registry.compactors.get("UserCreated")!
        const output: Array<EventJournal.Entry> = []
        yield* compactor.effect({
          entries: [first, last],
          write: (entry) =>
            Effect.sync(() => {
              output.push(entry)
            })
        })

        assert.strictEqual(output.length, 2)
        for (const entry of output) {
          assert.strictEqual(entry.createdAtMillis, first.createdAtMillis)
          assert.notStrictEqual(entry.idString, first.idString)
          assert.notStrictEqual(entry.idString, last.idString)
        }
        assert.notStrictEqual(output[0].idString, output[1].idString)
      }).pipe(Effect.provide(compaction.pipe(Layer.provideMerge(EventLog.layerRegistry))))
    }))

  it.effect("reports a stored entry newer than the source as a conflict for every replacement", () =>
    Effect.gen(function*() {
      const conflicts = yield* Queue.unbounded<number>()
      const handlers = Layer.mergeAll(
        EventLog.group(
          ItemGroup,
          (handlers) => handlers.handle("ItemAdded", ({ conflicts: c }) => Queue.offer(conflicts, c.length))
        ),
        EventLog.groupCompaction(ItemGroup, ({ events, write }) =>
          Effect.forEach(
            [1, 2],
            (item) => write("ItemAdded", { ...events[0].payload, item }),
            { discard: true }
          ))
      ).pipe(Layer.provide(EventLog.layerRegistry))
      const layer = EventLog.layer(EventLog.schema(ItemGroup), handlers).pipe(
        Layer.provideMerge(EventJournal.layerMemory),
        Layer.provide(
          Layer.effect(EventLog.Identity, EventLog.makeIdentity).pipe(Layer.provide(EventLogEncryption.layerSubtle))
        )
      )
      // Valid ids can be adjacent: `stored` is the source's id plus one.
      const makeEntry = Effect.fnUntraced(function*(item: number, lastByte: number) {
        const id = EventJournal.makeEntryIdUnsafe({ msecs: 1000 })
        id.fill(0, 7)
        id[6] = 0x70
        id[8] = 0x80
        id[15] = lastByte
        return new EventJournal.Entry({
          id,
          event: "ItemAdded",
          primaryKey: "list-1",
          payload: yield* Schema.encodeUnknownEffect(ItemGroup.events.ItemAdded.payloadSchemaBinary)({
            list: "list-1",
            item
          })
        }, { disableChecks: true })
      })
      const source = yield* makeEntry(0, 0x10)
      const stored = yield* makeEntry(9, 0x11)

      const handled = yield* Effect.gen(function*() {
        const journal = yield* EventJournal.EventJournal
        const registry = yield* EventLog.Registry
        yield* journal.writeFromRemote({
          remoteId: EventJournal.makeRemoteIdUnsafe(),
          entries: [new EventJournal.RemoteEntry({ remoteSequence: 0, entry: stored })],
          effect: () => Effect.void
        })
        const changes = yield* Queue.unbounded<EventJournal.RemoteEntry, EventLogRemote.EventLogRemoteError>()
        yield* Queue.offer(changes, new EventJournal.RemoteEntry({ remoteSequence: 0, entry: source }))
        yield* registry.registerRemote(EventLogRemote.EventLogRemote.of({
          id: EventJournal.makeRemoteIdUnsafe(),
          changes: () => Effect.succeed(changes),
          write: () => Effect.void,
          whenAuthenticated: (effect) => effect
        }))
        return [yield* Queue.take(conflicts), yield* Queue.take(conflicts)]
      }).pipe(Effect.provide(layer))

      // Both replacements stand for `source`, which `stored` is newer than.
      assert.deepStrictEqual(handled, [1, 1])
    }))

  it.effect("preserves all undecodable entries without invoking the group compactor", () =>
    Effect.gen(function*() {
      const entries = [
        yield* makeCompactionEntry({ id: "user-1" }),
        yield* makeCompactionEntry({ id: "user-2" })
      ]
      const calls = yield* Ref.make(0)
      const compaction = EventLog.groupCompaction(CurrentUserGroup, () => Ref.update(calls, (count) => count + 1))

      yield* Effect.gen(function*() {
        const registry = yield* EventLog.Registry
        const output: Array<EventJournal.Entry> = []
        yield* registry.compactors.get("UserCreated")!.effect({
          entries,
          write: (entry) =>
            Effect.sync(() => {
              output.push(entry)
            })
        })

        assert.strictEqual(yield* Ref.get(calls), 0)
        assert.strictEqual(output.length, entries.length)
        for (let i = 0; i < entries.length; i++) {
          assert.strictEqual(output[i], entries[i])
          assert.deepStrictEqual(output[i].payload, entries[i].payload)
        }
      }).pipe(Effect.provide(compaction.pipe(Layer.provideMerge(EventLog.layerRegistry))))
    }))

  it.effect("replays forwarded entries unchanged in id order when old entries arrive after new ones", () =>
    Effect.gen(function*() {
      const makeEntry = Effect.fnUntraced(function*(list: string, item: number, msecs: number) {
        return new EventJournal.Entry({
          id: EventJournal.makeEntryIdUnsafe({ msecs }),
          event: "ItemAdded",
          primaryKey: list,
          payload: yield* Schema.encodeUnknownEffect(ItemGroup.events.ItemAdded.payloadSchemaBinary)({ list, item })
        }, { disableChecks: true })
      })
      // An offline device uploads an older entry between newer ones.
      const entries = [yield* makeEntry("a", 0, 2000), yield* makeEntry("b", 1, 1000), yield* makeEntry("a", 2, 3000)]
      const handled = yield* Queue.unbounded<EventJournal.Entry>()
      const changes = yield* Queue.unbounded<EventJournal.RemoteEntry, EventLogRemote.EventLogRemoteError>()
      yield* Queue.offerAll(
        changes,
        entries.map((entry, remoteSequence) => new EventJournal.RemoteEntry({ remoteSequence, entry }))
      )
      const handlers = Layer.mergeAll(
        EventLog.group(
          ItemGroup,
          (handlers) => handlers.handle("ItemAdded", ({ entry }) => Queue.offer(handled, entry))
        ),
        EventLog.groupCompaction(
          ItemGroup,
          ({ entries, forward }) => Effect.forEach(entries, forward, { discard: true })
        )
      ).pipe(Layer.provide(EventLog.layerRegistry))
      const layer = EventLog.layer(EventLog.schema(ItemGroup), handlers).pipe(
        Layer.provide(EventJournal.layerMemory),
        Layer.provide(
          Layer.effect(EventLog.Identity, EventLog.makeIdentity).pipe(Layer.provide(EventLogEncryption.layerSubtle))
        )
      )

      const replayed = yield* Effect.gen(function*() {
        const registry = yield* EventLog.Registry
        yield* registry.registerRemote(EventLogRemote.EventLogRemote.of({
          id: EventJournal.makeRemoteIdUnsafe(),
          changes: () => Effect.succeed(changes),
          write: () => Effect.void,
          whenAuthenticated: (effect) => effect
        }))
        return yield* Effect.forEach(entries, () => Queue.take(handled))
      }).pipe(Effect.provide(layer))

      const fields = (entry: EventJournal.Entry) => [entry.idString, entry.primaryKey, entry.payload] as const
      assert.deepStrictEqual(replayed.map(fields), [entries[1], entries[0], entries[2]].map(fields))
    }))

  it.effect("passes every group entry to one batch compactor call in order and drops unforwarded opaque entries", () =>
    Effect.gen(function*() {
      const encode = Effect.fnUntraced(function*(
        event: "MenuItemAdded" | "MenuRemoved",
        primaryKey: string,
        payload: unknown,
        schema: Schema.Codec<any, Uint8Array<ArrayBuffer>>
      ) {
        return new EventJournal.Entry({
          id: EventJournal.makeEntryIdUnsafe(),
          event,
          primaryKey,
          payload: yield* Schema.encodeUnknownEffect(schema)(payload)
        }, { disableChecks: true })
      })
      const { MenuItemAdded, MenuRemoved } = MenuGroup.events
      const added = yield* encode(
        "MenuItemAdded",
        "item-1",
        { menu: "menu-1", item: "item-1" },
        MenuItemAdded.payloadSchemaBinary
      )
      // Lacks `item`, so it cannot be decoded as a MenuItemAdded payload.
      const opaque = yield* encode("MenuItemAdded", "item-2", { menu: "menu-1" }, MenuRemoved.payloadSchemaBinary)
      const removed = yield* encode("MenuRemoved", "menu-1", { menu: "menu-1" }, MenuRemoved.payloadSchemaBinary)
      const calls: Array<unknown> = []
      const compaction = EventLog.groupBatchCompaction(MenuGroup, ({ entries, forward }) => {
        calls.push(entries)
        return Effect.forEach(entries, ({ entry, event }) => event ? forward(entry) : Effect.void, { discard: true })
      })

      yield* Effect.gen(function*() {
        const registry = yield* EventLog.Registry
        const output: Array<EventJournal.Entry> = []
        yield* registry.compactors.get("MenuItemAdded")!.effect({
          entries: [added, opaque, removed],
          write: (entry) =>
            Effect.sync(() => {
              output.push(entry)
            })
        })

        // One call sees entries under every primary key in the group.
        assert.deepStrictEqual(calls, [[
          { entry: added, event: { _tag: "MenuItemAdded", payload: { menu: "menu-1", item: "item-1" } } },
          { entry: opaque, event: undefined },
          { entry: removed, event: { _tag: "MenuRemoved", payload: { menu: "menu-1" } } }
        ]])
        assert.deepStrictEqual(output, [added, removed])
      }).pipe(Effect.provide(compaction.pipe(Layer.provideMerge(EventLog.layerRegistry))))
    }))

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

  it.effect("writes a batch of events under one lock and handler transaction and returns results in order", () =>
    Effect.gen(function*() {
      const timeline: Array<string> = []
      const RenameGroup = EventGroup.empty.add({
        tag: "UserRenamed",
        primaryKey: (payload) => payload.id,
        payload: UserPayload,
        success: Schema.String,
        error: Schema.String
      })
      const renameSchema = EventLog.schema(RenameGroup)
      const handlers = EventLog.group(
        RenameGroup,
        (handlers) =>
          handlers.handle("UserRenamed", ({ payload }) =>
            Effect.gen(function*() {
              timeline.push(`handle ${payload.id}`)
              if (payload.id === "rejected") return yield* Effect.fail("rejected")
              return payload.id.toUpperCase()
            }))
      ).pipe(
        Layer.merge(EventLog.groupReactivity(RenameGroup, ["users"])),
        Layer.provide(EventLog.layerRegistry)
      )
      const journal = Layer.effect(
        EventJournal.EventJournal,
        Effect.map(EventJournal.makeMemory, (journal) =>
          EventJournal.EventJournal.of({
            ...journal,
            withLock: (storeId) => (effect) =>
              Effect.sync(() => timeline.push("lock")).pipe(
                Effect.andThen(journal.withLock(storeId)(effect)),
                Effect.ensuring(Effect.sync(() => timeline.push("unlock")))
              )
          }))
      )
      const layer = EventLog.layer(renameSchema, handlers).pipe(
        Layer.provide([
          journal,
          Layer.effect(EventLog.Identity, EventLog.makeIdentity).pipe(Layer.provide(EventLogEncryption.layerSubtle)),
          Layer.succeed(EventLog.HandlerTransaction, (effect) =>
            Effect.sync(() => timeline.push("begin")).pipe(
              Effect.andThen(effect),
              Effect.ensuring(Effect.sync(() => timeline.push("commit")))
            ))
        ]),
        Layer.merge(Reactivity.layer)
      )
      return yield* Effect.gen(function*() {
        const log = yield* EventLog.EventLog
        const reactivity = yield* Reactivity.Reactivity
        reactivity.registerUnsafe(["users"], () => {
          timeline.push("invalidate")
        })
        const results = yield* log.writeMany({
          schema: renameSchema,
          events: [
            { event: "UserRenamed", payload: { id: "a" } },
            { event: "UserRenamed", payload: { id: "b" } },
            { event: "UserRenamed", payload: { id: "c" } }
          ]
        })
        const batch = timeline.splice(0)
        const single = yield* log.write({ schema: renameSchema, event: "UserRenamed", payload: { id: "d" } })
        const singleTimeline = timeline.splice(0)
        const failed = yield* Effect.flip(log.writeMany({
          schema: renameSchema,
          events: [
            { event: "UserRenamed", payload: { id: "e" } },
            { event: "UserRenamed", payload: { id: "rejected" } }
          ]
        }))
        // Subscribers are notified once per batch, after the handler
        // transaction commits and the journal lock is released. A failed batch
        // commits none of its events.
        assert.deepStrictEqual({
          results,
          batch,
          single,
          singleTimeline,
          failed,
          committed: (yield* log.entries).map((entry) => entry.primaryKey)
        }, {
          results: ["A", "B", "C"],
          batch: ["lock", "begin", "handle a", "handle b", "handle c", "commit", "unlock", "invalidate"],
          single: "D",
          singleTimeline: ["lock", "begin", "handle d", "commit", "unlock", "invalidate"],
          failed: "rejected",
          committed: ["a", "b", "c", "d"]
        })
      }).pipe(Effect.provide(layer))
    }))

  it.effect("replays each remote batch inside one handler transaction and invalidates once per batch", () =>
    Effect.gen(function*() {
      const timeline: Array<string> = []
      const invalidated = yield* Queue.unbounded<void>()
      const handlers = EventLog.group(
        UserGroup,
        (handlers) =>
          handlers.handle("UserCreated", ({ payload }) =>
            Effect.sync(() => {
              timeline.push(`handle ${payload.id}`)
            }))
      ).pipe(
        Layer.merge(EventLog.groupReactivity(UserGroup, ["users"])),
        Layer.provide(EventLog.layerRegistry)
      )
      const layer = EventLog.layer(schema, handlers).pipe(
        Layer.provide([
          EventJournal.layerMemory,
          Layer.effect(EventLog.Identity, EventLog.makeIdentity).pipe(Layer.provide(EventLogEncryption.layerSubtle)),
          Layer.succeed(EventLog.HandlerTransaction, (effect) =>
            Effect.sync(() => timeline.push("begin")).pipe(
              Effect.andThen(effect),
              Effect.ensuring(Effect.sync(() => timeline.push("commit")))
            ))
        ]),
        Layer.merge(Reactivity.layer)
      )
      return yield* Effect.gen(function*() {
        const log = yield* EventLog.EventLog
        const reactivity = yield* Reactivity.Reactivity
        const registry = yield* EventLog.Registry
        reactivity.registerUnsafe(["users"], () => {
          timeline.push("invalidate")
          Queue.offerUnsafe(invalidated, undefined)
        })
        const changes = yield* Queue.unbounded<EventJournal.RemoteEntry, EventLogRemote.EventLogRemoteError>()
        let remoteSequence = 0
        const offer = (entries: ReadonlyArray<EventJournal.Entry>) =>
          Queue.offerAll(
            changes,
            entries.map((entry) => new EventJournal.RemoteEntry({ remoteSequence: remoteSequence++, entry }))
          )
        const users = yield* Effect.forEach(
          ["user-1", "user-2", "user-3"],
          (id) => makeCompactionEntry({ id })
        )

        yield* offer(users.slice(0, 2))
        yield* registry.registerRemote(EventLogRemote.EventLogRemote.of({
          id: EventJournal.makeRemoteIdUnsafe(),
          changes: () => Effect.succeed(changes),
          write: () => Effect.void,
          whenAuthenticated: (effect) => effect
        }))
        yield* Queue.take(invalidated)
        // The remote echoes the first batch back alongside a new entry.
        yield* offer(users)
        yield* Queue.take(invalidated)

        // Duplicates invalidate with their batch rather than once per entry.
        assert.deepStrictEqual(timeline, [
          "begin",
          "handle user-1",
          "handle user-2",
          "commit",
          "invalidate",
          "begin",
          "handle user-3",
          "commit",
          "invalidate"
        ])
        assert.deepStrictEqual(
          (yield* log.entries).map((entry) => entry.primaryKey),
          ["user-1", "user-2", "user-3"]
        )
      }).pipe(Effect.provide(layer))
    }))

  it.effect("resumes remote changes from the committed sequence without duplicate writes or invalidations", () =>
    Effect.gen(function*() {
      const handled = yield* Ref.make<ReadonlyArray<string>>([])
      const offered: Array<ReadonlyArray<string>> = []
      const journalLayer = Layer.effect(
        EventJournal.EventJournal,
        Effect.map(EventJournal.makeMemory, (journal) =>
          EventJournal.EventJournal.of({
            ...journal,
            writeFromRemote: (options) =>
              Effect.sync(() => offered.push(options.entries.map(({ entry }) => entry.primaryKey))).pipe(
                Effect.andThen(journal.writeFromRemote(options))
              )
          }))
      )
      const layer = logLayer(handled, journalLayer).pipe(
        Layer.provide(EventLog.groupReactivity(UserGroup, ["users"]).pipe(Layer.provide(EventLog.layerRegistry))),
        Layer.merge(Reactivity.layer)
      )
      return yield* Effect.gen(function*() {
        const registry = yield* EventLog.Registry
        const reactivity = yield* Reactivity.Reactivity
        let invalidations = 0
        reactivity.registerUnsafe(["users"], () => {
          invalidations++
        })
        const entries = yield* Effect.forEach(
          ["user-1", "user-2"],
          (id, remoteSequence) =>
            Effect.map(makeCompactionEntry({ id }), (entry) => new EventJournal.RemoteEntry({ remoteSequence, entry }))
        )
        const attempts = yield* Queue.unbounded<number>()
        let connections = 0
        yield* registry.registerRemote(EventLogRemote.EventLogRemote.of({
          id: EventJournal.makeRemoteIdUnsafe(),
          changes: Effect.fnUntraced(function*({ startSequence }) {
            const changes = yield* Queue.unbounded<EventJournal.RemoteEntry, EventLogRemote.EventLogRemoteError>()
            connections++
            if (connections <= 2) {
              // A real remote sends only entries at or after the requested cursor.
              yield* Queue.offerAll(changes, entries.filter((entry) => entry.remoteSequence >= startSequence))
              // Buffered entries drain before the disconnection is observed.
              yield* Queue.fail(
                changes,
                new EventLogRemote.EventLogRemoteError({ method: "changes", cause: "offline" })
              )
            }
            yield* Queue.offer(attempts, startSequence)
            return changes
          }),
          write: () => Effect.void,
          whenAuthenticated: (effect) => effect
        }))

        const initial = yield* Queue.take(attempts)
        yield* TestClock.adjust("200 millis")
        const reconnect = yield* Queue.take(attempts)
        yield* TestClock.adjust("300 millis")
        const nextReconnect = yield* Queue.take(attempts)
        // The third connection is a barrier: both preceding streams have drained,
        // their journal transactions committed, and reactivity batches completed.
        assert.deepStrictEqual({
          startSequences: [initial, reconnect, nextReconnect],
          offered,
          invalidations,
          handled: yield* Ref.get(handled)
        }, {
          startSequences: [0, 2, 2],
          offered: [["user-1", "user-2"]],
          invalidations: 1,
          handled: ["user-1", "user-2"]
        })
      }).pipe(Effect.provide(layer))
    }))

  it.effect("replays remote entries in their handler context, with the batch context and log identity taking precedence", () =>
    Effect.gen(function*() {
      const seen: Array<string> = []
      const done = yield* Queue.unbounded<void>()
      const First = makeObservedGroup("First", seen)
      const Second = makeObservedGroup("Second", seen)
      const handlers = Layer.mergeAll(
        EventLog.group(
          First,
          (handlers) => handlers.handle("First", ({ payload }) => observeReplay(seen, `handle First ${payload.id}`))
        ).pipe(Layer.provide([
          Layer.succeed(ReplayLabel, "first"),
          Layer.succeed(ReplayMarker, "handler"),
          Layer.succeed(EventLog.Identity, testIdentity("handler"))
        ])),
        EventLog.group(
          Second,
          (handlers) => handlers.handle("Second", ({ payload }) => observeReplay(seen, `handle Second ${payload.id}`))
        ).pipe(Layer.provide(Layer.succeed(ReplayLabel, "second")))
      ).pipe(Layer.provide(EventLog.layerRegistry))
      const layer = EventLog.layer(EventLog.schema(First, Second), handlers).pipe(
        Layer.provideMerge(EventJournal.layerMemory),
        Layer.provide([
          Layer.succeed(EventLog.Identity, testIdentity("log")),
          // Stands in for a transaction that exposes its connection to handlers.
          Layer.succeed(EventLog.HandlerTransaction, (effect) =>
            effect.pipe(
              Effect.provideService(ReplayMarker, "batch"),
              Effect.ensuring(Queue.offer(done, undefined))
            ))
        ])
      )

      yield* Effect.gen(function*() {
        const journal = yield* EventJournal.EventJournal
        const registry = yield* EventLog.Registry
        const remoteId = EventJournal.makeRemoteIdUnsafe()
        // Newer stored entries become conflicts of the incoming ones.
        yield* journal.writeFromRemote({
          remoteId,
          entries: [
            new EventJournal.RemoteEntry({
              remoteSequence: 0,
              entry: yield* makeObservedEntry("First", "stored", 2000)
            }),
            new EventJournal.RemoteEntry({
              remoteSequence: 1,
              entry: yield* makeObservedEntry("Second", "stored", 2000)
            })
          ],
          effect: () => Effect.void
        })
        const changes = yield* Queue.unbounded<EventJournal.RemoteEntry, EventLogRemote.EventLogRemoteError>()
        // Enqueue before registration so both entries replay as one batch.
        yield* Queue.offerAll(changes, [
          new EventJournal.RemoteEntry({
            remoteSequence: 2,
            entry: yield* makeObservedEntry("First", "incoming", 1000)
          }),
          new EventJournal.RemoteEntry({
            remoteSequence: 3,
            entry: yield* makeObservedEntry("Second", "incoming", 1000)
          })
        ])
        yield* registry.registerRemote(EventLogRemote.EventLogRemote.of({
          id: remoteId,
          changes: () => Effect.succeed(changes),
          write: () => Effect.void,
          whenAuthenticated: (effect) => effect
        }))
        yield* Queue.take(done)

        assert.deepStrictEqual(seen.sort(), [
          "decode First incoming label=first marker=batch identity=log",
          "decode First stored label=first marker=batch identity=log",
          "decode Second incoming label=second marker=batch identity=log",
          "decode Second stored label=second marker=batch identity=log",
          "handle First incoming label=first marker=batch identity=log",
          "handle Second incoming label=second marker=batch identity=log"
        ])
      }).pipe(Effect.provide(layer))
    }))

  it.effect("decodes replay conflicts with the caller identity, and the payload and handler with the log identity", () =>
    Effect.gen(function*() {
      const seen: Array<string> = []
      const First = makeObservedGroup("First", seen)
      const replay = EventLog.makeReplayFromRemote({
        handlers: new Map([["First", {
          event: First.events.First,
          context: Context.make(ReplayLabel, "first") as Context.Context<any>,
          handler: ({ payload }) => observeReplay(seen, `handle First ${(payload as { readonly id: string }).id}`)
        }]]),
        storeId: yield* EventLog.CurrentStoreId,
        identity: testIdentity("log"),
        reactivity: yield* Reactivity.Reactivity,
        reactivityKeys: {},
        logAnnotations: { service: "test", effect: "replay" }
      })

      yield* replay({
        entry: yield* makeObservedEntry("First", "incoming", 1000),
        conflicts: [yield* makeObservedEntry("First", "stored", 2000)]
      }).pipe(Effect.provideService(EventLog.Identity, testIdentity("caller")))

      assert.deepStrictEqual(seen.sort(), [
        "decode First incoming label=first marker=undefined identity=log",
        "decode First stored label=first marker=undefined identity=caller",
        "handle First incoming label=first marker=undefined identity=log"
      ])
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect("logs a failed remote replay batch and redelivers it uncommitted after a backoff", () =>
    Effect.gen(function*() {
      // The imported entries have wall-clock ids, so align the supplied Clock
      // with them to keep skew warnings out of the logs.
      yield* TestClock.setTime(Date.now())
      const journal = yield* EventJournal.makeMemory
      const remoteId = EventJournal.makeRemoteIdUnsafe()
      const logs: Array<{ readonly level: string; readonly annotations: Record<string, unknown> }> = []
      const handled: Array<string> = []
      const subscribed = yield* Queue.unbounded<number>()
      const finished = yield* Queue.unbounded<void>()
      let failures = 0
      const handlers = EventLog.group(
        UserGroup,
        (handlers) =>
          handlers.handle("UserCreated", ({ payload }) =>
            Effect.gen(function*() {
              handled.push(payload.id)
              if (payload.id === "user-1") {
                yield* Effect.log("handled")
              }
              // Fails on the first delivery only, like a transient handler error.
              if (payload.id === "user-2" && failures++ === 0) {
                return yield* Effect.die("handler failed")
              }
            }))
      ).pipe(Layer.provide(EventLog.layerRegistry))
      const layer = EventLog.layer(schema, handlers).pipe(
        Layer.provide([
          Layer.succeed(EventJournal.EventJournal, journal),
          Layer.succeed(EventLog.Identity, testIdentity("log")),
          Layer.succeed(
            EventLog.HandlerTransaction,
            (effect) => Effect.ensuring(effect, Queue.offer(finished, undefined))
          )
        ])
      )
      const user1 = yield* makeCompactionEntry({ id: "user-1" })
      const user2 = yield* makeCompactionEntry({ id: "user-2" })
      // Waits for the journal transaction, not merely the handlers, to finish.
      const snapshot = journal.withLock(EventLogMessage.StoreId.make("default"))(
        Effect.all({
          stored: Effect.map(journal.entries, (entries) => entries.map((entry) => entry.idString)),
          nextSequence: journal.nextRemoteSequence(remoteId)
        })
      )

      yield* Effect.gen(function*() {
        const registry = yield* EventLog.Registry
        yield* registry.registerRemote(EventLogRemote.EventLogRemote.of({
          id: remoteId,
          changes: Effect.fnUntraced(function*({ startSequence }) {
            const changes = yield* Queue.unbounded<EventJournal.RemoteEntry, EventLogRemote.EventLogRemoteError>()
            yield* Queue.offerAll(
              changes,
              [user1, user2].flatMap((entry, remoteSequence) =>
                remoteSequence < startSequence ? [] : [new EventJournal.RemoteEntry({ remoteSequence, entry })]
              )
            )
            yield* Queue.offer(subscribed, startSequence)
            return changes
          }),
          write: () => Effect.void,
          whenAuthenticated: (effect) => effect
        }))
        assert.strictEqual(yield* Queue.take(subscribed), 0)
        yield* Queue.take(finished)
        assert.deepStrictEqual(yield* snapshot, { stored: [], nextSequence: 0 })

        yield* TestClock.adjust("10 seconds")
        assert.strictEqual(yield* Queue.take(subscribed), 0)
        yield* Queue.take(finished)
        assert.deepStrictEqual(yield* snapshot, { stored: [user1.idString, user2.idString], nextSequence: 2 })
      }).pipe(
        Effect.provide(layer),
        Effect.provide(Logger.layer([Logger.make((options) => {
          logs.push({
            level: options.logLevel,
            annotations: { ...options.fiber.getRef(References.CurrentLogAnnotations) }
          })
        })]))
      )

      const annotations = (entry: EventJournal.Entry) => ({
        service: "EventLog",
        effect: "writeFromRemote",
        entryId: entry.idString
      })
      assert.deepStrictEqual(handled, ["user-1", "user-2", "user-1", "user-2"])
      assert.deepStrictEqual(logs, [
        { level: "Info", annotations: annotations(user1) },
        { level: "Error", annotations: annotations(user2) },
        { level: "Error", annotations: { service: "EventLog", effect: "runRemote consume" } },
        { level: "Info", annotations: annotations(user1) }
      ])
    }))

  it.effect("records upload acknowledgements when the change stream is silent", () =>
    Effect.gen(function*() {
      const journal = yield* EventJournal.makeMemory
      const uploads = yield* Queue.unbounded<void>()
      const remoteId = EventJournal.makeRemoteIdUnsafe()
      let writes = 0
      yield* Effect.gen(function*() {
        const log = yield* EventLog.EventLog
        const registry = yield* EventLog.Registry
        yield* log.write({ schema, event: "UserCreated", payload: { id: "user-1" } })
        yield* registry.registerRemote(EventLogRemote.EventLogRemote.of({
          id: remoteId,
          firstSequence: 1,
          changes: () => Queue.unbounded(),
          whenAuthenticated: (effect) => effect,
          write: ({ entries }) => {
            writes++
            return Queue.offer(uploads, undefined).pipe(Effect.andThen(
              writes === 1
                ? Effect.succeed(entries.map((entry) => ({ entryId: entry.id, sequence: 1 })))
                : Effect.fail(new EventLogRemote.EventLogRemoteError({ method: "write", cause: "paused" }))
            ))
          }
        }))
        yield* Queue.take(uploads)
        yield* log.write({ schema, event: "UserCreated", payload: { id: "barrier" } })
        yield* Queue.take(uploads)
        assert.strictEqual(yield* journal.nextRemoteSequence(remoteId), 2)
      }).pipe(
        Effect.provide(
          logLayer(yield* Ref.make<ReadonlyArray<string>>([]), Layer.succeed(EventJournal.EventJournal, journal))
        )
      )
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

  it.effect.each(["single", "chunked"] as const)(
    "does not decrypt known entries in %s remote replay",
    (mode) =>
      Effect.gen(function*() {
        let decrypts = 0
        const subtle = globalThis.crypto.subtle
        const crypto = {
          getRandomValues: (array: Uint8Array) => globalThis.crypto.getRandomValues(array),
          randomUUID: () => globalThis.crypto.randomUUID(),
          subtle: {
            digest: subtle.digest.bind(subtle),
            importKey: subtle.importKey.bind(subtle),
            exportKey: subtle.exportKey.bind(subtle),
            encrypt: subtle.encrypt.bind(subtle),
            decrypt: (...args: Parameters<SubtleCrypto["decrypt"]>) => {
              decrypts++
              return subtle.decrypt(...args)
            }
          }
        } as unknown as Crypto
        const encryption = yield* EventLogEncryption.makeEncryptionSubtle(crypto)
        const identity = yield* encryption.generateIdentity
        const handled = yield* Queue.unbounded<string>()
        const remoteId = EventJournal.makeRemoteIdUnsafe()
        const changes = yield* Queue.unbounded<EventLogMessage.SingleMessage | EventLogMessage.ChunkedMessage>()
        const client = yield* RpcTest.makeClient(EventLogMessage.EventLogRemoteRpcs).pipe(
          Effect.provide(EventLogMessage.EventLogRemoteRpcs.toLayer({
            "EventLog.Hello": () =>
              Effect.succeed(new EventLogMessage.HelloResponse({ remoteId, challenge: new Uint8Array(16) })),
            "EventLog.Authenticate": () => Effect.void,
            "EventLog.WriteChunked": () => Effect.succeed([]),
            "EventLog.WriteSingle": () => Effect.succeed([]),
            "EventLog.Changes": () => Stream.fromQueue(changes)
          })),
          Effect.provideService(
            EventLogMessage.EventLogAuthentication,
            (effect) => Effect.provideService(effect, EventLog.Identity, identity)
          )
        )
        const layer = EventLog.layer(
          schema,
          EventLog.group(
            UserGroup,
            (handlers) => handlers.handle("UserCreated", ({ payload }) => Queue.offer(handled, payload.id))
          ).pipe(
            Layer.provide(EventLog.layerRegistry)
          )
        ).pipe(
          Layer.provideMerge(EventJournal.layerMemory),
          Layer.provide(Layer.succeed(EventLog.Identity, identity))
        )

        return yield* Effect.gen(function*() {
          const log = yield* EventLog.EventLog
          const journal = yield* EventJournal.EventJournal
          yield* log.write({ schema, event: "UserCreated", payload: { id: "known" } })
          assert.strictEqual(yield* Queue.take(handled), "known")
          const [known] = yield* journal.entries
          const entries: [EventJournal.Entry, ...Array<EventJournal.Entry>] = [
            yield* makeCompactionEntry({ id: "new" }),
            known
          ]
          if (mode === "chunked") entries.push(yield* makeCompactionEntry({ id: "new-2" }))
          const storeId = EventLogMessage.StoreId.make("default")
          const encrypted = (yield* Effect.forEach(entries, (entry) => encryption.encrypt(identity, storeId, [entry])))
            .flat()

          yield* EventLogRemote.makeEncrypted.pipe(
            Effect.provideService(EventLogRemote.EventLogRemoteClient, client),
            Effect.provideService(EventLogEncryption.EventLogEncryption, encryption)
          )
          const data = yield* EventLogMessage.ChangesRpc.encodeEncrypted(
            Array.map(entries, (_, sequence) => ({ sequence, ...encrypted[sequence] }))
          )
          if (mode === "chunked") {
            const middle = Math.floor(data.byteLength / 2)
            yield* Queue.offerAll(changes, [
              new EventLogMessage.ChunkedMessage({ id: 0, part: [0, 2], data: data.subarray(0, middle) }),
              new EventLogMessage.ChunkedMessage({ id: 0, part: [1, 2], data: data.subarray(middle) })
            ])
          } else {
            // A trailing known entry must still advance the remote sequence.
            yield* Queue.offer(changes, new EventLogMessage.SingleMessage({ data }))
          }
          assert.strictEqual(yield* Queue.take(handled), "new")
          if (mode === "chunked") assert.strictEqual(yield* Queue.take(handled), "new-2")
          const nextSequence = yield* journal.withLock(EventLogMessage.StoreId.make("default"))(
            journal.nextRemoteSequence(remoteId)
          )
          const stored = yield* log.entries

          assert.strictEqual(nextSequence, mode === "chunked" ? 3 : 2)
          assert.strictEqual(yield* Queue.size(handled), 0)
          assert.deepStrictEqual(
            stored.map((entry) => entry.primaryKey),
            mode === "chunked" ? ["known", "new", "new-2"] : ["known", "new"]
          )
          assert.strictEqual(decrypts, mode === "chunked" ? 2 : 1)
        }).pipe(Effect.provide(layer))
      })
  )

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

const ValueGroup = EventGroup.empty.add({
  tag: "ValueSet",
  primaryKey: (payload) => payload.id,
  payload: Schema.Struct({ id: Schema.String, value: Schema.Number })
})
const valueSchema = EventLog.schema(ValueGroup)

const keepLatest = EventLog.groupBatchCompaction(ValueGroup, ({ entries, forward }) => {
  const newest = new Map<string, EventJournal.Entry>()
  for (const { entry } of entries) {
    const current = newest.get(entry.primaryKey)
    if (current === undefined || EventJournal.Entry.Order(current, entry) < 0) newest.set(entry.primaryKey, entry)
  }
  return Effect.forEach(newest.values(), forward, { discard: true })
}, { remote: true })

const CompactionRpcs = EventLogMessage.EventLogRemoteRpcs.merge(EventLogMessage.EventLogCompactionRpcs)
type CompactionRpcs = RpcGroup.Rpcs<typeof CompactionRpcs>
const defaultStoreId = EventLogMessage.StoreId.make("default")

// An encrypted server on memory storage, serving both RPC groups.
const makeCompactionServer = Effect.fnUntraced(function*() {
  const storage = EventLogServerEncrypted.layerStorageMemoryWith({
    compaction: { thresholdFloor: 1, stageTtl: "12 hours" }
  })
  const context = yield* Layer.build(Layer.provideMerge(EventLogServerEncrypted.layerRpcHandlers, storage))
  const compaction = Context.get(context, EventLogServerEncrypted.Storage).compaction!
  const connections: Array<(response: FromServer<CompactionRpcs>) => Effect.Effect<void>> = []
  const server = yield* RpcServer.makeNoSerialization(CompactionRpcs, {
    onFromServer: (response) => connections[response.clientId](response)
  }).pipe(Effect.provide(context))

  const connect = Effect.gen(function*() {
    const clientId = connections.length
    const { client, write } = yield* RpcClient.makeNoSerialization(CompactionRpcs, {
      supportsAck: true,
      onFromClient: ({ message }) => server.write(clientId, message)
    })
    connections.push(write)
    return client
  })

  const snapshots = (publicKey: string) =>
    compaction.history(publicKey, defaultStoreId).pipe(
      Effect.map((history) => history.filter((activation) => activation.keptCount !== undefined).length)
    )

  return { compaction, connect, snapshots }
})

type CompactionServer = Effect.Success<ReturnType<typeof makeCompactionServer>>

// A device running `EventLog` over `journal`, connected to `server`. Its
// handler records each replayed or written value as `id=value` in `handled`.
const makeDevice = Effect.fnUntraced(function*(
  server: CompactionServer,
  identity: EventLog.Identity["Service"],
  options?: {
    readonly journal?: EventJournal.EventJournal["Service"] | undefined
    readonly compactor?: Layer.Layer<never, never, EventLog.Registry> | undefined
    readonly handled?: Array<string> | undefined
  }
) {
  const handled = options?.handled ?? []
  const journal = options?.journal ?? (yield* EventJournal.makeMemory)
  const handlers = Layer.mergeAll(
    EventLog.group(ValueGroup, (handlers) =>
      handlers.handle("ValueSet", ({ payload }) =>
        Effect.sync(() => {
          handled.push(`${payload.id}=${payload.value}`)
        }))),
    options?.compactor ?? Layer.empty
  ).pipe(Layer.provide(EventLog.layerRegistry))
  const context = yield* Layer.build(
    EventLog.layer(valueSchema, handlers).pipe(
      Layer.provide(Layer.succeed(EventJournal.EventJournal, journal)),
      Layer.provide(Layer.succeed(EventLog.Identity, identity))
    )
  )
  const remote = yield* EventLogRemote.makeEncrypted.pipe(
    Effect.provideService(EventLogRemote.EventLogRemoteClient, yield* server.connect),
    Effect.provide(context)
  )
  const log = Context.get(context, EventLog.EventLog)
  return {
    log,
    journal,
    remote,
    handled,
    write: (id: string, value: number) => log.write({ schema: valueSchema, event: "ValueSet", payload: { id, value } })
  }
})

// Advances the TestClock 15 minutes, then gives fibers waiting on Web Crypto
// some real time.
const step = TestClock.adjust("15 minutes").pipe(Effect.andThen(TestClock.withLive(Effect.sleep(5))))

// Steps until `done` holds, for at most 50 hours.
const advanceUntil = Effect.fnUntraced(function*(done: Effect.Effect<boolean, unknown>, waitingFor: string) {
  for (let i = 0; i < 200; i++) {
    if (yield* done) return
    yield* step
  }
  return assert.fail(`timed out waiting until ${waitingFor}`)
})

describe("EventLog remote compaction", () => {
  it.effect("bootstraps a new device from the snapshot a background run commits, ending with the state of a full replay", () =>
    Effect.gen(function*() {
      const server = yield* makeCompactionServer()
      const identity = yield* EventLog.makeIdentity
      const writer = yield* makeDevice(server, identity, { compactor: keepLatest })
      for (const [id, value] of [["a", 1], ["b", 1], ["a", 2], ["a", 3], ["b", 2]] as const) {
        yield* writer.write(id, value)
      }

      yield* advanceUntil(
        Effect.map(server.snapshots(identity.publicKey), (count) => count === 1),
        "a snapshot commits"
      )
      yield* writer.write("a", 4)
      const reader = yield* makeDevice(server, identity)
      yield* advanceUntil(Effect.sync(() => reader.handled.includes("a=4")), "the reader replays the tail")

      // A full replay ends with a=4 and b=2 too, after handling all six writes.
      assert.deepStrictEqual(reader.handled, ["a=3", "b=2", "a=4"])
    }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))

  it.effect("serves a device whose cursor is inside one snapshot everything kept by the next", () =>
    Effect.gen(function*() {
      const server = yield* makeCompactionServer()
      const identity = yield* EventLog.makeIdentity
      const writer = yield* makeDevice(server, identity, { compactor: keepLatest })
      const journal = yield* EventJournal.makeMemory
      const handled: Array<string> = []
      yield* writer.write("k1", 1)
      yield* writer.write("k2", 1)
      const readerScope = yield* Scope.make()
      const reader = yield* makeDevice(server, identity, { journal, handled }).pipe(Scope.provide(readerScope))
      yield* advanceUntil(Effect.sync(() => handled.includes("k2=1")), "the reader reads sequence 1")
      yield* Scope.close(readerScope, Exit.void)
      const cursor = yield* journal.nextRemoteSequence(reader.remote.id)

      // Snapshot g+1 covers sequences 0 to 3, so the reader's cursor is inside it.
      yield* writer.write("k1", 2)
      yield* writer.write("k3", 1)
      yield* advanceUntil(Effect.map(server.snapshots(identity.publicKey), (count) => count === 1), "g+1 commits")
      yield* writer.write("k3", 2)
      yield* writer.write("k4", 1)
      yield* writer.write("k4", 2)
      yield* advanceUntil(Effect.map(server.snapshots(identity.publicKey), (count) => count === 2), "g+2 commits")
      yield* makeDevice(server, identity, { journal, handled })
      yield* advanceUntil(Effect.sync(() => handled.includes("k4=2")), "the reader catches up")

      assert.deepStrictEqual({ cursor, handled }, {
        cursor: 2,
        handled: ["k1=1", "k2=1", "k1=2", "k3=2", "k4=2"]
      })
    }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))
})
