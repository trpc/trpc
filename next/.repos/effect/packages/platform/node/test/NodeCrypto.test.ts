import * as NodeCrypto from "@effect/platform-node/NodeCrypto"
import { assert, describe, it } from "@effect/vitest"
import * as Aead from "effect/crypto/Aead"
import * as Digest from "effect/crypto/Digest"
import * as Kdf from "effect/crypto/Kdf"
import * as Mac from "effect/crypto/Mac"
import * as SecureRandom from "effect/crypto/SecureRandom"
import * as Effect from "effect/Effect"
import * as Hex from "effect/encoding/Hex"
import * as Layer from "effect/Layer"
import * as Result from "effect/Result"
import * as NodeCryptoModule from "node:crypto"

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
const bytes = (hex: string): Uint8Array => Result.getOrThrow(Hex.decode(hex))

// RFC 8439, section 2.8.2, and draft-irtf-cfrg-xchacha-03, Appendix A.3.1.
const sunscreen = encode(
  "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it."
)
const chachaKey = "808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f"
const aeadVectors: ReadonlyArray<readonly [Aead.Algorithm, string, string, string]> = [
  [
    Aead.chacha20Poly1305,
    chachaKey,
    "070000004041424344454647",
    "d31a8d34648e60db7b86afbc53ef7ec2a4aded51296e08fea9e2b5a736ee62d63dbea45e8ca9671282fafb69da92728b" +
    "1a71de0a9e060b2905d6a5b67ecd3b3692ddbd7f2d778b8c9803aee328091b58fab324e4fad675945585808b4831d7bc" +
    "3ff4def08e4b7a9de576d26586cec64b61161ae10b594f09e26a7e902ecbd0600691"
  ],
  [
    Aead.xchacha20Poly1305,
    chachaKey,
    "404142434445464748494a4b4c4d4e4f5051525354555657",
    "bd6d179d3e83d43b9576579493c0e939572a1700252bfaccbed2902c21396cbb731c7f1b0b4aa6440bf3a82f4eda7e39" +
    "ae64c6708c54c216cb96b72e1213b4522f8c9ba40db5d945b11b69b982c1bb9e3f3fac2bc369488f76b2383565d3fff9" +
    "21f9664c97637da9768812f615c68b13b52ec0875924c1c7987947deafd8780acf49"
  ]
]

describe("NodeCrypto", () => {
  it.effect("layerDigest computes MD5 and SHA digests", () =>
    Effect.gen(function*() {
      const digest = yield* Digest.Digest
      const abc = new TextEncoder().encode("abc")
      // RFC 1321 and FIPS 180-2 "abc" vectors.
      assert.strictEqual(yield* digest.digestHex(Digest.md5, abc), "900150983cd24fb0d6963f7d28e17f72")
      assert.strictEqual(yield* digest.digestHex(Digest.sha1, abc), "a9993e364706816aba3e25717850c26c9cd0d89d")
      assert.strictEqual(
        yield* digest.digestHex(Digest.sha256, abc),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
      )
      assert.strictEqual((yield* digest.digest(Digest.sha512, abc)).length, 64)
    }).pipe(Effect.provide(NodeCrypto.layerDigest)))

  it.effect("layerMac signs with byte-backed and CryptoKey-backed keys", () =>
    Effect.gen(function*() {
      const mac = yield* Mac.Mac
      // RFC 4231, test case 2.
      const secret = encode("Jefe")
      const message = encode("what do ya want for nothing?")
      const expected = "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
      const cryptoKey = yield* Effect.promise(() =>
        globalThis.crypto.subtle.importKey("raw", secret as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, [
          "sign",
          "verify"
        ])
      )
      for (const key of [yield* Mac.key(Mac.hmacSha256, secret), yield* Mac.fromCryptoKey(Mac.hmacSha256, cryptoKey)]) {
        const tag = yield* mac.sign(key, message)
        assert.strictEqual(Hex.encode(tag), expected)
        assert.isTrue(yield* mac.verify(key, tag, message))
        assert.isFalse(yield* mac.verify(key, tag.subarray(1), message))
      }
    }).pipe(Effect.provide(NodeCrypto.layerMac.pipe(Layer.provide(SecureRandom.layerWebCrypto)))))

  it.effect("layerKdf derives Argon2id where node:crypto has it, and HKDF through the core implementation", () =>
    Effect.gen(function*() {
      const kdf = yield* Kdf.Kdf
      const password = encode("password")
      const salt = encode("somesalt")
      // From the Argon2 reference CLI: `argon2 somesalt -id -t 2 -k 64 -p 1 -l 32`.
      const argon2id = Kdf.argon2id({ memory: 64, passes: 2, parallelism: 1 })
      if (typeof NodeCryptoModule.argon2 === "function") {
        assert.strictEqual(
          Hex.encode(yield* kdf.derive(argon2id, password, { salt, length: 32 })),
          "16a1a498734609dd01456da406de9f3d9da93e6c86c300a12fc1465214ce4922"
        )
      } else {
        const error = yield* Effect.flip(kdf.derive(argon2id, password, { salt, length: 32 }))
        assert.strictEqual(error.reason._tag, "Unsupported")
      }
      // RFC 5869, test case 3.
      assert.strictEqual(
        Hex.encode(
          yield* kdf.derive(Kdf.hkdfSha256, new Uint8Array(22).fill(0x0b), { salt: new Uint8Array(), length: 42 })
        ),
        "8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8"
      )
    }).pipe(Effect.provide(NodeCrypto.layerKdf)))

  it.effect("layerAead encrypts ChaCha20-Poly1305 on node:crypto and the other algorithms through the core implementation", () =>
    Effect.gen(function*() {
      const aead = yield* Aead.Aead
      const aad = bytes("50515253c0c1c2c3c4c5c6c7")
      for (const [algorithm, keyHex, nonceHex, expected] of aeadVectors) {
        const key = yield* Aead.key(algorithm, bytes(keyHex))
        const nonce = bytes(nonceHex)
        const sealed = yield* aead.encrypt(key, sunscreen, { nonce, aad })
        assert.strictEqual(Hex.encode(sealed), expected)
        assert.deepStrictEqual(yield* aead.decrypt(key, sealed, { nonce, aad }), sunscreen)
        sealed[sealed.length - 1] ^= 1
        for (const data of [sealed, sealed.subarray(0, 15)]) {
          const error = yield* Effect.flip(aead.decrypt(key, data, { nonce, aad }))
          assert.strictEqual(error.reason._tag, "DecryptionFailed")
          assert.strictEqual(error.message, "Aead.decrypt: Could not decrypt the data")
        }
        // node:crypto would throw its own error for a wrong nonce length.
        const error = yield* Effect.flip(aead.encrypt(key, sunscreen, { nonce: new Uint8Array(16) }))
        assert.strictEqual(error.reason._tag, "InvalidArgument")
      }

      const cryptoKey = yield* Effect.promise(() =>
        globalThis.crypto.subtle.importKey("raw", new Uint8Array(32), "AES-GCM", false, ["encrypt", "decrypt"])
      )
      for (
        const key of [
          yield* Aead.key(Aead.aes256Gcm, new Uint8Array(32)),
          yield* Aead.fromCryptoKey(Aead.aes256Gcm, cryptoKey)
        ]
      ) {
        const nonce = new Uint8Array(12)
        // The GCM specification, test case 13.
        assert.strictEqual(
          Hex.encode(yield* aead.encrypt(key, new Uint8Array(), { nonce })),
          "530f8afbc74536b9a963b4f1c4cb738b"
        )
      }
    }).pipe(Effect.provide(NodeCrypto.layerAead.pipe(Layer.provide(SecureRandom.layerWebCrypto)))))

  // An effect may run later than it is built, so node:crypto must not see a
  // nonce that was valid only when the effect was built.
  it.effect("layerAead checks the ChaCha20-Poly1305 nonce length when the effect runs", () =>
    Effect.gen(function*() {
      const aead = yield* Aead.Aead
      const key = yield* Aead.key(Aead.chacha20Poly1305, bytes(chachaKey))
      const options = { nonce: new Uint8Array(12) }
      const data = new Uint8Array(32)
      const encrypt = aead.encrypt(key, data, options)
      const decrypt = aead.decrypt(key, data, options)
      options.nonce = new Uint8Array(16)
      assert.strictEqual((yield* Effect.flip(encrypt)).reason._tag, "InvalidArgument")
      assert.strictEqual((yield* Effect.flip(decrypt)).reason._tag, "InvalidArgument")
    }).pipe(Effect.provide(NodeCrypto.layerAead.pipe(Layer.provide(SecureRandom.layerWebCrypto)))))
})
