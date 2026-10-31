import type { CliError } from "effect/cli"
import { describe, expect, it } from "tstyche"

describe("CliError", () => {
  describe("userMessage", () => {
    it("augments Error with an optional string annotation", () => {
      expect<Pick<Error, CliError.userMessage>>().type.toBe<{ readonly [CliError.userMessage]?: string }>()
    })

    it("rejects non-string annotations", () => {
      expect<{ readonly [CliError.userMessage]: number }>().type.not.toBeAssignableTo<
        Pick<Error, CliError.userMessage>
      >()
    })
  })
})
