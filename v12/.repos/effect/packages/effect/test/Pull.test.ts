import { assert, describe, it } from "@effect/vitest"
import { Cause, Exit, Result } from "effect"
import * as Pull from "effect/Pull"

describe("Pull", () => {
  describe("filterDone", () => {
    it("succeeds when the done signal is the only failure", () => {
      const result = Pull.filterDone(Cause.fail(Cause.Done("leftover")))
      assert.deepStrictEqual(result, Result.succeed(Cause.Done("leftover")))
    })

    it("strips the done signal when merged with other failures", () => {
      const cause = Cause.combine(Cause.fail(Cause.Done("leftover")), Cause.die("boom"))
      const result = Pull.filterDone(cause)
      assert.deepStrictEqual(result, Result.fail(Cause.die("boom")))
    })

    it("fails with the original cause when no done signal is present", () => {
      const cause = Cause.fail("error")
      assert.deepStrictEqual(Pull.filterDone(cause), Result.fail(cause))
    })

    it("succeeds when the done signal is merged only with interruptions", () => {
      const cause = Cause.combine(Cause.interrupt(1), Cause.fail(Cause.Done("leftover")))
      assert.deepStrictEqual(Pull.filterDone(cause), Result.succeed(Cause.Done("leftover")))
    })
  })

  describe("doneExitFromCause", () => {
    it("treats a pure done cause as success", () => {
      const exit = Pull.doneExitFromCause(Cause.fail(Cause.Done("leftover")))
      assert.deepStrictEqual(exit, Exit.succeed("leftover"))
    })

    it("fails with the stripped cause when the done signal was merged with a failure", () => {
      const cause = Cause.combine(Cause.fail(Cause.Done("leftover")), Cause.die("boom"))
      assert.deepStrictEqual(Pull.doneExitFromCause(cause), Exit.failCause(Cause.die("boom")))
    })
  })
})
