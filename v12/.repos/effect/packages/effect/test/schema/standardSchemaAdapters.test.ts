import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"

describe.each(
  [
    ["toStandardSchemaV1", Schema.toStandardSchemaV1],
    ["toStandardJSONSchemaV1", Schema.toStandardJSONSchemaV1]
  ] as const
)("%s preserves schema members", (_, adapt: <S extends Schema.ConstraintDecoder<unknown>>(schema: S) => S) => {
  it("preserves Array.value", () => {
    const schema = Schema.Array(Schema.String)
    const adapted = adapt(schema)

    assert.strictEqual(adapted.value, schema.value)
  })

  it("preserves Record.key and Record.value", () => {
    const schema = Schema.Record(Schema.String, Schema.Number)
    const adapted = adapt(schema)

    assert.strictEqual(adapted.key, schema.key)
    assert.strictEqual(adapted.value, schema.value)
  })

  it("preserves properties of class- and function-valued statics", () => {
    class Item extends Schema.Class<Item>("Item")({ value: Schema.String }) {
      static custom = "item"
    }
    class Parent extends Schema.Class<Parent>("Parent")({ a: Schema.String }) {
      static Item = Item
      static increment = Object.assign((value: number) => value + 1, { description: "increment" })
    }
    const adapted = adapt(Parent)

    assert.strictEqual(adapted.Item.custom, "item")
    assert.strictEqual(adapted.increment.description, "increment")
    assert.strictEqual(adapted.increment(1), 2)
  })

  it("keeps static writes, accessors, and method reads local to the copy", () => {
    class Parent extends Schema.Class<Parent>("Parent")({ a: Schema.String }) {
      static count = 0

      static get currentCount() {
        return this.count
      }

      static set currentCount(value: number) {
        this.count = value
      }

      static getCount() {
        return this.count
      }
    }
    const adapted = adapt(Parent)

    adapted.count = 1

    assert.strictEqual(adapted.count, 1)
    assert.strictEqual(adapted.getCount(), 1)
    assert.strictEqual(Parent.count, 0)

    adapted.currentCount = 2

    assert.strictEqual(adapted.currentCount, 2)
    assert.strictEqual(Parent.currentCount, 0)
  })

  it("preserves class construction and decoding", () => {
    class Parent extends Schema.Class<Parent>("Parent")({ a: Schema.String }) {}
    const adapted = adapt(Parent)
    const constructed = new adapted({ a: "a" })
    const decoded = Schema.decodeUnknownSync(adapted)({ a: "a" })

    assert.strictEqual(constructed.constructor, Parent)
    assert.strictEqual(decoded.constructor, Parent)
    assert.instanceOf(constructed, adapted)
    assert.instanceOf(decoded, adapted)
    assert.instanceOf(new Parent({ a: "a" }), adapted)
  })

  it("supports extending an adapted class", () => {
    class Parent extends Schema.Class<Parent>("Parent")({ a: Schema.String }) {}
    const adapted = adapt(Parent)
    class Child extends adapted.extend<Child>("Child")({ b: Schema.Number }) {}
    const decoded = Schema.decodeUnknownSync(Child)({ a: "a", b: 1 })

    assert.strictEqual(decoded.constructor, Child)
    assert.strictEqual(decoded.b, 1)
    assert.instanceOf(decoded, Parent)
  })
})
