// Measures the marginal type-level cost of Schema.decodeUnknownEffect.
import { Schema } from "effect"

Schema.String

const decode = Schema.decodeUnknownEffect(Schema.NumberFromString)

export type Decode = typeof decode
