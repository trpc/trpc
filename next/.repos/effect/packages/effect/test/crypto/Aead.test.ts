import { assert, describe, it } from "@effect/vitest"
import * as Aead from "effect/crypto/Aead"
import * as Cipher from "effect/crypto/Cipher"
import * as SecureRandom from "effect/crypto/SecureRandom"
import * as Effect from "effect/Effect"
import * as Hex from "effect/encoding/Hex"
import * as Layer from "effect/Layer"
import { Buffer } from "node:buffer"
import * as NodeCrypto from "node:crypto"
import { assertReason, bytes, encode, unreachable, view } from "../utils/crypto.ts"

interface Vector {
  readonly algorithm: Aead.Algorithm
  readonly key: string
  readonly nonce: string
  readonly aad: string
  readonly plaintext: Uint8Array
  readonly sealed: string
}

// The GCM specification (McGrew and Viega), test cases 4 and 16.
const gcmPlaintext = bytes(
  "d9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b39"
)
const gcm = {
  nonce: "cafebabefacedbaddecaf888",
  aad: "feedfacedeadbeeffeedfacedeadbeefabaddad2",
  plaintext: gcmPlaintext
}
// RFC 8439, section 2.8.2, and draft-irtf-cfrg-xchacha-03, Appendix A.3.1.
const sunscreen = encode(
  "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it."
)
const chacha = {
  key: "808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f",
  aad: "50515253c0c1c2c3c4c5c6c7",
  plaintext: sunscreen
}

const vectors: ReadonlyArray<Vector> = [
  {
    ...gcm,
    algorithm: Aead.aes128Gcm,
    key: "feffe9928665731c6d6a8f9467308308",
    sealed:
      "42831ec2217774244b7221b784d0d49ce3aa212f2c02a4e035c17e2329aca12e21d514b25466931c7d8f6a5aac84aa051ba30b396a0aac973d58e091" +
      "5bc94fbc3221a5db94fae95ae7121a47"
  },
  {
    ...gcm,
    algorithm: Aead.aes256Gcm,
    key: "feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308",
    sealed:
      "522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662" +
      "76fc6ece0f4e1768cddf8853bb2d551b"
  },
  {
    ...chacha,
    algorithm: Aead.chacha20Poly1305,
    nonce: "070000004041424344454647",
    sealed: "d31a8d34648e60db7b86afbc53ef7ec2a4aded51296e08fea9e2b5a736ee62d63dbea45e8ca9671282fafb69da92728b" +
      "1a71de0a9e060b2905d6a5b67ecd3b3692ddbd7f2d778b8c9803aee328091b58fab324e4fad675945585808b4831d7bc" +
      "3ff4def08e4b7a9de576d26586cec64b61161ae10b594f09e26a7e902ecbd0600691"
  },
  {
    ...chacha,
    algorithm: Aead.xchacha20Poly1305,
    nonce: "404142434445464748494a4b4c4d4e4f5051525354555657",
    sealed: "bd6d179d3e83d43b9576579493c0e939572a1700252bfaccbed2902c21396cbb731c7f1b0b4aa6440bf3a82f4eda7e39" +
      "ae64c6708c54c216cb96b72e1213b4522f8c9ba40db5d945b11b69b982c1bb9e3f3fac2bc369488f76b2383565d3fff9" +
      "21f9664c97637da9768812f615c68b13b52ec0875924c1c7987947deafd8780acf49"
  }
]

const seeded = Layer.succeed(SecureRandom.SecureRandom, SecureRandom.make((size) => new Uint8Array(size).fill(7)))
const layer = Aead.layerWebCrypto.pipe(Layer.provide(seeded))

const importAes = (name: string, length: number, usages: Array<KeyUsage> = ["encrypt", "decrypt"]) =>
  Effect.promise(() =>
    globalThis.crypto.subtle.importKey("raw", new Uint8Array(length / 8).fill(1), name, false, usages)
  )

describe("Aead", () => {
  it.effect("isKey accepts Aead keys and rejects Cipher keys", () =>
    Effect.gen(function*() {
      const bytes = new Uint8Array(32)
      assert.isTrue(Aead.isKey(yield* Aead.key(Aead.aes256Gcm, bytes)))
      assert.isFalse(Aead.isKey(yield* Cipher.key(Cipher.aes256Ctr, bytes)))
    }))

  it.effect("encrypts and decrypts the published vectors", () =>
    Effect.gen(function*() {
      const aead = yield* Aead.Aead
      for (const vector of vectors) {
        const key = yield* Aead.key(vector.algorithm, bytes(vector.key))
        assert.strictEqual(key.algorithm, vector.algorithm)
        const options = { nonce: view(bytes(vector.nonce)), aad: view(bytes(vector.aad)) }
        assert.strictEqual(Hex.encode(yield* aead.encrypt(key, view(vector.plaintext), options)), vector.sealed)
        assert.deepStrictEqual(yield* aead.decrypt(key, view(bytes(vector.sealed)), options), vector.plaintext)
      }
    }).pipe(Effect.provide(layer)))

  // Native and pure-TS code must not reveal which check failed.
  it.effect("fails decryption identically for a tampered tag, AAD or ciphertext", () =>
    Effect.gen(function*() {
      const aead = yield* Aead.Aead
      const messages = new Set<string>()
      for (const vector of vectors) {
        const key = yield* Aead.key(vector.algorithm, bytes(vector.key))
        const sealed = bytes(vector.sealed)
        const nonce = bytes(vector.nonce)
        const aad = bytes(vector.aad)
        const ciphertext = sealed.slice()
        ciphertext[0] ^= 1
        const tag = sealed.slice()
        tag[tag.length - 1] ^= 1
        const cases = [
          [ciphertext, aad],
          [tag, aad],
          [sealed, aad.subarray(1)],
          [sealed, undefined],
          // Shorter than the tag.
          [sealed.subarray(0, 15), aad]
        ] as const
        for (const [data, aad] of cases) {
          const error = yield* Effect.flip(aead.decrypt(key, data, { nonce, aad }))
          assert.strictEqual(error.module, "Aead")
          assertReason(error, "DecryptionFailed", "decrypt")
          assert.isUndefined(error.cause)
          messages.add(error.message)
        }
      }
      assert.strictEqual(messages.size, 1)
    }).pipe(Effect.provide(layer)))

  // Web Crypto and noble report other lengths with the same error as a tag
  // mismatch, so the length must be checked first.
  it.effect("checks the nonce length before any work", () =>
    Effect.gen(function*() {
      const aead = yield* Aead.Aead
      const cases: ReadonlyArray<readonly [Aead.Algorithm, number, ReadonlyArray<number>]> = [
        [Aead.aes128Gcm, 16, [0, 8, 16, 24]],
        [Aead.aes256Gcm, 32, [0, 8, 16, 24]],
        [Aead.chacha20Poly1305, 32, [0, 8, 16, 24]],
        [Aead.xchacha20Poly1305, 32, [0, 12, 16, 32]]
      ]
      for (const [algorithm, keyLength, nonceLengths] of cases) {
        const key = yield* Aead.key(algorithm, new Uint8Array(keyLength))
        for (const length of nonceLengths) {
          const nonce = new Uint8Array(length)
          const data = new Uint8Array(32)
          assertReason(yield* Effect.flip(aead.encrypt(key, data, { nonce })), "InvalidArgument", "encrypt")
          assertReason(yield* Effect.flip(aead.decrypt(key, data, { nonce })), "InvalidArgument", "decrypt")
        }
      }
    }).pipe(Effect.provide(Aead.layerWebCrypto.pipe(Layer.provide(Layer.mergeAll(seeded, unreachable))))))

  // An effect may run later than it is built, or more than once.
  it.effect("checks the nonce length when the effect runs", () =>
    Effect.gen(function*() {
      const aead = yield* Aead.Aead
      for (const algorithm of [Aead.aes256Gcm, Aead.chacha20Poly1305, Aead.xchacha20Poly1305]) {
        const key = yield* Aead.key(algorithm, new Uint8Array(32))
        const options = { nonce: new Uint8Array(algorithm.nonceLength) }
        const data = new Uint8Array(32)
        const encrypt = aead.encrypt(key, data, options)
        const decrypt = aead.decrypt(key, data, options)
        options.nonce = new Uint8Array(algorithm.nonceLength + 4)
        assertReason(yield* Effect.flip(encrypt), "InvalidArgument", "encrypt")
        assertReason(yield* Effect.flip(decrypt), "InvalidArgument", "decrypt")
      }
    }).pipe(Effect.provide(layer)))

  it.effect("builds keys of each algorithm's length from bytes and SecureRandom", () =>
    Effect.gen(function*() {
      const aead = yield* Aead.Aead
      // No AES-192, and ChaCha keys are 32 bytes.
      const cases: ReadonlyArray<readonly [Aead.Algorithm, number, ReadonlyArray<number>]> = [
        [Aead.aes128Gcm, 16, [0, 24, 32]],
        [Aead.aes256Gcm, 32, [0, 16, 24]],
        [Aead.chacha20Poly1305, 32, [0, 16, 24]],
        [Aead.xchacha20Poly1305, 32, [0, 16, 24]]
      ]
      for (const [algorithm, length, wrongLengths] of cases) {
        const key = yield* aead.generateKey(algorithm)
        assert.strictEqual(key.algorithm, algorithm)
        assert.deepStrictEqual(yield* Aead.toBytes(key), new Uint8Array(length).fill(7))
        for (const wrong of wrongLengths) {
          assertReason(yield* Effect.flip(Aead.key(algorithm, new Uint8Array(wrong))), "InvalidKey", "key")
        }
      }
    }).pipe(Effect.provide(layer)))

  it.effect("uses AES-GCM CryptoKeys that match the algorithm, without exporting non-extractable ones", () =>
    Effect.gen(function*() {
      const aead = yield* Aead.Aead
      const cryptoKey = yield* importAes("AES-GCM", 256)
      const key = yield* Aead.fromCryptoKey(Aead.aes256Gcm, cryptoKey)
      const byteKey = yield* Aead.key(Aead.aes256Gcm, new Uint8Array(32).fill(1))
      const options = { nonce: new Uint8Array(12), aad: encode("aad") }
      const sealed = yield* aead.encrypt(key, sunscreen, options)
      assert.deepStrictEqual(yield* aead.decrypt(byteKey, sealed, options), sunscreen)
      assertReason(yield* Effect.flip(Aead.toBytes(key)), "NotExtractable", "toBytes")

      const mismatched = [
        yield* importAes("AES-GCM", 128),
        yield* importAes("AES-CBC", 256),
        // An Aead.Key both encrypts and decrypts, so it needs both usages.
        yield* importAes("AES-GCM", 256, ["encrypt"])
      ]
      for (const cryptoKey of mismatched) {
        assertReason(
          yield* Effect.flip(Aead.fromCryptoKey(Aead.aes256Gcm, cryptoKey)),
          "InvalidKey",
          "fromCryptoKey"
        )
      }
      // ChaCha never runs on `crypto.subtle`.
      const fromChaCha = () =>
        // @ts-expect-error
        Aead.fromCryptoKey(Aead.chacha20Poly1305, cryptoKey)
      void fromChaCha
    }).pipe(Effect.provide(layer)))

  describe("layerWebCryptoWith", () => {
    const chachaImplementation = Aead.chacha20Poly1305.implementation!
    const recorded = () => {
      const calls: Array<string> = []
      const implementation: Aead.Implementation = {
        encrypt: (...args) => {
          calls.push("encrypt")
          return chachaImplementation.encrypt(...args)
        },
        decrypt: (...args) => {
          calls.push("decrypt")
          return chachaImplementation.decrypt(...args)
        }
      }
      const layer = Aead.layerWebCryptoWith({
        implementations: { chacha20Poly1305: implementation, aes256Gcm: implementation }
      })
      return { calls, layer }
    }

    it.effect("runs implementations for byte-backed keys and WebCrypto for CryptoKeys", () => {
      const { calls, layer } = recorded()
      return Effect.gen(function*() {
        const aead = yield* Aead.Aead
        const vector = vectors[2]
        const key = yield* Aead.key(vector.algorithm, bytes(vector.key))
        const options = { nonce: bytes(vector.nonce), aad: bytes(vector.aad) }
        assert.strictEqual(Hex.encode(yield* aead.encrypt(key, vector.plaintext, options)), vector.sealed)
        assert.deepStrictEqual(yield* aead.decrypt(key, bytes(vector.sealed), options), vector.plaintext)
        assert.deepStrictEqual(calls, ["encrypt", "decrypt"])

        const cryptoKey = yield* Aead.fromCryptoKey(Aead.aes256Gcm, yield* importAes("AES-GCM", 256))
        const gcmOptions = { nonce: new Uint8Array(12), aad: encode("aad") }
        const sealed = yield* aead.encrypt(cryptoKey, sunscreen, gcmOptions)
        assert.deepStrictEqual(yield* aead.decrypt(cryptoKey, sealed, gcmOptions), sunscreen)
        assert.deepStrictEqual(calls, ["encrypt", "decrypt"])
      }).pipe(Effect.provide(layer.pipe(Layer.provide(seeded))))
    })

    it.effect("rejects bad nonces and short ciphertexts before implementations, as layerWebCrypto does", () => {
      const { calls, layer } = recorded()
      const failures = (layer: Layer.Layer<Aead.Aead, never, SecureRandom.SecureRandom>) =>
        Effect.gen(function*() {
          const aead = yield* Aead.Aead
          const errors: Array<readonly [string, string, string]> = []
          for (const algorithm of [Aead.chacha20Poly1305, Aead.aes256Gcm]) {
            const key = yield* Aead.key(algorithm, new Uint8Array(32))
            const nonce = new Uint8Array(algorithm.nonceLength)
            const badNonce = new Uint8Array(algorithm.nonceLength + 4)
            for (
              const effect of [
                aead.encrypt(key, new Uint8Array(32), { nonce: badNonce }),
                aead.decrypt(key, new Uint8Array(32), { nonce: badNonce }),
                aead.decrypt(key, new Uint8Array(15), { nonce })
              ]
            ) {
              const error = yield* Effect.flip(effect)
              errors.push([error.method, error.reason._tag, error.message])
            }
          }
          return errors
        }).pipe(Effect.provide(layer.pipe(Layer.provide(Layer.mergeAll(seeded, unreachable)))))
      return Effect.gen(function*() {
        const expected = yield* failures(Aead.layerWebCrypto)
        assert.deepStrictEqual(expected.map(([method, reason]) => [method, reason]), [
          ["encrypt", "InvalidArgument"],
          ["decrypt", "InvalidArgument"],
          ["decrypt", "DecryptionFailed"],
          ["encrypt", "InvalidArgument"],
          ["decrypt", "InvalidArgument"],
          ["decrypt", "DecryptionFailed"]
        ])
        assert.deepStrictEqual(yield* failures(layer), expected)
        assert.deepStrictEqual(calls, [])
      })
    })
  })

  it.effect.skipIf(!NodeCrypto.getCiphers().includes("chacha20-poly1305"))(
    "matches node:crypto ChaCha20-Poly1305 on random inputs",
    () =>
      Effect.gen(function*() {
        const aead = yield* Aead.Aead
        for (let i = 0; i < 64; i++) {
          // Lengths cross the 16-byte Poly1305 and 64-byte ChaCha20 blocks.
          const keyBytes = NodeCrypto.randomBytes(32)
          const nonce = NodeCrypto.randomBytes(12)
          const aad = NodeCrypto.randomBytes(NodeCrypto.randomInt(40))
          const plaintext = NodeCrypto.randomBytes(NodeCrypto.randomInt(300))
          const cipher = NodeCrypto.createCipheriv("chacha20-poly1305", keyBytes, nonce, { authTagLength: 16 })
          cipher.setAAD(aad)
          const expected = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()])
          const inputs = Hex.encode(Buffer.concat([keyBytes, nonce, aad, plaintext]))

          const key = yield* Aead.key(Aead.chacha20Poly1305, keyBytes)
          const sealed = yield* aead.encrypt(key, plaintext, { nonce, aad })
          assert.strictEqual(Hex.encode(sealed), Hex.encode(expected), inputs)
          assert.deepStrictEqual(yield* aead.decrypt(key, expected, { nonce, aad }), new Uint8Array(plaintext), inputs)
        }
      }).pipe(Effect.provide(layer))
  )
})
