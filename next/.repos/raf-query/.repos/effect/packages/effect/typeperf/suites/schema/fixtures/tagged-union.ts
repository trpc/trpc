// Measures the marginal type-level cost of Schema.TaggedUnion with several tagged struct cases.
import { Schema } from "effect"

Schema.String

const schema = Schema.TaggedUnion({
  Created: { id: Schema.String, name: Schema.String },
  Updated: { id: Schema.String, before: Schema.String, after: Schema.String },
  Counted: { id: Schema.String, count: Schema.NumberFromString },
  Flagged: { id: Schema.String, enabled: Schema.Boolean }
})

export type Type = typeof schema.Type
export type Encoded = typeof schema.Encoded
export type Iso = typeof schema.Iso
export type Cases = typeof schema.cases
