import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SchemaAST from "effect/SchemaAST"
import * as SchemaParser from "effect/SchemaParser"
import * as SchemaTransformation from "effect/SchemaTransformation"
import assert from "node:assert/strict"

export const person = () => Schema.Struct({ name: Schema.String, age: Schema.Number, active: Schema.Boolean })
export const input = { name: "Ada", age: 37, active: true }
const small = person()
const nested = Schema.Struct({ user: person(), tags: Schema.Array(Schema.String) })
const array = Schema.Array(person())
const arrayInput = Array.from({ length: 32 }, () => ({ ...input }))
const tuple = Schema.TupleWithRest(Schema.Tuple([Schema.String]), [Schema.Number, Schema.Boolean])
const tupleInput = ["head", ...Array.from({ length: 32 }, (_, i) => i), true]
const record = Schema.Record(Schema.String, person())
const recordInput = Object.fromEntries(arrayInput.map((value, i) => [String(i), value]))
const transformedKeyRecord = Schema.Record(
  Schema.String.pipe(Schema.decode(SchemaTransformation.snakeToCamel())),
  Schema.String
)
const transformedKeyRecordInput = Object.fromEntries(
  Array.from({ length: 32 }, (_, index) => [`field_${index}_value`, `value${index}`])
)
const transformedKeyRecordOutput = Object.fromEntries(
  Array.from({ length: 32 }, (_, index) => [`field${index}Value`, `value${index}`])
)
const union = Schema.Union(
  Array.from({ length: 8 }, (_, i) => Schema.Struct({ tag: Schema.Literal(i), value: Schema.Number }))
)
const oneOf = Schema.Union([Schema.Struct({ a: Schema.String }), Schema.Struct({ b: Schema.Number })], {
  mode: "oneOf"
})
const fields = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`v${i}`, Schema.NumberFromString]))
const transformed = Schema.Struct(fields)
const transformedInput = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`v${i}`, String(i)]))
const transformedOutput = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`v${i}`, i]))
const checkedTransform = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Number.check(Schema.isGreaterThan(0)),
    SchemaTransformation.transform({ decode: Number, encode: String })
  )
)
const rootTransform = Schema.FiniteFromString
const middleware = small.pipe(Schema.middlewareDecoding((effect) => effect))
const declaration = Schema.ReadonlySet(person())
const declarationInput = new Set(arrayInput)
interface Node {
  readonly value: number
  readonly children: ReadonlyArray<Node>
}
const recursive: Schema.Codec<Node> = Schema.Struct({
  value: Schema.Number,
  children: Schema.Array(Schema.suspend(() => recursive))
})
const node = (depth: number): Node => ({
  value: depth,
  children: depth === 0 ? [] : [node(depth - 1), node(depth - 1)]
})
const recursiveInput = node(4)
const suspendRoot = Schema.suspend(() => Schema.Struct({ value: Schema.Number }))
const defaults = Schema.Struct(
  Object.fromEntries(
    Array.from(
      { length: 32 },
      (_, i) => [`v${i}`, Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(i)))]
    )
  )
)

type Case = {
  schema: Schema.Constraint
  input: unknown
  expected: unknown
  operation?: "is" | "make" | "encode"
  invalid?: boolean
  options?: SchemaAST.ParseOptions
}

export const cases: Record<string, Case> = {
  parseValid: { schema: small, input, expected: input },
  parseExtra: { schema: small, input: { ...input, extra: 1 }, expected: input },
  parseInvalid: { schema: small, input: { ...input, age: "bad" }, expected: true, invalid: true },
  isValid: { schema: small, input, expected: true, operation: "is" },
  isInvalid: { schema: small, input: { ...input, age: "bad" }, expected: false, operation: "is" },
  encode: { schema: small, input, expected: input, operation: "encode" },
  strict: { schema: small, input, expected: input, options: { onExcessProperty: "error" } },
  nested: { schema: nested, input: { user: input, tags: ["a", "b"] }, expected: { user: input, tags: ["a", "b"] } },
  array: { schema: array, input: arrayInput, expected: arrayInput },
  arrayInvalid: { schema: array, input: [...arrayInput, { ...input, age: "bad" }], expected: true, invalid: true },
  tuple: { schema: tuple, input: tupleInput, expected: tupleInput },
  record: { schema: record, input: recordInput, expected: recordInput },
  recordTransformedKeys: {
    schema: transformedKeyRecord,
    input: transformedKeyRecordInput,
    expected: transformedKeyRecordOutput
  },
  union: { schema: union, input: { tag: 7, value: 1 }, expected: { tag: 7, value: 1 } },
  oneOf: { schema: oneOf, input: { b: 1 }, expected: { b: 1 } },
  transform: { schema: transformed, input: transformedInput, expected: transformedOutput },
  transformInvalid: { schema: checkedTransform, input: "-1", expected: true, invalid: true },
  rootTransform: { schema: rootTransform, input: "123", expected: 123 },
  middleware: { schema: middleware, input, expected: input },
  recursive: { schema: recursive, input: recursiveInput, expected: recursiveInput },
  suspendRoot: { schema: suspendRoot, input: { value: 1 }, expected: { value: 1 } },
  declaration: { schema: declaration, input: declarationInput, expected: declarationInput },
  makeStruct: { schema: defaults, input: {}, expected: transformedOutput, operation: "make" },
  makeArray: { schema: array, input: arrayInput, expected: arrayInput, operation: "make" },
  makeUnion: { schema: union, input: { tag: 7, value: 1 }, expected: { tag: 7, value: 1 }, operation: "make" }
}

export const targets = Object.values(cases).map(({ operation, schema }) =>
  operation === "encode"
    ? { ast: SchemaAST.flip(schema.ast), operations: ["decode"] as const }
    : operation === "is" || operation === "make"
    ? { ast: SchemaAST.toType(schema.ast), operations: [operation] as const }
    : { ast: schema.ast, operations: ["decode"] as const }
)
export const roots = targets.map((target) => target.ast)

export const fixture = (name: string) => {
  const { schema, input, expected, operation, invalid, options } = cases[name]
  const parse = operation === "is" ?
    SchemaParser.is(schema)
    : operation === "make" ?
    SchemaParser.make(schema)
    : operation === "encode" ?
    SchemaParser.encodeUnknownSync(schema as Schema.ConstraintEncoder<unknown>)
    : SchemaParser.decodeUnknownSync(schema as Schema.ConstraintDecoder<unknown>, options)
  return {
    run: invalid ?
      () => {
        try {
          parse(input)
          return false
        } catch {
          return true
        }
      } :
      () => parse(input),
    validate: (result: unknown) => assert.deepEqual(result, expected)
  }
}
