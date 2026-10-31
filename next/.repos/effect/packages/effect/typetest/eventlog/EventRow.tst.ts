import { Effect, Schema } from "effect"
import * as EventGroup from "effect/eventlog/EventGroup"
import type { EventJournalError } from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventRow from "effect/eventlog/EventRow"
import { describe, expect, it } from "tstyche"

const schema = Schema.Struct({ list: Schema.String, aisle: Schema.String, value: Schema.Number })
declare const log: EventLog.EventLog["Service"]

describe("EventRow", () => {
  it("constructs typed events for write and writeMany", () => {
    const row = EventRow.make("row", { key: "list", schema })
    const included = EventLog.schema(EventGroup.empty.add(row))
    const other = EventRow.make("other", { key: "list", schema })
    const excluded = EventLog.schema(EventGroup.empty.add(other))
    type Write = { readonly event: "row"; readonly payload: EventRow.Payload<typeof schema.fields, "list"> }
    expect<ReturnType<typeof row.set>>().type.toBe<Write>()
    expect<ReturnType<typeof row.patch>>().type.toBe<Write>()
    expect<ReturnType<typeof row.remove>>().type.toBe<Write>()

    const set = row.set({ list: "list", aisle: "aisle", value: 1 })
    const patch = row.patch("list", { value: 2 })
    const remove = row.remove("list")
    for (const event of [set, patch, remove]) {
      expect(log.write({ schema: included, ...event })).type.toBe<Effect.Effect<void, EventJournalError>>()
      expect(log.write).type.not.toBeCallableWith({ schema: excluded, ...event })
    }
    expect(log.writeMany({ schema: included, events: [set, patch, remove] })).type.toBe<
      Effect.Effect<[void, ...Array<void>], EventJournalError>
    >()
    expect(log.writeMany).type.not.toBeCallableWith({ schema: excluded, events: [set, patch, remove] })
  })

  it("preserves per-event client results and rejects mismatched inputs", () => {
    const row = EventRow.make("row", { key: "list", schema, error: Schema.Literal("row-error") })
    const group = EventGroup.empty.add(row).add({
      tag: "plain",
      primaryKey: (payload) => payload,
      payload: Schema.String,
      success: Schema.Number,
      error: Schema.Literal("plain-error")
    })
    Effect.gen(function*() {
      const client = yield* EventLog.makeClient(EventLog.schema(group))
      const set = row.set({ list: "list", aisle: "aisle", value: 1 })
      expect(client(set)).type.toBe<Effect.Effect<void, "row-error" | EventJournalError>>()
      expect(client({ event: "plain", payload: "value" })).type.toBe<
        Effect.Effect<number, "plain-error" | EventJournalError>
      >()
      expect(client).type.not.toBeCallableWith({ event: "plain", payload: set.payload })
      expect(client).type.not.toBeCallableWith({ event: "row", payload: "value" })
      expect(client).type.not.toBeCallableWith({ event: "missing", payload: "value" })
      expect(client).type.not.toBeCallableWith("plain", "value")
    })
  })

  it("infers composite keys and excludes them from patches", () => {
    const row = EventRow.make("row", {
      key: {
        fields: ["list", "aisle"],
        derive: (fields) => {
          expect(fields).type.toBe<{ readonly list: string; readonly aisle: string }>()
          return JSON.stringify([fields.list, fields.aisle])
        }
      },
      schema
    })
    expect<Parameters<typeof row.keyOf>[0]>().type.toBe<{ readonly list: string; readonly aisle: string }>()
    expect<ReturnType<typeof row.keyOf>>().type.toBe<string>()
    expect(row.patch).type.toBeCallableWith({ list: "list", aisle: "aisle" }, {})
    expect(row.patch).type.not.toBeCallableWith("key", {})
    expect(row.remove).type.not.toBeCallableWith("key")
    expect(row.patch).type.not.toBeCallableWith({ list: "list", aisle: "aisle" }, { list: "new" })
    expect(row.patch).type.not.toBeCallableWith({ list: "list", aisle: "aisle" }, { aisle: "new" })
    EventRow.handler(row, {
      set: (value, key) => {
        expect(value).type.toBe<typeof schema.Type>()
        expect(key).type.toBe<{ readonly list: string; readonly aisle: string }>()
        return Effect.void
      },
      patch: (key, fields) => {
        expect(key).type.toBe<{ readonly list: string; readonly aisle: string }>()
        expect(fields).type.toBe<{ readonly value?: number }>()
        return Effect.void
      },
      remove: (key) => {
        expect(key).type.toBe<{ readonly list: string; readonly aisle: string }>()
        return Effect.void
      }
    })
  })

  it("distinguishes scalar and declared byte keys without derive", () => {
    const schema = Schema.Struct({ id: Schema.Uint8Array, value: Schema.Number })
    const scalar = EventRow.make("scalar", { key: "id", schema })
    const declared = EventRow.make("declared", { key: { fields: ["id"] }, schema })
    expect<Parameters<typeof scalar.patch>[0]>().type.toBe<Uint8Array>()
    expect<Parameters<typeof scalar.remove>[0]>().type.toBe<Uint8Array>()
    expect<Parameters<typeof declared.patch>[0]>().type.toBe<{ readonly id: Uint8Array }>()
    expect<Parameters<typeof declared.remove>[0]>().type.toBe<{ readonly id: Uint8Array }>()
    expect<ReturnType<typeof scalar.keyOf>>().type.toBe<string>()
    expect(scalar.patch).type.not.toBeCallableWith("key", {})
    expect(scalar.remove).type.not.toBeCallableWith("key")
    expect(declared.patch).type.not.toBeCallableWith("key", {})
    expect(declared.remove).type.not.toBeCallableWith("key")
    expect(scalar.patch).type.not.toBeCallableWith(Uint8Array.of(1), { id: Uint8Array.of(2) })
    EventRow.handler(scalar, {
      set: (_, key) => {
        expect(key).type.toBe<Uint8Array>()
        return Effect.void
      },
      patch: () => Effect.void,
      remove: () => Effect.void
    })
    EventRow.handler(declared, {
      set: (_, key) => {
        expect(key).type.toBe<{ readonly id: Uint8Array }>()
        return Effect.void
      },
      patch: () => Effect.void,
      remove: () => Effect.void
    })
  })

  it("requires derive for nullable or mixed-kind keys", () => {
    const nullable = Schema.Struct({ id: Schema.Union([Schema.Null, Schema.Undefined, Schema.String]) })
    const mixed = Schema.Struct({ id: Schema.Union([Schema.String, Schema.Number]) })
    expect(EventRow.make).type.not.toBeCallableWith("nullable", { key: "id", schema: nullable })
    expect(EventRow.make).type.not.toBeCallableWith("nullable", { key: { fields: ["id"] }, schema: nullable })
    expect(EventRow.make).type.not.toBeCallableWith("mixed", { key: "id", schema: mixed })
    expect(EventRow.make).type.not.toBeCallableWith("mixed", { key: { fields: ["id"] }, schema: mixed })
    expect(EventRow.make).type.toBeCallableWith("nullable", {
      key: { fields: ["id"], derive: ({ id }: typeof nullable.Type) => `${typeof id}:${id}` },
      schema: nullable
    })
    expect(EventRow.make).type.toBeCallableWith("mixed", {
      key: { fields: ["id"], derive: ({ id }: typeof mixed.Type) => `${typeof id}:${id}` },
      schema: mixed
    })
    const numeric = Schema.Struct({ id: Schema.Number })
    expect(EventRow.make).type.toBeCallableWith("numeric", { key: "id", schema: numeric })
    expect(EventRow.make).type.toBeCallableWith("numeric", { key: { fields: ["id"] }, schema: numeric })
  })

  it("preserves suspended literal shorthand primary keys", () => {
    const row = EventRow.make("literal", {
      key: "id",
      schema: Schema.Struct({ id: Schema.suspend(() => Schema.Literal("a")), value: Schema.Number })
    })
    expect<ReturnType<typeof row.keyOf>>().type.toBe<"a">()
  })
})
