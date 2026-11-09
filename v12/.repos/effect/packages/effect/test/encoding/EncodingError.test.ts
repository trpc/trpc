import { assert, describe, it } from "@effect/vitest"
import * as EncodingError from "effect/encoding/EncodingError"

describe("EncodingError", () => {
  it("constructs errors with encoding failure metadata", () => {
    const error = new EncodingError.EncodingError({
      kind: "Decode",
      module: "Base64",
      input: "!!!!",
      message: "Invalid input"
    })

    assert.strictEqual(error._tag, "EncodingError")
    assert.strictEqual(error.kind, "Decode")
    assert.strictEqual(error.module, "Base64")
    assert.strictEqual(error.input, "!!!!")
    assert.strictEqual(error.message, "Invalid input")
    assert.strictEqual(
      error[EncodingError.EncodingErrorTypeId],
      EncodingError.EncodingErrorTypeId
    )
  })

  it("identifies encoding errors", () => {
    const error = new EncodingError.EncodingError({
      kind: "Encode",
      module: "Hex",
      input: new Uint8Array(),
      message: "Invalid input"
    })

    assert.isTrue(EncodingError.isEncodingError(error))
    assert.isFalse(EncodingError.isEncodingError(new Error("Invalid input")))
    assert.isFalse(EncodingError.isEncodingError({ _tag: "EncodingError" }))
  })
})
