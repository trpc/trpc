import { assert, describe, it } from "@effect/vitest"
import * as KeyAgreement from "effect/crypto/KeyAgreement"
import * as SecureRandom from "effect/crypto/SecureRandom"
import * as Effect from "effect/Effect"
import * as Hex from "effect/encoding/Hex"
import * as Layer from "effect/Layer"
import { Buffer } from "node:buffer"
import * as NodeCrypto from "node:crypto"
import { inspect } from "node:util"
import { assertReason, bytes, fakeSubtle, point, spki } from "../utils/crypto.ts"

// RFC 7748, section 6.1.
const rfc7748 = {
  alice: "77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a",
  alicePublic: "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a",
  bob: "5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb",
  bobPublic: "de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f",
  shared: "4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742"
}

// Each curve with its coordinate size, which is also the shared secret's.
const ecdh = [
  [KeyAgreement.ecdhP256, "P-256", 32],
  [KeyAgreement.ecdhP384, "P-384", 48],
  [KeyAgreement.ecdhP521, "P-521", 66]
] as const

const seeded = Layer.succeed(SecureRandom.SecureRandom, SecureRandom.make((size) => new Uint8Array(size).fill(7)))
const layer = KeyAgreement.layerWebCrypto.pipe(Layer.provide(seeded))

describe("KeyAgreement", () => {
  it.effect("derives the RFC 7748 X25519 shared secret on both sides", () =>
    Effect.gen(function*() {
      const keyAgreement = yield* KeyAgreement.KeyAgreement
      const alice = yield* KeyAgreement.privateKey(KeyAgreement.x25519, bytes(rfc7748.alice))
      const bob = yield* KeyAgreement.privateKey(KeyAgreement.x25519, bytes(rfc7748.bob))
      assert.strictEqual(alice.algorithm, KeyAgreement.x25519)
      assert.strictEqual(Hex.encode(yield* KeyAgreement.toBytes(alice)), rfc7748.alice)
      assert.strictEqual(
        Hex.encode(yield* KeyAgreement.toBytes(yield* keyAgreement.publicKeyOf(alice))),
        rfc7748.alicePublic
      )
      const bobPublic = yield* KeyAgreement.publicKey(KeyAgreement.x25519, bytes(rfc7748.bobPublic))
      const alicePublic = yield* KeyAgreement.publicKey(KeyAgreement.x25519, bytes(rfc7748.alicePublic))
      assert.strictEqual(Hex.encode(yield* keyAgreement.deriveSharedSecret(alice, bobPublic)), rfc7748.shared)
      assert.strictEqual(Hex.encode(yield* keyAgreement.deriveSharedSecret(bob, alicePublic)), rfc7748.shared)
    }).pipe(Effect.provide(layer)))

  it.effect("builds X25519 keys from SecureRandom bytes and rejects other raw lengths", () =>
    Effect.gen(function*() {
      const keyAgreement = yield* KeyAgreement.KeyAgreement
      const { privateKey, publicKey } = yield* keyAgreement.generateKeyPair(KeyAgreement.x25519)
      assert.deepStrictEqual(yield* KeyAgreement.toBytes(privateKey), new Uint8Array(32).fill(7))
      assert.deepStrictEqual(
        yield* KeyAgreement.toBytes(yield* keyAgreement.publicKeyOf(privateKey)),
        yield* KeyAgreement.toBytes(publicKey)
      )

      // The 64-byte libsodium `seed‖pk` form must be sliced by the caller.
      for (const length of [0, 31, 33, 64]) {
        assertReason(
          yield* Effect.flip(KeyAgreement.privateKey(KeyAgreement.x25519, new Uint8Array(length))),
          "InvalidKey",
          "privateKey"
        )
      }
      for (const length of [0, 31, 33]) {
        assertReason(
          yield* Effect.flip(KeyAgreement.publicKey(KeyAgreement.x25519, new Uint8Array(length))),
          "InvalidKey",
          "publicKey"
        )
      }
    }).pipe(Effect.provide(layer)))

  it.effect("derives ECDH secrets of the coordinate size, storing SEC1 points and PKCS#8 private keys", () =>
    Effect.gen(function*() {
      const keyAgreement = yield* KeyAgreement.KeyAgreement
      for (const [algorithm, namedCurve, size] of ecdh) {
        const first = yield* keyAgreement.generateKeyPair(algorithm)
        const second = yield* keyAgreement.generateKeyPair(algorithm)
        assert.strictEqual(first.privateKey.algorithm, algorithm)
        const shared = yield* keyAgreement.deriveSharedSecret(first.privateKey, second.publicKey)
        assert.strictEqual(shared.length, size)
        assert.deepStrictEqual(yield* keyAgreement.deriveSharedSecret(second.privateKey, first.publicKey), shared)

        const point = yield* KeyAgreement.toBytes(second.publicKey)
        assert.strictEqual(point.length, 2 * size + 1)
        assert.strictEqual(point[0], 4)
        assert.deepStrictEqual(yield* KeyAgreement.toBytes(yield* keyAgreement.publicKeyOf(second.privateKey)), point)
        // node:crypto reads the stored forms and agrees on the secret.
        const expected = NodeCrypto.diffieHellman({
          privateKey: NodeCrypto.createPrivateKey({
            key: Buffer.from(yield* KeyAgreement.toBytes(first.privateKey)),
            format: "der",
            type: "pkcs8"
          }),
          publicKey: NodeCrypto.createPublicKey({
            key: Buffer.from(yield* spki(point, { name: "ECDH", namedCurve })),
            format: "der",
            type: "spki"
          })
        })
        assert.deepStrictEqual(shared, new Uint8Array(expected))
      }
    }).pipe(Effect.provide(layer)))

  it.effect("checks raw EC public keys and keeps curves apart in the types", () =>
    Effect.gen(function*() {
      const keyAgreement = yield* KeyAgreement.KeyAgreement
      for (const [algorithm, , size] of ecdh) {
        for (const raw of [point(size, 2), point(size, 3), point(size + 1), point(size - 1)]) {
          assertReason(yield* Effect.flip(KeyAgreement.publicKey(algorithm, raw)), "InvalidKey", "publicKey")
        }
      }
      // The point (0, 0) has the right encoding but is not on the curve.
      const p256 = yield* keyAgreement.generateKeyPair(KeyAgreement.ecdhP256)
      const offCurve = yield* KeyAgreement.publicKey(KeyAgreement.ecdhP256, point(32))
      assertReason(
        yield* Effect.flip(keyAgreement.deriveSharedSecret(p256.privateKey, offCurve)),
        "InvalidKey",
        "deriveSharedSecret"
      )

      const mixed = (
        p384: KeyAgreement.PublicKey<typeof KeyAgreement.ecdhP384>,
        x25519: KeyAgreement.PrivateKey<KeyAgreement.X25519>
      ) => [
        // @ts-expect-error
        keyAgreement.deriveSharedSecret(p256.privateKey, p384),
        // @ts-expect-error
        keyAgreement.deriveSharedSecret(x25519, p256.publicKey),
        // Only X25519 private keys have a raw form.
        // @ts-expect-error
        KeyAgreement.privateKey(KeyAgreement.ecdhP256, new Uint8Array(32))
      ]
      void mixed
    }).pipe(Effect.provide(layer)))

  // Runtimes either reject a low-order point or return the all-zero output.
  it.effect("rejects a low-order X25519 peer key", () =>
    Effect.gen(function*() {
      const lowOrder = yield* KeyAgreement.publicKey(KeyAgreement.x25519, new Uint8Array(32))
      const zeros = Layer.mergeAll(
        seeded,
        fakeSubtle({ deriveBits: () => Promise.resolve(new ArrayBuffer(32)) })
      )
      for (const provided of [seeded, zeros]) {
        const error = yield* Effect.gen(function*() {
          const keyAgreement = yield* KeyAgreement.KeyAgreement
          const privateKey = yield* KeyAgreement.privateKey(KeyAgreement.x25519, new Uint8Array(32).fill(7))
          return yield* Effect.flip(keyAgreement.deriveSharedSecret(privateKey, lowOrder))
        }).pipe(Effect.provide(KeyAgreement.layerWebCrypto.pipe(Layer.provideMerge(provided))))
        assertReason(error, "InvalidKey", "deriveSharedSecret")
      }
    }))

  it.effect("uses CryptoKeys that match the algorithm, without exporting non-extractable ones", () =>
    Effect.gen(function*() {
      const keyAgreement = yield* KeyAgreement.KeyAgreement
      const subtle = globalThis.crypto.subtle
      const generate = (
        params: AlgorithmIdentifier | EcKeyGenParams,
        usages: Array<KeyUsage> = ["deriveBits"]
      ) => Effect.promise(() => subtle.generateKey(params, false, usages) as Promise<CryptoKeyPair>)

      const ec = yield* generate({ name: "ECDH", namedCurve: "P-256" })
      const privateKey = yield* KeyAgreement.privateKeyFromCryptoKey(KeyAgreement.ecdhP256, ec.privateKey)
      const publicKey = yield* KeyAgreement.publicKeyFromCryptoKey(KeyAgreement.ecdhP256, ec.publicKey)
      const peer = yield* keyAgreement.generateKeyPair(KeyAgreement.ecdhP256)
      assert.deepStrictEqual(
        yield* keyAgreement.deriveSharedSecret(privateKey, peer.publicKey),
        yield* keyAgreement.deriveSharedSecret(peer.privateKey, publicKey)
      )
      assertReason(yield* Effect.flip(KeyAgreement.toBytes(privateKey)), "NotExtractable", "toBytes")

      const x25519 = yield* generate("X25519")
      yield* KeyAgreement.privateKeyFromCryptoKey(KeyAgreement.x25519, x25519.privateKey)

      const p384 = yield* generate({ name: "ECDH", namedCurve: "P-384" })
      const ecdsa = yield* generate({ name: "ECDSA", namedCurve: "P-256" }, ["sign", "verify"])
      const deriveKeyOnly = yield* generate({ name: "ECDH", namedCurve: "P-256" }, ["deriveKey"])
      const mismatched: ReadonlyArray<readonly [KeyAgreement.Algorithm, CryptoKey]> = [
        [KeyAgreement.ecdhP256, p384.privateKey],
        [KeyAgreement.ecdhP256, ecdsa.privateKey],
        [KeyAgreement.ecdhP256, ec.publicKey],
        [KeyAgreement.ecdhP256, deriveKeyOnly.privateKey],
        [KeyAgreement.ecdhP256, x25519.privateKey],
        [KeyAgreement.x25519, ec.privateKey]
      ]
      for (const [algorithm, cryptoKey] of mismatched) {
        assertReason(
          yield* Effect.flip(KeyAgreement.privateKeyFromCryptoKey(algorithm, cryptoKey)),
          "InvalidKey",
          "privateKeyFromCryptoKey"
        )
      }
      assertReason(
        yield* Effect.flip(KeyAgreement.publicKeyFromCryptoKey(KeyAgreement.ecdhP256, p384.publicKey)),
        "InvalidKey",
        "publicKeyFromCryptoKey"
      )
    }).pipe(Effect.provide(layer)))

  it.effect("tells private and public keys apart, and redacts private keys", () =>
    Effect.gen(function*() {
      const keyAgreement = yield* KeyAgreement.KeyAgreement
      const { privateKey, publicKey } = yield* keyAgreement.generateKeyPair(KeyAgreement.x25519)
      assert.isTrue(KeyAgreement.isPrivateKey(privateKey))
      assert.isFalse(KeyAgreement.isPrivateKey(publicKey))
      assert.isTrue(KeyAgreement.isPublicKey(publicKey))
      assert.isFalse(KeyAgreement.isPublicKey(privateKey))
      assert.isFalse(KeyAgreement.isPublicKey(new Uint8Array(32)))

      const other = yield* KeyAgreement.privateKey(KeyAgreement.x25519, new Uint8Array(32).fill(1))
      assert.strictEqual(String(privateKey), String(other))
      assert.strictEqual(JSON.stringify(privateKey), JSON.stringify(other))
      assert.strictEqual(inspect(privateKey), inspect(other))
    }).pipe(Effect.provide(layer)))
})
