import { assert, describe, it } from "@effect/vitest"
import { Context, Effect, Exit, Layer, Option, Queue, Schema, SchemaGetter } from "effect"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as EventLogRemote from "effect/eventlog/EventLogRemote"
import * as EventRow from "effect/eventlog/EventRow"

const Grocery = EventRow.make("grocery", {
  key: "id",
  schema: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    quantity: Schema.NullOr(Schema.Number),
    completed: Schema.Boolean
  })
})

const Groceries = EventGroup.empty.add(Grocery)
const schema = EventLog.schema(Groceries)

type Row = {
  readonly id: string
  readonly name: string
  readonly quantity: number | null
  readonly completed: boolean
}
type Fields = Partial<Omit<Row, "id">>
type Payload = EventRow.Payload<typeof Grocery.schema.fields, "id">
type Call = readonly ["set", Row] | readonly ["patch", string, Fields] | readonly ["remove", string]

const makeEntry = (msecs: number) =>
  new EventJournal.Entry({
    id: EventJournal.makeEntryIdUnsafe({ msecs }),
    event: "grocery",
    primaryKey: "g1",
    payload: new Uint8Array()
  }, { disableChecks: true })

// An entry carrying `payload` encoded as the journal stores it.
const makeEntryWith = <A>(
  msecs: number,
  row: { readonly tag: string; readonly primaryKey: (payload: A) => string },
  codec: Schema.Codec<A, Uint8Array<ArrayBuffer>>,
  payload: A
) =>
  Effect.map(Schema.encodeEffect(codec)(payload), (bytes) =>
    new EventJournal.Entry({
      id: EventJournal.makeEntryIdUnsafe({ msecs }),
      event: row.tag,
      primaryKey: row.primaryKey(payload),
      payload: bytes
    }, { disableChecks: true }))

// Runs the generated handler for a late `payload` whose stored newer
// conflicts are `conflicts` (oldest first), returning the callbacks it made.
const replay = Effect.fnUntraced(function*(payload: Payload, conflicts: ReadonlyArray<Payload>) {
  const calls: Array<Call> = []
  const handler = EventRow.handler(Grocery, {
    set: (row) => Effect.sync(() => calls.push(["set", row])),
    patch: (id, fields) => Effect.sync(() => calls.push(["patch", id, fields])),
    remove: (id) => Effect.sync(() => calls.push(["remove", id]))
  })
  yield* handler({
    storeId: yield* EventLog.CurrentStoreId,
    payload,
    entry: yield* makeEntryWith(1000, Grocery, Groceries.events.grocery.payloadSchemaBinary, payload),
    conflicts: conflicts.map((payload, i) => ({ entry: makeEntry(2000 + i), payload }))
  })
  return calls
})

const X: Row = { id: "g1", name: "x", quantity: 1, completed: false }
const Y: Row = { id: "g1", name: "y", quantity: 2, completed: true }
const E: Row = { id: "g1", name: "e", quantity: null, completed: false }
const P: Fields = { name: "p", quantity: 3 }
const Q: Fields = { name: "q", completed: true }

// Decoding is not undone by encoding, so a value decoded twice differs from
// one decoded once.
const Stamp = EventRow.make("stamp", {
  key: "id",
  schema: Schema.Struct({
    id: Schema.String,
    mark: Schema.String.pipe(Schema.decode({
      decode: SchemaGetter.transform((s: string) => `${s}!`),
      encode: SchemaGetter.transform((s: string) => s)
    }))
  })
})
const StampCodec = EventGroup.empty.add(Stamp).events.stamp.payloadSchemaBinary

const Key = Schema.Literals(["a", "b"])
const Name = Schema.Literals(["x", "y"])
const Quantity = Schema.NullOr(Schema.Literals([1, 2]))
const Op = Schema.Union([
  Schema.TaggedStruct("set", { key: Key, name: Name, quantity: Quantity, completed: Schema.Boolean }),
  Schema.TaggedStruct("patch", {
    key: Key,
    name: Schema.optionalKey(Name),
    quantity: Schema.optionalKey(Quantity),
    completed: Schema.optionalKey(Schema.Boolean)
  }),
  Schema.TaggedStruct("remove", { key: Key })
])
const ReplicaIndex = Schema.Literals([0, 1, 2])
const Command = Schema.Union([
  // A local write of one or more ops on a replica, through `writeMany`.
  Schema.TaggedStruct("write", { replica: ReplicaIndex, ops: Schema.NonEmptyArray(Op).check(Schema.isMaxLength(3)) }),
  Schema.TaggedStruct("offline", { skewMillis: Schema.Literals([-1000, -1, 0, 1, 1000]), op: Op }),
  // Delivers some missing entries in a picked order, split into batches.
  Schema.TaggedStruct("sync", {
    replica: ReplicaIndex,
    picks: Schema.Array(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 99 }))).check(
      Schema.isMaxLength(8)
    ),
    batchSizes: Schema.NonEmptyArray(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 4 }))).check(
      Schema.isMaxLength(4)
    )
  })
])

const toPayload = (op: typeof Op.Type): Payload => {
  switch (op._tag) {
    case "set": {
      const { _tag, key, ...fields } = op
      return Grocery.set({ id: key, ...fields }).payload
    }
    case "patch": {
      const { _tag, key, ...fields } = op
      return Grocery.patch(key, fields).payload
    }
    case "remove": {
      return Grocery.remove(op.key).payload
    }
  }
}

// An entry to compact. `rank` picks its position in a shuffled batch.
const Draft = Schema.Struct({
  msecs: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 })),
  rank: Schema.Int,
  op: Op
})
const Drafts = Schema.Array(Draft).check(Schema.isMaxLength(8))

const toEntries = (drafts: ReadonlyArray<typeof Draft.Type>) =>
  Effect.forEach(drafts, ({ msecs, op }) =>
    Effect.map(
      Schema.encodeUnknownEffect(Groceries.events.grocery.payloadSchemaBinary)(toPayload(op)),
      (payload) =>
        new EventJournal.Entry({
          id: EventJournal.makeEntryIdUnsafe({ msecs: 1000 + msecs }),
          event: "grocery",
          primaryKey: op.key,
          payload
        }, { disableChecks: true })
    ))

// Gives the ids `EventRow.compaction` keeps from a batch.
const makeDrop = Effect.fnUntraced(function*() {
  const registry = yield* EventLog.Registry
  yield* Layer.build(
    EventRow.compaction(Groceries, Grocery).pipe(Layer.provide(Layer.succeed(EventLog.Registry, registry)))
  )
  const compactor = registry.compactors.get("grocery")!
  return Effect.fnUntraced(function*(entries: ReadonlyArray<EventJournal.Entry>) {
    const kept: Array<EventJournal.Entry> = []
    yield* compactor.effect({ entries, write: (entry) => Effect.sync(() => kept.push(entry)) })
    return kept
  })
})

const ids = (entries: ReadonlyArray<EventJournal.Entry>) => entries.map((entry) => entry.idString).sort()

type Replica = Effect.Success<ReturnType<typeof makeReplica>>

// An `EventLog` on a memory journal whose storage is a map of rows, fed by a
// remote whose changes the test delivers by hand.
const makeReplica = Effect.fnUntraced(function*(compact = false) {
  const storage = new Map<string, Row>()
  const applied = yield* Queue.unbounded<void>()
  const changes = yield* Queue.unbounded<EventJournal.RemoteEntry, EventLogRemote.EventLogRemoteError>()
  const journal = yield* EventJournal.makeMemory
  const handlers = EventLog.group(Groceries, (handlers) =>
    handlers.handle(
      "grocery",
      EventRow.handler(Grocery, {
        set: (row) => Effect.sync(() => storage.set(row.id, row)),
        patch: (id, fields) =>
          Effect.sync(() => {
            const row = storage.get(id)
            if (row !== undefined) storage.set(id, { ...row, ...fields })
          }),
        remove: (id) => Effect.sync(() => storage.delete(id))
      })
    )).pipe(Layer.provide(EventLog.layerRegistry))
  const context = yield* Layer.build(
    EventLog.layer(schema, handlers).pipe(
      Layer.provide([
        Layer.succeed(
          EventJournal.EventJournal,
          EventJournal.EventJournal.of({
            ...journal,
            writeFromRemote: (options) =>
              journal.writeFromRemote(options).pipe(Effect.tap(() => Queue.offer(applied, undefined)))
          })
        ),
        Layer.effect(EventLog.Identity, EventLog.makeIdentity).pipe(Layer.provide(EventLogEncryption.layerSubtle))
      ])
    )
  )
  const registry = Context.get(context, EventLog.Registry)
  if (compact) {
    const compaction: Layer.Layer<never, never, EventLog.Registry> = EventRow.compaction(Groceries, Grocery)
    yield* Layer.build(
      compaction.pipe(
        Layer.provide(Layer.succeed(EventLog.Registry, registry))
      )
    )
  }
  yield* registry.registerRemote(EventLogRemote.EventLogRemote.of({
    id: EventJournal.makeRemoteIdUnsafe(),
    changes: () => Effect.succeed(changes),
    write: () => Effect.void,
    whenAuthenticated: (effect) => effect
  }))

  let remoteSequence = 0
  const deliverBatch = Effect.fnUntraced(function*(entries: ReadonlyArray<EventJournal.Entry>) {
    yield* Queue.offerAll(
      changes,
      entries.map((entry) => new EventJournal.RemoteEntry({ remoteSequence: remoteSequence++, entry }))
    )
    // The log may take a batch in more than one read.
    while (true) {
      yield* Queue.take(applied)
      const stored = yield* journal.entriesById(entries.map((entry) => entry.id))
      if (stored.every((entry) => entry !== undefined)) return
    }
  })

  return {
    storage,
    journal,
    log: Context.get(context, EventLog.EventLog),
    deliver: Effect.fnUntraced(
      function*(entries: ReadonlyArray<EventJournal.Entry>, batchSizes: ReadonlyArray<number>) {
        for (let i = 0, batch = 0; i < entries.length; batch++) {
          const size = batchSizes[batch % batchSizes.length]
          yield* deliverBatch(entries.slice(i, i + size))
          i += size
        }
      }
    )
  }
})

describe("EventRow", () => {
  it("constructs tagged events for set, patch and remove", () => {
    assert.deepStrictEqual([Grocery.set(X), Grocery.patch("g1", P), Grocery.remove("g1")], [
      { event: "grocery", payload: { _tag: "set", row: X } },
      { event: "grocery", payload: { _tag: "patch", key: "g1", fields: P } },
      { event: "grocery", payload: { _tag: "remove", key: "g1" } }
    ])
  })

  it.effect("round-trips byte keys without derive through every operation", () =>
    Effect.gen(function*() {
      const rowSchema = Schema.Struct({ id: Schema.Uint8Array, value: Schema.Number })
      const id = Uint8Array.of(0, 1, 255)
      const encodedId = yield* Schema.encodeEffect(Schema.toCodecJson(Schema.Uint8Array))(id)
      const primaryKey = JSON.stringify([encodedId])
      const check = Effect.fnUntraced(function*<KeySchema extends Schema.Codec<unknown, unknown>>(
        row: EventRow.EventRow<"bytes", typeof rowSchema.fields, "id", typeof Schema.Never, KeySchema>,
        key: Schema.Schema.Type<KeySchema>
      ) {
        const codec = EventGroup.empty.add(row).events.bytes.payloadSchemaBinary
        const initial = { id, value: 1 }
        assert.deepStrictEqual(row.keyOf(initial), primaryKey)
        const calls: Array<unknown> = []
        const handler = EventRow.handler(row, {
          set: (value, key) => Effect.sync(() => calls.push(["set", value, key])),
          patch: (key, fields) => Effect.sync(() => calls.push(["patch", key, fields])),
          remove: (key) => Effect.sync(() => calls.push(["remove", key]))
        })
        const payloads = [row.set(initial).payload, row.patch(key, { value: 2 }).payload, row.remove(key).payload]
        for (const [i, payload] of payloads.entries()) {
          assert.strictEqual(row.primaryKey(payload), primaryKey)
          const entry = yield* makeEntryWith(1000 + i, row, codec, payload)
          const decoded = yield* Schema.decodeUnknownEffect(codec)(entry.payload)
          assert.deepStrictEqual(decoded, payload)
          assert.strictEqual(row.primaryKey(decoded), primaryKey)
          yield* handler({
            storeId: yield* EventLog.CurrentStoreId,
            payload: decoded,
            entry,
            conflicts: []
          })
        }
        assert.deepStrictEqual(calls, [["set", initial, key], ["patch", key, { value: 2 }], ["remove", key]])
      })
      yield* check(EventRow.make("bytes", { key: "id", schema: rowSchema }), id)
      yield* check(EventRow.make("bytes", { key: { fields: ["id"] }, schema: rowSchema }), { id })
    }))

  it.effect("routes composite keys and suspended string keys consistently", () =>
    Effect.gen(function*() {
      const schema = Schema.Struct({ list: Schema.String, aisle: Schema.String, value: Schema.Number })
      const key = { list: "A|B", aisle: "c" }
      for (const derive of [undefined, ({ list, aisle }: typeof key) => JSON.stringify([list.toLowerCase(), aisle])]) {
        const row = EventRow.make("composite", { key: { fields: ["list", "aisle"], derive }, schema })
        const codec = EventGroup.empty.add(row).events.composite.payloadSchemaBinary
        const calls: Array<unknown> = []
        const handler = EventRow.handler(row, {
          set: (_, key) => Effect.sync(() => calls.push(key)),
          patch: (key) => Effect.sync(() => calls.push(key)),
          remove: (key) => Effect.sync(() => calls.push(key))
        })
        assert.notStrictEqual(row.keyOf(key), row.keyOf({ list: "a", aisle: "b|c" }))
        for (
          const payload of [
            row.set({ ...key, value: 1 }).payload,
            row.patch(key, { value: 2 }).payload,
            row.remove(key).payload
          ]
        ) {
          const entry = yield* makeEntryWith(1000, row, codec, payload)
          const decoded = yield* Schema.decodeUnknownEffect(codec)(entry.payload)
          const expected = derive ? "[\"a|b\",\"c\"]" : "[\"A|B\",\"c\"]"
          assert.strictEqual(entry.primaryKey, expected)
          assert.strictEqual(row.primaryKey(decoded), expected)
          yield* handler({ storeId: yield* EventLog.CurrentStoreId, payload: decoded, entry, conflicts: [] })
        }
        assert.deepStrictEqual(calls, [key, key, key])
      }
      const suspended = EventRow.make("suspended", {
        key: "id",
        schema: Schema.Struct({ id: Schema.suspend(() => Schema.Literal("a")) })
      })
      assert.strictEqual(suspended.keyOf({ id: "a" }), "a")
      assert.strictEqual(suspended.primaryKey(suspended.set({ id: "a" }).payload), "a")
    }))

  it.effect("compacts only shadowed entries within the same row tag and key", () =>
    Effect.gen(function*() {
      const Other = EventRow.make("other", { key: "id", schema: Grocery.schema })
      const group = Groceries.add(Other)
      const registry = yield* EventLog.Registry
      const register = (layer: Layer.Layer<never, never, EventLog.Registry>) =>
        Layer.build(layer.pipe(Layer.provide(Layer.succeed(EventLog.Registry, registry))))
      yield* register(EventRow.compaction(group, Grocery))
      yield* register(EventRow.compaction(group, Other))
      assert.deepStrictEqual([...registry.compactors.get("grocery")!.events], ["grocery"])
      assert.deepStrictEqual([...registry.compactors.get("other")!.events], ["other"])
      assert.isTrue(registry.compactors.get("grocery")!.remote)

      type Input = readonly ["grocery" | "other", Payload]
      const cases: ReadonlyArray<readonly [string, ReadonlyArray<Input>, ReadonlyArray<number>]> = [
        ...([Grocery.set(X).payload, Grocery.patch("g1", P).payload, Grocery.remove("g1").payload] as const).flatMap((
          older
        ) =>
          [Grocery.set(Y).payload, Grocery.remove("g1").payload].map((newer) =>
            [
              older._tag + " before " + newer._tag,
              [["grocery", older], ["grocery", newer]],
              [1]
            ] as const
          )
        ),
        ["patch jointly covered by newer patches", [
          ["grocery", Grocery.patch("g1", P).payload],
          ["grocery", Grocery.patch("g1", { name: "new" }).payload],
          ["grocery", Grocery.patch("g1", { quantity: 4 }).payload]
        ], [1, 2]],
        ["partially overlapping patches", [["grocery", Grocery.patch("g1", P).payload], [
          "grocery",
          Grocery.patch("g1", Q).payload
        ]], [
          0,
          1
        ]],
        ["set is required even before a patch of every field", [
          ["grocery", Grocery.set(X).payload],
          ["grocery", Grocery.patch("g1", { name: "new", quantity: null, completed: true }).payload]
        ], [0, 1]],
        ["remove is required before patch", [["grocery", Grocery.remove("g1").payload], [
          "grocery",
          Grocery.patch("g1", P).payload
        ]], [
          0,
          1
        ]],
        ["different key cannot shadow", [["grocery", Grocery.set(X).payload], [
          "grocery",
          Grocery.remove("g2").payload
        ]], [0, 1]],
        ["different tag cannot shadow the same key", [["grocery", Grocery.set(X).payload], [
          "other",
          Other.remove("g1").payload
        ]], [
          0,
          1
        ]]
      ]
      for (const [name, inputs, kept] of cases) {
        const entries = yield* Effect.forEach(inputs, ([event, payload], i) =>
          Effect.gen(function*() {
            return new EventJournal.Entry({
              id: EventJournal.makeEntryIdUnsafe({ msecs: 1000 + i }),
              event,
              primaryKey: payload._tag === "set" ? payload.row.id : payload.key,
              payload: yield* Schema.encodeUnknownEffect(group.events[event].payloadSchemaBinary)(payload)
            }, { disableChecks: true })
          }))
        // Batch order must not be mistaken for id order.
        const output: Array<EventJournal.Entry> = []
        for (const tag of ["grocery", "other"] as const) {
          yield* registry.compactors.get(tag)!.effect({
            entries: entries.filter((entry) => entry.event === tag).reverse(),
            write: (entry, source) =>
              Effect.sync(() => {
                assert.isUndefined(source, name)
                assert.isTrue(entries.includes(entry), name)
                output.push(entry)
              })
          })
        }
        assert.deepStrictEqual(output.sort(EventJournal.Entry.Order), kept.map((i) => entries[i]), name)
      }
    }).pipe(Effect.provide(EventLog.layerRegistry)))

  it.effect("composes newer conflicts with the op algebra", () =>
    Effect.gen(function*() {
      // The late entry is `set(E)`: a collapsed `set` or `remove` skips it, and
      // only a collapsed `patch` writes, as `set(E with the patch on top)`.
      const cases: ReadonlyArray<readonly [string, ReadonlyArray<Payload>, ReadonlyArray<Call>]> = [
        ["set(X) ; set(Y) = set(Y)", [Grocery.set(X).payload, Grocery.set(Y).payload], []],
        ["set(X) ; patch(Q) = set(X with Q)", [Grocery.set(X).payload, Grocery.patch("g1", Q).payload], []],
        ["set(X) ; remove = remove", [Grocery.set(X).payload, Grocery.remove("g1").payload], []],
        ["patch(P) ; set(Y) = set(Y)", [Grocery.patch("g1", P).payload, Grocery.set(Y).payload], []],
        ["patch(P) ; patch(Q) = patch(P with Q)", [Grocery.patch("g1", P).payload, Grocery.patch("g1", Q).payload], [
          ["set", { id: "g1", name: "q", quantity: 3, completed: true }]
        ]],
        ["patch(P) ; remove = remove", [Grocery.patch("g1", P).payload, Grocery.remove("g1").payload], []],
        ["remove ; set(Y) = set(Y)", [Grocery.remove("g1").payload, Grocery.set(Y).payload], []],
        ["remove ; patch(Q) = remove", [Grocery.remove("g1").payload, Grocery.patch("g1", Q).payload], []],
        ["remove ; remove = remove", [Grocery.remove("g1").payload, Grocery.remove("g1").payload], []]
      ]
      const actual = yield* Effect.forEach(cases, ([name, conflicts]) =>
        Effect.map(replay(Grocery.set(E).payload, conflicts), (calls) => [name, calls] as const))
      assert.deepStrictEqual(
        actual,
        cases.map(([name, , calls]) =>
          [name, calls] as const
        )
      )
    }))

  it.effect("writes at most one callback for a late entry", () =>
    Effect.gen(function*() {
      const cases: ReadonlyArray<readonly [string, Payload, ReadonlyArray<Payload>, ReadonlyArray<Call>]> = [
        ["empty, set(E)", Grocery.set(E).payload, [], [["set", E]]],
        ["empty, patch(Q)", Grocery.patch("g1", Q).payload, [], [["patch", "g1", Q]]],
        ["empty, remove", Grocery.remove("g1").payload, [], [["remove", "g1"]]],
        ["empty, empty patch", Grocery.patch("g1", {}).payload, [], []],
        ["set(X), set(E)", Grocery.set(E).payload, [Grocery.set(X).payload], []],
        ["set(X), patch(Q)", Grocery.patch("g1", Q).payload, [Grocery.set(X).payload], []],
        ["set(X), remove", Grocery.remove("g1").payload, [Grocery.set(X).payload], []],
        ["remove, set(E)", Grocery.set(E).payload, [Grocery.remove("g1").payload], []],
        ["remove, patch(Q)", Grocery.patch("g1", Q).payload, [Grocery.remove("g1").payload], []],
        ["remove, remove", Grocery.remove("g1").payload, [Grocery.remove("g1").payload], []],
        // Required even when the row is missing and the newer patch did nothing.
        ["patch(P), set(E)", Grocery.set(E).payload, [Grocery.patch("g1", P).payload], [
          ["set", { id: "g1", name: "p", quantity: 3, completed: false }]
        ]],
        ["patch(P), patch(Q)", Grocery.patch("g1", Q).payload, [Grocery.patch("g1", P).payload], [["patch", "g1", {
          completed: true
        }]]],
        [
          "patch(P), patch covered by P",
          Grocery.patch("g1", { name: "r" }).payload,
          [Grocery.patch("g1", P).payload],
          []
        ],
        ["patch(P), remove", Grocery.remove("g1").payload, [Grocery.patch("g1", P).payload], [["remove", "g1"]]]
      ]
      const actual = yield* Effect.forEach(
        cases,
        ([name, payload, conflicts]) => Effect.map(replay(payload, conflicts), (calls) => [name, calls] as const)
      )
      assert.deepStrictEqual(actual, cases.map(([name, , , calls]) => [name, calls] as const))
    }))

  it.effect("replicas decode patches without filling in defaults for unwritten fields", () =>
    Effect.gen(function*() {
      const Task = EventRow.make("task", {
        key: "id",
        schema: Schema.Struct({
          id: Schema.String,
          name: Schema.String.pipe(Schema.withDecodingDefaultKey(Effect.succeed("default"))),
          done: Schema.Boolean
        })
      })
      const codec = EventGroup.empty.add(Task).events.task.payloadSchemaBinary
      const payloads = [Task.patch("t1", { done: true }).payload, Task.patch("t1", {}).payload]
      const replayed = yield* Effect.forEach(payloads, (payload) =>
        Schema.encodeUnknownEffect(codec)(payload).pipe(Effect.flatMap(Schema.decodeUnknownEffect(codec))))
      assert.deepStrictEqual(replayed, payloads)
    }))

  it.effect("passes the same values to callbacks for a local write and its replay", () =>
    Effect.gen(function*() {
      const calls: Array<unknown> = []
      const handler = EventRow.handler(Stamp, {
        set: (row) => Effect.sync(() => calls.push(["set", row])),
        patch: (id, fields) => Effect.sync(() => calls.push(["patch", id, fields])),
        remove: () => Effect.void
      })
      const storeId = yield* EventLog.CurrentStoreId
      for (const payload of [Stamp.set({ id: "s1", mark: "x" }).payload, Stamp.patch("s1", { mark: "x" }).payload]) {
        const entry = new EventJournal.Entry({
          id: EventJournal.makeEntryIdUnsafe({ msecs: 1000 }),
          event: "stamp",
          primaryKey: "s1",
          payload: yield* Schema.encodeEffect(StampCodec)(payload)
        }, { disableChecks: true })
        // A local write passes the written payload, and a replica the decoded entry.
        yield* handler({ storeId, payload, entry, conflicts: [] })
        yield* handler({
          storeId,
          payload: yield* Schema.decodeUnknownEffect(StampCodec)(entry.payload),
          entry,
          conflicts: []
        })
      }
      assert.deepStrictEqual(calls, [
        ["set", { id: "s1", mark: "x!" }],
        ["set", { id: "s1", mark: "x!" }],
        ["patch", "s1", { mark: "x!" }],
        ["patch", "s1", { mark: "x!" }]
      ])
    }))

  it.effect("patches a field whose encoding omits None only with Some", () =>
    Effect.gen(function*() {
      const Shelf = EventRow.make("shelf", {
        key: "id",
        schema: Schema.Struct({ id: Schema.String, label: Schema.OptionFromOptionalKey(Schema.String) })
      })
      const ShelfCodec = EventGroup.empty.add(Shelf).events.shelf.payloadSchemaBinary
      const some = Shelf.patch("s1", { label: Option.some("x") }).payload
      const replayed = yield* Schema.encodeUnknownEffect(ShelfCodec)(some).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(ShelfCodec))
      )
      // Replicas would read the omitted key as "not written", so None is refused.
      const none = yield* Effect.exit(
        Schema.encodeUnknownEffect(ShelfCodec)(Shelf.patch("s1", { label: Option.none() }).payload)
      )
      assert.deepStrictEqual(replayed, some)
      assert.isTrue(Exit.isFailure(none))
    }))

  it.effect.prop(
    "compaction composes, including with older entries",
    { a: Drafts, b: Drafts },
    Effect.fnUntraced(
      function*({ a, b }) {
        const drop = yield* makeDrop()
        const older = yield* toEntries(a)
        const later = yield* toEntries(b)
        assert.deepStrictEqual(
          ids(yield* drop([...(yield* drop(older)), ...later])),
          ids(yield* drop([...older, ...later]))
        )
      },
      Effect.scoped,
      Effect.provide(EventLog.layerRegistry)
    )
  )

  it.effect.prop(
    "compaction is independent of input order",
    { drafts: Drafts },
    Effect.fnUntraced(
      function*({ drafts }) {
        const drop = yield* makeDrop()
        const entries = yield* toEntries(drafts)
        const shuffled = entries.map((entry, i) => [drafts[i].rank, entry] as const).sort(([x], [y]) => x - y)
        assert.deepStrictEqual(ids(yield* drop(shuffled.map(([, entry]) => entry))), ids(yield* drop(entries)))
      },
      Effect.scoped,
      Effect.provide(EventLog.layerRegistry)
    )
  )

  it.effect.prop(
    "replicas converge to the fold of every entry in id order",
    { commands: Schema.Array(Command).check(Schema.isMaxLength(24)) },
    Effect.fnUntraced(function*({ commands }) {
      const replicas = yield* Effect.forEach([0, 1, 2], () =>
        Effect.gen(function*() {
          return { plain: yield* makeReplica(), compacted: yield* makeReplica(true) }
        }))
      const deliver = Effect.fnUntraced(function*(
        replica: typeof replicas[number],
        entries: ReadonlyArray<EventJournal.Entry>,
        batchSizes: ReadonlyArray<number>
      ) {
        yield* replica.plain.deliver(entries, batchSizes)
        yield* replica.compacted.deliver(entries, batchSizes)
      })
      // Every entry written anywhere, with the payload it carries.
      const server = new Map<string, { readonly entry: EventJournal.Entry; readonly payload: Payload }>()

      const missing = Effect.fnUntraced(function*(replica: Replica) {
        const known = new Set((yield* replica.journal.entries).map((entry) => entry.idString))
        return globalThis.Array.from(server.values(), ({ entry }) => entry).filter((entry) =>
          !known.has(entry.idString)
        )
      })

      for (const command of commands) {
        switch (command._tag) {
          case "write": {
            const replica = replicas[command.replica]
            const payloads = command.ops.map(toPayload)
            yield* replica.plain.log.writeMany({
              schema,
              events: [
                { event: "grocery", payload: payloads[0] },
                ...payloads.slice(1).map((payload) => ({ event: "grocery" as const, payload }))
              ]
            })
            // Local ids ascend in input order.
            const written = (yield* replica.plain.journal.entries).filter((entry) => !server.has(entry.idString))
              .sort(EventJournal.Entry.Order)
            written.forEach((entry, i) => server.set(entry.idString, { entry, payload: payloads[i] }))
            yield* replica.compacted.deliver(written, [written.length])
            break
          }
          case "offline": {
            // A device whose clock is skewed against the newest entry so far.
            let latest = Date.now()
            for (const { entry } of server.values()) latest = Math.max(latest, entry.createdAtMillis)
            const payload = toPayload(command.op)
            const entry = new EventJournal.Entry({
              id: EventJournal.makeEntryIdUnsafe({ msecs: latest + command.skewMillis }),
              event: "grocery",
              primaryKey: command.op.key,
              payload: yield* Schema.encodeUnknownEffect(Groceries.events.grocery.payloadSchemaBinary)(payload)
            }, { disableChecks: true })
            server.set(entry.idString, { entry, payload })
            break
          }
          case "sync": {
            const replica = replicas[command.replica]
            const remaining = yield* missing(replica.plain)
            const picked: Array<EventJournal.Entry> = []
            for (const pick of command.picks) {
              if (remaining.length === 0) break
              picked.push(remaining.splice(pick % remaining.length, 1)[0])
            }
            yield* deliver(replica, picked, command.batchSizes)
            break
          }
        }
      }

      // Deliver the rest newest first, as one batch per replica.
      for (const replica of replicas) {
        const remaining = yield* missing(replica.plain)
        yield* deliver(replica, remaining.reverse(), [remaining.length])
      }

      const expected = new Map<string, Row>()
      for (
        const { payload } of globalThis.Array.from(server.values()).sort((a, b) =>
          EventJournal.Entry.Order(a.entry, b.entry)
        )
      ) {
        switch (payload._tag) {
          case "set": {
            expected.set(payload.row.id, payload.row)
            break
          }
          case "patch": {
            const row = expected.get(payload.key)
            if (row !== undefined) expected.set(payload.key, { ...row, ...payload.fields })
            break
          }
          case "remove": {
            expected.delete(payload.key)
            break
          }
        }
      }
      assert.deepStrictEqual(
        replicas.map(({ plain, compacted }) =>
          [plain, compacted].map((replica) => Object.fromEntries(replica.storage))
        ),
        replicas.map(() => [Object.fromEntries(expected), Object.fromEntries(expected)])
      )
    }, Effect.scoped),
    { arbitrary: { runs: 200 } }
  )
})
