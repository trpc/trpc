// Measures the marginal type-level cost of Schema.NonEmptyArray for one structured element schema.
import { Schema } from "effect"

Schema.String

const schema = Schema.NonEmptyArray(Schema.Struct({
  id: Schema.String,
  count: Schema.NumberFromString
}))

export type Type = typeof schema.Type
export type Encoded = typeof schema.Encoded
export type Iso = typeof schema.Iso
export type MakeIn = typeof schema["~type.make.in"]
