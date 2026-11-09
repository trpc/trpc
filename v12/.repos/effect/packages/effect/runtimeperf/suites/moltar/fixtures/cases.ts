import * as Schema from "effect/Schema"
import * as SchemaAST from "effect/SchemaAST"
import * as SchemaParser from "effect/SchemaParser"
import assert from "node:assert/strict"
import { invalidData, validData, validDataWithExtras } from "./data.ts"

export const schema = Schema.Struct({
  number: Schema.Number,
  negNumber: Schema.Number,
  maxNumber: Schema.Number,
  string: Schema.String,
  longString: Schema.String,
  boolean: Schema.Boolean,
  deeplyNested: Schema.Struct({
    foo: Schema.String,
    num: Schema.Number,
    bool: Schema.Boolean
  })
})

export const targets = [
  { ast: schema.ast, operations: ["decode"] },
  { ast: SchemaAST.toType(schema.ast), operations: ["is"] },
  { ast: SchemaAST.flip(schema.ast), operations: ["decode"] }
] as const
export const roots = targets.map((target) => target.ast)

const parseCase = (input: unknown, invalid = false) => () => {
  const parse = SchemaParser.decodeUnknownSync(schema)
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
    validate: invalid
      ? (result: unknown) => assert.equal(result, true)
      : (result: unknown) => assert.deepEqual(result, validData)
  }
}

const guardCase = (input: unknown, expected: boolean) => () => {
  const guard = SchemaParser.is(schema)
  return {
    run: expected
      ? () => {
        if (!guard(input)) throw new Error("Invalid")
        return true
      }
      : () => guard(input),
    validate: (result: unknown) => assert.equal(result, expected)
  }
}

export const parseValid = parseCase(validData)
export const parseExtraValid = parseCase(validDataWithExtras)
export const parseInvalid = parseCase(invalidData, true)
export const isValid = guardCase(validData, true)
export const isExtraValid = guardCase(validDataWithExtras, true)
export const isInvalid = guardCase(invalidData, false)
