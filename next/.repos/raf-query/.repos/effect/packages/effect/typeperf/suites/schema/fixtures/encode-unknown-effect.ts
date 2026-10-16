// Measures the marginal type-level cost of Schema.encodeUnknownEffect.
import { Schema } from "effect"

Schema.String

const encode = Schema.encodeUnknownEffect(Schema.NumberFromString)

export type Encode = typeof encode
