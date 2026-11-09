import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

class A extends Schema.Class<A>("A")({
  a: Schema.String,
  b: Schema.optional(Schema.FiniteFromString),
  c: Schema.Array(Schema.String)
}) {}

Schema.decodeUnknownEffect(A)({ a: "a", b: 1, c: ["c"] }).pipe(
  Effect.runFork
)
