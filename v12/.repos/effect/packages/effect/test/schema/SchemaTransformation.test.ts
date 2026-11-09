import { assert } from "@effect/vitest"
import { Cause, Exit, Schema, SchemaGetter, SchemaTransformation } from "effect"
import { describe, it } from "vitest"
import { assertFalse, assertTrue, strictEqual } from "../utils/assert.ts"

describe("SchemaTransformation", () => {
  it.each(["abc", "1.5", "1e3"])("bigintFromString rejects %j with a typed failure", (input) => {
    const schema = Schema.Struct({
      value: Schema.String.pipe(Schema.decodeTo(Schema.BigInt, SchemaTransformation.bigintFromString))
    })

    const exit = Schema.decodeUnknownExit(schema)({ value: input })

    assert(Exit.isFailure(exit))
    assert.isFalse(Cause.hasDies(exit.cause))
    assert.isTrue(Cause.hasFails(exit.cause))
  })

  it("snakeToCamel round-trips unless a segment starts with a digit", () => {
    const schema = Schema.String.pipe(Schema.decodeTo(Schema.String, SchemaTransformation.snakeToCamel()))
    const roundTrip = (input: string) => Schema.encodeSync(schema)(Schema.decodeSync(schema)(input))

    strictEqual(roundTrip("my_field_name"), "my_field_name")
    strictEqual(Schema.decodeSync(schema)("foo_2_bar"), "foo2Bar")
    strictEqual(roundTrip("foo_2_bar"), "foo2_bar")
  })

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
