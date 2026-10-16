// Measures the marginal type-level cost of Schema.TupleWithRest.
import { Schema } from "effect"

Schema.String

const schema = Schema.TupleWithRest(
  Schema.Tuple([
    Schema.String,
    Schema.NumberFromString
  ]),
  [
    Schema.Boolean,
    Schema.String
  ]
)

export type Type = typeof schema.Type
export type Encoded = typeof schema.Encoded
export type Iso = typeof schema.Iso
export type MakeIn = typeof schema["~type.make.in"]
