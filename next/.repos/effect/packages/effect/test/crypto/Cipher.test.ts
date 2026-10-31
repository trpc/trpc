import { assert, describe, it } from "@effect/vitest"
import * as Cipher from "effect/crypto/Cipher"
import * as Mac from "effect/crypto/Mac"
import * as SecureRandom from "effect/crypto/SecureRandom"
import * as Effect from "effect/Effect"
import * as Hex from "effect/encoding/Hex"
import * as Layer from "effect/Layer"
import * as NodeCrypto from "node:crypto"
import { assertReason, bytes, unreachable, view } from "../utils/crypto.ts"

// NIST SP 800-38A, appendix F.2 and F.5.
const key128 = "2b7e151628aed2a6abf7158809cf4f3c"
const key256 = "603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4"
const plaintext = bytes(
  "6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710"
)
const ctrIv = "f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff"
const cbcIv = "000102030405060708090a0b0c0d0e0f"
const vectors: ReadonlyArray<readonly [Cipher.Algorithm, string, string, string]> = [
  [
    Cipher.aes128Ctr,
    key128,
    ctrIv,
    "874d6191b620e3261bef6864990db6ce9806f66b7970fdff8617187bb9fffdff5ae4df3edbd5d35e5b4f09020db03eab1e031dda2fbe03d1792170a0f3009cee"
  ],
  [
    Cipher.aes256Ctr,
    key256,
    ctrIv,
    "601ec313775789a5b7a7f504bbf3d228f443e3ca4d62b59aca84e990cacaf5c52b0930daa23de94ce87017ba2d84988ddfc9c58db67aada613c2dd08457941a6"
  ],
  // The NIST ciphertext followed by the PKCS#7 padding block, from OpenSSL.
  [
    Cipher.aes128Cbc,
    key128,
    cbcIv,
    "7649abac8119b246cee98e9b12e9197d5086cb9b507219ee95db113a917678b273bed6b8e3c1743b7116e69e222295163ff1caa1681fac09120eca307586e1a7" +
    "8cb82807230e1321d3fae00d18cc2012"
  ],
  [
    Cipher.aes256Cbc,
    key256,
    cbcIv,
    "f58c4c04d6e5f1ba779eabfb5f7bfbd69cfc4e967edb808d679f777bc6702c7d39f23369a9d9bacfa530e26304231461b2eb05e2c39be9fcda6c19078c6a9d1b" +
    "3f461796d6b0d6b2e0c2a72b4d80e644"
  ]
]

const seeded = Layer.succeed(SecureRandom.SecureRandom, SecureRandom.make((size) => new Uint8Array(size).fill(7)))
const layer = Cipher.layerWebCrypto.pipe(Layer.provide(seeded))

const importAes = (name: string, length: number, usages: Array<KeyUsage> = ["encrypt", "decrypt"]) =>
  Effect.promise(() =>
    globalThis.crypto.subtle.importKey("raw", new Uint8Array(length / 8).fill(1), name, false, usages)
  )

describe("Cipher", () => {
  it.effect("isKey accepts Cipher keys and rejects Mac keys", () =>
    Effect.gen(function*() {
      const bytes = new Uint8Array(32)
      assert.isTrue(Cipher.isKey(yield* Cipher.key(Cipher.aes256Ctr, bytes)))
      assert.isFalse(Cipher.isKey(yield* Mac.key(Mac.hmacSha256, bytes)))
    }))

  it.effect("encrypts and decrypts the published vectors", () =>
    Effect.gen(function*() {
      const cipher = yield* Cipher.Cipher
      for (const [algorithm, keyHex, iv, expected] of vectors) {
        const key = yield* Cipher.key(algorithm, bytes(keyHex))
        assert.strictEqual(key.algorithm, algorithm)
        const options = { iv: view(bytes(iv)) }
        assert.strictEqual(Hex.encode(yield* cipher.encrypt(key, view(plaintext), options)), expected)
        assert.deepStrictEqual(yield* cipher.decrypt(key, view(bytes(expected)), options), plaintext)
      }
    }).pipe(Effect.provide(layer)))

  // A 64-bit counter would wrap to zero after the first block instead of
  // carrying into the upper half, as OpenSSL, Go and noble do.
  it.effect("counts AES-CTR blocks with the whole 128-bit block", () =>
    Effect.gen(function*() {
      const cipher = yield* Cipher.Cipher
      const keyBytes = bytes(key128)
      const iv = bytes("0000000000000000ffffffffffffffff")
      const data = new Uint8Array(48)
      const expected = NodeCrypto.createCipheriv("aes-128-ctr", keyBytes, iv).update(data)
      const key = yield* Cipher.key(Cipher.aes128Ctr, keyBytes)
      assert.strictEqual(Hex.encode(yield* cipher.encrypt(key, data, { iv })), Hex.encode(expected))
    }).pipe(Effect.provide(layer)))

  // Distinguishable padding and length failures would be a padding oracle.
  it.effect("fails AES-CBC decryption identically for bad padding and bad lengths, and never fails AES-CTR", () =>
    Effect.gen(function*() {
      const cipher = yield* Cipher.Cipher
      const iv = bytes(cbcIv)
      const messages = new Set<string>()
      for (const [algorithm, keyHex, , sealed] of vectors.slice(2)) {
        const key = yield* Cipher.key(algorithm, bytes(keyHex))
        const ciphertext = bytes(sealed)
        // The last plaintext block is all padding, so this turns its final
        // 0x10 into 0x00.
        const badPadding = ciphertext.slice()
        badPadding[63] ^= 0x10
        const cases = [badPadding, ciphertext.subarray(0, 79), ciphertext.subarray(0, 15), new Uint8Array()]
        for (const data of cases) {
          const error = yield* Effect.flip(cipher.decrypt(key, data, { iv }))
          assert.strictEqual(error.module, "Cipher")
          assertReason(error, "DecryptionFailed", "decrypt")
          assert.isUndefined(error.cause)
          messages.add(error.message)
        }
      }
      assert.strictEqual(messages.size, 1)

      const ctr = yield* Cipher.key(Cipher.aes128Ctr, bytes(key128))
      for (const data of [bytes(vectors[2][3]), new Uint8Array(15)]) {
        assert.strictEqual((yield* cipher.decrypt(ctr, data, { iv })).length, data.length)
      }
    }).pipe(Effect.provide(layer)))

  it.effect("checks the IV length before calling Web Crypto", () =>
    Effect.gen(function*() {
      const cipher = yield* Cipher.Cipher
      const cases: ReadonlyArray<readonly [Cipher.Algorithm, number]> = [
        [Cipher.aes128Ctr, 16],
        [Cipher.aes256Ctr, 32],
        [Cipher.aes128Cbc, 16],
        [Cipher.aes256Cbc, 32]
      ]
      for (const [algorithm, keyLength] of cases) {
        const key = yield* Cipher.key(algorithm, new Uint8Array(keyLength))
        for (const length of [0, 12, 15, 17]) {
          const iv = new Uint8Array(length)
          const data = new Uint8Array(32)
          assertReason(yield* Effect.flip(cipher.encrypt(key, data, { iv })), "InvalidArgument", "encrypt")
          assertReason(yield* Effect.flip(cipher.decrypt(key, data, { iv })), "InvalidArgument", "decrypt")
        }
      }
    }).pipe(Effect.provide(Cipher.layerWebCrypto.pipe(Layer.provide(Layer.mergeAll(seeded, unreachable))))))

  it.effect("builds keys from bytes, SecureRandom and matching CryptoKeys", () =>
    Effect.gen(function*() {
      const cipher = yield* Cipher.Cipher
      // No AES-192.
      const cases: ReadonlyArray<readonly [Cipher.Algorithm, number, ReadonlyArray<number>]> = [
        [Cipher.aes128Ctr, 16, [0, 24, 32]],
        [Cipher.aes256Ctr, 32, [0, 16, 24]],
        [Cipher.aes128Cbc, 16, [0, 24, 32]],
        [Cipher.aes256Cbc, 32, [0, 16, 24]]
      ]
      for (const [algorithm, length, wrongLengths] of cases) {
        const key = yield* cipher.generateKey(algorithm)
        assert.strictEqual(key.algorithm, algorithm)
        assert.deepStrictEqual(yield* Cipher.toBytes(key), new Uint8Array(length).fill(7))
        for (const wrong of wrongLengths) {
          assertReason(yield* Effect.flip(Cipher.key(algorithm, new Uint8Array(wrong))), "InvalidKey", "key")
        }
      }

      const key = yield* Cipher.fromCryptoKey(Cipher.aes256Cbc, yield* importAes("AES-CBC", 256))
      const byteKey = yield* Cipher.key(Cipher.aes256Cbc, new Uint8Array(32).fill(1))
      const iv = bytes(cbcIv)
      const encrypted = yield* cipher.encrypt(key, plaintext, { iv })
      assert.deepStrictEqual(yield* cipher.decrypt(byteKey, encrypted, { iv }), plaintext)
      assertReason(yield* Effect.flip(Cipher.toBytes(key)), "NotExtractable", "toBytes")

      const mismatched = [
        yield* importAes("AES-CBC", 128),
        yield* importAes("AES-CTR", 256),
        yield* importAes("AES-CBC", 256, ["decrypt"])
      ]
      for (const cryptoKey of mismatched) {
        assertReason(
          yield* Effect.flip(Cipher.fromCryptoKey(Cipher.aes256Cbc, cryptoKey)),
          "InvalidKey",
          "fromCryptoKey"
        )
      }
    }).pipe(Effect.provide(layer)))
})
