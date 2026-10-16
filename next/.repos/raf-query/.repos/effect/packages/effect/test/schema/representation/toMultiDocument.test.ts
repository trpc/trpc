import { assert, describe, it } from "@effect/vitest"
import { SchemaRepresentation } from "effect"

describe("SchemaRepresentation.toMultiDocument", () => {
  it("wraps the root representation and preserves references", () => {
    const reference = { _tag: "String" as const, checks: [] }
    assert.deepStrictEqual(
      SchemaRepresentation.toMultiDocument({
        representation: { _tag: "Reference", $ref: "Value" },
        references: { Value: reference }
      }),
      {
        representations: [{ _tag: "Reference", $ref: "Value" }],
        references: { Value: reference }
      }
    )
  })
})
