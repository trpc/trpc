import { Effect, Schema, SchemaAST } from "effect"

export const constructionEvents: Array<string> = []
const value = Schema.Number.pipe(Schema.withConstructorDefault(Effect.sync(() => {
  constructionEvents.push("default")
  return 1
})))
export class Constructed extends Schema.TaggedClass<Constructed>()("Constructed", {
  value
}) {
  readonly initialized = constructionEvents.push("class") > 0
}

export const constructionCases = {
  struct: {
    schema: Schema.Struct({ value, optional: Schema.optionalKey(Schema.String) })
      .check(Schema.makeFilter((input) => {
        constructionEvents.push("check")
        return input.value > 0
      })),
    inputs: [{}, { value: undefined }, { value: -1 }, { value: "bad", optional: 1 }, { value: 2, extra: true }]
  },
  array: { schema: Schema.Array(value), inputs: [[undefined, 2], ["bad", 3], null] },
  tuple: {
    schema: Schema.TupleWithRest(Schema.Tuple([value]), [Schema.String, Schema.Boolean]),
    inputs: [[], [undefined, "a", true], ["bad", 1, false], [1, true]]
  },
  optionalTuple: {
    schema: Schema.Tuple([Schema.optionalKey(Schema.Undefined)]),
    inputs: [[], [undefined], [1], [undefined, 2]]
  },
  record: { schema: Schema.Record(Schema.String, value), inputs: [{ a: undefined }, { a: "bad", b: "bad" }, {}, null] },
  mixedRecord: {
    schema: Schema.StructWithRest(Schema.Struct({ value }), [
      Schema.Record(Schema.TemplateLiteral(["x-", Schema.String]), Schema.Number)
    ]),
    inputs: [{}, { value: 1, "x-a": 2 }, { value: "bad", "x-a": "bad", extra: true }]
  },
  union: {
    schema: Schema.Union([
      Schema.Struct({ _tag: Schema.tag("A"), value }),
      Schema.Struct({ _tag: Schema.tag("B"), text: Schema.String })
    ]),
    inputs: [{}, { text: "a" }, { _tag: "A", value: "bad" }, { _tag: "C" }]
  },
  oneOf: { schema: Schema.Union([Schema.String, Schema.Literal("a")], { mode: "oneOf" }), inputs: ["a", "b", 1] },
  class: {
    schema: Constructed,
    inputs: [{}, { value: undefined }, { value: -1 }, { value: "bad" }, { _tag: "wrong" }]
  },
  transformed: {
    schema: Schema.Struct({ value: Schema.FiniteFromString.pipe(Schema.withConstructorDefault(Effect.succeed(1))) }),
    inputs: [{}, { value: "1" }, { value: 2 }]
  },
  declaration: { schema: Schema.ReadonlySet(Schema.Number), inputs: [new Set([1]), new Set(["bad"]), null] },
  empty: { schema: Schema.Struct({}), inputs: [{}, 1, [], null] }
} satisfies Record<string, { readonly schema: Schema.Constraint; readonly inputs: ReadonlyArray<unknown> }>

export const constructionSchemas = Object.fromEntries(
  Object.entries(constructionCases).map((
    [name, test]
  ) => [`construct-${name}`, Schema.make(SchemaAST.toType(test.schema.ast))])
)

export const constructionOptions: ReadonlyArray<SchemaAST.ParseOptions | undefined> = [
  undefined,
  { errors: "all", reportInput: true },
  { onExcessProperty: "error" },
  { disableChecks: true }
]
