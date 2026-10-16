import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

const schema = Schema.String

Schema.decodeUnknownEffect(schema)("a").pipe(
  Effect.runFork
)
