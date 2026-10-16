import { SchemaGetter, SchemaTransformation } from "effect"
import { describe, it } from "vitest"
import { assertFalse, assertTrue, strictEqual } from "../utils/assert.ts"

describe("SchemaTransformation", () => {
  it("isTransformation", () => {
    assertTrue(SchemaTransformation.isTransformation(SchemaTransformation.passthrough()))
    assertFalse(SchemaTransformation.isTransformation({ "~effect/SchemaTransformation/Transformation": false }))
  })

  it("pipe", () => {
    const transformation = SchemaTransformation.passthrough<string>()
    const middleware = new SchemaTransformation.Middleware<string, string, never, never, never, never>(
      (effect) => effect,
      (effect) => effect
    )

    strictEqual(transformation.pipe((self) => self), transformation)
    strictEqual(middleware.pipe((self) => self), middleware)
  })

  it("makeTransformation preserves an existing transformation", () => {
    const transformation = SchemaTransformation.makeTransformation({
      decode: SchemaGetter.transform(Number),
      encode: SchemaGetter.transform(String)
    })

    strictEqual(SchemaTransformation.makeTransformation(transformation), transformation)
  })
})
