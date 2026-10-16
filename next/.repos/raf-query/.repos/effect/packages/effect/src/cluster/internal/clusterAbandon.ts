import type * as Cause from "../../Cause.ts"
import * as Effect from "../../Effect.ts"
import * as Fiber from "../../Fiber.ts"
import { Abandon } from "../ClusterSchema.ts"

export const interrupt: Effect.Effect<never> = Effect.interruptible(
  Effect.callback<never>(() => {
    const fiber = Fiber.getCurrent()!
    fiber.interruptUnsafe(fiber.id, Abandon.annotation)
  })
)

export const isCause = (cause: Cause.Cause<unknown>): boolean =>
  cause.reasons.some((reason) => reason._tag === "Interrupt" && reason.annotations.has(Abandon.key))
