import * as Str from "effect/String"
import assert from "node:assert/strict"
import * as v from "valibot"

const person = () => v.object({ name: v.string(), age: v.number(), active: v.boolean() })
const input = { name: "Ada", age: 37, active: true }
const small = person()
const arraySchema = v.array(person())
const arrayInput = Array.from({ length: 32 }, () => ({ ...input }))
const recordSchema = v.record(v.string(), person())
const recordInput = Object.fromEntries(arrayInput.map((value, i) => [String(i), value]))
const transformedKeyRecordSchema = v.record(
  v.pipe(v.string(), v.transform(Str.snakeToCamel)),
  v.string()
)
const transformedKeyRecordInput = Object.fromEntries(
  Array.from({ length: 32 }, (_, i) => [`field_${i}_value`, String(i)])
)
const transformedKeyRecordOutput = Object.fromEntries(
  Array.from({ length: 32 }, (_, i) => [`field${i}Value`, String(i)])
)
const unionSchema = v.variant(
  "tag",
  Array.from({ length: 8 }, (_, i) => v.object({ tag: v.literal(i), value: v.number() }))
)
const transformedSchema = v.object(
  Object.fromEntries(
    Array.from({ length: 32 }, (_, i) => [`v${i}`, v.pipe(v.string(), v.transform(Number))])
  )
)
const transformedInput = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`v${i}`, String(i)]))
const transformedOutput = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`v${i}`, i]))
const defaultsSchema = v.object(
  Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`v${i}`, v.optional(v.number(), i)]))
)

type Case = {
  readonly schema: v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>
  readonly input: unknown
  readonly expected: unknown
  readonly operation?: "is" | "make"
  readonly invalid?: boolean
}

const cases: Record<string, Case> = {
  parseValid: { schema: small, input, expected: input },
  parseInvalid: { schema: small, input: { ...input, age: "bad" }, expected: true, invalid: true },
  isValid: { schema: small, input, expected: true, operation: "is" },
  isInvalid: { schema: small, input: { ...input, age: "bad" }, expected: false, operation: "is" },
  array: { schema: arraySchema, input: arrayInput, expected: arrayInput },
  record: { schema: recordSchema, input: recordInput, expected: recordInput },
  recordTransformedKeys: {
    schema: transformedKeyRecordSchema,
    input: transformedKeyRecordInput,
    expected: transformedKeyRecordOutput
  },
  union: { schema: unionSchema, input: { tag: 7, value: 1 }, expected: { tag: 7, value: 1 } },
  transform: { schema: transformedSchema, input: transformedInput, expected: transformedOutput },
  makeStruct: { schema: defaultsSchema, input: {}, expected: transformedOutput, operation: "make" },
  makeArray: { schema: arraySchema, input: arrayInput, expected: arrayInput, operation: "make" }
}

const fixture = (name: string) => {
  const { schema, input, expected, operation, invalid } = cases[name]
  const parse = operation === "is"
    ? (input: unknown) => v.is(schema, input)
    : (input: unknown) => v.parse(schema, input)
  return {
    run: invalid
      ? () => {
        try {
          parse(input)
          return false
        } catch {
          return true
        }
      }
      : () => parse(input),
    validate: (result: unknown) => assert.deepEqual(result, expected)
  }
}

export const parseValid = () => fixture("parseValid")
export const parseInvalid = () => fixture("parseInvalid")
export const isValid = () => fixture("isValid")
export const isInvalid = () => fixture("isInvalid")
export const array = () => fixture("array")
export const record = () => fixture("record")
export const recordTransformedKeys = () => fixture("recordTransformedKeys")
export const union = () => fixture("union")
export const transform = () => fixture("transform")
export const makeStruct = () => fixture("makeStruct")
export const makeArray = () => fixture("makeArray")
