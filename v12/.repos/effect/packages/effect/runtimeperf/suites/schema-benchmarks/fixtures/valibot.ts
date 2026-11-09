import assert from "node:assert/strict"
import * as v from "valibot"
import { invalidData, validData } from "./data.ts"

// Extracted from open-circle/schema-benchmarks at
// 11fab2a741cef95a1374910276023c51218c0683.

const makeSchema = () => {
  const image = v.object({
    id: v.number(),
    created: v.date(),
    title: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
    type: v.picklist(["jpg", "png"]),
    size: v.number(),
    url: v.pipe(v.string(), v.url())
  })
  const rating = v.object({
    id: v.number(),
    stars: v.pipe(v.number(), v.minValue(0), v.maxValue(5)),
    title: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
    text: v.pipe(v.string(), v.minLength(1), v.maxLength(1000)),
    images: v.array(image)
  })
  return v.object({
    id: v.number(),
    created: v.date(),
    title: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
    brand: v.pipe(v.string(), v.minLength(1), v.maxLength(30)),
    description: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
    price: v.pipe(v.number(), v.minValue(1), v.maxValue(10000)),
    discount: v.nullable(v.pipe(v.number(), v.minValue(1), v.maxValue(100))),
    quantity: v.pipe(v.number(), v.minValue(1), v.maxValue(10)),
    tags: v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(30))),
    images: v.array(image),
    ratings: v.array(rating)
  })
}

export const initializationSchema = () => ({
  run: makeSchema,
  validate: (schema) => assert.equal(schema.type, "object")
})

const validationCase = (input, expected) => () => {
  const schema = makeSchema()
  return {
    run: () => v.is(schema, input),
    validate: (result) => assert.equal(result, expected)
  }
}

export const validationValid = validationCase(validData, true)
export const validationInvalid = validationCase(invalidData, false)

const parsingCase = (input, options, success) => () => {
  const schema = makeSchema()
  return {
    run: () => v.safeParse(schema, input, options),
    validate: (result) => {
      assert.equal(result.success, success)
      if (success) assert.deepEqual(result.output, validData)
    }
  }
}

export const parsingAllValid = parsingCase(validData, undefined, true)
export const parsingAllInvalid = parsingCase(invalidData, undefined, false)
export const parsingFirstValid = parsingCase(validData, { abortEarly: true }, true)
export const parsingFirstInvalid = parsingCase(invalidData, { abortEarly: true }, false)

const standardCase = (input, success) => () => {
  const schema = makeSchema()
  return {
    run: () => schema["~standard"].validate(input),
    validate: (result) => {
      assert.equal(typeof result?.then, "undefined")
      assert.equal(result.issues === undefined, success)
      if (success) assert.deepEqual(result.value, validData)
    }
  }
}

export const standardAllValid = standardCase(validData, true)
export const standardAllInvalid = standardCase(invalidData, false)
