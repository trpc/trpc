// Measures the marginal type-level cost of Schema.StructWithRest without opt-in record validation.
import { Schema } from "effect"

Schema.String

const schema = Schema.StructWithRest(
  Schema.Struct({
    id: Schema.String,
    value: Schema.NumberFromString
  }),
  [Schema.Record(Schema.String, Schema.mutableKey(Schema.NumberFromString))]
)

export type Type = typeof schema.Type
export type Encoded = typeof schema.Encoded
export type Iso = typeof schema.Iso
export type MakeIn = typeof schema["~type.make.in"]
