// Measures the marginal type-level cost of Schema.Union with several structured members.
import { Schema } from "effect"

Schema.String

const schema = Schema.Union([
  Schema.Struct({ type: Schema.Literal("a"), id: Schema.String, count: Schema.NumberFromString }),
  Schema.Struct({ type: Schema.Literal("b"), id: Schema.String, enabled: Schema.Boolean }),
  Schema.Struct({ type: Schema.Literal("c"), id: Schema.String, tags: Schema.Array(Schema.String) }),
  Schema.Struct({ type: Schema.Literal("d"), id: Schema.String, nested: Schema.Struct({ value: Schema.String }) })
])

export type Type = typeof schema.Type
export type Encoded = typeof schema.Encoded
export type Iso = typeof schema.Iso
