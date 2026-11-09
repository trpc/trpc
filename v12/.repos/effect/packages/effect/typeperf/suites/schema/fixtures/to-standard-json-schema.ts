// Measures the marginal type-level cost of Schema.toStandardJSONSchemaV1.
import { Schema } from "effect"

Schema.String

const schema = Schema.toStandardJSONSchemaV1(Schema.Struct({
  id: Schema.String,
  count: Schema.NumberFromString
}))

export type StandardJsonSchema = typeof schema
