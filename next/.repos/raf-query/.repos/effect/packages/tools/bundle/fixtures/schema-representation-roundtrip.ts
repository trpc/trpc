import * as Schema from "effect/Schema"
import * as SchemaRepresentation from "effect/SchemaRepresentation"

const schema = Schema.toCodecJson(Schema.Struct({
  a: Schema.String,
  b: Schema.optional(Schema.FiniteFromString),
  c: Schema.Array(Schema.String)
}))

const json = SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(schema.ast))

export const roundtrip = SchemaRepresentation.fromRepresentation(
  SchemaRepresentation.fromJson(JSON.parse(JSON.stringify(json))),
  { revivers: [SchemaRepresentation.isFiniteReviver] }
)
