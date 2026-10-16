// Measures the marginal type-level cost of Schema.Record with literal keys and mixed field modifiers.
import { Schema } from "effect"

Schema.String

const schema = Schema.Record(
  Schema.Literals(["primary", "secondary", "archive"]),
  Schema.mutableKey(Schema.optionalKey(Schema.NumberFromString))
)

export type Type = typeof schema.Type
export type Encoded = typeof schema.Encoded
export type Iso = typeof schema.Iso
export type MakeIn = typeof schema["~type.make.in"]
