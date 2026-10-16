// Measures the marginal type-level cost of Schema.Struct when all fields are mutable.
import { Schema } from "effect"

Schema.String

const schema = Schema.Struct({
  id: Schema.mutableKey(Schema.String),
  name: Schema.mutableKey(Schema.String),
  count: Schema.mutableKey(Schema.NumberFromString),
  enabled: Schema.mutableKey(Schema.Boolean),
  createdAt: Schema.mutableKey(Schema.DateFromString),
  updatedAt: Schema.mutableKey(Schema.DateFromString),
  country: Schema.mutableKey(Schema.String),
  region: Schema.mutableKey(Schema.String),
  city: Schema.mutableKey(Schema.String),
  postalCode: Schema.mutableKey(Schema.String)
})

export type Type = typeof schema.Type
export type Encoded = typeof schema.Encoded
export type Iso = typeof schema.Iso
export type MakeIn = typeof schema["~type.make.in"]
