// Measures the marginal type-level cost of Schema.Tuple.
import { Schema } from "effect"

Schema.String

const schema = Schema.Tuple([
  Schema.String,
  Schema.NumberFromString,
  Schema.Boolean,
  Schema.Array(Schema.String)
])

export type Type = typeof schema.Type
export type Encoded = typeof schema.Encoded
export type Iso = typeof schema.Iso
export type MakeIn = typeof schema["~type.make.in"]
