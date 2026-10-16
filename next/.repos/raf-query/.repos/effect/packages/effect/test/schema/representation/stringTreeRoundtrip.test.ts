import { assert, describe, it } from "@effect/vitest"
import { Schema, SchemaGetter } from "effect"

function makeValueCodec<Type extends string, Value>(type: Type, value: Schema.Codec<Value>) {
  return value.pipe(
    Schema.encodeTo(Schema.Struct({ type: Schema.tag(type), value }), {
      decode: SchemaGetter.transform((encoded: { readonly type: Type; readonly value: Value }) => encoded.value),
      encode: SchemaGetter.transform((value: Value) => ({ type, value }))
    })
  )
}

const LiteralValueSchema = Schema.Union([
  makeValueCodec("string", Schema.String),
  makeValueCodec("number", Schema.Finite),
  makeValueCodec("bigint", Schema.BigInt),
  makeValueCodec("boolean", Schema.Boolean)
])

const EnumValueSchema = Schema.Union([
  makeValueCodec("string", Schema.String),
  makeValueCodec("number", Schema.Number)
])

const PropertyNameSchema = Schema.Union([
  makeValueCodec("string", Schema.String),
  makeValueCodec("number", Schema.Number),
  makeValueCodec("symbol", Schema.Symbol)
])

function assertRoundtrips<A>(
  schema: Schema.Codec<A, unknown>,
  cases: ReadonlyArray<readonly [value: A, encoded: Schema.StringTree]>
): void {
  const codec = Schema.toCodecStringTree(schema)
  const encode = Schema.encodeSync(codec)
  const decode = Schema.decodeSync(codec)
  for (const [value, encoded] of cases) {
    assert.deepStrictEqual(encode(value), encoded)
    assert.deepStrictEqual(decode(encoded), value)
  }
}

describe("SchemaRepresentation encoded values through StringTree", () => {
  it("preserves literal value types", () => {
    assertRoundtrips(LiteralValueSchema, [
      ["1", { type: "string", value: "1" }],
      [1, { type: "number", value: "1" }],
      [1n, { type: "bigint", value: "1" }],
      ["true", { type: "string", value: "true" }],
      [true, { type: "boolean", value: "true" }]
    ])
  })

  it("preserves enum value types", () => {
    assertRoundtrips(EnumValueSchema, [
      ["NaN", { type: "string", value: "NaN" }],
      [Number.NaN, { type: "number", value: "NaN" }],
      ["Infinity", { type: "string", value: "Infinity" }],
      [Number.POSITIVE_INFINITY, { type: "number", value: "Infinity" }]
    ])
  })

  it("preserves property name types", () => {
    assertRoundtrips(PropertyNameSchema, [
      ["1", { type: "string", value: "1" }],
      [1, { type: "number", value: "1" }],
      ["Symbol(key)", { type: "string", value: "Symbol(key)" }],
      [Symbol.for("key"), { type: "symbol", value: "Symbol(key)" }]
    ])
  })
})
