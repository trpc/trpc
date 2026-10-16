import assert from "node:assert/strict"
import * as z from "zod/v4"
import { invalidData, validData, validDataWithExtras } from "./data.ts"

const makeShape = () => ({
  number: z.number(),
  negNumber: z.number(),
  maxNumber: z.number(),
  string: z.string(),
  longString: z.string(),
  boolean: z.boolean(),
  deeplyNested: z.object({
    foo: z.string(),
    num: z.number(),
    bool: z.boolean()
  })
})

const makeParseSchema = () => z.object(makeShape())
const makeGuardSchema = () => {
  const shape = makeShape()
  return z.object({ ...shape, deeplyNested: shape.deeplyNested.passthrough() }).passthrough()
}

const parseCase = (
  compile: (schema: ReturnType<typeof makeParseSchema>) => (input: unknown) => unknown,
  input: unknown,
  invalid = false
) =>
() => {
  const parse = compile(makeParseSchema())
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

const guardCase = (
  compile: (schema: ReturnType<typeof makeGuardSchema>) => (input: unknown) => boolean,
  input: unknown,
  expected: boolean
) =>
() => {
  const validate = compile(makeGuardSchema())
  return {
    run: expected
      ? () => {
        if (!validate(input)) throw new Error("Invalid")
        return true
      }
      : () => validate(input),
    validate: (result: unknown) => assert.equal(result, expected)
  }
}

const assertParseCase = (
  compile: (schema: ReturnType<typeof makeGuardSchema>) => (input: unknown) => unknown,
  input: unknown
) =>
() => {
  const parse = compile(makeGuardSchema())
  return {
    run: () => {
      parse(input)
      return true
    },
    validate: (result: unknown) => assert.equal(result, true)
  }
}

const parse = (schema: ReturnType<typeof makeParseSchema>) => (input: unknown) => schema.parse(input)
const parseJitless = (schema: ReturnType<typeof makeParseSchema>) => (input: unknown) =>
  schema.parse(input, { jitless: true })
const parseCompiled = (schema: ReturnType<typeof makeParseSchema>) => {
  const compiled = z.compile(schema, { strict: true })
  return (input: unknown) => compiled.parse(input)
}
const validate = (schema: ReturnType<typeof makeGuardSchema>) => (input: unknown) => z.validate(schema, input)
const validateJitless = (schema: ReturnType<typeof makeGuardSchema>) => (input: unknown) =>
  z.validate(schema, input, { jitless: true })
const validateCompiled = (schema: ReturnType<typeof makeGuardSchema>) => {
  const compiled = z.compile(schema, { strict: true })
  return (input: unknown) => z.validate(compiled, input)
}
const assertParse = (schema: ReturnType<typeof makeGuardSchema>) => (input: unknown) => schema.parse(input)

export const parseValid = parseCase(parse, validData)
export const parseExtraValid = parseCase(parse, validDataWithExtras)
export const parseInvalid = parseCase(parse, invalidData, true)
export const parseJitlessValid = parseCase(parseJitless, validData)
export const parseJitlessExtraValid = parseCase(parseJitless, validDataWithExtras)
export const parseJitlessInvalid = parseCase(parseJitless, invalidData, true)
export const parseCompiledValid = parseCase(parseCompiled, validData)
export const parseCompiledExtraValid = parseCase(parseCompiled, validDataWithExtras)
export const parseCompiledInvalid = parseCase(parseCompiled, invalidData, true)
export const isValid = guardCase(validate, validData, true)
export const isExtraValid = guardCase(validate, validDataWithExtras, true)
export const isInvalid = guardCase(validate, invalidData, false)
export const isJitlessValid = guardCase(validateJitless, validData, true)
export const isJitlessExtraValid = guardCase(validateJitless, validDataWithExtras, true)
export const isJitlessInvalid = guardCase(validateJitless, invalidData, false)
export const isCompiledValid = guardCase(validateCompiled, validData, true)
export const isCompiledExtraValid = guardCase(validateCompiled, validDataWithExtras, true)
export const isCompiledInvalid = guardCase(validateCompiled, invalidData, false)
export const assertParseValid = assertParseCase(assertParse, validData)
export const assertParseExtraValid = assertParseCase(assertParse, validDataWithExtras)
