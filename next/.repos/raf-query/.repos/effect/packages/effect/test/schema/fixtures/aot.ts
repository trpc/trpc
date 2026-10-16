import { Effect, Option, Schema, SchemaGetter, SchemaTransformation } from "effect"
import { invalid } from "effect/schema/SchemaCompiler"
import { constructionSchemas } from "./construction.ts"

export const key = Symbol("key")
export const token = Symbol("token")
export const events: Array<string> = []

const transformed = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Number.check(Schema.isGreaterThan(0)),
    SchemaTransformation.transform({
      decode: (input) => {
        events.push("transform")
        return Number(input)
      },
      encode: String
    })
  )
)

const pureTransformed = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Number,
    SchemaTransformation.transform({
      decode: (input) => {
        events.push("pure transform")
        return input === "invalid" ? "invalid" as any : Number(input)
      },
      encode: String
    })
  )
)

const pureTransform = (decode: (input: string) => number) =>
  Schema.String.pipe(
    Schema.decodeTo(
      Schema.Number,
      SchemaTransformation.transform({ decode, encode: String })
    )
  )
const sharedPureTransform = pureTransform(Number)
const repeatedUnionMember = Schema.Struct({ kind: Schema.Literal("a"), value: Schema.Number })

const middleware = transformed.pipe(
  Schema.middlewareDecoding((effect) => {
    events.push("middleware")
    return Effect.catchEager(effect, () => {
      events.push("recover")
      return Effect.succeed(Option.some(1))
    })
  })
)

const asynchronous = Schema.String.pipe(
  Schema.decodeTo(Schema.Number.check(Schema.isGreaterThan(0)), {
    decode: SchemaGetter.transformOptionalEffect((input) => {
      events.push("async")
      return Effect.yieldNow.pipe(Effect.as(Option.map(input, Number)))
    }),
    encode: SchemaGetter.transform(String)
  })
)

interface Fixture {
  readonly schema: Schema.ConstraintDecoder<unknown>
  readonly inputs: ReadonlyArray<unknown>
}

export const synchronous = {
  struct: {
    schema: Schema.Struct({
      name: Schema.String,
      nested: Schema.Struct({ count: Schema.Number.check(Schema.isGreaterThan(0)) }),
      optional: Schema.optionalKey(Schema.String)
    }).check(Schema.makeFilter((input) => Object.keys(input).length <= 3)),
    inputs: [
      { name: "a", nested: { count: 1, ignored: true }, extra: true },
      { name: "a", nested: { count: -1 } },
      { name: 1, nested: { count: "invalid" } },
      { name: "a" }
    ]
  },
  array: {
    schema: Schema.Array(Schema.Struct({ value: Schema.String })),
    inputs: [[{ value: "a", extra: true }], [{ value: 1 }, {}], null]
  },
  tuple: {
    schema: Schema.TupleWithRest(Schema.Tuple([Schema.String]), [Schema.Number, Schema.Boolean]),
    inputs: [["a", 1, 2, true], ["a", true], ["a", "invalid", false], ["a"]]
  },
  tagged: {
    schema: Schema.Union([
      Schema.Struct({ kind: Schema.Literal("a"), value: Schema.String }),
      Schema.Struct({ kind: Schema.Literal("b"), value: Schema.Number })
    ]),
    inputs: [{ kind: "b", value: 1 }, { kind: "b", value: "invalid" }, { kind: "c" }]
  },
  literals: {
    schema: Schema.Literals(["a", "b", 0, 1, 2, 3, 4, 5, 6, 7, 8]),
    inputs: ["a", -0, 8, 9, null]
  },
  oneOf: {
    schema: Schema.Union([Schema.String, Schema.Literal("a")], { mode: "oneOf" }),
    inputs: ["b", "a", false]
  },
  repeatedOneOf: {
    schema: Schema.Union([
      repeatedUnionMember,
      Schema.Struct({ kind: Schema.Literal("b"), value: Schema.String }),
      repeatedUnionMember,
      Schema.Never
    ], { mode: "oneOf" }),
    inputs: [{ kind: "a", value: 1 }, { kind: "b", value: "value" }, { kind: "c" }]
  },
  sentinel: {
    schema: Schema.Union([Schema.Symbol, Schema.String]),
    inputs: [invalid]
  },
  sentinelLookup: {
    schema: Schema.Union([Schema.UniqueSymbol(invalid), Schema.Literal("valid")]),
    inputs: [invalid]
  },
  checkedSentinel: {
    schema: Schema.Struct({ value: Schema.Union([Schema.Symbol, Schema.String]) }).check(
      Schema.makeFilter(() => true)
    ),
    inputs: [{ value: invalid }]
  },
  symbols: {
    schema: Schema.Struct({ [key]: Schema.UniqueSymbol(token) }),
    inputs: [{ [key]: token }, { [key]: key }, {}]
  },
  enumeration: {
    schema: Schema.Enum({ a: "a", b: "b", c: 0, d: 1, e: 2, f: 3, g: 4, h: 5, i: 6 }),
    inputs: ["a", -0, 6, "invalid"]
  },
  record: {
    schema: Schema.Record(Schema.String, Schema.Struct({ count: Schema.Number })),
    inputs: [{ a: { count: 1 } }, { a: { count: "invalid" }, b: {} }, {}]
  },
  mixedRecord: {
    schema: Schema.StructWithRest(
      Schema.Struct({ fixed: Schema.Number }),
      [
        Schema.Record(Schema.TemplateLiteral(["data-", Schema.String]), Schema.Number),
        Schema.Record(Schema.Symbol, Schema.Number)
      ]
    ),
    inputs: [
      { fixed: 1, "data-a": 2, [key]: 3 },
      { fixed: 1, ignored: true },
      { fixed: 1, [key]: "invalid" }
    ]
  },
  numericRecord: {
    schema: Schema.Record(Schema.Union([Schema.Literal(1), Schema.Symbol]), Schema.String),
    inputs: [{ 1: "one", [key]: "symbol" }, { 1: "one", extra: true }, { 1: 1 }]
  },
  templateLiteral: {
    schema: Schema.TemplateLiteral(["count:", Schema.Int.check(Schema.isGreaterThan(0))]),
    inputs: ["count:1", "count:0", "count:1.5", "invalid", null]
  },
  templateLiteralParser: {
    schema: Schema.TemplateLiteralParser(["bit:", Schema.BooleanFromBit]),
    inputs: ["bit:1", "bit:0", "bit:true", null]
  },
  transformed: { schema: transformed, inputs: ["2", "-1", false] },
  checkedTransformedStruct: {
    schema: Schema.Struct({ value: transformed }).check(Schema.makeFilter((output) => {
      events.push("struct check")
      return output.value < 10 && Object.keys(output).length === 1
    })),
    inputs: [{ value: "2", extra: true }, { value: "12" }, { value: "-1" }, {}]
  },
  encodingCheckedTransformedStruct: {
    schema: Schema.Struct({ value: transformed }).pipe(
      Schema.flip,
      Schema.check(Schema.makeFilter((input) => {
        events.push("encoding check")
        return input.value !== "02"
      })),
      Schema.flip
    ),
    inputs: [{ value: "2" }, { value: "02" }, { value: "-1" }]
  },
  transformedStruct: {
    schema: Schema.Struct({ before: Schema.String, value: transformed, after: Schema.Boolean }),
    inputs: [
      { before: "a", value: "2", after: true },
      { before: "a", value: "-1", after: true },
      { before: "a", value: "2", after: "invalid" }
    ]
  },
  pureTransformedStruct: {
    schema: Schema.Struct({ value: pureTransformed }),
    inputs: [{ value: "2" }, { value: false }, { value: "invalid" }]
  },
  pureTransformedFields: {
    schema: Schema.Struct({
      first: sharedPureTransform,
      second: sharedPureTransform,
      incremented: pureTransform((input) => Number(input) + 1),
      doubled: pureTransform((input) => Number(input) * 2)
    }),
    inputs: [
      { first: "1", second: "2", incremented: "3", doubled: "4" },
      { first: false, second: "2", incremented: "3", doubled: "4" }
    ]
  },
  middleware: {
    schema: middleware,
    inputs: ["2", "-1", false]
  }
} satisfies Record<string, Fixture>

export const asyncFixture = {
  schema: Schema.Struct({ before: Schema.String, value: asynchronous, after: Schema.Boolean }).check(
    Schema.makeFilter((output) => {
      events.push("async struct check")
      return output.value < 10
    })
  ),
  inputs: [
    { before: "a", value: "2", after: true },
    { before: "a", value: "12", after: true },
    { before: "a", value: "-1", after: true },
    { before: "a", value: "2", after: "invalid" }
  ]
}

export let suspendEvaluations = 0
export const lazy = Schema.suspend(() => {
  suspendEvaluations++
  return Schema.Struct({ value: Schema.String })
})

export const proof = Schema.Struct({ value: Schema.String })

export const schemas: Readonly<Record<string, Schema.ConstraintDecoder<unknown>>> = {
  ...constructionSchemas,
  ...Object.fromEntries(Object.entries(synchronous).map(([name, fixture]) => [name, fixture.schema])),
  asynchronous: asyncFixture.schema,
  lazy,
  proofArray: Schema.Array(proof),
  proof
}

export const roots = [...Object.values(schemas).map((schema) => schema.ast), proof.ast]
