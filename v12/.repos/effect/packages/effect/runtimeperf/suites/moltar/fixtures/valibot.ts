import assert from "node:assert/strict"
import * as v from "valibot"
import { invalidData, validData, validDataWithExtras } from "./data.ts"

const shape = {
  number: v.number(),
  negNumber: v.number(),
  maxNumber: v.number(),
  string: v.string(),
  longString: v.string(),
  boolean: v.boolean(),
  deeplyNested: v.object({
    foo: v.string(),
    num: v.number(),
    bool: v.boolean()
  })
}

const parseSchema = v.object(shape)
const guardSchema = v.looseObject({ ...shape, deeplyNested: v.looseObject(shape.deeplyNested.entries) })

const parseCase = (input: unknown, invalid = false) => () => ({
  run: invalid
    ? () => {
      try {
        v.parse(parseSchema, input)
        return false
      } catch {
        return true
      }
    }
    : () => v.parse(parseSchema, input),
  validate: invalid
    ? (result: unknown) => assert.equal(result, true)
    : (result: unknown) => assert.deepEqual(result, validData)
})

const guardCase = (input: unknown, expected: boolean) => () => ({
  run: expected
    ? () => {
      if (!v.is(guardSchema, input)) throw new Error("Invalid")
      return true
    }
    : () => v.is(guardSchema, input),
  validate: (result: unknown) => assert.equal(result, expected)
})

export const parseValid = parseCase(validData)
export const parseExtraValid = parseCase(validDataWithExtras)
export const parseInvalid = parseCase(invalidData, true)
export const isValid = guardCase(validData, true)
export const isExtraValid = guardCase(validDataWithExtras, true)
export const isInvalid = guardCase(invalidData, false)
