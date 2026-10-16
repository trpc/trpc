import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"
import { Tool } from "effect/ai"

describe("Tool representation v2", () => {
  it("projects the encoded side before JSON Schema generation", () => {
    assert.strictEqual(Tool.getJsonSchemaFromSchema(Schema.FiniteFromString).type, "string")
  })

  it("uses custom JSON Schema compiler annotations for schema parameters", () => {
    const schema = Schema.Struct({
      value: Schema.String.check(Schema.makeFilter<string>((value) => value.length >= 2, {
        representation: {
          id: "test/ai/tool/minTwoCharacters",
          payload: null
        },
        toJsonSchema: () => ({ minLength: 2 })
      }))
    })
    const tool = Tool.make("CustomCheck", { parameters: schema })

    assert.deepStrictEqual(Tool.getJsonSchema(tool), Tool.getJsonSchemaFromSchema(schema))
    assert.deepStrictEqual(Tool.getJsonSchema(tool), {
      type: "object",
      properties: {
        value: {
          type: "string",
          minLength: 2
        }
      },
      required: ["value"],
      additionalProperties: true
    })
  })
})
