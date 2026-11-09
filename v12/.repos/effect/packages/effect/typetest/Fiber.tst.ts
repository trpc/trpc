import type { Effect } from "effect"
import { Fiber } from "effect"
import { expect, it } from "tstyche"

it("joinAll preserves input fiber errors", () => {
  const fibers = null as unknown as readonly [
    Fiber.Fiber<string, "err-1">,
    Fiber.Fiber<number, "err-2">
  ]
  const result = Fiber.joinAll(fibers)

  expect<Effect.Error<typeof result>>().type.toBe<"err-1" | "err-2">()
})
