import { assert, describe, it } from "@effect/vitest"
import * as Aead from "effect/crypto/Aead"
import * as Digest from "effect/crypto/Digest"
import * as KeyAgreement from "effect/crypto/KeyAgreement"
import * as KeyFormat from "effect/crypto/KeyFormat"
import * as KeyWrap from "effect/crypto/KeyWrap"
import * as Mac from "effect/crypto/Mac"
import * as Signature from "effect/crypto/Signature"
import * as Effect from "effect/Effect"
import * as Base64Url from "effect/encoding/Base64Url"
import * as Result from "effect/Result"
import { Buffer } from "node:buffer"
import * as NodeCrypto from "node:crypto"
import { assertReason, bytes, unreachable } from "../utils/crypto.ts"

// Keys generated and encoded by node:crypto, independently of the module under
// test.
const p256 = NodeCrypto.generateKeyPairSync("ec", { namedCurve: "P-256" })
const p384 = NodeCrypto.generateKeyPairSync("ec", { namedCurve: "P-384" })
const ed25519 = NodeCrypto.generateKeyPairSync("ed25519")
const x25519 = NodeCrypto.generateKeyPairSync("x25519")
const rsa = NodeCrypto.generateKeyPairSync("rsa", { modulusLength: 2048 })

const der = (key: NodeCrypto.KeyObject, type: "spki" | "pkcs8" | "pkcs1" | "sec1") =>
  new Uint8Array(key.export({ format: "der", type }))
const pem = (key: NodeCrypto.KeyObject, type: "spki" | "pkcs8" | "pkcs1" | "sec1") =>
  key.export({ format: "pem", type })
const jwk = (key: NodeCrypto.KeyObject) => key.export({ format: "jwk" })
// The private key behind PKCS#8 bytes, read back by node:crypto.
const nodeJwk = (pkcs8: Uint8Array) =>
  NodeCrypto.createPrivateKey({ key: Buffer.from(pkcs8), format: "der", type: "pkcs8" }).export({ format: "jwk" })

const rsaPss2048 = Signature.rsaPss({ hash: Digest.sha256, modulusLength: 2048 })
const rsaOaep2048 = KeyWrap.rsaOaep({ hash: Digest.sha256, modulusLength: 2048 })

describe("KeyFormat", () => {
  it.effect("rejects RSA PKCS#8 decoded as ECDSA with InvalidKey", () =>
    Effect.gen(function*() {
      assertReason(
        yield* Effect.flip(KeyFormat.decodePrivate(KeyFormat.pkcs8, Signature.ecdsaP256, der(rsa.privateKey, "pkcs8"))),
        "InvalidKey",
        "decodePrivate"
      )
    }))

  it.effect("rejects a point-less P-384 PKCS#8 decoded as P-256 with InvalidKey", () =>
    Effect.gen(function*() {
      const d = Result.getOrThrow(Base64Url.decode(jwk(p384.privateKey).d!))
      const pkcs8 = Uint8Array.of(
        ...bytes("304e020100301006072a8648ce3d020106052b81040022043730350201010430"),
        ...d
      )
      assertReason(
        yield* Effect.flip(KeyFormat.decodePrivate(KeyFormat.pkcs8, Signature.ecdsaP256, pkcs8)),
        "InvalidKey",
        "decodePrivate"
      )
    }))

  it.effect("reports the imported RSA PKCS#8 modulus rather than the generation default", () =>
    Effect.gen(function*() {
      const key = yield* KeyFormat.decodePrivate(KeyFormat.pkcs8, Signature.rsaPssSha256, der(rsa.privateKey, "pkcs8"))
      assert.strictEqual(key.algorithm.modulusLength, 2048)
    }))

  it.effect("decodes and encodes SPKI and PKCS#8 for every asymmetric family", () =>
    Effect.gen(function*() {
      const cases = [
        [Signature.ecdsaP256, p256],
        [KeyAgreement.ecdhP384, p384],
        [Signature.ed25519, ed25519],
        [KeyAgreement.x25519, x25519],
        [rsaPss2048, rsa],
        [rsaOaep2048, rsa]
      ] as const
      for (const [algorithm, pair] of cases) {
        const publicKey = yield* KeyFormat.decodePublic(KeyFormat.spki, algorithm, der(pair.publicKey, "spki"))
        assert.strictEqual(publicKey.algorithm, algorithm)
        assert.deepStrictEqual(yield* KeyFormat.encode(KeyFormat.spki, publicKey), der(pair.publicKey, "spki"))

        const privateKey = yield* KeyFormat.decodePrivate(KeyFormat.pkcs8, algorithm, der(pair.privateKey, "pkcs8"))
        assert.strictEqual(privateKey.algorithm, algorithm)
        assert.deepStrictEqual(nodeJwk(yield* KeyFormat.encode(KeyFormat.pkcs8, privateKey)), jwk(pair.privateKey))
      }

      // Decoded keys hold the section 5 forms: an EC private key's PKCS#8 and
      // an Ed25519 seed.
      const ecPrivate = yield* KeyFormat.decodePrivate(
        KeyFormat.pkcs8,
        Signature.ecdsaP256,
        der(p256.privateKey, "pkcs8")
      )
      assert.deepStrictEqual(
        yield* Signature.toBytes(ecPrivate),
        yield* KeyFormat.encode(KeyFormat.pkcs8, ecPrivate)
      )
      const edPrivate = yield* KeyFormat.decodePrivate(
        KeyFormat.pkcs8,
        Signature.ed25519,
        der(ed25519.privateKey, "pkcs8")
      )
      assert.deepStrictEqual(
        yield* Signature.toBytes(edPrivate),
        Result.getOrThrow(Base64Url.decode(jwk(ed25519.privateKey).d!))
      )
    }))

  it.effect("rejects malformed DER and keys for another algorithm", () =>
    Effect.gen(function*() {
      const cases = [
        [KeyFormat.spki, Signature.ecdsaP256, new Uint8Array(32)],
        [KeyFormat.spki, Signature.ecdsaP256, der(p384.publicKey, "spki")],
        [KeyFormat.spki, Signature.ed25519, der(x25519.publicKey, "spki")]
      ] as const
      for (const [format, algorithm, data] of cases) {
        assertReason(yield* Effect.flip(KeyFormat.decodePublic(format, algorithm, data)), "InvalidKey", "decodePublic")
      }
      assertReason(
        yield* Effect.flip(KeyFormat.decodePrivate(KeyFormat.pkcs8, Signature.ecdsaP256, der(p256.publicKey, "spki"))),
        "InvalidKey",
        "decodePrivate"
      )

      const cryptoKey = yield* Effect.promise(() =>
        globalThis.crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])
      )
      const nonExtractable = yield* Signature.privateKeyFromCryptoKey(Signature.ecdsaP256, cryptoKey.privateKey)
      assertReason(
        yield* Effect.flip(KeyFormat.encode(KeyFormat.pkcs8, nonExtractable)),
        "NotExtractable",
        "encode"
      )

      // Formats carry their role, direction and data type.
      const wrongRole = () =>
        // @ts-expect-error
        KeyFormat.decodePublic(KeyFormat.pkcs8, Signature.ecdsaP256, new Uint8Array())
      const encodePkcs1 = () =>
        // @ts-expect-error
        KeyFormat.encode(KeyFormat.pkcs1, nonExtractable)
      const pemBytes = () =>
        // @ts-expect-error
        KeyFormat.decodePublic(KeyFormat.pem(KeyFormat.spki), Signature.ecdsaP256, new Uint8Array())
      void wrongRole
      void encodePkcs1
      void pemBytes
    }))

  it.effect("imports PKCS#1 and SEC1 private keys, checking the SEC1 curve", () =>
    Effect.gen(function*() {
      const fromPkcs1 = yield* KeyFormat.decodePrivate(KeyFormat.pkcs1, rsaPss2048, der(rsa.privateKey, "pkcs1"))
      assert.deepStrictEqual(nodeJwk(yield* KeyFormat.encode(KeyFormat.pkcs8, fromPkcs1)), jwk(rsa.privateKey))

      // node:crypto writes SEC1 with the `[0]` curve parameters and `[1]` point.
      for (const algorithm of [Signature.ecdsaP256, KeyAgreement.ecdhP256]) {
        const fromSec1 = yield* KeyFormat.decodePrivate(KeyFormat.sec1, algorithm, der(p256.privateKey, "sec1"))
        assert.deepStrictEqual(nodeJwk(yield* KeyFormat.encode(KeyFormat.pkcs8, fromSec1)), jwk(p256.privateKey))
      }
      assertReason(
        yield* Effect.flip(KeyFormat.decodePrivate(KeyFormat.sec1, Signature.ecdsaP384, der(p256.privateKey, "sec1"))),
        "InvalidKey",
        "decodePrivate"
      )

      // Safari cannot import an EC private key without its public point, so
      // core refuses it everywhere.
      const d = Result.getOrThrow(Base64Url.decode(jwk(p256.privateKey).d!))
      const curve = bytes("06082a8648ce3d030107")
      const sec1 = Uint8Array.of(...bytes("3031020101"), 0x04, 0x20, ...d, 0xa0, 0x0a, ...curve)
      const pkcs8 = Uint8Array.of(
        ...bytes("3041020100301306072a8648ce3d0201"),
        ...curve,
        ...bytes("0427302502010104"),
        0x20,
        ...d
      )
      assertReason(
        yield* Effect.flip(KeyFormat.decodePrivate(KeyFormat.sec1, Signature.ecdsaP256, sec1)),
        "Unsupported",
        "decodePrivate"
      )
      assertReason(
        yield* Effect.flip(KeyFormat.decodePrivate(KeyFormat.pkcs8, Signature.ecdsaP256, pkcs8)),
        "Unsupported",
        "decodePrivate"
      )
    }))

  it.effect("reads and writes strict PEM", () =>
    Effect.gen(function*() {
      const spkiPem = pem(rsa.publicKey, "spki")
      const publicKey = yield* KeyFormat.decodePublic(KeyFormat.pem(KeyFormat.spki), rsaPss2048, spkiPem)
      // One block with 64-column lines, as node:crypto writes it.
      assert.strictEqual((yield* KeyFormat.encode(KeyFormat.pem(KeyFormat.spki), publicKey)).trim(), spkiPem.trim())

      const cases = [
        [KeyFormat.pem(KeyFormat.pkcs8), pem(rsa.privateKey, "pkcs8")],
        [KeyFormat.pem(KeyFormat.pkcs1), pem(rsa.privateKey, "pkcs1")]
      ] as const
      for (const [format, data] of cases) {
        const privateKey = yield* KeyFormat.decodePrivate(format, rsaPss2048, data)
        assert.deepStrictEqual(nodeJwk(yield* KeyFormat.encode(KeyFormat.pkcs8, privateKey)), jwk(rsa.privateKey))
      }
      const fromSec1 = yield* KeyFormat.decodePrivate(
        KeyFormat.pem(KeyFormat.sec1),
        Signature.ecdsaP256,
        pem(p256.privateKey, "sec1")
      )
      assert.deepStrictEqual(nodeJwk(yield* KeyFormat.encode(KeyFormat.pkcs8, fromSec1)), jwk(p256.privateKey))

      // The label must match, and there must be exactly one block.
      for (const data of [pem(rsa.privateKey, "pkcs8"), spkiPem + spkiPem, "not a key"]) {
        assertReason(
          yield* Effect.flip(KeyFormat.decodePublic(KeyFormat.pem(KeyFormat.spki), rsaPss2048, data)),
          "InvalidKey",
          "decodePublic"
        )
      }
    }))

  it.effect("reads and writes JWK with only kty, crv and the key material", () =>
    Effect.gen(function*() {
      const cases = [[Signature.ecdsaP256, p256], [Signature.ed25519, ed25519]] as const
      for (const [algorithm, pair] of cases) {
        const publicJwk = jwk(pair.publicKey)
        const privateJwk = jwk(pair.privateKey)
        // JOSE members other than kty, crv and alg are ignored on import.
        const decorated = { ...publicJwk, use: "sig", kid: "1", key_ops: ["verify"], ext: true }
        const publicKey = yield* KeyFormat.decodePublic(KeyFormat.jwk, algorithm, decorated)
        assert.deepStrictEqual(yield* KeyFormat.encode(KeyFormat.jwk, publicKey), publicJwk)
        const privateKey = yield* KeyFormat.decodePrivate(KeyFormat.jwk, algorithm, privateJwk)
        assert.deepStrictEqual(yield* KeyFormat.encode(KeyFormat.jwk, privateKey), privateJwk)

        // `d` decides the role.
        assertReason(
          yield* Effect.flip(KeyFormat.decodePublic(KeyFormat.jwk, algorithm, privateJwk)),
          "InvalidKey",
          "decodePublic"
        )
        assertReason(
          yield* Effect.flip(KeyFormat.decodePrivate(KeyFormat.jwk, algorithm, publicJwk)),
          "InvalidKey",
          "decodePrivate"
        )
      }

      // alg, crv and kty are checked when present.
      const p256Jwk = jwk(p256.publicKey)
      assert.strictEqual(
        (yield* KeyFormat.decodePublic(KeyFormat.jwk, Signature.ecdsaP256, { ...p256Jwk, alg: "ES256" })).algorithm,
        Signature.ecdsaP256
      )
      for (const mismatch of [{ alg: "ES384" }, { crv: "P-384" }, { kty: "OKP" }]) {
        assertReason(
          yield* Effect.flip(KeyFormat.decodePublic(KeyFormat.jwk, Signature.ecdsaP256, { ...p256Jwk, ...mismatch })),
          "InvalidKey",
          "decodePublic"
        )
      }

      const secret = { kty: "oct", k: Base64Url.encode(new Uint8Array(32).fill(7)) }
      const macKey = yield* KeyFormat.decodeSecret(KeyFormat.jwk, Mac.hmacSha256, { ...secret, alg: "HS256" })
      assert.deepStrictEqual(yield* Mac.toBytes(macKey), new Uint8Array(32).fill(7))
      assert.deepStrictEqual(yield* KeyFormat.encode(KeyFormat.jwk, macKey), secret)
      assertReason(
        yield* Effect.flip(KeyFormat.decodeSecret(KeyFormat.jwk, Mac.hmacSha256, { ...secret, alg: "HS512" })),
        "InvalidKey",
        "decodeSecret"
      )
      const kek = yield* KeyFormat.decodeSecret(KeyFormat.jwk, KeyWrap.aes256Kw, secret)
      assert.deepStrictEqual(yield* KeyWrap.toBytes(kek), new Uint8Array(32).fill(7))
    }))

  it.effect("handles ChaCha JWK without subtle", () =>
    Effect.gen(function*() {
      const secret = { kty: "oct", k: Base64Url.encode(new Uint8Array(32).fill(7)) }
      for (const algorithm of [Aead.chacha20Poly1305, Aead.xchacha20Poly1305]) {
        const key = yield* KeyFormat.decodeSecret(KeyFormat.jwk, algorithm, secret)
        assert.strictEqual(key.algorithm, algorithm)
        assert.deepStrictEqual(yield* Aead.toBytes(key), new Uint8Array(32).fill(7))
        assert.deepStrictEqual(yield* KeyFormat.encode(KeyFormat.jwk, key), secret)
      }
      for (const bad of [{ ...secret, kty: "RSA" }, { kty: "oct", k: Base64Url.encode(new Uint8Array(16)) }]) {
        assertReason(
          yield* Effect.flip(KeyFormat.decodeSecret(KeyFormat.jwk, Aead.chacha20Poly1305, bad)),
          "InvalidKey",
          "decodeSecret"
        )
      }
    }).pipe(Effect.provide(unreachable)))
})
