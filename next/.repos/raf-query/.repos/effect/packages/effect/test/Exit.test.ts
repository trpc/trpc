import { assert, describe, it } from "@effect/vitest"
import { Exit } from "effect"

describe("Exit", () => {
  it("toString", () => {
    assert.strictEqual(Exit.succeed(1).toString(), "Success(1)")
    assert.strictEqual(Exit.fail("error").toString(), `Failure(Cause([Fail("error")]))`)
    assert.strictEqual(Exit.die("error").toString(), `Failure(Cause([Die("error")]))`)
    assert.strictEqual(Exit.interrupt(1).toString(), `Failure(Cause([Interrupt(1)]))`)
    assert.strictEqual(Exit.interrupt(undefined).toString(), `Failure(Cause([Interrupt(undefined)]))`)
  })
})
