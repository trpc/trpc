import { assert, describe, it } from "@effect/vitest"
import * as Digest from "effect/crypto/Digest"
import * as SecureRandom from "effect/crypto/SecureRandom"
import * as Signature from "effect/crypto/Signature"
import * as Effect from "effect/Effect"
import * as Hex from "effect/encoding/Hex"
import * as Layer from "effect/Layer"
import { Buffer } from "node:buffer"
import * as NodeCrypto from "node:crypto"
import { inspect } from "node:util"
import { assertReason, bytes, encode, point, spki } from "../utils/crypto.ts"

// RFC 8032, section 7.1, test 2.
const ed25519Vector = {
  seed: "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb",
  publicKey: "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
  message: "72",
  signature: "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da" +
    "085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00"
}

// Each curve with its bound hash and its raw `r‖s` signature length.
const ecdsa = [
  [Signature.ecdsaP256, "P-256", "sha256", 64],
  [Signature.ecdsaP384, "P-384", "sha384", 96],
  [Signature.ecdsaP521, "P-521", "sha512", 132]
] as const

// Small moduli keep generation fast. Import ignores the modulus length.
const rsaPss2048 = Signature.rsaPss({ hash: Digest.sha256, modulusLength: 2048 })
const rsaPkcs1v15_2048 = Signature.rsaPkcs1v15({ hash: Digest.sha256, modulusLength: 2048 })

const seeded = Layer.succeed(SecureRandom.SecureRandom, SecureRandom.make((size) => new Uint8Array(size).fill(7)))
const layer = Signature.layerWebCrypto.pipe(Layer.provide(seeded))

const data = encode("data")

// Verification by node:crypto, independently of the layer under test.
const nodeVerify = (
  hash: string,
  publicKey: Uint8Array,
  signature: Uint8Array,
  options: Omit<NodeCrypto.VerifyKeyObjectInput, "key"> = {}
) =>
  NodeCrypto.verify(
    hash,
    data,
    { ...options, key: NodeCrypto.createPublicKey({ key: Buffer.from(publicKey), format: "der", type: "spki" }) },
    signature
  )

describe("Signature", () => {
  it.effect("reports the imported RSA CryptoKey modulus rather than the generation default", () =>
    Effect.gen(function*() {
      const pair = yield* Effect.promise(() =>
        globalThis.crypto.subtle.generateKey(
          { name: "RSA-PSS", hash: "SHA-256", modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1) },
          false,
          ["sign", "verify"]
        )
      )
      const key = yield* Signature.privateKeyFromCryptoKey(Signature.rsaPssSha256, pair.privateKey)
      assert.strictEqual(key.algorithm.modulusLength, 2048)
    }))

  it.effect("signs and verifies the RFC 8032 Ed25519 vector, deriving the public key from the seed", () =>
    Effect.gen(function*() {
      const signature = yield* Signature.Signature
      const privateKey = yield* Signature.privateKey(Signature.ed25519, bytes(ed25519Vector.seed))
      assert.strictEqual(privateKey.algorithm, Signature.ed25519)
      const publicKey = yield* signature.publicKeyOf(privateKey)
      assert.strictEqual(Hex.encode(yield* Signature.toBytes(publicKey)), ed25519Vector.publicKey)
      assert.strictEqual(Hex.encode(yield* Signature.toBytes(privateKey)), ed25519Vector.seed)

      const message = bytes(ed25519Vector.message)
      const signed = yield* signature.sign(privateKey, message)
      assert.strictEqual(Hex.encode(signed), ed25519Vector.signature)
      const imported = yield* Signature.publicKey(Signature.ed25519, bytes(ed25519Vector.publicKey))
      assert.isTrue(yield* signature.verify(imported, signed, message))
      assert.isFalse(yield* signature.verify(imported, signed, encode("other")))
    }).pipe(Effect.provide(layer)))

  it.effect("builds Ed25519 keys from SecureRandom bytes and rejects other raw lengths", () =>
    Effect.gen(function*() {
      const signature = yield* Signature.Signature
      const { privateKey, publicKey } = yield* signature.generateKeyPair(Signature.ed25519)
      assert.deepStrictEqual(yield* Signature.toBytes(privateKey), new Uint8Array(32).fill(7))
      assert.isTrue(yield* signature.verify(publicKey, yield* signature.sign(privateKey, data), data))

      // The 64-byte libsodium `seed‖pk` form must be sliced by the caller.
      for (const length of [0, 31, 33, 64]) {
        assertReason(
          yield* Effect.flip(Signature.privateKey(Signature.ed25519, new Uint8Array(length))),
          "InvalidKey",
          "privateKey"
        )
      }
      for (const length of [0, 31, 33]) {
        assertReason(
          yield* Effect.flip(Signature.publicKey(Signature.ed25519, new Uint8Array(length))),
          "InvalidKey",
          "publicKey"
        )
      }
    }).pipe(Effect.provide(layer)))

  it.effect("signs ECDSA in raw r‖s form with the hash bound to the curve", () =>
    Effect.gen(function*() {
      const signature = yield* Signature.Signature
      for (const [algorithm, namedCurve, hash, length] of ecdsa) {
        const { privateKey, publicKey } = yield* signature.generateKeyPair(algorithm)
        assert.strictEqual(privateKey.algorithm, algorithm)
        const signed = yield* signature.sign(privateKey, data)
        assert.strictEqual(signed.length, length)
        assert.isTrue(yield* signature.verify(publicKey, signed, data))

        // The public key is an uncompressed SEC1 point.
        const point = yield* Signature.toBytes(publicKey)
        assert.strictEqual(point.length, length + 1)
        assert.strictEqual(point[0], 4)
        const params = { name: "ECDSA", namedCurve }
        assert.isTrue(nodeVerify(hash, yield* spki(point, params), signed, { dsaEncoding: "ieee-p1363" }))
        assert.deepStrictEqual(yield* Signature.toBytes(yield* signature.publicKeyOf(privateKey)), point)
      }
    }).pipe(Effect.provide(layer)))

  it.effect("signs RSA-PSS salted with the hash length, and deterministic RSASSA-PKCS1-v1_5", () =>
    Effect.gen(function*() {
      const signature = yield* Signature.Signature
      // Pre-made RSA values follow current NIST guidance.
      assert.strictEqual(Signature.rsaPssSha256.modulusLength, 3072)

      const pss = yield* signature.generateKeyPair(rsaPss2048)
      assert.strictEqual(pss.privateKey.algorithm, rsaPss2048)
      const pssSigned = yield* signature.sign(pss.privateKey, data)
      assert.isTrue(yield* signature.verify(pss.publicKey, pssSigned, data))
      // RSA keys hold SPKI and PKCS#8 DER.
      const pssSpki = yield* Signature.toBytes(pss.publicKey)
      const padding = NodeCrypto.constants.RSA_PKCS1_PSS_PADDING
      assert.isTrue(nodeVerify("sha256", pssSpki, pssSigned, { padding, saltLength: 32 }))
      assert.deepStrictEqual(yield* Signature.toBytes(yield* signature.publicKeyOf(pss.privateKey)), pssSpki)

      const pkcs1 = yield* signature.generateKeyPair(rsaPkcs1v15_2048)
      const pkcs1Signed = yield* signature.sign(pkcs1.privateKey, data)
      assert.deepStrictEqual(yield* signature.sign(pkcs1.privateKey, data), pkcs1Signed)
      assert.isTrue(yield* signature.verify(pkcs1.publicKey, pkcs1Signed, data))
      assert.isTrue(nodeVerify("sha256", yield* Signature.toBytes(pkcs1.publicKey), pkcs1Signed))
    }).pipe(Effect.provide(layer)))

  it.effect("checks the RSA-PSS salt length before signing or verifying", () =>
    Effect.gen(function*() {
      const signature = yield* Signature.Signature
      const pair = yield* Effect.promise(() =>
        globalThis.crypto.subtle.generateKey(
          { name: "RSA-PSS", hash: "SHA-256", modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1) },
          false,
          ["sign", "verify"]
        )
      )
      const keys = (saltLength: number) => {
        const algorithm = Signature.rsaPss({ hash: Digest.sha256, modulusLength: 2048, saltLength })
        return Effect.all({
          privateKey: Signature.privateKeyFromCryptoKey(algorithm, pair.privateKey),
          publicKey: Signature.publicKeyFromCryptoKey(algorithm, pair.publicKey)
        })
      }

      const unsalted = yield* keys(0)
      const signed = yield* signature.sign(unsalted.privateKey, data)
      assert.isTrue(yield* signature.verify(unsalted.publicKey, signed, data))

      // A 2048-bit key with SHA-256 fits at most 256 - 32 - 2 = 222 bytes of salt.
      for (const saltLength of [-1, -0.5, 1.5, 223]) {
        const { privateKey, publicKey } = yield* keys(saltLength)
        assertReason(yield* Effect.flip(signature.sign(privateKey, data)), "InvalidArgument", "sign")
        assertReason(yield* Effect.flip(signature.verify(publicKey, signed, data)), "InvalidArgument", "verify")
      }
    }).pipe(Effect.provide(layer)))

  it.effect("returns false for any problem with the signature bytes", () =>
    Effect.gen(function*() {
      const signature = yield* Signature.Signature
      for (const algorithm of [Signature.ed25519, Signature.ecdsaP256, Signature.ecdsaP521, rsaPss2048]) {
        const { privateKey, publicKey } = yield* signature.generateKeyPair(algorithm)
        const signed = yield* signature.sign(privateKey, data)
        const tampered = signed.slice()
        tampered[0] ^= 1
        const cases = [
          tampered,
          signed.subarray(1),
          Uint8Array.of(...signed, 0),
          new Uint8Array(),
          // Out of range for r and s.
          new Uint8Array(signed.length).fill(0xff),
          new Uint8Array(signed.length)
        ]
        for (const bad of cases) {
          assert.isFalse(yield* signature.verify(publicKey, bad, data), `${algorithm.name}: ${Hex.encode(bad)}`)
        }
      }
    }).pipe(Effect.provide(layer)))

  it.effect("checks raw EC public keys, rejecting off-curve points when they are used", () =>
    Effect.gen(function*() {
      const signature = yield* Signature.Signature
      for (const [algorithm, , , length] of ecdsa) {
        const size = length / 2
        // Compressed points and points of another size.
        for (const raw of [point(size, 2), point(size, 3), point(size + 1), point(size - 1)]) {
          assertReason(yield* Effect.flip(Signature.publicKey(algorithm, raw)), "InvalidKey", "publicKey")
        }
      }
      // The point (0, 0) has the right encoding but is not on the curve.
      const offCurve = yield* Signature.publicKey(Signature.ecdsaP256, point(32))
      assertReason(
        yield* Effect.flip(signature.verify(offCurve, new Uint8Array(64), data)),
        "InvalidKey",
        "verify"
      )
      // EC and RSA private keys have no raw form.
      const rawEcPrivate = () =>
        // @ts-expect-error
        Signature.privateKey(Signature.ecdsaP256, new Uint8Array(32))
      const rawRsaPublic = () =>
        // @ts-expect-error
        Signature.publicKey(Signature.rsaPssSha256, new Uint8Array(32))
      void rawEcPrivate
      void rawRsaPublic
    }).pipe(Effect.provide(layer)))

  it.effect("uses CryptoKeys that match the algorithm, without exporting non-extractable ones", () =>
    Effect.gen(function*() {
      const signature = yield* Signature.Signature
      const subtle = globalThis.crypto.subtle
      const generate = (params: EcKeyGenParams | RsaHashedKeyGenParams, usages: Array<KeyUsage> = ["sign", "verify"]) =>
        Effect.promise(() => subtle.generateKey(params, false, usages) as Promise<CryptoKeyPair>)

      const ec = yield* generate({ name: "ECDSA", namedCurve: "P-256" })
      const privateKey = yield* Signature.privateKeyFromCryptoKey(Signature.ecdsaP256, ec.privateKey)
      const publicKey = yield* Signature.publicKeyFromCryptoKey(Signature.ecdsaP256, ec.publicKey)
      assert.isTrue(yield* signature.verify(publicKey, yield* signature.sign(privateKey, data), data))
      assertReason(yield* Effect.flip(Signature.toBytes(privateKey)), "NotExtractable", "toBytes")

      // Import ignores the modulus length: a 2048-bit key backs rsaPssSha256.
      const rsa = yield* generate({
        name: "RSA-PSS",
        hash: "SHA-256",
        modulusLength: 2048,
        publicExponent: Uint8Array.of(1, 0, 1)
      })
      const rsaPrivate = yield* Signature.privateKeyFromCryptoKey(Signature.rsaPssSha256, rsa.privateKey)
      const rsaPublic = yield* Signature.publicKeyFromCryptoKey(Signature.rsaPssSha256, rsa.publicKey)
      assert.isTrue(yield* signature.verify(rsaPublic, yield* signature.sign(rsaPrivate, data), data))

      const p384 = yield* generate({ name: "ECDSA", namedCurve: "P-384" })
      const ecdh = yield* generate({ name: "ECDH", namedCurve: "P-256" }, ["deriveBits"])
      // A private key must allow signing, but its public key can lack verify usage.
      const signOnly = yield* generate({ name: "ECDSA", namedCurve: "P-256" }, ["sign"])
      const mismatched: ReadonlyArray<readonly [Signature.Algorithm, CryptoKey]> = [
        [Signature.ecdsaP256, p384.privateKey],
        [Signature.ecdsaP256, ecdh.privateKey],
        [Signature.ecdsaP256, ec.publicKey],
        // The hash is part of an RSA algorithm.
        [Signature.rsaPss({ hash: Digest.sha384, modulusLength: 2048 }), rsa.privateKey],
        [Signature.rsaPkcs1v15Sha256, rsa.privateKey]
      ]
      for (const [algorithm, cryptoKey] of mismatched) {
        assertReason(
          yield* Effect.flip(Signature.privateKeyFromCryptoKey(algorithm, cryptoKey)),
          "InvalidKey",
          "privateKeyFromCryptoKey"
        )
      }
      assertReason(
        yield* Effect.flip(Signature.publicKeyFromCryptoKey(Signature.ecdsaP256, signOnly.publicKey)),
        "InvalidKey",
        "publicKeyFromCryptoKey"
      )
      assertReason(
        yield* Effect.flip(Signature.publicKeyFromCryptoKey(Signature.ecdsaP256, ec.privateKey)),
        "InvalidKey",
        "publicKeyFromCryptoKey"
      )
    }).pipe(Effect.provide(layer)))

  it.effect("tells private and public keys apart, and redacts private keys", () =>
    Effect.gen(function*() {
      const signature = yield* Signature.Signature
      const { privateKey, publicKey } = yield* signature.generateKeyPair(Signature.ed25519)
      assert.isTrue(Signature.isPrivateKey(privateKey))
      assert.isFalse(Signature.isPrivateKey(publicKey))
      assert.isTrue(Signature.isPublicKey(publicKey))
      assert.isFalse(Signature.isPublicKey(privateKey))
      assert.isFalse(Signature.isPublicKey(new Uint8Array(32)))

      const other = yield* Signature.privateKey(Signature.ed25519, new Uint8Array(32).fill(1))
      assert.strictEqual(String(privateKey), String(other))
      assert.strictEqual(JSON.stringify(privateKey), JSON.stringify(other))
      assert.strictEqual(inspect(privateKey), inspect(other))
    }).pipe(Effect.provide(layer)))
})
