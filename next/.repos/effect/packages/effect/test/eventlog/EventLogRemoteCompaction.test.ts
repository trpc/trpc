import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, Layer, Schema, Stream } from "effect"
import type * as Event from "effect/eventlog/Event"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as RemoteCompaction from "effect/eventlog/internal/remoteCompaction"

const Item = Schema.Struct({ id: Schema.String, value: Schema.Number })
const Items = EventGroup.empty.add({ tag: "ItemSet", primaryKey: (payload) => payload.id, payload: Item })
const Notes = EventGroup.empty.add({ tag: "NoteSet", primaryKey: (payload) => payload.id, payload: Item })
// A newer client's schema, with a field this client does not know.
const SkewedItems = EventGroup.empty.add({
  tag: "ItemSet",
  primaryKey: (payload) => payload.id,
  payload: Schema.Struct({ ...Item.fields, note: Schema.String })
})

const makeEntry = Effect.fnUntraced(function*(
  msecs: number,
  event: string,
  codec: Schema.Codec<any, Uint8Array<ArrayBuffer>>,
  payload: { readonly id: string; readonly [key: string]: unknown }
) {
  return new EventJournal.Entry({
    id: EventJournal.makeEntryIdUnsafe({ msecs }),
    event,
    primaryKey: payload.id,
    payload: yield* Schema.encodeUnknownEffect(codec)(payload)
  }, { disableChecks: true })
})

// Runs the engine over `entries`, in input-sequence order, with the
// compactors `layer` registers.
const run = (
  layer: Layer.Layer<never, never, EventLog.Registry>,
  entries: ReadonlyArray<EventJournal.Entry>,
  chunkSize = 100
) =>
  Effect.gen(function*() {
    const registry = yield* EventLog.Registry
    return yield* RemoteCompaction.run({
      compactors: registry.compactors,
      entries: Stream.fromIterable(entries),
      chunkSize
    })
  }).pipe(Effect.provide(layer.pipe(Layer.provideMerge(EventLog.layerRegistry))))

const keepLatest = <Events extends Event.Any>(group: EventGroup.EventGroup<Events>, options = { remote: true }) =>
  EventLog.groupBatchCompaction(group, ({ entries, forward }) => {
    const latest = new Map<string, EventJournal.Entry>()
    for (const { entry, event } of entries) {
      if (event === undefined) continue
      const current = latest.get(entry.primaryKey)
      if (current === undefined || EventJournal.Entry.Order(current, entry) < 0) latest.set(entry.primaryKey, entry)
    }
    return Effect.forEach(latest.values(), forward, { discard: true })
  }, options)

// An `ItemSet` group whose payload also has `fields`.
const itemsWith = (fields: Record<string, Schema.Codec<any, any>>) =>
  EventGroup.empty.add({
    tag: "ItemSet",
    primaryKey: (payload: { readonly id: string }) => payload.id,
    payload: Schema.Struct({ ...Item.fields, ...fields })
  })

describe("RemoteCompaction", () => {
  it.effect("keeps the whole input of a call that outputs a new entry and carries on", () =>
    Effect.gen(function*() {
      const items = [
        yield* makeEntry(1000, "ItemSet", Items.events.ItemSet.payloadSchemaBinary, { id: "a", value: 1 }),
        yield* makeEntry(2000, "ItemSet", Items.events.ItemSet.payloadSchemaBinary, { id: "a", value: 2 })
      ]
      const notes = [
        yield* makeEntry(1000, "NoteSet", Notes.events.NoteSet.payloadSchemaBinary, { id: "a", value: 1 }),
        yield* makeEntry(2000, "NoteSet", Notes.events.NoteSet.payloadSchemaBinary, { id: "a", value: 2 })
      ]
      const kept = yield* run(
        Layer.mergeAll(
          EventLog.groupCompaction(Items, ({ events, write }) => write("ItemSet", events[events.length - 1].payload), {
            remote: true
          }),
          keepLatest(Notes)
        ),
        [items[0], notes[0], items[1], notes[1]]
      )
      assert.deepStrictEqual(kept, [items[0], items[1], notes[1]])
    }))

  it.effect("keeps entries with fields the schema does not know, even when the compactor drops them", () =>
    Effect.gen(function*() {
      const older = yield* makeEntry(1000, "ItemSet", Items.events.ItemSet.payloadSchemaBinary, { id: "a", value: 1 })
      const skewed = yield* makeEntry(2000, "ItemSet", SkewedItems.events.ItemSet.payloadSchemaBinary, {
        id: "a",
        value: 2,
        note: "n"
      })
      const newer = yield* makeEntry(3000, "ItemSet", Items.events.ItemSet.payloadSchemaBinary, { id: "a", value: 3 })
      const kept = yield* run(keepLatest(Items), [older, skewed, newer])
      assert.deepStrictEqual(kept, [skewed, newer])
    }))

  it.effect("keeps entries holding values the schema cannot read", () =>
    Effect.gen(function*() {
      const A = Schema.Struct({ _tag: Schema.Literal("A"), n: Schema.Number })
      const B = Schema.Struct({ _tag: Schema.Literal("B"), text: Schema.String })
      // Each case: reader fields, newer writer fields, and the newer value.
      const cases: ReadonlyArray<
        readonly [string, Record<string, Schema.Codec<any, any>>, Record<string, Schema.Codec<any, any>>, object]
      > = [
        [
          "a record key no index signature matches",
          { attrs: Schema.optionalKey(Schema.Record(Schema.TemplateLiteral(["keep", Schema.String]), Schema.String)) },
          { attrs: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)) },
          { attrs: { keep1: "a", drop: "b" } }
        ],
        [
          "an unknown union member",
          { event: Schema.optionalKey(Schema.Union([A])) },
          { event: Schema.optionalKey(Schema.Union([A, B])) },
          { event: { _tag: "B", text: "new" } }
        ],
        [
          "an unknown field in an array of structs",
          { rows: Schema.optionalKey(Schema.Array(Schema.Struct({ n: Schema.Number }))) },
          { rows: Schema.optionalKey(Schema.Array(Schema.Struct({ n: Schema.Number, later: Schema.String }))) },
          { rows: [{ n: 1, later: "x" }, { n: 2, later: "y" }] }
        ],
        [
          "a field whose wire type changed",
          { size: Schema.optionalKey(Schema.String) },
          { size: Schema.optionalKey(Schema.Number) },
          { size: 5 }
        ]
      ]
      for (const [name, readerFields, writerFields, value] of cases) {
        const Reader = itemsWith(readerFields)
        const Writer = itemsWith(writerFields)
        const older = yield* makeEntry(1000, "ItemSet", Reader.events.ItemSet.payloadSchemaBinary, {
          id: "a",
          value: 1
        })
        const skewed = yield* makeEntry(2000, "ItemSet", Writer.events.ItemSet.payloadSchemaBinary, {
          id: "a",
          value: 2,
          ...value
        })
        const newer = yield* makeEntry(3000, "ItemSet", Reader.events.ItemSet.payloadSchemaBinary, {
          id: "a",
          value: 3
        })
        const kept = yield* run(keepLatest(Reader), [older, skewed, newer])
        assert.deepStrictEqual(kept, [skewed, newer], name)
      }
    }))

  it.effect("folds chunks that grow with the kept set into the entries kept so far", () =>
    Effect.gen(function*() {
      const item = (msecs: number, id: string) =>
        makeEntry(msecs, "ItemSet", Items.events.ItemSet.payloadSchemaBinary, { id, value: msecs })
      const note = (msecs: number) =>
        makeEntry(msecs, "NoteSet", Notes.events.NoteSet.payloadSchemaBinary, { id: "a", value: msecs })
      const entries = [
        yield* item(3000, "a"),
        // No compactor is registered for this event.
        yield* makeEntry(1000, "Observed", Items.events.ItemSet.payloadSchemaBinary, { id: "a", value: 1 }),
        // Older than the kept entry for "a", in a later chunk.
        yield* item(1000, "a"),
        yield* note(1000),
        yield* note(2000),
        yield* item(500, "b"),
        yield* item(2000, "a")
      ]
      // How many items each call to the opted-in compactor received.
      const calls: Array<number> = []
      const kept = yield* run(
        Layer.mergeAll(
          EventLog.groupBatchCompaction(Items, ({ entries, forward }) => {
            calls.push(entries.length)
            const latest = new Map<string, EventJournal.Entry>()
            for (const { entry } of entries) {
              const current = latest.get(entry.primaryKey)
              if (current === undefined || EventJournal.Entry.Order(current, entry) < 0) {
                latest.set(entry.primaryKey, entry)
              }
            }
            return Effect.forEach(latest.values(), forward, { discard: true })
          }, { remote: true }),
          keepLatest(Notes, { remote: false })
        ),
        entries,
        2
      )
      assert.deepStrictEqual(kept, [entries[0], entries[1], entries[3], entries[4], entries[5]])
      // The chunk is at least 2 entries and at least the kept set: the first
      // two chunks hold 2 entries, the third waits for 3, and the last call is
      // the pass over the kept set.
      assert.deepStrictEqual(calls, [1, 2, 3, 2])
    }))

  it.effect("fails the run when the kept set does not survive another pass", () =>
    Effect.gen(function*() {
      const entries = yield* Effect.forEach([1, 2, 3], (value) =>
        makeEntry(1000 * value, "ItemSet", Items.events.ItemSet.payloadSchemaBinary, { id: "a", value }))
      // Drops the oldest entry of every call, so a second pass drops again.
      const dropFirst = EventLog.groupBatchCompaction(
        Items,
        ({ entries, forward }) =>
          Effect.forEach(entries.slice(1), ({ entry }) => forward(entry), { discard: true }),
        { remote: true }
      )
      const error = yield* Effect.flip(run(dropFirst, entries))
      assert.strictEqual(error._tag, "IdempotenceError")
    }))

  it.effect("fails the run when a compactor dies", () =>
    Effect.gen(function*() {
      const entry = yield* makeEntry(1000, "ItemSet", Items.events.ItemSet.payloadSchemaBinary, { id: "a", value: 1 })
      const exit = yield* Effect.exit(
        run(EventLog.groupBatchCompaction(Items, () => Effect.die("boom"), { remote: true }), [entry])
      )
      assert.isTrue(Exit.hasDies(exit))
    }))
})
