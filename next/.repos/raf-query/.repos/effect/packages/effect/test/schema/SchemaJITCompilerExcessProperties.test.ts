import { assert, describe, it } from "@effect/vitest"
import { Schema, SchemaParser } from "effect"
import * as Registry from "effect/internal/schema/compilerRegistry"
// oxlint-disable-next-line no-unassigned-import
import "effect/schema/SchemaJITCompiler/enable"
import { assertSchemaIssueError, deepStrictEqual, throws } from "../utils/assert.ts"

const strict = { onExcessProperty: "error" } as const

const compiled = (schema: Schema.Top) => {
  const { decode, is } = Registry.resolve(schema.ast)
  assert.ok(decode, "Expected a compiled decoder")
  assert.ok(is, "Expected a compiled type guard")
  return { decode, is }
}

describe("SchemaJITCompiler excess properties", () => {
  it("ignores non-enumerable own properties without fallback or getter access", () => {
    const schema = Schema.Struct({ a: Schema.String })
    const { decode, is } = compiled(schema)
    const input = Object.assign(Object.create(null), { a: "a" })
    for (const key of ["stack", "propertyIsEnumerable", Symbol("hidden")]) {
      Object.defineProperty(input, key, {
        get() {
          throw new Error("Non-enumerable excess properties must not be read")
        },
        enumerable: false
      })
    }
    deepStrictEqual(decode(input, strict), { a: "a" })
    assert.isTrue(is(input, strict))
  })

  it("rejects enumerable excess properties", () => {
    const schema = Schema.Struct({ a: Schema.String })
    const compiledParser = compiled(schema)
    for (const key of ["b", Symbol("b")]) {
      const input = { a: "a", [key]: "b" }
      assert.strictEqual(compiledParser.decode(input, strict), Registry.invalid)
      assert.isFalse(compiledParser.is(input, strict))
    }
    const decode = SchemaParser.decodeUnknownSync(schema, strict)
    throws(
      () => decode({ a: "a", b: "b" }),
      (error) => {
        assertSchemaIssueError(error, `Expected no excess property\n  at ["b"]`)
      }
    )
  })

  it("symbol index signatures ignore non-enumerable properties in decode and encode", () => {
    const visible = Symbol("visible")
    const hidden = Symbol("hidden")
    const input = { [visible]: 1 }
    Object.defineProperty(input, hidden, {
      get() {
        throw new Error("Non-enumerable record entries must not be read")
      },
      enumerable: false
    })
    const expected = { [visible]: 1 }
    const schema = Schema.Record(Schema.Symbol, Schema.Number)

    const { decode, is } = compiled(schema)
    for (const options of [{}, strict]) {
      deepStrictEqual(decode(input, options), expected)
      assert.isTrue(is(input, options))
      assert.strictEqual(decode({ [visible]: "invalid" }, options), Registry.invalid)
      assert.isFalse(is({ [visible]: "invalid" }, options))
      deepStrictEqual(SchemaParser.encodeUnknownSync(schema, options)(input), expected)
    }
  })

  it("validates non-enumerable declared string and symbol properties", () => {
    const symbol = Symbol("declared")
    const schema = Schema.Struct({ a: Schema.Number, [symbol]: Schema.String })
    const { decode, is } = compiled(schema)
    const input = Object.defineProperties({}, {
      a: { value: 1, enumerable: false },
      [symbol]: { value: "a", enumerable: false }
    })
    deepStrictEqual(decode(input, strict), { a: 1, [symbol]: "a" })
    assert.isTrue(is(input, strict))
    deepStrictEqual(SchemaParser.encodeUnknownSync(schema, strict)(input), { a: 1, [symbol]: "a" })
    for (const key of ["a", symbol]) {
      const invalid = Object.defineProperty({ a: 1, [symbol]: "a" }, key, { value: null, enumerable: false })
      assert.strictEqual(decode(invalid, strict), Registry.invalid)
      assert.isFalse(is(invalid, strict))
    }
  })

  it("handles fixed fields and multiple index signatures", () => {
    const symbol = Symbol("visible")
    const schema = Schema.StructWithRest(Schema.Struct({ fixed: Schema.String }), [
      Schema.Record(Schema.TemplateLiteral(["field-", Schema.Number]), Schema.Number),
      Schema.Record(Schema.Symbol, Schema.Number)
    ])
    const { decode, is } = compiled(schema)
    const expected = { fixed: "a", "field-1": 1, [symbol]: 2 }
    const input = Object.defineProperties({ ...expected }, {
      "field-2": { value: "invalid", enumerable: false },
      [Symbol("hidden")]: { value: "invalid", enumerable: false }
    })
    deepStrictEqual(decode(input, strict), expected)
    assert.isTrue(is(input, strict))
    assert.strictEqual(decode({ ...input, extra: 1 }, strict), Registry.invalid)
    assert.isFalse(is({ ...input, extra: 1 }, strict))
    assert.strictEqual(decode({ ...input, [symbol]: "invalid" }, strict), Registry.invalid)
    deepStrictEqual(decode({ fixed: "b", "field-3": 3 }, strict), { fixed: "b", "field-3": 3 })
  })

  it("reuses the strict key snapshot before reading declared getters", () => {
    const visible = Symbol("visible")
    const added = Symbol("added")
    const schema = Schema.StructWithRest(Schema.Struct({ fixed: Schema.Boolean }), [
      Schema.Record(Schema.Symbol, Schema.Number)
    ])
    const { decode, is } = compiled(schema)
    const input = () => {
      const record: Record<PropertyKey, unknown> = { [visible]: 1 }
      Object.defineProperty(record, "fixed", {
        enumerable: true,
        get() {
          record[added] = "added after excess checking"
          return true
        }
      })
      return record
    }
    deepStrictEqual(decode(input(), strict), { fixed: true, [visible]: 1 })
    assert.isTrue(is(input(), strict))
    assert.strictEqual(decode(input(), {}), Registry.invalid)
    assert.isFalse(is(input(), {}))
  })

  it("encodes tagged errors carrying runtime internals", () => {
    class NotFound extends Schema.TaggedError<NotFound>()("NotFound", { id: Schema.Number }) {}
    const encode = SchemaParser.encodeUnknownSync(NotFound, strict)
    deepStrictEqual(encode(new NotFound({ id: 1 })), { _tag: "NotFound", id: 1 })
  })
})
