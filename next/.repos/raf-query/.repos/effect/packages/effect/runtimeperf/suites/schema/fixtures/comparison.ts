import * as Schema from "effect/Schema"
import * as SchemaParser from "effect/SchemaParser"
import assert from "node:assert/strict"

const effectCase = (schema, input, success) => () => {
  const run = SchemaParser.decodeUnknownExit(schema)
  return {
    run: () => run(input),
    validate: (result) => {
      assert.equal(result._tag, success ? "Success" : "Failure")
      if (success) assert.deepEqual(result.value, input)
    }
  }
}

const makeObjectInput = (size) =>
  Object.fromEntries(Array.from({ length: size }, (_, index) => [`field${index}`, `value${index}`]))

const makeInvalidLastObjectInput = (size) => ({
  ...makeObjectInput(size),
  [`field${size - 1}`]: 1
})

const object32 = makeObjectInput(32)
const object32InvalidLast = makeInvalidLastObjectInput(32)
const effectObject32 = Schema.Struct(
  Object.fromEntries(Array.from({ length: 32 }, (_, index) => [`field${index}`, Schema.String]))
)

export const effectObject32Valid = effectCase(effectObject32, object32, true)
export const effectObject32InvalidLast = effectCase(effectObject32, object32InvalidLast, false)

const array32 = Array.from({ length: 32 }, (_, index) => `value${index}`)
const array32InvalidLast = array32.slice()
array32InvalidLast[array32InvalidLast.length - 1] = 1
const effectArray32 = Schema.Array(Schema.String)

export const effectArray32Valid = effectCase(effectArray32, array32, true)
export const effectArray32InvalidLast = effectCase(effectArray32, array32InvalidLast, false)

const record32 = makeObjectInput(32)
const record32InvalidLast = makeInvalidLastObjectInput(32)
const effectRecord32 = Schema.Record(Schema.String, Schema.String)

export const effectRecord32Valid = effectCase(effectRecord32, record32, true)
export const effectRecord32InvalidLast = effectCase(effectRecord32, record32InvalidLast, false)

const literalValues = Array.from({ length: 100 }, (_, index) => `value${index}`)
const effectLiteral100 = Schema.Literals(literalValues)

export const effectLiteral100ValidLast = effectCase(effectLiteral100, "value99", true)
export const effectLiteral100Invalid = effectCase(effectLiteral100, "missing", false)

const makeEffectTaggedMember = (index) =>
  Schema.Struct({
    kind: Schema.Literal(`kind${index}`),
    a: Schema.String,
    b: Schema.Number,
    c: Schema.Boolean
  })

const taggedInput = { kind: "kind99", a: "a", b: 1, c: true }
const taggedInvalidSelected = { kind: "kind99", a: "a", b: 1, c: "invalid" }
const taggedInvalidTag = { kind: "missing", a: "a", b: 1, c: true }
const effectTagged100 = Schema.Union(
  Array.from({ length: 100 }, (_, index) => makeEffectTaggedMember(index))
)

export const effectTagged100ValidLast = effectCase(effectTagged100, taggedInput, true)
export const effectTagged100InvalidSelected = effectCase(effectTagged100, taggedInvalidSelected, false)
export const effectTagged100InvalidTag = effectCase(effectTagged100, taggedInvalidTag, false)

const makeEffectMultiSentinelMember = (index) =>
  Schema.Struct({
    kind: Schema.Literal("shared"),
    variant: Schema.Literal(`variant${index}`),
    value: Schema.String
  })

const effectMultiSentinel100 = Schema.Union(
  Array.from({ length: 100 }, (_, index) => makeEffectMultiSentinelMember(index))
)
const multiSentinelValidFirst = { kind: "shared", variant: "variant0", value: "value" }
const multiSentinelInvalidVariant = { kind: "shared", variant: "missing", value: "value" }

export const effectMultiSentinel100ValidFirst = effectCase(effectMultiSentinel100, multiSentinelValidFirst, true)
export const effectMultiSentinel100InvalidVariant = effectCase(
  effectMultiSentinel100,
  multiSentinelInvalidVariant,
  false
)
