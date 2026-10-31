import { assertTrue, deepStrictEqual, strictEqual } from "@effect/vitest/utils"
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
  it("describes subclass fields when the parent already has a Standard JSON Schema adapter", () => {
    class Parent extends Schema.Class<Parent>("Parent")({ a: Schema.String }) {}
    const parent = Schema.toStandardSchemaV1(Schema.toStandardJSONSchemaV1(Parent))
    class Child extends parent.extend<Child>("Child")({ b: Schema.FiniteFromString }) {}
    const child = Schema.toStandardJSONSchemaV1(Child)

    strictEqual("validate" in child["~standard"], false)
    deepStrictEqual(standardConvertToJSONSchemaInput(child), {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $ref: "#/$defs/Child",
      $defs: {
        Child: {
          type: "object",
          properties: { a: { type: "string" }, b: { type: "string" } },
          required: ["a", "b"],
          additionalProperties: true
        }
      }
    })
    deepStrictEqual(standardConvertToJSONSchemaOutput(child), {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $ref: "#/$defs/Child",
      $defs: {
        Child: {
          type: "object",
          properties: { a: { type: "string" }, b: { type: "number" } },
          required: ["a", "b"],
          additionalProperties: true
        }
      }
    })
  })

  it("should return a schema with Standard JSON Schema metadata", () => {
    const schema = Schema.FiniteFromString
    const standardSchema = Schema.toStandardJSONSchemaV1(schema)
    assertTrue(Schema.isSchema(standardSchema))
  })

  it("should support both standards", () => {
    const schema = Schema.String
    const both = Schema.toStandardSchemaV1(Schema.toStandardJSONSchemaV1(schema))
    deepStrictEqual(standardConvertToJSONSchemaInput(both), {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "string"
    })
  })

  describe("draft-2020-12", () => {
    it("should return the input JSON Schema", () => {
      const schema = Schema.Tuple([Schema.FiniteFromString])
      const standardJSONSchema = Schema.toStandardJSONSchemaV1(schema)
      deepStrictEqual(standardConvertToJSONSchemaInput(standardJSONSchema), {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
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
        "$schema": "https://json-schema.org/draft/2020-12/schema",
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
        "$schema": "https://json-schema.org/draft/2020-12/schema",
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
        "$schema": "http://json-schema.org/draft-07/schema#",
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
        "$schema": "http://json-schema.org/draft-07/schema#",
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
        "$schema": "http://json-schema.org/draft-07/schema#",
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
