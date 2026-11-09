// Measures the marginal type-level cost of Schema.toCodecArrayFromSingle.
import { Schema } from "effect"

Schema.String

const schema = Schema.toCodecArrayFromSingle(
  Schema.toCodecStringTree(Schema.Array(Schema.NumberFromString))
)

export type Type = typeof schema.Type
export type Encoded = typeof schema.Encoded
export type Iso = typeof schema.Iso
