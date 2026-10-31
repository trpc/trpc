import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"
import { ProblemDetails } from "effect/http"

describe("ProblemDetails", () => {
  it("decode drops wrong-typed members, defaults type and keeps extensions", () => {
    const decoded = Schema.decodeUnknownSync(ProblemDetails.Schema)({
      title: 123,
      status: 404,
      detail: "No such user",
      traceId: "abc-123"
    })
    assert.deepStrictEqual(decoded, {
      type: "about:blank",
      status: 404,
      detail: "No such user",
      traceId: "abc-123"
    })
  })

  it("encode always emits type", () => {
    const encoded = Schema.encodeSync(ProblemDetails.Schema)({
      type: "about:blank",
      title: "Not Found",
      status: 404
    })
    assert.deepStrictEqual(encoded, { type: "about:blank", title: "Not Found", status: 404 })
  })
})
