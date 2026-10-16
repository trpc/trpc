// Measures the marginal type-level cost of Schema.toCodecJson.
import { Schema } from "effect"

Schema.String

const schema = Schema.toCodecJson(Schema.Struct({
  id: Schema.String,
  count: Schema.NumberFromString
}))

export type Type = typeof schema.Type
export type Encoded = typeof schema.Encoded
export type Iso = typeof schema.Iso
