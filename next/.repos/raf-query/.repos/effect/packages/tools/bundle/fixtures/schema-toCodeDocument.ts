import * as Schema from "effect/Schema"
import * as SchemaRepresentation from "effect/SchemaRepresentation"

const schema = Schema.Struct({
  a: Schema.String,
  b: Schema.optional(Schema.FiniteFromString),
  c: Schema.Array(Schema.String)
})

export const document = SchemaRepresentation.toCodeDocument(SchemaRepresentation.toRepresentations([schema.ast]))
