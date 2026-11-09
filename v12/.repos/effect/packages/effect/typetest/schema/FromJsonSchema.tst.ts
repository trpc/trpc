import { type JsonSchema, type Schema, SchemaRepresentation } from "effect"
import { describe, expect, it } from "tstyche"

describe("JSON Schema importer", () => {
  it("exposes exact synchronous signatures", () => {
    const fromDocument: (
      document: JsonSchema.Document<"draft-2020-12">,
      options?: SchemaRepresentation.FromJsonSchemaOptions
    ) => Schema.Top = SchemaRepresentation.fromJsonSchemaDocument
    const fromMultiDocument: (
      document: JsonSchema.MultiDocument<"draft-2020-12">,
      options?: SchemaRepresentation.FromJsonSchemaOptions
    ) => readonly [Schema.Top, ...Array<Schema.Top>] = SchemaRepresentation.fromJsonSchemaMultiDocument
    expect(fromDocument).type.toBe<
      (
        document: JsonSchema.Document<"draft-2020-12">,
        options?: SchemaRepresentation.FromJsonSchemaOptions
      ) => Schema.Top
    >()
    expect(fromMultiDocument).type.toBe<
      (
        document: JsonSchema.MultiDocument<"draft-2020-12">,
        options?: SchemaRepresentation.FromJsonSchemaOptions
      ) => readonly [Schema.Top, ...Array<Schema.Top>]
    >()
  })

  it("keeps onEnter limited to JSON Schema nodes", () => {
    const options: SchemaRepresentation.FromJsonSchemaOptions = {
      onEnter: (schema) => ({ ...schema, description: "entered" })
    }

    expect(options.onEnter).type.toBe<
      ((schema: JsonSchema.JsonSchema) => JsonSchema.JsonSchema) | undefined
    >()
  })

  it("limits the pattern policy to the supported modes", () => {
    const options: SchemaRepresentation.FromJsonSchemaOptions = { patterns: "error" }

    expect(options.patterns).type.toBe<"error" | "ignore" | "apply" | undefined>()

    const invalidOptions: SchemaRepresentation.FromJsonSchemaOptions = {
      // @ts-expect-error Type '"safe"' is not assignable to type
      patterns: "safe"
    }
    void invalidOptions
  })
})
