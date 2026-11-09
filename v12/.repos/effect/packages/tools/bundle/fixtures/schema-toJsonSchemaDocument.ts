import * as Schema from "effect/Schema"

const schema = Schema.Struct({
  a: Schema.String,
  b: Schema.optional(Schema.FiniteFromString),
  c: Schema.Array(Schema.String)
})

export const document = Schema.toJsonSchemaDocument(schema)
