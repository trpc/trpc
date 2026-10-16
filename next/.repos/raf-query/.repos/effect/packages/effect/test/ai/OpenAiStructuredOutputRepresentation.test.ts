import { assert, describe, it } from "@effect/vitest"
import { type JsonSchema, Schema } from "effect"
import { toCodecOpenAI } from "effect/ai/OpenAiStructuredOutput"
import { TestSchema } from "effect/testing"

function getValueSchema(jsonSchema: JsonSchema.JsonSchema): JsonSchema.JsonSchema {
  return (jsonSchema.properties as Record<string, JsonSchema.JsonSchema>).value
}

function toValueSchema(schema: Schema.Constraint): JsonSchema.JsonSchema {
  return getValueSchema(toCodecOpenAI(Schema.Struct({ value: schema })).jsonSchema)
}

describe("OpenAiStructuredOutput representation v2", () => {
  it("projects the encoded side before JSON Schema generation", () => {
    assert.strictEqual(toValueSchema(Schema.FiniteFromString).type, "string")
  })

  it("keeps supported custom JSON Schema filters with a description", () => {
    const schema = Schema.String.check(Schema.makeFilter<string>((value) => value.startsWith("a"), {
      description: "starts with a",
      representation: {
        id: "test/ai/openai/startsWithA",
        payload: null
      },
      toJsonSchema: () => ({ pattern: "^a" })
    }))

    assert.deepStrictEqual(toValueSchema(schema), {
      type: "string",
      description: "starts with a",
      pattern: "^a"
    })
  })

  it("drops unsupported custom JSON Schema filters with a description", async () => {
    const schema = Schema.String.check(Schema.makeFilter<string>((value) => value.length >= 2, {
      description: "at least two characters",
      representation: {
        id: "test/ai/openai/minTwoCharactersWithDescription",
        payload: null
      },
      toJsonSchema: () => ({ minLength: 2 })
    }))

    const result = toCodecOpenAI(Schema.Struct({ value: schema }))
    assert.deepStrictEqual(getValueSchema(result.jsonSchema), {
      type: "string",
      description: "at least two characters"
    })
    await new TestSchema.Asserts(result.codec).decoding().fail(
      { value: "a" },
      `Expected <filter>
  at ["value"]`
    )
  })

  it("keeps supported custom JSON Schema filters without a description", () => {
    const schema = Schema.String.check(Schema.makeFilter<string>((value) => value.startsWith("a"), {
      representation: {
        id: "test/ai/openai/startsWithAWithoutDescription",
        payload: null
      },
      toJsonSchema: () => ({ pattern: "^a" })
    }))

    assert.deepStrictEqual(toValueSchema(schema), {
      type: "string",
      pattern: "^a"
    })
  })

  it("drops unsupported custom JSON Schema filters without a description", () => {
    const schema = Schema.String.check(Schema.makeFilter<string>((value) => value.length >= 2, {
      representation: {
        id: "test/ai/openai/minTwoCharactersWithoutDescription",
        payload: null
      },
      toJsonSchema: () => ({ minLength: 2 })
    }))

    assert.deepStrictEqual(toValueSchema(schema), {
      type: "string"
    })
  })

  it("invokes custom JSON Schema callbacks only with compiler inputs", () => {
    let invocations = 0
    const schema = Schema.String.check(Schema.makeFilter<string>(() => true, {
      representation: {
        id: "test/ai/openai/compilerInputs",
        payload: null,
        schemas: [Schema.Finite.ast]
      },
      toJsonSchema: ({ type, schemas }) => {
        invocations++
        assert.strictEqual(type, "string")
        assert.strictEqual(schemas.length, 1)
        assert.strictEqual(schemas[0].type, "number")
        return { pattern: "^a" }
      }
    }))

    assert.deepStrictEqual(toValueSchema(schema), {
      type: "string",
      pattern: "^a"
    })
    assert.strictEqual(invocations, 1)
  })

  it("compiles custom callbacks after structural transformations", () => {
    let invocations = 0
    const schema = Schema.Record(Schema.String, Schema.Finite).check(
      Schema.makeFilter<object>(() => true, {
        representation: {
          id: "test/ai/openai/structuralCompilerInput",
          payload: null
        },
        toJsonSchema: ({ type }) => {
          invocations++
          assert.strictEqual(type, "array")
          return { minItems: 1 }
        }
      })
    )

    const jsonSchema = toValueSchema(schema)
    assert.strictEqual(jsonSchema.type, "array")
    assert.strictEqual(jsonSchema.minItems, 1)
    assert.strictEqual(invocations, 1)
  })

  it("keeps property names that match unsupported keywords", () => {
    const unsupported = Schema.Any.check(Schema.makeFilter<unknown>(() => true, {
      representation: {
        id: "test/ai/openai/unsupportedPropertySchema",
        payload: null
      },
      toJsonSchema: () => ({ minLength: 2 })
    }))

    assert.deepStrictEqual(toCodecOpenAI(Schema.Struct({ minLength: unsupported })).jsonSchema, {
      type: "object",
      properties: { minLength: {} },
      required: ["minLength"],
      additionalProperties: false
    })
  })

  it("drops patternProperties returned by custom callbacks", () => {
    const schema = Schema.Struct({ fixed: Schema.String }).check(Schema.makeFilter<object>(() => true, {
      representation: {
        id: "test/ai/openai/patternProperties",
        payload: null
      },
      toJsonSchema: () => ({
        patternProperties: {
          "^x": { type: "string" }
        }
      })
    }))

    assert.deepStrictEqual(toCodecOpenAI(schema).jsonSchema, {
      type: "object",
      properties: { fixed: { type: "string" } },
      required: ["fixed"],
      additionalProperties: false
    })
  })

  it("does not merge structural constraints from allOf", () => {
    const schema = Schema.Struct({ fixed: Schema.String }).check(Schema.makeFilter<object>(() => true, {
      representation: {
        id: "test/ai/openai/structuralAllOf",
        payload: null
      },
      toJsonSchema: () => ({
        properties: {
          extra: { type: "string" }
        },
        required: ["extra"]
      })
    }))

    assert.deepStrictEqual(toCodecOpenAI(schema).jsonSchema, {
      type: "object",
      properties: { fixed: { type: "string" } },
      required: ["fixed"],
      additionalProperties: false
    })
  })

  it("keeps the original codec on the unchanged fast path", () => {
    const schema = Schema.Struct({ value: Schema.String })
    assert.strictEqual(toCodecOpenAI(schema).codec, schema)
  })

  it("keeps declaration fallback validation in the codec", () => {
    class Opaque {
      readonly _tag = "Opaque"
    }
    const schema = Schema.declare<Opaque>((input): input is Opaque => input instanceof Opaque, {
      expected: "Opaque"
    })
    const result = toCodecOpenAI(Schema.Struct({ value: schema }))
    assert.ok(Object.keys(getValueSchema(result.jsonSchema)).length > 0)
    assert.strictEqual(Schema.decodeUnknownExit(result.codec)({ value: {} })._tag, "Failure")
  })

  it("merges repeated lower bounds conservatively", () => {
    assert.deepStrictEqual(
      toValueSchema(Schema.Finite.check(
        Schema.isGreaterThan(1),
        Schema.isGreaterThanOrEqualTo(2),
        Schema.isGreaterThan(2)
      )),
      {
        type: "number",
        description: "a value greater than 1 and a value greater than or equal to 2 and a value greater than 2",
        exclusiveMinimum: 2
      }
    )
  })

  it("merges repeated array bounds conservatively", () => {
    const jsonSchema = toValueSchema(
      Schema.Array(Schema.String).check(
        Schema.isMinLength(1),
        Schema.isMinLength(2),
        Schema.isMaxLength(5),
        Schema.isMaxLength(4)
      )
    )
    assert.strictEqual(jsonSchema.minItems, 2)
    assert.strictEqual(jsonSchema.maxItems, 4)
  })

  it("transports only sound record size bounds to entry arrays", () => {
    const maximum = toValueSchema(
      Schema.Record(Schema.String, Schema.Finite).check(Schema.isMaxProperties(3))
    )
    assert.isUndefined(maximum.maxItems)

    const between = toValueSchema(
      Schema.Record(Schema.String, Schema.Finite).check(Schema.isBetweenProperties(1, 3))
    )
    assert.strictEqual(between.minItems, 1)
    assert.isUndefined(between.maxItems)
  })
})
