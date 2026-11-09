import { assert, describe, it } from "@effect/vitest"
import { Schema, SchemaRepresentation } from "effect"

describe("SchemaRepresentation.toJsonMultiDocument", () => {
  it("encodes every root in order", () => {
    const document = SchemaRepresentation.toRepresentations([
      Schema.String.ast,
      Schema.Number.ast,
      Schema.Literal(1n).ast
    ])

    assert.deepStrictEqual(SchemaRepresentation.toJsonMultiDocument(document), {
      representations: [
        { _tag: "String", checks: [] },
        { _tag: "Number", checks: [] },
        { _tag: "Literal", literal: { type: "bigint", value: "1" }, checks: [] }
      ],
      references: {}
    })
  })

  it("encodes shared references once", () => {
    const shared = Schema.String.annotate({ identifier: "Shared", callback: () => "live" })
    const document = SchemaRepresentation.toRepresentations([shared.ast, shared.ast])

    assert.deepStrictEqual(SchemaRepresentation.toJsonMultiDocument(document), {
      representations: [
        { _tag: "Reference", $ref: "Shared" },
        { _tag: "Reference", $ref: "Shared" }
      ],
      references: {
        Shared: {
          _tag: "String",
          annotations: { identifier: "Shared" },
          checks: []
        }
      }
    })
  })
})
