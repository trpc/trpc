import * as Arbitrary from "effect/Arbitrary"
import * as Schema from "effect/Schema"

const schema = Schema.Struct({
  a: Schema.String,
  b: Schema.optional(Schema.FiniteFromString),
  c: Schema.Array(Schema.String)
})

export const arbitrary = Arbitrary.schema(schema)
