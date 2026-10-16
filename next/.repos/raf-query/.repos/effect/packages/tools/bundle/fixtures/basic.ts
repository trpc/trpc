import * as Effect from "effect/Effect"

Effect.succeed(123).pipe(Effect.runFork)
