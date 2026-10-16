import { assert, describe, it } from "@effect/vitest"
import { Cause, Context } from "effect"

describe("Cause.map", () => {
  it("preserves annotations on mapped failures", () => {
    class RequestId extends Context.Service<RequestId, string>()("RequestId") {}

    const cause = Cause.fail("error").pipe(
      Cause.annotate(Context.make(RequestId, "request-1")),
      Cause.map((error) => error.toUpperCase())
    )

    assert.strictEqual(Context.getOrUndefined(Cause.annotations(cause), RequestId), "request-1")
  })
})
