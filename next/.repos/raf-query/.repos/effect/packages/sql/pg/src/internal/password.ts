import * as Effect from "effect/Effect"
import * as Redacted from "effect/Redacted"

export const resolve = (
  password: Redacted.Redacted | Effect.Effect<Redacted.Redacted> | undefined
): Effect.Effect<string | undefined> =>
  password === undefined
    ? Effect.succeed(undefined)
    : Effect.isEffect(password)
    ? Effect.map(password, Redacted.value)
    : Effect.succeed(Redacted.value(password))
