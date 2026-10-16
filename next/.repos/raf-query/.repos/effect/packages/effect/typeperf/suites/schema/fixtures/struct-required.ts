// Measures the marginal type-level cost of Schema.Struct when all fields are required readonly fields.
import { Schema } from "effect"

Schema.String

const schema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  count: Schema.NumberFromString,
  enabled: Schema.Boolean,
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
  country: Schema.String,
  region: Schema.String,
  city: Schema.String,
  postalCode: Schema.String
})

export type Type = typeof schema.Type
export type Encoded = typeof schema.Encoded
export type Iso = typeof schema.Iso
export type MakeIn = typeof schema["~type.make.in"]
