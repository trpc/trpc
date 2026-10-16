import { type JsonSchema, Schema, SchemaRepresentation } from "effect"
import { describe, expect, it } from "tstyche"

describe("SchemaRepresentation compilers", () => {
  it("exposes exact compiler signatures", () => {
    expect(SchemaRepresentation.toJsonSchemaDocument).type.toBe<
      (
        document: SchemaRepresentation.Document,
        options?: Schema.ToJsonSchemaOptions
      ) => JsonSchema.Document<"draft-2020-12">
    >()
    expect(SchemaRepresentation.toJsonSchemaMultiDocument).type.toBe<
      (
        document: SchemaRepresentation.MultiDocument,
        options?: Schema.ToJsonSchemaOptions
      ) => JsonSchema.MultiDocument<"draft-2020-12">
    >()
    expect(SchemaRepresentation.toCodeDocument).type.toBe<
      (document: SchemaRepresentation.MultiDocument) => SchemaRepresentation.CodeDocument
    >()
  })

  it("distinguishes live compiler inputs and their outputs", () => {
    const document = SchemaRepresentation.toRepresentation(Schema.String.ast)
    const multiDocument = SchemaRepresentation.toRepresentations([Schema.String.ast])

    expect(SchemaRepresentation.toJsonSchemaDocument(document)).type.toBe<
      JsonSchema.Document<"draft-2020-12">
    >()
    expect(SchemaRepresentation.toJsonSchemaMultiDocument(multiDocument)).type.toBe<
      JsonSchema.MultiDocument<"draft-2020-12">
    >()
    expect(SchemaRepresentation.toCodeDocument(multiDocument)).type.toBe<
      SchemaRepresentation.CodeDocument
    >()
  })

  it("exposes node code generation through toCode annotations", () => {
    const declaration: Schema.Annotations.Declaration<unknown> = {
      toCode: () => ({ runtime: "Custom", Type: "unknown" })
    }
    const filter: Schema.Annotations.Filter = {
      toCode: () => ({ runtime: "Custom.check()" })
    }

    expect(declaration.toCode).type.toBe<SchemaRepresentation.Generation.Declaration | undefined>()
    expect(filter.toCode).type.toBe<SchemaRepresentation.Generation.Check | undefined>()
  })
})
