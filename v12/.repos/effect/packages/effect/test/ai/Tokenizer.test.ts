import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { Prompt, Tokenizer } from "effect/ai"

describe("Tokenizer", () => {
  it.effect("truncate accounts for costs between messages", () =>
    Effect.gen(function*() {
      const tokenizer = Tokenizer.make({
        tokenize: (prompt) =>
          Effect.succeed(
            Array.from({ length: Math.max(0, prompt.content.length * 2 - 1) }, (_, index) => index)
          )
      })
      const input = Prompt.make([
        { role: "user", content: "a" },
        { role: "assistant", content: "b" }
      ])

      const output = yield* tokenizer.truncate(input, 2)

      assert.deepStrictEqual(output.content, [input.content[1]])
      assert.isAtMost((yield* tokenizer.tokenize(output)).length, 2)
    }))
})
