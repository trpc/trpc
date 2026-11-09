import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"
import { toCodecAnthropic } from "effect/ai/AnthropicStructuredOutput"
import { TestSchema } from "effect/testing"

describe("AnthropicStructuredOutput representation v2", () => {
  it("projects the encoded side before JSON Schema generation", () => {
    assert.strictEqual(toCodecAnthropic(Schema.FiniteFromString).jsonSchema.type, "string")
  })

  it("keeps supported custom JSON Schema filters with a description", () => {
    const schema = Schema.String.check(Schema.makeFilter<string>((value) => value.startsWith("a"), {
      description: "starts with a",
      representation: {
        id: "test/ai/anthropic/startsWithA",
        payload: null
      },
      toJsonSchema: () => ({ pattern: "^a" })
    }))

    assert.deepStrictEqual(toCodecAnthropic(schema).jsonSchema, {
      type: "string",
      description: "starts with a",
      pattern: "^a"
    })
  })

  it("drops unsupported custom JSON Schema filters with a description", async () => {
    const schema = Schema.String.check(Schema.makeFilter<string>((value) => value.length >= 2, {
      description: "at least two characters",
      representation: {
        id: "test/ai/anthropic/minTwoCharactersWithDescription",
        payload: null
      },
      toJsonSchema: () => ({ minLength: 2 })
    }))

    const result = toCodecAnthropic(schema)
    assert.deepStrictEqual(result.jsonSchema, {
      type: "string",
      description: "at least two characters"
    })
    await new TestSchema.Asserts(result.codec).decoding().fail(
      "a",
      `Expected <filter>`
    )
  })

  it("keeps supported custom JSON Schema filters without a description", () => {
    const schema = Schema.String.check(Schema.makeFilter<string>((value) => value.startsWith("a"), {
      representation: {
        id: "test/ai/anthropic/startsWithAWithoutDescription",
        payload: null
      },
      toJsonSchema: () => ({ pattern: "^a" })
    }))

    assert.deepStrictEqual(toCodecAnthropic(schema).jsonSchema, {
      type: "string",
      pattern: "^a"
    })
  })

  it("drops unsupported custom JSON Schema filters without a description", () => {
    const schema = Schema.String.check(Schema.makeFilter<string>((value) => value.length >= 2, {
      representation: {
        id: "test/ai/anthropic/minTwoCharactersWithoutDescription",
        payload: null
      },
      toJsonSchema: () => ({ minLength: 2 })
    }))

    assert.deepStrictEqual(toCodecAnthropic(schema).jsonSchema, {
      type: "string"
    })
  })

  it("invokes custom JSON Schema callbacks only with compiler inputs", () => {
    let invocations = 0
    const schema = Schema.String.check(Schema.makeFilter<string>(() => true, {
      representation: {
        id: "test/ai/anthropic/compilerInputs",
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

    assert.deepStrictEqual(toCodecAnthropic(schema).jsonSchema, {
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
          id: "test/ai/anthropic/structuralCompilerInput",
          payload: null
        },
        toJsonSchema: ({ type }) => {
          invocations++
          assert.strictEqual(type, "array")
          return { description: "compiled from the provider shape" }
        }
      })
    )

    const jsonSchema = toCodecAnthropic(schema).jsonSchema
    assert.strictEqual(jsonSchema.type, "array")
    assert.strictEqual(
      jsonSchema.description,
      "Object encoded as array of [key, value] pairs. Apply object constraints to the decoded object and compiled from the provider shape"
    )
    assert.strictEqual(invocations, 1)
  })

  it("keeps property names that match unsupported keywords", () => {
    const unsupported = Schema.Any.check(Schema.makeFilter<unknown>(() => true, {
      representation: {
        id: "test/ai/anthropic/unsupportedPropertySchema",
        payload: null
      },
      toJsonSchema: () => ({ minLength: 2 })
    }))

    assert.deepStrictEqual(toCodecAnthropic(Schema.Struct({ minLength: unsupported })).jsonSchema, {
      type: "object",
      properties: { minLength: {} },
      required: ["minLength"],
      additionalProperties: false
    })
  })

  it("keeps the original codec on the unchanged fast path", () => {
    assert.strictEqual(toCodecAnthropic(Schema.String).codec, Schema.String)
  })
})
