import { assert, describe, it } from "@effect/vitest"
import { SchemaRepresentation } from "effect"
import { throws } from "../../utils/assert.ts"

describe("SchemaRepresentation.fromJsonMultiDocument", () => {
  it("decodes every root in order", () => {
    const input = {
      representations: [
        { _tag: "String", checks: [] },
        { _tag: "Number", checks: [] },
        { _tag: "Literal", literal: { type: "string", value: "1" }, checks: [] },
        { _tag: "Literal", literal: { type: "bigint", value: "1" }, checks: [] }
      ],
      references: {}
    } as const

    assert.deepStrictEqual(SchemaRepresentation.fromJsonMultiDocument(input), {
      representations: [
        { _tag: "String", checks: [] },
        { _tag: "Number", checks: [] },
        { _tag: "Literal", literal: "1", checks: [] },
        { _tag: "Literal", literal: 1n, checks: [] }
      ],
      references: {}
    })
  })

  it("decodes shared references", () => {
    const input = {
      representations: [
        { _tag: "Reference", $ref: "Shared" },
        { _tag: "Reference", $ref: "Shared" }
      ],
      references: {
        Shared: { _tag: "String", checks: [] }
      }
    } as const

    assert.deepStrictEqual(SchemaRepresentation.fromJsonMultiDocument(input), input)
  })

  it("rejects an empty roots array", () => {
    throws(
      () => SchemaRepresentation.fromJsonMultiDocument({ representations: [], references: {} }),
      `Missing key\n  at ["representations"][0]`
    )
  })
})
