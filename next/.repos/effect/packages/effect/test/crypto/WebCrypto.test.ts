import { assert, describe, it } from "@effect/vitest"
import * as Cause from "effect/Cause"
import * as Digest from "effect/crypto/Digest"
import * as SecureRandom from "effect/crypto/SecureRandom"
import * as Signature from "effect/crypto/Signature"
import * as WebCrypto from "effect/crypto/WebCrypto"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { assertReason, encode, fakeSubtle } from "../utils/crypto.ts"

const assertSubtleUnavailable = <A, E>(exit: Exit.Exit<A, E>) => {
  assert.isTrue(Exit.isFailure(exit) && Cause.hasDies(exit.cause), "expected a defect")
  if (Exit.isFailure(exit)) {
    assert.include(String(Cause.squash(exit.cause)), "crypto.subtle is unavailable")
  }
}

describe("WebCrypto", () => {
  it.effect("identifies the algorithm and declining layer in native Unsupported errors", () =>
    Effect.gen(function*() {
      const key = yield* Signature.privateKey(Signature.ed25519, new Uint8Array(32).fill(7))
      const signature = yield* Signature.Signature
      const error = yield* Effect.flip(signature.sign(key, encode("message")))
      assertReason(error, "Unsupported", "sign")
      assert.include(error.reason.message, "ed25519")
      assert.include(error.reason.message, "Signature.layerWebCrypto")
    }).pipe(
      Effect.provide(Signature.layerWebCrypto),
      Effect.provideService(SecureRandom.SecureRandom, SecureRandom.make((size) => new Uint8Array(size).fill(7))),
      Effect.provide(fakeSubtle({
        importKey: () => Promise.reject(new DOMException("not supported", "NotSupportedError"))
      }))
    ))

  it.effect("defaults to globalThis.crypto", () =>
    Effect.gen(function*() {
      assert.strictEqual(yield* WebCrypto.WebCrypto, globalThis.crypto)
    }))

  it.effect("swaps the Crypto object the Digest service runs on", () =>
    Effect.gen(function*() {
      const digest = yield* Digest.Digest
      assert.deepStrictEqual(yield* digest.digest(Digest.sha256, encode("abc")), Uint8Array.of(1, 2, 3))
    }).pipe(
      Effect.provide(Digest.layerWebCrypto),
      Effect.provide(WebCrypto.layer({
        subtle: { digest: () => Promise.resolve(Uint8Array.of(1, 2, 3).buffer) }
      } as unknown as Crypto))
    ))

  it.effect("dies at the first call that needs crypto.subtle, not when a layer is built", () =>
    Effect.gen(function*() {
      const digest = yield* Digest.Digest
      // MD5 is pure TypeScript, so it keeps working without crypto.subtle.
      assert.strictEqual(yield* digest.digestHex(Digest.md5, encode("abc")), "900150983cd24fb0d6963f7d28e17f72")
      assertSubtleUnavailable(yield* Effect.exit(digest.digest(Digest.sha256, encode("abc"))))
      assertSubtleUnavailable(yield* Effect.exit(digest.digestHex(Digest.sha256, encode("abc"))))
    }).pipe(
      Effect.provide(Digest.layerWebCrypto),
      // A Crypto object without subtle, as in an insecure browser context.
      Effect.provide(WebCrypto.layer({} as Crypto))
    ))
})
