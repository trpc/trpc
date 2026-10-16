import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"
import { LanguageModel } from "effect/ai"

describe("LanguageModel representation v2", () => {
  it("projects the encoded side before JSON Schema generation", () => {
    assert.strictEqual(LanguageModel.defaultCodecTransformer(Schema.FiniteFromString).jsonSchema.type, "string")
  })

  it("uses custom JSON Schema compiler annotations in the default transformer", () => {
    const schema = Schema.String.check(Schema.makeFilter<string>((value) => value.length >= 2, {
      representation: {
        id: "test/ai/language-model/minTwoCharacters",
        payload: null
      },
      toJsonSchema: () => ({ minLength: 2 })
    }))

    assert.deepStrictEqual(LanguageModel.defaultCodecTransformer(schema).jsonSchema, {
      type: "string",
      minLength: 2
    })
  })
})
