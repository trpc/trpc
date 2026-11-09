import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

const schema = Schema.Struct({
  a: Schema.String,
  b: Schema.optional(Schema.FiniteFromString),
  c: Schema.Array(Schema.String)
})

Schema.decodeUnknownEffect(schema)({ a: "a", b: 1, c: ["c"] }).pipe(
  Effect.runFork
)
