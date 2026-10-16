// Measures the marginal type-level cost of applying Schema.brand to one schema.
import { Schema } from "effect"

Schema.String

const schema = Schema.String.pipe(Schema.brand("TypeperfBrand"))

export type Type = typeof schema.Type
export type Encoded = typeof schema.Encoded
export type Iso = typeof schema.Iso
