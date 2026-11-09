// Measures the marginal type-level cost of Schema.Exit.
import { Schema } from "effect"

Schema.String

const schema = Schema.Exit(
  Schema.Struct({ id: Schema.String, count: Schema.NumberFromString }),
  Schema.Struct({ code: Schema.String, message: Schema.String }),
  Schema.Defect()
)

export type Type = typeof schema.Type
export type Encoded = typeof schema.Encoded
export type Iso = typeof schema.Iso
