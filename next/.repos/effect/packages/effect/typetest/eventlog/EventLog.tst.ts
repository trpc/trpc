import type { Effect } from "effect"
import { Schema } from "effect"
import * as EventGroup from "effect/eventlog/EventGroup"
import type { EventJournalError } from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import { describe, expect, it } from "tstyche"

const Group = EventGroup.empty
  .add({
    tag: "A",
    primaryKey: (payload) => payload.a,
    payload: Schema.Struct({ a: Schema.String }),
    success: Schema.String
  })
  .add({
    tag: "B",
    primaryKey: (payload) => String(payload.b),
    payload: Schema.Struct({ b: Schema.Number }),
    success: Schema.Number
  })
const schema = EventLog.schema(Group)
declare const log: EventLog.EventLog["Service"]

describe("EventLog", () => {
  it("writeMany pairs each event with its own payload", () => {
    expect(log.writeMany({
      schema,
      events: [{ event: "A", payload: { a: "x" } }, { event: "B", payload: { b: 1 } }]
    })).type.toBe<Effect.Effect<[string | number, ...Array<string | number>], EventJournalError>>()

    log.writeMany({
      schema,
      // @ts-expect-error is not assignable to type
      events: [{ event: "A", payload: { b: 1 } }, { event: "B", payload: { a: "x" } }]
    })
  })

  it("groupReactivity accepts any key names when no keys are declared", () => {
    expect(EventLog.groupReactivity).type.toBeCallableWith(Group, ["anything"])
    expect(EventLog.groupReactivity).type.toBeCallableWith(Group, { A: ["anything"] })
  })
})
