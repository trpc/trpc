import { Effect, Schema } from "effect"
import { HttpApiError } from "effect/http-api"
import { describe, expect, it } from "tstyche"

describe("HttpApiError", () => {
  describe("Problem", () => {
    class OutOfCredit extends HttpApiError.Problem<OutOfCredit>()(
      "OutOfCredit",
      { type: "https://example.com/probs/out-of-credit", status: 403, title: "You do not have enough credit." },
      { balance: Schema.Number }
    ) {}
    class Banned extends HttpApiError.Problem<Banned>()(
      "Banned",
      { type: "https://example.com/probs/banned", status: 403, title: "You are banned." },
      { balance: Schema.Number }
    ) {}

    it("carries the literal tag and the declared members", () => {
      const error = new OutOfCredit({ balance: 30 })
      expect(error._tag).type.toBe<"OutOfCredit">()
      expect(error.type).type.toBe<"https://example.com/probs/out-of-credit">()
      expect(error.status).type.toBe<403>()
      expect(error.title).type.toBe<string>()
      expect(error.detail).type.toBe<string | undefined>()
    })

    it("narrows in catchTag and removes the handled error", () => {
      const program = Effect.fail(new OutOfCredit({ balance: 30 }) as OutOfCredit | Banned)
      const handled = program.pipe(
        Effect.catchTag("OutOfCredit", (error) => {
          expect(error).type.toBe<OutOfCredit>()
          return Effect.succeed(error.balance)
        })
      )
      expect(handled).type.toBe<Effect.Effect<number, Banned, never>>()
    })

    it("rejects extension fields that collide with the fixed members", () => {
      const declaration = { type: "https://example.com/probs/x", status: 403, title: "x" } as const
      const Problem = HttpApiError.Problem<{}>()
      expect(Problem).type.not.toBeCallableWith("X", declaration, { type: Schema.String })
      expect(Problem).type.not.toBeCallableWith("X", declaration, { status: Schema.Number })
      expect(Problem).type.not.toBeCallableWith("X", declaration, { title: Schema.String })
      expect(Problem).type.toBeCallableWith("X", declaration, { detail: Schema.String })
    })
  })
})
