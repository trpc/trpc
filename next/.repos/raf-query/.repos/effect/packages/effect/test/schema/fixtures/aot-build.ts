import { Schema } from "effect"

export const Port = Schema.NumberFromString

export const User = Schema.Struct({
  name: Schema.String,
  port: Port
})

export const ignored = "not a Schema"
