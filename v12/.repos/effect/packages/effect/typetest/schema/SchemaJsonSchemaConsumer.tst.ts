import { type JsonSchema, Schema, type SchemaRepresentation } from "effect"
import { describe, expect, it } from "tstyche"

describe("Schema JSON Schema consumer", () => {
  it("exposes exact synchronous high-level signatures", () => {
    const toJsonSchema: (
      schema: Schema.Constraint,
      options?: Schema.ToJsonSchemaOptions
    ) => JsonSchema.Document<"draft-2020-12"> = Schema.toJsonSchemaDocument

    expect(Schema.toRepresentation(Schema.String)).type.toBe<
      SchemaRepresentation.Document
    >()
    expect(Schema.toJsonSchemaDocument(Schema.String)).type.toBe<JsonSchema.Document<"draft-2020-12">>()
    expect(toJsonSchema).type.toBe<
      (
        schema: Schema.Constraint,
        options?: Schema.ToJsonSchemaOptions
      ) => JsonSchema.Document<"draft-2020-12">
    >()
  })
})
