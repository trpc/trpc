import * as Effect from "effect/Effect"
import * as Schedule from "effect/Schedule"

Effect.succeed(123).pipe(
  Effect.repeat({
    schedule: Schedule.spaced("100 millis")
  }),
  Effect.runFork
)
