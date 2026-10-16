import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

const schema = Schema.TemplateLiteral(["a", Schema.String])

Schema.decodeUnknownEffect(schema)("abc").pipe(
  Effect.runFork
)
