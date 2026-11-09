import { Schema } from "effect"

export class A extends Schema.Class<A>("Class")({
  a: Schema.String
}) {}
