import * as Effect from "effect/Effect"

Effect.log("hello").pipe(
  Effect.runFork
)
