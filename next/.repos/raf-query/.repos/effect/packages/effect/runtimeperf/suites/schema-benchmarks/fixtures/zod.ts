import assert from "node:assert/strict"
import { z } from "zod/v4"
import { invalidData, validData } from "./data.ts"

// Extracted from open-circle/schema-benchmarks at
// 11fab2a741cef95a1374910276023c51218c0683.

const makeSchema = () => {
  const image = z.object({
    id: z.number(),
    created: z.date(),
    title: z.string().min(1).max(100),
    type: z.enum(["jpg", "png"]),
    size: z.number(),
    url: z.url()
  })
  const rating = z.object({
    id: z.number(),
    stars: z.number().min(0).max(5),
    title: z.string().min(1).max(100),
    text: z.string().min(1).max(1000),
    images: z.array(image)
  })
  return z.object({
    id: z.number(),
    created: z.date(),
    title: z.string().min(1).max(100),
    brand: z.string().min(1).max(30),
    description: z.string().min(1).max(500),
    price: z.number().min(1).max(10000),
    discount: z.number().min(1).max(100).nullable(),
    quantity: z.number().min(1).max(10),
    tags: z.array(z.string().min(1).max(30)),
    images: z.array(image),
    ratings: z.array(rating)
  })
}

export const initializationSchema = () => ({
  run: makeSchema,
  validate: (schema) => assert.equal(schema.type, "object")
})

const parsingCase = (input, success) => () => {
  const schema = makeSchema()
  const options = { jitless: true }
  return {
    run: () => schema.safeParse(input, options),
    validate: (result) => {
      assert.equal(result.success, success)
      if (success) assert.deepEqual(result.data, validData)
    }
  }
}

export const parsingAllValid = parsingCase(validData, true)
export const parsingAllInvalid = parsingCase(invalidData, false)

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

const codec = z.codec(z.string(), z.bigint(), {
  decode: (value) => BigInt(value),
  encode: (value) => value.toString()
})
const bigint = BigInt("1234567890123456789")
const bigintString = bigint.toString()

export const codecTypedEncode = () => ({
  run: () => codec.encode(bigint),
  validate: (result) => assert.equal(result, bigintString)
})

export const codecTypedDecode = () => ({
  run: () => codec.decode(bigintString),
  validate: (result) => assert.equal(result, bigint)
})
