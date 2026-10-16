import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SchemaGetter from "effect/SchemaGetter"
import * as SchemaParser from "effect/SchemaParser"
import * as SchemaTransformation from "effect/SchemaTransformation"
import assert from "node:assert/strict"

const decodeCase = (schema, input, success, options) => () => {
  const run = Schema.decodeUnknownExit(schema, options)
  const isOutput = success ? Schema.is(schema) : undefined
  return {
    run: () => run(input),
    validate: (result) => {
      assert.equal(result._tag, success ? "Success" : "Failure")
      if (result._tag === "Success") assert.equal(isOutput?.(result.value), true)
    }
  }
}

const decodeParserCase = (schema, input, success, options) => () => {
  const run = SchemaParser.decodeUnknownExit(schema, options)
  const isOutput = success ? Schema.is(schema) : undefined
  return {
    run: () => run(input),
    validate: (result) => {
      assert.equal(result._tag, success ? "Success" : "Failure")
      if (result._tag === "Success") assert.equal(isOutput?.(result.value), true)
    }
  }
}

const encodeParserCase = (schema, input, success, options) => () => {
  const run = SchemaParser.encodeUnknownExit(schema, options)
  const isOutput = success ? Schema.is(Schema.flip(schema)) : undefined
  return {
    run: () => run(input),
    validate: (result) => {
      assert.equal(result._tag, success ? "Success" : "Failure")
      if (result._tag === "Success") assert.equal(isOutput?.(result.value), true)
    }
  }
}

const checkedString = Schema.String
  .check(Schema.isMinLength(2))
  .check(Schema.isPattern(/^[a-z]+$/))

export const checksInvalidFirst = decodeParserCase(checkedString, "", false)
export const checksInvalidLast = decodeParserCase(checkedString, "runtime-perf", false)

const encodingCheckedString = Schema.String.pipe(
  Schema.flip,
  Schema.check(Schema.isMinLength(2)),
  Schema.flip
)

export const encodingCheckValid = decodeParserCase(encodingCheckedString, "runtimeperf", true)

const templateLiteralLinear = Schema.TemplateLiteralParser([
  "prefix-",
  Schema.String,
  "-middle-",
  Schema.Number,
  "-suffix"
])

export const templateLiteralLinearValid = decodeParserCase(
  templateLiteralLinear,
  "prefix-value-middle-123-suffix",
  true
)
export const templateLiteralLinearInvalid = decodeParserCase(
  templateLiteralLinear,
  "prefix-value-middle-invalid",
  false
)

const templateLiteralBacktracking = Schema.TemplateLiteralParser([
  Schema.String,
  ":",
  Schema.NonEmptyString,
  "x"
])

export const templateLiteralBacktrackingValid = decodeParserCase(
  templateLiteralBacktracking,
  "a:b:x",
  true
)
export const templateLiteralBacktrackingInvalid = decodeParserCase(
  templateLiteralBacktracking,
  "a:x",
  false
)

export const templateLiteralTransformedValid = decodeParserCase(
  Schema.TemplateLiteralParser([Schema.FiniteFromString, "a", Schema.NonEmptyString]),
  "100ab23a",
  true
)

const templateLiteralRecordInput = Object.fromEntries(
  Array.from({ length: 32 }, (_, index) => [`field-${index}`, `value${index}`])
)

export const templateLiteralRecord32Valid = decodeParserCase(
  Schema.Record(Schema.TemplateLiteral(["field-", Schema.Number]), Schema.String),
  templateLiteralRecordInput,
  true
)

export const transformationDecodeValid = decodeParserCase(Schema.FiniteFromString, "123", true)
export const transformationDecodeInvalid = decodeParserCase(Schema.FiniteFromString, "invalid", false)
export const transformationEncodeValid = encodeParserCase(Schema.FiniteFromString, 123, true)

const makeEncodingChain = (size) => {
  let schema = Schema.FiniteFromString
  for (let i = 1; i < size; i++) {
    schema = Schema.String.pipe(
      Schema.decodeTo(schema, SchemaTransformation.passthrough())
    )
  }
  return schema
}

const encodingChain8 = makeEncodingChain(8)

export const encodingChain8DecodeValid = decodeParserCase(encodingChain8, "123", true)
export const encodingChain8DecodeInvalid = decodeParserCase(encodingChain8, "invalid", false)
export const encodingChain8EncodeValid = encodeParserCase(encodingChain8, 123, true)

const transformedKeyRecord = Schema.Record(
  Schema.String.pipe(Schema.decode(SchemaTransformation.snakeToCamel())),
  Schema.String
)
const transformedKeyRecordInput = Object.fromEntries(
  Array.from({ length: 32 }, (_, index) => [`field_${index}_value`, `value${index}`])
)

export const transformedKeyRecordValid = decodeParserCase(
  transformedKeyRecord,
  transformedKeyRecordInput,
  true
)

const optionalStruct = Schema.Struct({
  required: Schema.String,
  optionalKey: Schema.optionalKey(Schema.String),
  optionalValue: Schema.optional(Schema.String)
})

export const optionalValid = decodeCase(optionalStruct, { required: "value" }, true)
export const optionalPresentValid = decodeCase(
  optionalStruct,
  { required: "value", optionalKey: "key", optionalValue: "value" },
  true
)
export const optionalPresentInvalid = decodeCase(optionalStruct, { required: "value", optionalKey: 1 }, false)

const suspendedString = Schema.String.pipe(Schema.decode({
  decode: SchemaGetter.transformOptionalEffect((input) => Effect.suspend(() => Effect.succeed(input))),
  encode: SchemaGetter.passthrough()
}))
const suspendedObjectFields = Object.fromEntries(
  Array.from({ length: 32 }, (_, index) => [`field${index}`, index === 16 ? suspendedString : Schema.String])
)
const suspendedObjectInput = Object.fromEntries(
  Array.from({ length: 32 }, (_, index) => [`field${index}`, `value${index}`])
)

export const object32SuspendedMiddleValid = decodeParserCase(
  Schema.Struct(suspendedObjectFields),
  suspendedObjectInput,
  true
)

const suspendedArrayInput = Array.from({ length: 32 }, (_, index) => `value${index}`)
const suspendedObjectAllFields = Object.fromEntries(
  Array.from({ length: 32 }, (_, index) => [`field${index}`, suspendedString])
)

export const array32SuspendedConcurrent4 = decodeParserCase(
  Schema.Array(suspendedString),
  suspendedArrayInput,
  true,
  { concurrency: 4 }
)

export const object32SuspendedConcurrent4 = decodeParserCase(
  Schema.Struct(suspendedObjectAllFields),
  suspendedObjectInput,
  true,
  { concurrency: 4 }
)

export const record32SuspendedConcurrent4 = decodeParserCase(
  Schema.Record(Schema.String, suspendedString),
  suspendedObjectInput,
  true,
  { concurrency: 4 }
)

const literal2 = Schema.Literals(["value0", "value1"])
const literal100 = Schema.Literals(Array.from({ length: 100 }, (_, index) => `value${index}`))
const homogeneousUnion100 = Schema.Union(
  Array.from(
    { length: 100 },
    (_, index) => Schema.String.check(Schema.makeFilter((value) => value === `value${index}`))
  )
)
const tagged2 = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("a"), value: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("b"), value: Schema.String })
])
const taggedWithFallback = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("a"), value: Schema.String }),
  Schema.Struct({ value: Schema.String })
])

export const literal2ValidLast = decodeParserCase(literal2, "value1", true)
export const literal100ValidFirst = decodeParserCase(literal100, "value0", true)
export const homogeneousUnion100Invalid = decodeParserCase(homogeneousUnion100, "missing", false)
export const tagged2ValidLast = decodeParserCase(tagged2, { kind: "b", value: "value" }, true)
export const taggedWithFallbackValid = decodeParserCase(
  taggedWithFallback,
  { kind: "a", value: "value" },
  true
)

const recursiveTree = Schema.Struct({
  value: Schema.String,
  children: Schema.Array(Schema.suspend(() => recursiveTree))
})

const makeTree = (depth) =>
  depth === 0
    ? { value: "leaf", children: [] }
    : { value: `node${depth}`, children: [makeTree(depth - 1)] }

export const recursiveTreeDepth16Valid = decodeCase(recursiveTree, makeTree(16), true)
