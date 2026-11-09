// Measures the marginal type-level cost of Schema.Struct when all fields are optional keys.
import { Schema } from "effect"

Schema.String

const schema = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String),
  count: Schema.optionalKey(Schema.NumberFromString),
  enabled: Schema.optionalKey(Schema.Boolean),
  createdAt: Schema.optionalKey(Schema.DateFromString),
  updatedAt: Schema.optionalKey(Schema.DateFromString),
  country: Schema.optionalKey(Schema.String),
  region: Schema.optionalKey(Schema.String),
  city: Schema.optionalKey(Schema.String),
  postalCode: Schema.optionalKey(Schema.String)
})

export type Type = typeof schema.Type
export type Encoded = typeof schema.Encoded
export type Iso = typeof schema.Iso
export type MakeIn = typeof schema["~type.make.in"]
