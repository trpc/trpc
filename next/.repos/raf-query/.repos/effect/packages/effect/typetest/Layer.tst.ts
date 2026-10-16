/** @effect-diagnostics missingEffectError:skip-file */
import { type Cause, Effect, Layer } from "effect"
import { it } from "tstyche"

const source = Layer.effectDiscard(Effect.fail<string | number>(123))

it("tapError rejects an observer that cannot handle every source error", () => {
  const observer = (error: string) => Effect.succeed(error.toUpperCase())

  // @ts-expect-error is not assignable
  Layer.tapError(source, observer)
  // @ts-expect-error is not assignable
  source.pipe(Layer.tapError(observer))
})

it("tapCause rejects an observer that cannot handle every source error", () => {
  const observer = (cause: Cause.Cause<string>) => Effect.succeed(cause.reasons)

  // @ts-expect-error is not assignable
  Layer.tapCause(source, observer)
  // @ts-expect-error is not assignable
  source.pipe(Layer.tapCause(observer))
})
