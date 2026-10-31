import { assert, it } from "@effect/vitest"
import { Digest, Signature } from "effect/crypto"
import * as Effect from "effect/Effect"
import { Jwk, Jwks, Jws } from "effect/jose"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as jose from "jose"
import * as NodeCrypto from "node:crypto"
import { assertReason, es256PublicJwk, layer, rfc7515, rs256PublicJwk, secretJwk, utf8 } from "./utils.ts"

it.effect("generates algorithm-bound key pairs that import for signing and verification", () =>
  Effect.gen(function*() {
    for (const algorithm of ["RS256", "PS256", "ES256", "ES384", "ES512", "EdDSA"] as const) {
      const pair = yield* Jwk.generateKeyPair({ algorithm, kid: "k1" })
      assert.strictEqual(pair.publicKey.alg, algorithm)
      assert.strictEqual(pair.publicKey.kid, "k1")
      assert.strictEqual(pair.publicKey.use, "sig")
      assert.isFalse("d" in pair.publicKey)

      const privateKey = yield* Jwk.importPrivate(pair.privateKey, algorithm)
      const publicKey = yield* Jwk.importPublic(pair.publicKey, algorithm)
      assert.strictEqual(privateKey.algorithm, algorithm)
      assert.strictEqual(privateKey.kid, "k1")
      assert.strictEqual(publicKey.algorithm, algorithm)
      assert.strictEqual(publicKey.kid, "k1")
      assert.isTrue(Signature.isPrivateKey(privateKey.key))
      assert.isTrue(Signature.isPublicKey(publicKey.key))
      assert.deepStrictEqual(publicKey.jwk, pair.publicKey)
      assert.deepStrictEqual(yield* Jwk.exportPublic(publicKey), pair.publicKey)
    }
  }).pipe(Effect.provide(layer)))

it.effect("rejects non-canonical base64url key members without exposing private input", () =>
  Effect.gen(function*() {
    const { d: _d, ...ecPublic } = rfc7515.es256.jwk
    const publicError = yield* Jwk.importPublic({ ...ecPublic, x: `${ecPublic.x}=` }, "ES256").pipe(Effect.flip)
    assertReason(publicError, "InvalidKey")
    assert.include(publicError.reason.description, "base64url")

    const d = `${rfc7515.es256.jwk.d}=`
    assert.isFalse(Schema.is(Jwk.PrivateJwk)({ ...rfc7515.es256.jwk, d }))
    const privateError = yield* Jwk.importPrivate(Redacted.make({ ...rfc7515.es256.jwk, d }), "ES256").pipe(
      Effect.flip
    )
    assertReason(privateError, "InvalidKey")
    assert.isUndefined(privateError.reason.cause)
    assert.notInclude(JSON.stringify(privateError), d)
  }))

it.effect("binds imported keys to the selected algorithm and honours JWK metadata", () =>
  Effect.gen(function*() {
    const key = yield* Jwk.importPublic(es256PublicJwk, "ES256")
    assert.strictEqual(key.algorithm, "ES256")
    assert.isUndefined(key.kid)

    // Curve family and selected algorithm must agree.
    assertReason(yield* Jwk.importPublic(es256PublicJwk, "EdDSA").pipe(Effect.flip), "InvalidKey")
    assertReason(yield* Jwk.importPublic(es256PublicJwk, "ES384").pipe(Effect.flip), "InvalidKey")
    // Declared `alg` wins over the selection when they disagree.
    assertReason(
      yield* Jwk.importPublic({ ...es256PublicJwk, alg: "RS256" }, "ES256").pipe(Effect.flip),
      "InvalidKey"
    )
    // `use`/`key_ops` that exclude signing are not verification keys.
    assertReason(
      yield* Jwk.importPublic({ ...es256PublicJwk, use: "enc" }, "ES256").pipe(Effect.flip),
      "InvalidKey"
    )
    // Private members never satisfy the public schema.
    assert.isFalse(Schema.is(Jwk.PublicJwk)(rfc7515.es256.jwk))
    assert.isTrue(Schema.is(Jwk.PrivateJwk)(rfc7515.es256.jwk))
    // Not even RSA factors without `d`.
    const { d: _d, ...factors } = rfc7515.rs256.jwk
    assert.isFalse(Schema.is(Jwk.PublicJwk)(factors))
    assert.isFalse(Schema.is(Jwks.KeySet)({ keys: [factors] }))
    assertReason(
      yield* Jwk.importPublic(factors as unknown as Jwk.PublicJwk, "RS256").pipe(Effect.flip),
      "InvalidKey"
    )
  }))

it.effect("rejects RSA keys below 2048 bits", () =>
  Effect.gen(function*() {
    const { privateKey, publicKey } = NodeCrypto.generateKeyPairSync("rsa", { modulusLength: 1024 })
    const jwk = publicKey.export({ format: "jwk" }) as unknown as Jwk.PublicJwk
    assertReason(yield* Jwk.importPublic(jwk, "RS256").pipe(Effect.flip), "InvalidKey")
    assertReason(
      yield* Jwk.importSpki(publicKey.export({ format: "pem", type: "spki" }).toString(), "RS384").pipe(Effect.flip),
      "InvalidKey"
    )
    assertReason(
      yield* Jwk.importPkcs8(
        Redacted.make(new Uint8Array(privateKey.export({ format: "der", type: "pkcs8" }))),
        "PS512"
      ).pipe(Effect.flip),
      "InvalidKey"
    )
  }))

it.effect("interoperates with jose for SPKI and PKCS#8 in DER and PEM form", () =>
  Effect.gen(function*() {
    const pair = yield* Effect.promise(() => jose.generateKeyPair("ES384", { extractable: true }))
    const publicPem = yield* Effect.promise(() => jose.exportSPKI(pair.publicKey))
    const privatePem = yield* Effect.promise(() => jose.exportPKCS8(pair.privateKey))
    const publicDer = new Uint8Array(NodeCrypto.createPublicKey(publicPem).export({ format: "der", type: "spki" }))
    const privateDer = new Uint8Array(NodeCrypto.createPrivateKey(privatePem).export({ format: "der", type: "pkcs8" }))
    const trim = (data: Uint8Array | string) => typeof data === "string" ? data.trim() : data

    for (
      const [format, publicData, privateData] of [["der", publicDer, privateDer], [
        "pem",
        publicPem,
        privatePem
      ]] as const
    ) {
      const publicKey = yield* Jwk.importSpki(publicData, "ES384", { kid: "key-1" })
      const privateKey = yield* Jwk.importPkcs8(Redacted.make(privateData), "ES384", { kid: "key-1" })
      assert.deepInclude(publicKey.jwk, { alg: "ES384", kid: "key-1", use: "sig" })
      assert.deepStrictEqual(trim(yield* Jwk.exportSpki(publicKey, { format })), trim(publicData))
      assert.deepStrictEqual(trim(Redacted.value(yield* Jwk.exportPkcs8(privateKey, { format }))), trim(privateData))

      const token = yield* Jws.sign(utf8("key formats"), privateKey)
      yield* Effect.promise(() => jose.compactVerify(Redacted.value(token), pair.publicKey))
    }
  }).pipe(Effect.provide(layer)))

it.effect("rejects mismatched PEM roles and algorithms without exposing private input", () =>
  Effect.gen(function*() {
    const pair = yield* Jwk.generateKeyPair({ algorithm: "ES384" })
    const publicPem = yield* Jwk.exportSpki(yield* Jwk.importPublic(pair.publicKey, "ES384"), { format: "pem" })
    assertReason(yield* Jwk.importSpki(publicPem, "ES256").pipe(Effect.flip), "InvalidKey")
    assertReason(yield* Jwk.importPkcs8(Redacted.make(publicPem), "ES384").pipe(Effect.flip), "InvalidKey")

    const marker = "private-pem-marker"
    const error = yield* Jwk.importPkcs8(Redacted.make(marker), "ES384").pipe(Effect.flip)
    assertReason(error, "InvalidKey")
    assert.isUndefined(error.reason.cause)
    assert.notInclude(JSON.stringify(error), marker)
  }).pipe(Effect.provide(layer)))

it.effect("imports octet keys with per-algorithm length rules", () =>
  Effect.gen(function*() {
    const hmac = yield* Jwk.importSecret(Redacted.make(rfc7515.hs256.jwk), "HS256")
    assert.strictEqual(hmac.algorithm, "HS256")
    const dir = yield* Jwk.importSecret(Redacted.make({ ...secretJwk, kid: "enc-1" }), "dir")
    assert.strictEqual(dir.algorithm, "dir")
    assert.strictEqual(dir.kid, "enc-1")

    for (const [algorithm, length] of [["HS256", 32], ["HS384", 48], ["HS512", 64]] as const) {
      const jwk = (size: number) =>
        Redacted.make({ kty: "oct", k: jose.base64url.encode(new Uint8Array(size)) } as const)
      assertReason(yield* Jwk.importSecret(jwk(length - 1), algorithm).pipe(Effect.flip), "InvalidKey")
      assert.strictEqual((yield* Jwk.importSecret(jwk(length), algorithm)).algorithm, algorithm)
    }
    assertReason(yield* Jwk.importSecret(Redacted.make(rfc7515.hs256.jwk), "dir").pipe(Effect.flip), "InvalidKey")
    assertReason(
      yield* Jwk.importSecret(Redacted.make({ ...secretJwk, alg: "HS256" }), "dir").pipe(Effect.flip),
      "InvalidKey"
    )
    // A symmetric key performs both operations, so `key_ops` must allow both.
    yield* Jwk.importSecret(Redacted.make({ ...secretJwk, key_ops: ["sign", "verify"] }), "HS256")
    assertReason(
      yield* Jwk.importSecret(Redacted.make({ ...secretJwk, key_ops: ["verify"] }), "HS256").pipe(Effect.flip),
      "InvalidKey"
    )
    assertReason(
      yield* Jwk.importSecret(Redacted.make({ ...secretJwk, key_ops: ["decrypt"] }), "dir").pipe(Effect.flip),
      "InvalidKey"
    )
  }))

it.effect("generates redacted secrets with the required length and metadata", () =>
  Effect.gen(function*() {
    for (const [algorithm, length, use] of [["HS512", 64, "sig"], ["dir", 32, "enc"]] as const) {
      const secret = yield* Jwk.generateSecret(algorithm, { kid: "secret-1" })
      const jwk = Redacted.value(secret)
      assert.deepInclude(jwk, { kty: "oct", alg: algorithm, use, kid: "secret-1" })
      assert.strictEqual(jose.base64url.decode(jwk.k).length, length)
      assert.notInclude(JSON.stringify(secret), jwk.k)
      assert.strictEqual((yield* Jwk.importSecret(secret, algorithm)).algorithm, algorithm)
    }
  }).pipe(Effect.provide(layer)))

it.effect("matches jose thumbprints for every key type and input form", () =>
  Effect.gen(function*() {
    const ed25519 = yield* Jwk.generateKeyPair({ algorithm: "EdDSA" })
    for (
      const [publicJwk, privateJwk] of [
        [rs256PublicJwk, Redacted.make(rfc7515.rs256.jwk)],
        [es256PublicJwk, Redacted.make(rfc7515.es256.jwk)],
        [ed25519.publicKey, ed25519.privateKey]
      ] as const
    ) {
      const expected = yield* Effect.promise(() => jose.calculateJwkThumbprint(publicJwk as unknown as jose.JWK))
      assert.strictEqual(yield* Jwk.thumbprint(publicJwk), expected)
      assert.strictEqual(yield* Jwk.thumbprint(privateJwk), expected)
    }

    // Metadata is ignored, and imported keys hash their public members.
    const publicKey = yield* Jwk.importPublic(es256PublicJwk, "ES256")
    const privateKey = yield* Jwk.importPrivate(Redacted.make(rfc7515.es256.jwk), "ES256")
    const expected = yield* Effect.promise(() =>
      jose.calculateJwkThumbprint(es256PublicJwk as unknown as jose.JWK, "sha512")
    )
    for (const input of [{ ...es256PublicJwk, kid: "ignored", use: "enc" }, publicKey, privateKey]) {
      assert.strictEqual(yield* Jwk.thumbprint(input, Digest.sha512), expected)
    }
    assert.strictEqual(
      yield* Jwk.thumbprintUri(publicKey),
      yield* Effect.promise(() => jose.calculateJwkThumbprintUri(es256PublicJwk as unknown as jose.JWK))
    )

    const secret = yield* Effect.promise(() => jose.calculateJwkThumbprint(secretJwk as jose.JWK))
    assert.strictEqual(yield* Jwk.thumbprint(Redacted.make(secretJwk)), secret)
    assert.strictEqual(yield* Jwk.thumbprint(yield* Jwk.importSecret(Redacted.make(secretJwk), "HS256")), secret)
  }).pipe(Effect.provide(layer)))

it.effect("rejects invalid thumbprint members and unsupported hashes without exposing secrets", () =>
  Effect.gen(function*() {
    const marker = "secret-thumbprint-marker!"
    for (
      const input of [
        { ...es256PublicJwk, x: "AB" },
        Redacted.make({ ...secretJwk, k: marker }),
        { kty: "unsupported" } as unknown as Jwk.PublicJwk
      ]
    ) {
      const error = yield* Jwk.thumbprint(input).pipe(Effect.flip)
      assertReason(error, "InvalidKey")
      assert.isUndefined(error.reason.cause)
      assert.notInclude(JSON.stringify(error), marker)
    }
    assertReason(yield* Jwk.thumbprint(rs256PublicJwk, Digest.sha1).pipe(Effect.flip), "InvalidArgument")
  }).pipe(Effect.provide(layer)))
