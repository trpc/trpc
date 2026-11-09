import { Schema, SchemaRepresentation } from "effect"
import { describe, expect, it } from "tstyche"

describe("SchemaRepresentation revivers", () => {
  it("infers payload types from reviver constructors", () => {
    const declaration = SchemaRepresentation.makeReviverDeclaration(
      "acme/schema/Box",
      Schema.Struct({ label: Schema.String }),
      ({ payload }) => {
        expect(payload).type.toBe<{ readonly label: string }>()
        return Schema.String
      }
    )
    expect(declaration).type.toBe<SchemaRepresentation.DeclarationReviver<{ readonly label: string }>>()

    const filter = SchemaRepresentation.makeReviverFilter(
      "acme/schema/minLength",
      Schema.Struct({ minimum: Schema.Number }),
      ({ annotations, payload }) => {
        expect(payload).type.toBe<{ readonly minimum: number }>()
        return Schema.isMinLength(payload.minimum, annotations)
      }
    )
    expect(filter).type.toBe<SchemaRepresentation.FilterReviver<{ readonly minimum: number }>>()

    const filterGroup = SchemaRepresentation.makeReviverFilterGroup(
      "acme/schema/nonEmpty",
      Schema.Null,
      ({ annotations, payload }) => {
        expect(payload).type.toBe<null>()
        return Schema.makeFilterGroup([Schema.isMinLength(1)], annotations)
      }
    )
    expect(filterGroup).type.toBe<SchemaRepresentation.FilterGroupReviver<null>>()
  })

  it("accepts concrete payload revivers at the erased collection boundary", () => {
    const reviver: SchemaRepresentation.FilterReviver<{ readonly source: string }> = {
      id: "acme/schema/isPattern",
      payloadSchema: Schema.Struct({ source: Schema.String }),
      revive: ({ payload, annotations }) => Schema.isPattern(new RegExp(payload.source), annotations)
    }
    const revivers: ReadonlyArray<SchemaRepresentation.AnyReviver> = [reviver]

    expect(revivers).type.toBe<ReadonlyArray<SchemaRepresentation.AnyReviver>>()
  })

  it("exposes the concrete payload types of built-in revivers", () => {
    expect(SchemaRepresentation.isPatternReviver).type.toBe<
      SchemaRepresentation.FilterReviver<{ readonly source: string; readonly flags: string }>
    >()
    expect(SchemaRepresentation.isBetweenReviver).type.toBe<
      SchemaRepresentation.FilterReviver<{
        readonly minimum: number
        readonly maximum: number
        readonly exclusiveMinimum?: true | undefined
        readonly exclusiveMaximum?: true | undefined
      }>
    >()
    expect(SchemaRepresentation.isBetweenDateReviver).type.toBe<
      SchemaRepresentation.FilterReviver<{
        readonly minimum: globalThis.Date
        readonly maximum: globalThis.Date
        readonly exclusiveMinimum?: true | undefined
        readonly exclusiveMaximum?: true | undefined
      }>
    >()
    expect(SchemaRepresentation.isBetweenBigIntReviver).type.toBe<
      SchemaRepresentation.FilterReviver<{
        readonly minimum: bigint
        readonly maximum: bigint
        readonly exclusiveMinimum?: true | undefined
        readonly exclusiveMaximum?: true | undefined
      }>
    >()
    expect(SchemaRepresentation.GraphReviver).type.toBe<
      SchemaRepresentation.DeclarationReviver<"directed" | "undirected">
    >()
    expect(SchemaRepresentation.ErrorInstanceReviver).type.toBe<
      SchemaRepresentation.DeclarationReviver<
        | null
        | {
          readonly includeStack?: true | undefined
          readonly excludeCause?: true | undefined
        }
      >
    >()
    expect(SchemaRepresentation.RedactedReviver).type.toBe<
      SchemaRepresentation.DeclarationReviver<
        | null
        | {
          readonly label?: string | undefined
          readonly disallowJsonEncode?: true | undefined
        }
      >
    >()
  })

  it("separates JSON decoding from schema revival", () => {
    expect(SchemaRepresentation.fromJson).type.toBe<
      (input: Schema.Json) => SchemaRepresentation.Document
    >()
    expect(SchemaRepresentation.fromJsonMultiDocument).type.toBe<
      (input: Schema.Json) => SchemaRepresentation.MultiDocument
    >()
    expect(SchemaRepresentation.fromRepresentation).type.toBe<
      (
        document: SchemaRepresentation.Document,
        options: { readonly revivers: ReadonlyArray<SchemaRepresentation.AnyReviver> }
      ) => Schema.Top
    >()
    expect(SchemaRepresentation.fromRepresentations).type.toBe<
      (
        document: SchemaRepresentation.MultiDocument,
        options: { readonly revivers: ReadonlyArray<SchemaRepresentation.AnyReviver> }
      ) => readonly [Schema.Top, ...Array<Schema.Top>]
    >()

    const document = SchemaRepresentation.fromJson({ representation: { _tag: "String", checks: [] }, references: {} })
    // @ts-expect-error Expected 2 arguments, but got 1.
    SchemaRepresentation.fromRepresentation(document)
    // @ts-expect-error Expected 2 arguments, but got 1.
    SchemaRepresentation.fromRepresentations({
      representations: [{ _tag: "String", checks: [] }],
      references: {}
    })
  })
})
