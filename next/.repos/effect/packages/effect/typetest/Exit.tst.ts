import type { Cause } from "effect"
import { Exit } from "effect"
import { describe, expect, it } from "tstyche"

declare const exit: Exit.Exit<number, string>
declare const failure: Exit.Failure<number, string>

describe("Exit", () => {
  it("cause guards keep failures on false", () => {
    if (!Exit.hasFails(exit)) {
      expect(exit).type.toBe<Exit.Exit<number, string>>()
    }
    if (!Exit.hasDies(exit)) {
      expect(exit).type.toBe<Exit.Exit<number, string>>()
    }
    if (!Exit.hasInterrupts(exit)) {
      expect(exit).type.toBe<Exit.Exit<number, string>>()
    }
    if (!Exit.hasFails(failure) && !Exit.hasDies(failure) && !Exit.hasInterrupts(failure)) {
      expect(failure).type.toBe<Exit.Failure<number, string>>()
    }
    if (Exit.isFailure(exit) && Exit.hasDies(exit)) {
      expect(exit.cause).type.toBe<Cause.Cause<string>>()
    }
  })
})
