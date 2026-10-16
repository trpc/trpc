import { assertTrue, deepStrictEqual } from "@effect/vitest/utils"
import { Schema } from "effect"
import type { StandardJSONSchemaV1 } from "effect/StandardSchema"
import { describe, it } from "vitest"

function standardConvertToJSONSchemaInput(
  schema: StandardJSONSchemaV1,
  target?: StandardJSONSchemaV1.Target
): Record<string, unknown> {
  return schema["~standard"].jsonSchema.input({
    target: target ?? "draft-2020-12"
  })
}

function standardConvertToJSONSchemaOutput(
  schema: StandardJSONSchemaV1,
  target?: StandardJSONSchemaV1.Target
): Record<string, unknown> {
  return schema["~standard"].jsonSchema.output({
    target: target ?? "draft-2020-12"
  })
}

describe("toStandardJSONSchemaV1", () => {
  it("should return a schema with Standard JSON Schema metadata", () => {
    const schema = Schema.FiniteFromString
    const standardSchema = Schema.toStandardJSONSchemaV1(schema)
    assertTrue(Schema.isSchema(standardSchema))
  })

  it("should support both standards", () => {
    const schema = Schema.String
    const both = Schema.toStandardSchemaV1(Schema.toStandardJSONSchemaV1(schema))
    deepStrictEqual(standardConvertToJSONSchemaInput(both), {
      "type": "string"
    })
  })

  describe("draft-2020-12", () => {
    it("should return the input JSON Schema", () => {
      const schema = Schema.Tuple([Schema.FiniteFromString])
      const standardJSONSchema = Schema.toStandardJSONSchemaV1(schema)
      deepStrictEqual(standardConvertToJSONSchemaInput(standardJSONSchema), {
        "type": "array",
        "prefixItems": [{ "type": "string" }],
        "minItems": 1,
        "maxItems": 1
      })
    })

    it("should return the output JSON Schema", () => {
      const schema = Schema.Tuple([Schema.FiniteFromString])
      const standardJSONSchema = Schema.toStandardJSONSchemaV1(schema)
      deepStrictEqual(standardConvertToJSONSchemaOutput(standardJSONSchema), {
        "type": "array",
        "prefixItems": [{ "type": "number" }],
        "minItems": 1,
        "maxItems": 1
      })
    })

    it("a schema with identifier", () => {
      const S = Schema.String.annotate({ identifier: "id" })
      const schema = Schema.Tuple([S, S])
      const standardJSONSchema = Schema.toStandardJSONSchemaV1(schema)
      deepStrictEqual(standardConvertToJSONSchemaInput(standardJSONSchema), {
        "type": "array",
        "prefixItems": [
          { "$ref": "#/$defs/id" },
          { "$ref": "#/$defs/id" }
        ],
        "minItems": 2,
        "maxItems": 2,
        "$defs": {
          "id": {
            "type": "string"
          }
        }
      })
    })
  })

  describe("draft-07", () => {
    it("should return the input JSON Schema", () => {
      const schema = Schema.Tuple([Schema.FiniteFromString])
      const standardJSONSchema = Schema.toStandardJSONSchemaV1(schema)
      deepStrictEqual(standardConvertToJSONSchemaInput(standardJSONSchema, "draft-07"), {
        "type": "array",
        "items": [{ "type": "string" }],
        "minItems": 1,
        "maxItems": 1
      })
    })

    it("should return the output JSON Schema", () => {
      const schema = Schema.Tuple([Schema.FiniteFromString])
      const standardJSONSchema = Schema.toStandardJSONSchemaV1(schema)
      deepStrictEqual(standardConvertToJSONSchemaOutput(standardJSONSchema, "draft-07"), {
        "type": "array",
        "items": [{ "type": "number" }],
        "minItems": 1,
        "maxItems": 1
      })
    })

    it("a schema with identifier", () => {
      const S = Schema.String.annotate({ identifier: "id" })
      const schema = Schema.Tuple([S, S])
      const standardJSONSchema = Schema.toStandardJSONSchemaV1(schema)
      deepStrictEqual(standardConvertToJSONSchemaInput(standardJSONSchema, "draft-07"), {
        "type": "array",
        "items": [
          { "$ref": "#/definitions/id" },
          { "$ref": "#/definitions/id" }
        ],
        "minItems": 2,
        "maxItems": 2,
        "definitions": {
          "id": {
            "type": "string"
          }
        }
      })
    })
  })
})
