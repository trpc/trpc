import { assert, describe, it } from "@effect/vitest"
import { Cause, Exit } from "effect"
import { inspect } from "node:util"

describe("Exit", () => {
  it("uses reasons in failed runtime JSON and Node inspection", () => {
    const exit = Exit.fail("boom")
    const json = {
      _id: "Exit",
      _tag: "Failure",
      cause: { _id: "Cause", reasons: [{ _tag: "Fail", error: "boom" }] }
    }
    assert.strictEqual(JSON.stringify(exit.toJSON()), JSON.stringify(json))
    assert.strictEqual(JSON.stringify(exit), JSON.stringify(json))
    assert.strictEqual(inspect(exit), inspect(json))
  })

  it("toString", () => {
    assert.strictEqual(Exit.succeed(1).toString(), "Success(1)")
    assert.strictEqual(Exit.fail("error").toString(), `Failure(Cause([Fail("error")]))`)
    assert.strictEqual(Exit.die("error").toString(), `Failure(Cause([Die("error")]))`)
    assert.strictEqual(Exit.interrupt(1).toString(), `Failure(Cause([Interrupt(1)]))`)
    assert.strictEqual(Exit.interrupt(undefined).toString(), `Failure(Cause([Interrupt(undefined)]))`)
  })

  it("error mapping keeps defects and interrupts", () => {
    const defect = new Error("boom")
    const self = Exit.failCause(Cause.fromReasons([
      Cause.makeFailReason("error"),
      Cause.makeInterruptReason(1),
      Cause.makeDieReason(defect)
    ]))
    const onFailure = () => "mapped"
    const expected = Exit.failCause(Cause.fromReasons([
      Cause.makeFailReason("mapped"),
      Cause.makeInterruptReason(1),
      Cause.makeDieReason(defect)
    ]))
    assert.deepStrictEqual(Exit.mapError(self, onFailure), expected)
    assert.deepStrictEqual(Exit.mapBoth(self, { onFailure, onSuccess: (a) => a }), expected)
  })
})
