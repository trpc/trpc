import * as SchemaBinary from "effect/encoding/SchemaBinary"
import * as Schema from "effect/Schema"

const schema = Schema.Struct({
  a: Schema.String,
  b: Schema.optional(Schema.FiniteFromString),
  c: Schema.Array(Schema.String)
})

export const codec = SchemaBinary.toCodec(schema)
