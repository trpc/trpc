// Measures the marginal type-level cost of Schema.Struct with mixed required, optional, and mutable fields.
import { Schema } from "effect"

Schema.String

const schema = Schema.Struct({
  id: Schema.String,
  name: Schema.optionalKey(Schema.String),
  count: Schema.mutableKey(Schema.NumberFromString),
  enabled: Schema.Boolean.pipe(Schema.optionalKey, Schema.mutableKey),
  createdAt: Schema.DateFromString,
  updatedAt: Schema.optionalKey(Schema.DateFromString),
  country: Schema.mutableKey(Schema.String),
  region: Schema.String.pipe(Schema.mutableKey, Schema.optionalKey),
  city: Schema.String,
  postalCode: Schema.optional(Schema.String)
})

export type Type = typeof schema.Type
export type Encoded = typeof schema.Encoded
export type Iso = typeof schema.Iso
export type MakeIn = typeof schema["~type.make.in"]
