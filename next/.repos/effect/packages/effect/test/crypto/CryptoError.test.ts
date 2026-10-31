import { assert, describe, it } from "@effect/vitest"
import * as CryptoError from "effect/crypto/CryptoError"

describe("CryptoError", () => {
  it("prefixes the reason message with the module and method and copies the reason's cause", () => {
    const cause = new Error("DataError from fixture")
    const error = new CryptoError.CryptoError({
      module: "Mac",
      method: "key",
      reason: new CryptoError.InvalidKey({ description: "HMAC keys must not be empty", cause })
    })
    assert.strictEqual(error.module, "Mac")
    assert.strictEqual(error.method, "key")
    assert.strictEqual(error.message, "Mac.key: HMAC keys must not be empty")
    assert.strictEqual(error.cause, cause)
  })

  it("carries no detail for a failed decryption", () => {
    const reason = new CryptoError.DecryptionFailed()
    const error = new CryptoError.CryptoError({ module: "Aead", method: "decrypt", reason })
    assert.strictEqual(error.message, `Aead.decrypt: ${reason.message}`)
    assert.isUndefined(error.cause)
    assert.isUndefined(reason.cause)
  })

  it("recognizes the error and each of its reasons", () => {
    const reasons: ReadonlyArray<CryptoError.CryptoErrorReason> = [
      new CryptoError.InvalidArgument({ description: "nonce must be 12 bytes" }),
      new CryptoError.InvalidKey({ description: "key must be 32 bytes" }),
      new CryptoError.DecryptionFailed(),
      new CryptoError.Unsupported({ description: "Kdf.layerWebCrypto does not provide argon2id" }),
      new CryptoError.NotExtractable({ description: "the CryptoKey is not extractable" })
    ]
    for (const reason of reasons) {
      const error = new CryptoError.CryptoError({ module: "Aead", method: "encrypt", reason })
      assert.isTrue(CryptoError.isCryptoError(error))
      assert.isFalse(CryptoError.isCryptoErrorReason(error))
      assert.isTrue(CryptoError.isCryptoErrorReason(reason))
      assert.isFalse(CryptoError.isCryptoError(reason))
    }
    assert.isFalse(CryptoError.isCryptoError(new Error("Aead.encrypt: failed")))
    assert.isFalse(CryptoError.isCryptoErrorReason(new Error("failed")))
  })
})
