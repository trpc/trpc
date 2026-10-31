import { assert, describe, it } from "@effect/vitest"
import * as Aead from "effect/crypto/Aead"
import * as Cipher from "effect/crypto/Cipher"
import * as Digest from "effect/crypto/Digest"
import * as KeyWrap from "effect/crypto/KeyWrap"
import * as Mac from "effect/crypto/Mac"
import * as SecureRandom from "effect/crypto/SecureRandom"
import * as Signature from "effect/crypto/Signature"
import * as Effect from "effect/Effect"
import * as Hex from "effect/encoding/Hex"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import { Buffer } from "node:buffer"
import * as NodeCrypto from "node:crypto"
import { inspect } from "node:util"
import { assertReason, bytes, fakeSubtle } from "../utils/crypto.ts"

// RFC 3394, sections 4.1 and 4.6.
const rfc3394 = [
  {
    algorithm: KeyWrap.aes128Kw,
    kek: "000102030405060708090a0b0c0d0e0f",
    target: Aead.aes128Gcm,
    key: "00112233445566778899aabbccddeeff",
    wrapped: "1fa68b0a8112b447aef34bd8fb5a7b829d3e862371d2cfe5"
  },
  {
    algorithm: KeyWrap.aes256Kw,
    kek: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    target: Aead.aes256Gcm,
    key: "00112233445566778899aabbccddeeff000102030405060708090a0b0c0d0e0f",
    wrapped: "28c9f404c4b810f4cbccb35cfb87f8263f5786e2d80ed326cbc7f0e71a99f43bfb988b9b7a02dd21"
  }
] as const

// A small modulus keeps generation fast.
const rsaOaep2048 = KeyWrap.rsaOaep({ hash: Digest.sha256, modulusLength: 2048 })

const seeded = Layer.succeed(SecureRandom.SecureRandom, SecureRandom.make((size) => new Uint8Array(size).fill(7)))
const layer = KeyWrap.layerWebCrypto.pipe(Layer.provide(seeded))

const subtle = globalThis.crypto.subtle

describe("KeyWrap", () => {
  it.effect("reports the imported RSA CryptoKey modulus rather than the generation default", () =>
    Effect.gen(function*() {
      const pair = yield* Effect.promise(() =>
        globalThis.crypto.subtle.generateKey(
          { name: "RSA-OAEP", hash: "SHA-256", modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1) },
          false,
          ["encrypt", "decrypt"]
        )
      )
      const key = yield* KeyWrap.privateKeyFromCryptoKey(KeyWrap.rsaOaepSha256, pair.privateKey)
      assert.strictEqual(key.algorithm.modulusLength, 2048)
    }))

  it.effect("wraps and unwraps the RFC 3394 AES-KW vectors into typed keys", () =>
    Effect.gen(function*() {
      const keyWrap = yield* KeyWrap.KeyWrap
      for (const vector of rfc3394) {
        const kek = yield* KeyWrap.key(vector.algorithm, bytes(vector.kek))
        assert.strictEqual(kek.algorithm, vector.algorithm)
        const wrapped = yield* keyWrap.wrap(kek, yield* Aead.key(vector.target, bytes(vector.key)))
        assert.strictEqual(Hex.encode(wrapped), vector.wrapped)

        const unwrapped = yield* keyWrap.unwrap(kek, vector.target, wrapped)
        assert.strictEqual(unwrapped.algorithm, vector.target)
        assert.strictEqual(Hex.encode(yield* Aead.toBytes(unwrapped)), vector.key)
        // The same bytes can come back as a key of another family.
        const mac = yield* keyWrap.unwrap(kek, Mac.hmacSha256, wrapped)
        assert.strictEqual(Hex.encode(yield* Mac.toBytes(mac)), vector.key)

        const tampered = wrapped.slice()
        tampered[0] ^= 1
        const error = yield* Effect.flip(keyWrap.unwrap(kek, vector.target, tampered))
        assertReason(error, "DecryptionFailed", "unwrap")
        assert.isUndefined(error.cause)
      }
    }).pipe(Effect.provide(layer)))

  // Only unwrap turns an OperationError into DecryptionFailed. Arguments are
  // checked before wrap reaches WebCrypto, so its OperationError is a bug.
  it.effect("keeps an unexpected wrap failure a defect, unlike an unwrap failure", () =>
    Effect.gen(function*() {
      const keyWrap = yield* KeyWrap.KeyWrap
      const kek = yield* KeyWrap.key(KeyWrap.aes128Kw, new Uint8Array(16))
      const exit = yield* Effect.exit(keyWrap.wrap(kek, yield* Aead.key(Aead.aes128Gcm, new Uint8Array(16))))
      assert.isTrue(Exit.hasDies(exit), "expected a defect")

      const error = yield* Effect.flip(keyWrap.unwrap(kek, Aead.aes128Gcm, new Uint8Array(24)))
      assertReason(error, "DecryptionFailed", "unwrap")
      assert.isUndefined(error.cause)
    }).pipe(Effect.provide(KeyWrap.layerWebCrypto.pipe(Layer.provide(Layer.mergeAll(
      seeded,
      fakeSubtle({
        wrapKey: () => Promise.reject(new DOMException("failed", "OperationError")),
        unwrapKey: () => Promise.reject(new DOMException("failed", "OperationError"))
      })
    ))))))

  it.effect("builds AES-KW keys from SecureRandom bytes and applies the RFC 3394 length rule", () =>
    Effect.gen(function*() {
      const keyWrap = yield* KeyWrap.KeyWrap
      const kek = yield* keyWrap.generateKey(KeyWrap.aes256Kw)
      assert.deepStrictEqual(yield* KeyWrap.toBytes(kek), new Uint8Array(32).fill(7))
      for (const length of [0, 15, 24, 32]) {
        assertReason(yield* Effect.flip(KeyWrap.key(KeyWrap.aes128Kw, new Uint8Array(length))), "InvalidKey", "key")
      }

      // Wrapped keys must be a multiple of 8 bytes and at least 16.
      const wrapped = yield* keyWrap.wrap(kek, yield* Mac.key(Mac.hmacSha256, new Uint8Array(24).fill(1)))
      assert.strictEqual(wrapped.length, 32)
      for (const length of [8, 20]) {
        const target = yield* Mac.key(Mac.hmacSha256, new Uint8Array(length).fill(1))
        assertReason(yield* Effect.flip(keyWrap.wrap(kek, target)), "InvalidArgument", "wrap")
      }
      assertReason(
        yield* Effect.flip(keyWrap.unwrap(kek, Mac.hmacSha256, new Uint8Array(20))),
        "InvalidArgument",
        "unwrap"
      )
    }).pipe(Effect.provide(layer)))

  it.effect("wraps with RSA-OAEP, storing SPKI and PKCS#8 and binding MGF1 to the hash", () =>
    Effect.gen(function*() {
      const keyWrap = yield* KeyWrap.KeyWrap
      // RSA-OAEP-256 is the default, with RSA-OAEP for JOSE interop.
      assert.strictEqual(KeyWrap.rsaOaepSha256.hash, Digest.sha256)
      assert.strictEqual(KeyWrap.rsaOaepSha256.modulusLength, 3072)
      assert.strictEqual(KeyWrap.rsaOaepSha1.hash, Digest.sha1)

      const { privateKey, publicKey } = yield* keyWrap.generateKeyPair(rsaOaep2048)
      assert.strictEqual(privateKey.algorithm, rsaOaep2048)
      const target = yield* Cipher.key(Cipher.aes256Cbc, new Uint8Array(32).fill(3))
      const wrapped = yield* keyWrap.wrap(publicKey, target)
      assert.strictEqual(wrapped.length, 256)
      const unwrapped = yield* keyWrap.unwrap(privateKey, Cipher.aes256Cbc, wrapped)
      assert.deepStrictEqual(yield* Cipher.toBytes(unwrapped), new Uint8Array(32).fill(3))

      // node:crypto decrypts with the stored PKCS#8 key, independently of the layer.
      const pkcs8 = NodeCrypto.createPrivateKey({
        key: Buffer.from(yield* KeyWrap.toBytes(privateKey)),
        format: "der",
        type: "pkcs8"
      })
      const decrypted = NodeCrypto.privateDecrypt(
        { key: pkcs8, padding: NodeCrypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
        wrapped
      )
      assert.deepStrictEqual(new Uint8Array(decrypted), new Uint8Array(32).fill(3))
      assert.deepStrictEqual(
        NodeCrypto.createPublicKey(pkcs8).export({ format: "der", type: "spki" }),
        Buffer.from(yield* KeyWrap.toBytes(publicKey))
      )

      const other = yield* keyWrap.generateKeyPair(rsaOaep2048)
      const error = yield* Effect.flip(keyWrap.unwrap(other.privateKey, Cipher.aes256Cbc, wrapped))
      assertReason(error, "DecryptionFailed", "unwrap")
      assert.isUndefined(error.cause)
    }).pipe(Effect.provide(layer)))

  it.effect("mixes the encrypt and wrapKey routes for RSA-OAEP CryptoKeys", () =>
    Effect.gen(function*() {
      const keyWrap = yield* KeyWrap.KeyWrap
      const pair = yield* keyWrap.generateKeyPair(rsaOaep2048)
      const params = { name: "RSA-OAEP", hash: "SHA-256" }
      const spki = yield* KeyWrap.toBytes(pair.publicKey)
      const pkcs8 = yield* KeyWrap.toBytes(pair.privateKey)
      const wrapOnly = yield* KeyWrap.publicKeyFromCryptoKey(
        rsaOaep2048,
        yield* Effect.promise(() => subtle.importKey("spki", spki as BufferSource, params, true, ["wrapKey"]))
      )
      const unwrapOnly = yield* KeyWrap.privateKeyFromCryptoKey(
        rsaOaep2048,
        yield* Effect.promise(() => subtle.importKey("pkcs8", pkcs8 as BufferSource, params, false, ["unwrapKey"]))
      )

      const target = yield* Aead.key(Aead.aes128Gcm, new Uint8Array(16).fill(5))
      const pairs = [
        [pair.publicKey, unwrapOnly],
        [wrapOnly, pair.privateKey],
        [wrapOnly, unwrapOnly]
      ] as const
      for (const [publicKey, privateKey] of pairs) {
        const unwrapped = yield* keyWrap.unwrap(privateKey, Aead.aes128Gcm, yield* keyWrap.wrap(publicKey, target))
        assert.deepStrictEqual(yield* Aead.toBytes(unwrapped), new Uint8Array(16).fill(5))
      }

      // The message bound uses the key's real modulus: 191 bytes would fit a
      // 3072-bit key, but this one has 2048 bits.
      const narrow = yield* KeyWrap.publicKeyFromCryptoKey(
        KeyWrap.rsaOaepSha256,
        yield* Effect.promise(() => subtle.importKey("spki", spki as BufferSource, params, true, ["encrypt"]))
      )
      const tooLong = yield* Mac.key(Mac.hmacSha256, new Uint8Array(191).fill(1))
      assertReason(yield* Effect.flip(keyWrap.wrap(narrow, tooLong)), "InvalidArgument", "wrap")
    }).pipe(Effect.provide(layer)))

  it.effect("uses non-extractable key-encryption keys, but cannot wrap non-extractable targets", () =>
    Effect.gen(function*() {
      const keyWrap = yield* KeyWrap.KeyWrap
      const [vector] = rfc3394
      const importKw = (usages: Array<KeyUsage>) =>
        Effect.promise(() => subtle.importKey("raw", bytes(vector.kek) as BufferSource, "AES-KW", false, usages))
      const kek = yield* KeyWrap.fromCryptoKey(KeyWrap.aes128Kw, yield* importKw(["wrapKey", "unwrapKey"]))
      const target = yield* Aead.key(Aead.aes128Gcm, bytes(vector.key))
      assert.strictEqual(Hex.encode(yield* keyWrap.wrap(kek, target)), vector.wrapped)
      assertReason(yield* Effect.flip(KeyWrap.toBytes(kek)), "NotExtractable", "toBytes")

      const sealed = yield* Aead.fromCryptoKey(
        Aead.aes128Gcm,
        yield* Effect.promise(() =>
          subtle.importKey("raw", bytes(vector.key) as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"])
        )
      )
      assertReason(yield* Effect.flip(keyWrap.wrap(kek, sealed)), "NotExtractable", "wrap")

      // AES-KW keys need both usages and the right size.
      const aes256 = yield* Effect.promise(() =>
        subtle.importKey("raw", new Uint8Array(32), "AES-KW", false, ["wrapKey", "unwrapKey"])
      )
      for (const cryptoKey of [yield* importKw(["wrapKey"]), aes256]) {
        assertReason(
          yield* Effect.flip(KeyWrap.fromCryptoKey(KeyWrap.aes128Kw, cryptoKey)),
          "InvalidKey",
          "fromCryptoKey"
        )
      }
      const rsa = yield* Effect.promise(() =>
        subtle.generateKey(
          { name: "RSA-OAEP", hash: "SHA-256", modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1) },
          false,
          ["encrypt", "decrypt"]
        )
      )
      // The roles and the hash must match.
      assertReason(
        yield* Effect.flip(KeyWrap.publicKeyFromCryptoKey(rsaOaep2048, rsa.privateKey)),
        "InvalidKey",
        "publicKeyFromCryptoKey"
      )
      assertReason(
        yield* Effect.flip(KeyWrap.privateKeyFromCryptoKey(KeyWrap.rsaOaepSha1, rsa.privateKey)),
        "InvalidKey",
        "privateKeyFromCryptoKey"
      )

      const wrapRaw = () =>
        // @ts-expect-error
        keyWrap.wrap(kek, new Uint8Array(16))
      const unwrapSignature = () =>
        // @ts-expect-error
        keyWrap.unwrap(kek, Signature.ed25519, new Uint8Array(24))
      const rawRsa = () =>
        // @ts-expect-error
        KeyWrap.key(KeyWrap.rsaOaepSha256, new Uint8Array(32))
      void wrapRaw
      void unwrapSignature
      void rawRsa
    }).pipe(Effect.provide(layer)))

  it.effect("tells the key roles apart, and redacts secret keys", () =>
    Effect.gen(function*() {
      const keyWrap = yield* KeyWrap.KeyWrap
      const kek = yield* keyWrap.generateKey(KeyWrap.aes128Kw)
      const { privateKey, publicKey } = yield* keyWrap.generateKeyPair(rsaOaep2048)
      assert.isTrue(KeyWrap.isKey(kek))
      assert.isFalse(KeyWrap.isKey(privateKey))
      assert.isTrue(KeyWrap.isPrivateKey(privateKey))
      assert.isFalse(KeyWrap.isPrivateKey(publicKey))
      assert.isTrue(KeyWrap.isPublicKey(publicKey))
      assert.isFalse(KeyWrap.isPublicKey(kek))
      assert.isFalse(KeyWrap.isKey(yield* Aead.key(Aead.aes128Gcm, new Uint8Array(16))))

      const other = yield* KeyWrap.key(KeyWrap.aes128Kw, new Uint8Array(16).fill(1))
      assert.strictEqual(String(kek), String(other))
      assert.strictEqual(JSON.stringify(kek), JSON.stringify(other))
      assert.strictEqual(inspect(kek), inspect(other))
    }).pipe(Effect.provide(layer)))
})
