import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import assert from "node:assert/strict"
import { invalidData, validData } from "./data.ts"

// Extracted from open-circle/schema-benchmarks at
// 11fab2a741cef95a1374910276023c51218c0683.

const makeSchema = () => {
  const Image = Schema.Struct({
    id: Schema.Number,
    created: Schema.instanceOf(Date),
    title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    type: Schema.Literals(["jpg", "png"]),
    size: Schema.Number,
    url: Schema.String.check(Schema.makeFilter((value) => URL.canParse(value)))
  })
  const Rating = Schema.Struct({
    id: Schema.Number,
    stars: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(5)),
    title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    text: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1000)),
    images: Schema.mutable(Schema.Array(Image))
  })
  return Schema.Struct({
    id: Schema.Number,
    created: Schema.instanceOf(Date),
    title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    brand: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(30)),
    description: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(500)),
    price: Schema.Number.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(10000)),
    discount: Schema.NullOr(
      Schema.Number.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(100))
    ),
    quantity: Schema.Number.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(10)),
    tags: Schema.mutable(
      Schema.Array(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(30)))
    ),
    images: Schema.mutable(Schema.Array(Image)),
    ratings: Schema.mutable(Schema.Array(Rating))
  })
}

export const initializationSchema = () => ({
  run: makeSchema,
  validate: (schema) => assert.equal(schema.ast._tag, "Objects")
})

export const initializationDecoder = () => ({
  run: () => Schema.decodeUnknownOption(makeSchema()),
  validate: (decode) => assert.equal(typeof decode, "function")
})

const validationCase = (input, expected) => () => {
  const run = Schema.is(makeSchema())
  return {
    run: () => run(input),
    validate: (result) => assert.equal(result, expected)
  }
}

export const validationValid = validationCase(validData, true)
export const validationInvalid = validationCase(invalidData, false)

const parsingCase = (input, errors, success) => () => {
  const run = Schema.decodeUnknownOption(makeSchema())
  return {
    run: () => run(input, { errors }),
    validate: (result) => {
      assert.equal(Option.isSome(result), success)
      if (success && Option.isSome(result)) assert.deepEqual(result.value, validData)
    }
  }
}

export const parsingAllValid = parsingCase(validData, "all", true)
export const parsingAllInvalid = parsingCase(invalidData, "all", false)
export const parsingFirstValid = parsingCase(validData, "first", true)
export const parsingFirstInvalid = parsingCase(invalidData, "first", false)

const standardCase = (input, errors, success) => () => {
  const schema = Schema.toStandardSchemaV1(makeSchema(), { parseOptions: { errors } })
  return {
    run: () => schema["~standard"].validate(input),
    validate: (result) => {
      assert.equal(typeof result?.then, "undefined")
      if (success) {
        assert.equal(result.issues, undefined)
        assert.deepEqual(result.value, validData)
      } else {
        assert.ok(result.issues)
        assert.ok(result.issues.length > 0)
      }
    }
  }
}

export const standardAllValid = standardCase(validData, "all", true)
export const standardAllInvalid = standardCase(invalidData, "all", false)
export const standardFirstValid = standardCase(validData, "first", true)
export const standardFirstInvalid = standardCase(invalidData, "first", false)

const bigint = BigInt("1234567890123456789")
const bigintString = bigint.toString()

export const codecTypedEncode = () => {
  const run = Schema.encodeSync(Schema.BigIntFromString)
  return {
    run: () => run(bigint),
    validate: (result) => assert.equal(result, bigintString)
  }
}

export const codecTypedDecode = () => {
  const run = Schema.decodeSync(Schema.BigIntFromString)
  return {
    run: () => run(bigintString),
    validate: (result) => assert.equal(result, bigint)
  }
}

export const codecUnknownEncode = () => {
  const run = Schema.encodeUnknownSync(Schema.BigIntFromString)
  return {
    run: () => run(bigint),
    validate: (result) => assert.equal(result, bigintString)
  }
}

export const codecUnknownDecode = () => {
  const run = Schema.decodeUnknownSync(Schema.BigIntFromString)
  return {
    run: () => run(bigintString),
    validate: (result) => assert.equal(result, bigint)
  }
}
