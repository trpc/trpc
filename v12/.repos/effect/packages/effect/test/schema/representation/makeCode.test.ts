import { assert, describe, it } from "@effect/vitest"
import { SchemaRepresentation } from "effect"

describe("SchemaRepresentation.makeCode", () => {
  it("constructs runtime and type source", () => {
    assert.deepStrictEqual(SchemaRepresentation.makeCode("Schema.String", "string"), {
      runtime: "Schema.String",
      Type: "string"
    })
  })
})
