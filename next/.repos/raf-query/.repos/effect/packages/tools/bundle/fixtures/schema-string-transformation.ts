import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"

const schema = Schema.String.pipe(Schema.decodeTo(
  Schema.String,
  SchemaTransformation.transformEffect({
    decode: (s) =>
      Effect.gen(function*() {
        yield* Effect.clockWith((clock) => clock.sleep(Duration.millis(300)))
        return s
      }),
    encode: (_) => Effect.succeed(_)
  })
))

Schema.decodeUnknownEffect(schema)("a").pipe(
  Effect.runFork
)
