import { type Schema, type SchemaAST, SchemaRepresentation } from "effect"
import { describe, expect, it } from "tstyche"

describe("SchemaRepresentation persisted wire", () => {
  it("exposes exact construction signatures", () => {
    expect(SchemaRepresentation.toRepresentation).type.toBe<
      (
        ast: SchemaAST.AST,
        options?: SchemaRepresentation.ToRepresentationOptions
      ) => SchemaRepresentation.Document
    >()
    expect(SchemaRepresentation.toRepresentations).type.toBe<
      (
        asts: readonly [SchemaAST.AST, ...Array<SchemaAST.AST>],
        options?: SchemaRepresentation.ToRepresentationOptions
      ) => SchemaRepresentation.MultiDocument
    >()
  })

  it("keeps projection explicit for single and multi documents", () => {
    expect(SchemaRepresentation.toJson).type.toBe<
      (document: SchemaRepresentation.Document) => Schema.Json
    >()
    expect(SchemaRepresentation.toJsonMultiDocument).type.toBe<
      (document: SchemaRepresentation.MultiDocument) => Schema.Json
    >()
  })

  it("wraps a document as a multi-document", () => {
    expect(SchemaRepresentation.toMultiDocument).type.toBe<
      (document: SchemaRepresentation.Document) => SchemaRepresentation.MultiDocument
    >()
  })

  it("constructs generated code", () => {
    expect(SchemaRepresentation.makeCode).type.toBe<
      (runtime: string, Type: string) => SchemaRepresentation.Code
    >()
  })

  it("keeps representation metadata separate from annotations", () => {
    const declaration = null as unknown as SchemaRepresentation.Declaration
    const filter = null as unknown as SchemaRepresentation.Filter
    const group = null as unknown as SchemaRepresentation.FilterGroup

    expect(declaration.representation).type.toBe<
      SchemaRepresentation.RepresentationAnnotation | undefined
    >()
    expect(filter.representation).type.toBe<
      SchemaRepresentation.CheckRepresentationAnnotation<SchemaRepresentation.Representation> | undefined
    >()
    expect(group.representation).type.toBe<
      SchemaRepresentation.CheckRepresentationAnnotation<SchemaRepresentation.Representation> | undefined
    >()
  })

  it("uses native literal values", () => {
    const literal = null as unknown as SchemaRepresentation.Literal
    expect(literal.literal).type.toBe<SchemaAST.LiteralValue>()

    expect(
      {
        _tag: "Literal",
        literal: "value",
        checks: []
      } as const
    ).type.toBeAssignableTo<SchemaRepresentation.Literal>()

    expect(
      {
        _tag: "Literal",
        literal: { type: "string", value: "value" },
        checks: []
      } as const
    ).type.not.toBeAssignableTo<SchemaRepresentation.Literal>()
  })

  it("uses native Enum values", () => {
    const representation = null as unknown as SchemaRepresentation.Enum
    expect(representation.enums).type.toBe<ReadonlyArray<readonly [string, string | number]>>()
    expect([["A", 1]] as const).type.toBeAssignableTo<SchemaRepresentation.Enum["enums"]>()
    expect([["A", { type: "number", value: 1 }]] as const).type.not.toBeAssignableTo<
      SchemaRepresentation.Enum["enums"]
    >()
  })

  it("uses native property keys", () => {
    const property = null as unknown as SchemaRepresentation.PropertySignature
    expect(property.name).type.toBe<PropertyKey>()
    expect(Symbol.for("key")).type.toBeAssignableTo<SchemaRepresentation.PropertySignature["name"]>()
    expect({ type: "symbol", value: Symbol.for("key") } as const).type.not.toBeAssignableTo<
      SchemaRepresentation.PropertySignature["name"]
    >()
  })
})
