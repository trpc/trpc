import { Effect, Sink } from "effect"
import { describe, expect, it } from "tstyche"

describe("Sink", () => {
  it("curried catch replaces the handled error type", () => {
    const sink = null as unknown as Sink.Sink<number, string, never, "old-error">
    const recovered = Sink.catch<"old-error", never, "new-error", never>(
      (_) => Effect.fail("new-error" as const)
    )(sink)

    expect(recovered).type.toBe<Sink.Sink<number, string, never, "new-error">>()
  })
})
