// Measures the marginal type-level cost of Schema.toType.
import { Schema } from "effect"

Schema.String

const schema = Schema.toType(Schema.NumberFromString)

export type Type = typeof schema.Type
export type Encoded = typeof schema.Encoded
export type Iso = typeof schema.Iso
