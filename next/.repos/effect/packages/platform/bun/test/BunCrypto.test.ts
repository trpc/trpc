import * as BunCrypto from "@effect/platform-bun/BunCrypto"
import { assert, describe, it } from "@effect/vitest"
import * as Aead from "effect/crypto/Aead"
import * as Digest from "effect/crypto/Digest"
import * as SecureRandom from "effect/crypto/SecureRandom"
import * as Effect from "effect/Effect"
import * as Hex from "effect/encoding/Hex"
import * as Layer from "effect/Layer"
import * as Result from "effect/Result"

const bytes = (hex: string): Uint8Array => Result.getOrThrow(Hex.decode(hex))

describe("BunCrypto", () => {
  it.effect("re-exports the NodeCrypto layers", () =>
    Effect.gen(function*() {
      const digest = yield* Digest.Digest
      // RFC 1321 "abc" vector.
      assert.strictEqual(
        yield* digest.digestHex(Digest.md5, new TextEncoder().encode("abc")),
        "900150983cd24fb0d6963f7d28e17f72"
      )
    }).pipe(Effect.provide(BunCrypto.layerDigest)))

  // Bun's node:crypto lacks ChaCha20-Poly1305, so layerAead must fall back to
  // the pure TypeScript implementation.
  it.effect("layerAead encrypts ChaCha20-Poly1305", () =>
    Effect.gen(function*() {
      const aead = yield* Aead.Aead
      // RFC 8439, section 2.8.2.
      const key = yield* Aead.key(
        Aead.chacha20Poly1305,
        bytes("808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f")
      )
      const options = { nonce: bytes("070000004041424344454647"), aad: bytes("50515253c0c1c2c3c4c5c6c7") }
      const plaintext = new TextEncoder().encode(
        "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it."
      )
      const sealed = yield* aead.encrypt(key, plaintext, options)
      assert.strictEqual(
        Hex.encode(sealed),
        "d31a8d34648e60db7b86afbc53ef7ec2a4aded51296e08fea9e2b5a736ee62d63dbea45e8ca9671282fafb69da92728b" +
          "1a71de0a9e060b2905d6a5b67ecd3b3692ddbd7f2d778b8c9803aee328091b58fab324e4fad675945585808b4831d7bc" +
          "3ff4def08e4b7a9de576d26586cec64b61161ae10b594f09e26a7e902ecbd0600691"
      )
      assert.deepStrictEqual(yield* aead.decrypt(key, sealed, options), plaintext)
      sealed[0] ^= 1
      assert.strictEqual((yield* Effect.flip(aead.decrypt(key, sealed, options))).reason._tag, "DecryptionFailed")
    }).pipe(Effect.provide(BunCrypto.layerAead.pipe(Layer.provide(SecureRandom.layerWebCrypto)))))
})
