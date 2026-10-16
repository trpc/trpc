import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

const schema = Schema.Struct({
  API_KEY: Schema.String,
  PORT: Schema.Int,
  LOCALHOST: Schema.URL
})

const config = Config.schema(schema)

Effect.runFork(config)
