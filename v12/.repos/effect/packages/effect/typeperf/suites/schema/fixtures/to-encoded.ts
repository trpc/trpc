// Measures the marginal type-level cost of Schema.toEncoded.
import { Schema } from "effect"

Schema.String

const schema = Schema.toEncoded(Schema.NumberFromString)

export type Type = typeof schema.Type
export type Encoded = typeof schema.Encoded
export type Iso = typeof schema.Iso
