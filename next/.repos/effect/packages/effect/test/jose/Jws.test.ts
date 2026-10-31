import { assert, it } from "@effect/vitest"
import { CryptoError, Mac, Signature } from "effect/crypto"
import * as Effect from "effect/Effect"
import { JoseError, Jwk, Jwks, Jws } from "effect/jose"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as jose from "jose"
import * as NodeUtil from "node:util"
import { assertReason, base64url, es256PublicJwk, layer, rfc7515, rs256PublicJwk, text, utf8 } from "./utils.ts"

it.effect("verifies the RFC 7515 Appendix A compact serializations", () =>
  Effect.gen(function*() {
    const payload = base64url(rfc7515.payload)

    const hmac = yield* Jwk.importSecret(Redacted.make(rfc7515.hs256.jwk), "HS256")
    const a1 = yield* Jws.verify(rfc7515.hs256.token, hmac)
    assert.deepStrictEqual(a1.protectedHeader, { typ: "JWT", alg: "HS256" })
    assert.deepStrictEqual(a1.payload, payload)

    const rsa = yield* Jwk.importPublic(rs256PublicJwk, "RS256")
    const a2 = yield* Jws.verify(Redacted.make(rfc7515.rs256.token), rsa)
    assert.deepStrictEqual(a2.protectedHeader, { alg: "RS256" })
    assert.deepStrictEqual(a2.payload, payload)

    const ec = yield* Jwk.importPublic(es256PublicJwk, "ES256")
    const a3 = yield* Jws.verify(rfc7515.es256.token, ec)
    assert.deepStrictEqual(a3.payload, payload)
  }).pipe(Effect.provide(layer)))

// RSASSA-PKCS1-v1_5 is deterministic, so signing the RFC payload with the RFC
// key must reproduce the RFC token byte for byte.
it.effect("reproduces the RFC 7515 A.2 RS256 signature", () =>
  Effect.gen(function*() {
    const key = yield* Jwk.importPrivate(Redacted.make(rfc7515.rs256.jwk), "RS256")
    const token = yield* Jws.sign(base64url(rfc7515.payload), key)
    assert.strictEqual(Redacted.value(token), rfc7515.rs256.token)
  }).pipe(Effect.provide(layer)))

it.effect("reproduces the RFC 7520 Section 4.4 HS256 signature with the key's kid", () =>
  Effect.gen(function*() {
    const key = yield* Jwk.importSecret(
      Redacted.make({
        kty: "oct",
        kid: "018c0ae5-4d9b-471b-bfd6-eef314bc7037",
        use: "sig",
        alg: "HS256",
        k: "hJtXIZ2uSN5kbQfbtTNWbpdmhkV8FJG-Onbc6mxCcYg"
      }),
      "HS256"
    )
    const payload =
      "SXTigJlzIGEgZGFuZ2Vyb3VzIGJ1c2luZXNzLCBGcm9kbywgZ29pbmcgb3V0IHlvdXIgZG9vci4gWW91IHN0ZXAgb250byB0aGUgcm9hZCwgYW5kIGlmIHlvdSBkb24ndCBrZWVwIHlvdXIgZmVldCwgdGhlcmXigJlzIG5vIGtub3dpbmcgd2hlcmUgeW91IG1pZ2h0IGJlIHN3ZXB0IG9mZiB0by4"
    const token = yield* Jws.sign(base64url(payload), key)
    assert.strictEqual(
      Redacted.value(token),
      "eyJhbGciOiJIUzI1NiIsImtpZCI6IjAxOGMwYWU1LTRkOWItNDcxYi1iZmQ2LWVlZjMxNGJjNzAzNyJ9" +
        `.${payload}.s0h6KThzkfBBBkLspW1h84VsJZFTsPPqMDA7g1Md7p0`
    )
    // An explicit `kid: undefined` falls back to the key's kid.
    assert.strictEqual(
      Redacted.value(yield* Jws.sign(base64url(payload), key, { kid: undefined })),
      Redacted.value(token)
    )
  }).pipe(Effect.provide(layer)))

it.effect("preserves extension headers when signing, verifying, and resolving a key", () =>
  Effect.gen(function*() {
    const key = yield* Jwk.importPrivate(Redacted.make(rfc7515.es256.jwk), "ES256")
    const { d: _d, ...jwk } = rfc7515.es256.jwk
    const header = { typ: "dpop+jwt", jwk, jku: "https://issuer.example/keys" }
    const token = yield* Jws.sign(utf8("{}"), key, { ...header, alg: "none" } as unknown as Jws.Header)
    const expected = { alg: "ES256" as const, ...header }
    const theirKey = yield* Effect.promise(() => jose.importJWK(jwk, "ES256"))
    const theirs = yield* Effect.promise(() => jose.compactVerify(Redacted.value(token), theirKey))
    assert.deepStrictEqual(theirs.protectedHeader, expected)

    const keySet = Layer.succeed(
      Jwks.Jwks,
      Jwks.Jwks.of({
        resolve: (selection) => {
          assert.deepStrictEqual(selection.protectedHeader, expected)
          return Jwk.importPublic(
            Schema.decodeUnknownSync(Jwk.PublicJwk)(selection.protectedHeader?.jwk),
            selection.algorithm
          )
        }
      })
    )
    const verified = yield* Jws.verifyWithKeySet(token, { algorithms: ["ES256"] }).pipe(Effect.provide(keySet))
    assert.deepStrictEqual(verified.protectedHeader, expected)

    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    assertReason(
      yield* Jws.sign(utf8("{}"), key, { ext: cyclic } as unknown as Jws.Header).pipe(Effect.flip),
      "InvalidArgument"
    )
  }).pipe(Effect.provide(layer)))

it.effect("interoperates with jose for every supported algorithm and carries the key id", () =>
  Effect.gen(function*() {
    for (
      const algorithm of [
        "HS256",
        "HS384",
        "HS512",
        "RS256",
        "RS384",
        "RS512",
        "PS256",
        "PS384",
        "PS512",
        "ES256",
        "ES384",
        "ES512",
        "EdDSA"
      ] as const
    ) {
      let signingKey: Jwk.SigningKey
      let verificationKey: Jwk.VerificationKey
      let theirKey: Awaited<ReturnType<typeof jose.importJWK>>
      let theirSigningKey: Awaited<ReturnType<typeof jose.importJWK>>
      if (algorithm === "HS256" || algorithm === "HS384" || algorithm === "HS512") {
        const jwk = yield* Jwk.generateSecret(algorithm, { kid: "k1" })
        signingKey = verificationKey = yield* Jwk.importSecret(jwk, algorithm)
        theirSigningKey = theirKey = jose.base64url.decode(Redacted.value(jwk).k)
      } else {
        const pair = yield* Jwk.generateKeyPair({ algorithm, kid: "k1" })
        signingKey = yield* Jwk.importPrivate(pair.privateKey, algorithm)
        verificationKey = yield* Jwk.importPublic(pair.publicKey, algorithm)
        theirKey = yield* Effect.promise(() => jose.importJWK(pair.publicKey as unknown as jose.JWK, algorithm))
        theirSigningKey = yield* Effect.promise(() =>
          jose.importJWK(Redacted.value(pair.privateKey) as unknown as jose.JWK, algorithm)
        )
      }

      const ours = yield* Jws.sign(utf8("hello"), signingKey, { typ: "JOSE" })
      const theirs = yield* Effect.promise(() => jose.compactVerify(Redacted.value(ours), theirKey))
      assert.strictEqual(text(theirs.payload), "hello")
      // `kid` comes from the key, `alg` from its algorithm.
      assert.deepStrictEqual(theirs.protectedHeader, { alg: algorithm, kid: "k1", typ: "JOSE" })

      const theirToken = yield* Effect.promise(() =>
        new jose.CompactSign(utf8("hello")).setProtectedHeader({ alg: algorithm, kid: "k1" }).sign(theirSigningKey)
      )
      const verified = yield* Jws.verify(theirToken, verificationKey)
      assert.strictEqual(text(verified.payload), "hello")
      assert.strictEqual(verified.protectedHeader.kid, "k1")
    }
  }).pipe(Effect.provide(layer)))

it.effect("rejects forged, malformed, and algorithm-confused tokens", () =>
  Effect.gen(function*() {
    const hmac = yield* Jwk.importSecret(Redacted.make(rfc7515.hs256.jwk), "HS256")
    const rsa = yield* Jwk.importPublic(rs256PublicJwk, "RS256")
    const [header, payload, signature] = rfc7515.hs256.token.split(".")

    const forged = `${header}.${jose.base64url.encode(utf8("{\"iss\":\"eve\"}"))}.${signature}`
    assertReason(yield* Jws.verify(forged, hmac).pipe(Effect.flip), "SignatureVerificationFailed")

    // The token's algorithm must be the key's algorithm. An HS256 token
    // must never be checked with an RSA public key as the HMAC secret.
    assertReason(yield* Jws.verify(rfc7515.hs256.token, rsa).pipe(Effect.flip), "AlgorithmNotAllowed")
    assertReason(yield* Jws.verify(rfc7515.rs256.token, hmac).pipe(Effect.flip), "AlgorithmNotAllowed")

    const unsecured = `${jose.base64url.encode(utf8("{\"alg\":\"none\"}"))}.${payload}.`
    assertReason(yield* Jws.verify(unsecured, hmac).pipe(Effect.flip), "InvalidToken")

    for (const extension of [{ crit: ["exp"], exp: 1 }, { b64: true }]) {
      const unsupported = `${
        jose.base64url.encode(JSON.stringify({ alg: "HS256", ...extension }))
      }.${payload}.${signature}`
      assertReason(yield* Jws.verify(unsupported, hmac).pipe(Effect.flip), "InvalidToken")
      assertReason(
        yield* Jws.sign(utf8("payload"), hmac, extension as unknown as Jws.Header).pipe(Effect.flip),
        "InvalidArgument"
      )
    }

    assertReason(yield* Jws.verify(`${header}.${payload}`, hmac).pipe(Effect.flip), "InvalidToken")
    for (const invalid of [`${signature}=`, `${signature.slice(0, -1)}l`]) {
      assertReason(yield* Jws.verify(`${header}.${payload}.${invalid}`, hmac).pipe(Effect.flip), "InvalidToken")
    }
    assertReason(yield* Jws.verify("", hmac).pipe(Effect.flip), "InvalidToken")
  }).pipe(Effect.provide(layer)))

it.effect("rejects a resolved key whose algorithm differs from the token's", () =>
  Effect.gen(function*() {
    const privateKey = yield* Jwk.importPrivate(Redacted.make(rfc7515.rs256.jwk), "RS256")
    const publicKey = yield* Jwk.importPublic(rs256PublicJwk, "RS256")
    const signingInput = `${jose.base64url.encode("{\"alg\":\"PS256\"}")}.${jose.base64url.encode("{}")}`
    const signature = yield* Signature.Signature.use((signer) => signer.sign(privateKey.key, utf8(signingInput)))
    const token = `${signingInput}.${jose.base64url.encode(signature)}`
    const keySet = Layer.succeed(Jwks.Jwks, Jwks.Jwks.of({ resolve: () => Effect.succeed(publicKey) }))

    assertReason(
      yield* Jws.verifyWithKeySet(token, { algorithms: ["PS256"] }).pipe(Effect.provide(keySet), Effect.flip),
      "AlgorithmNotAllowed"
    )
  }).pipe(Effect.provide(layer)))

it.effect("resolves the verification key from the Jwks service by algorithm and kid", () =>
  Effect.gen(function*() {
    const one = yield* Jwk.generateKeyPair({ algorithm: "ES256", kid: "one" })
    const two = yield* Jwk.generateKeyPair({ algorithm: "ES256", kid: "two" })
    const keySet = Jwks.layerLocal({ keys: [one.publicKey, two.publicKey] })
    const signingKey = yield* Jwk.importPrivate(two.privateKey, "ES256")
    const token = yield* Jws.sign(utf8("payload"), signingKey)

    const verified = yield* Jws.verifyWithKeySet(token, { algorithms: ["ES256"] }).pipe(Effect.provide(keySet))
    assert.strictEqual(text(verified.payload), "payload")
    assert.strictEqual(verified.key.kid, "two")
    assert.deepStrictEqual(verified.key.jwk, two.publicKey)

    // The allowlist is enforced before any key lookup.
    assertReason(
      yield* Jws.verifyWithKeySet(token, { algorithms: ["RS256", "EdDSA"] }).pipe(Effect.provide(keySet), Effect.flip),
      "AlgorithmNotAllowed"
    )
    // Symmetric tokens never resolve through a public key set.
    // Even when an untyped caller allows them.
    const hmac = yield* Jwk.importSecret(Redacted.make(rfc7515.hs256.jwk), "HS512")
    const symmetric = yield* Jws.sign(utf8("payload"), hmac)
    assertReason(
      yield* Jws.verifyWithKeySet(symmetric, {
        algorithms: ["HS512"] as unknown as ReadonlyArray<Jwk.AsymmetricAlgorithm>
      }).pipe(Effect.provide(keySet), Effect.flip),
      "AlgorithmNotAllowed"
    )
  }).pipe(Effect.provide(layer)))

it.effect("never exposes crypto backend diagnostics", () =>
  Effect.gen(function*() {
    const marker = "backend-secret-marker"
    const failure = Effect.fail(
      new CryptoError.CryptoError({
        module: "Mac",
        method: "verify",
        reason: new CryptoError.InvalidArgument({ description: marker, cause: new Error(marker) })
      })
    )
    const failing = Layer.succeed(
      Mac.Mac,
      Mac.Mac.of({
        generateKey: () => failure,
        sign: () => failure,
        verify: () => failure
      })
    )
    const key = yield* Jwk.importSecret(Redacted.make(rfc7515.hs256.jwk), "HS256")

    const operations: Array<Effect.Effect<unknown, JoseError.JoseError, Jws.Requirements>> = [
      Jws.verify(rfc7515.hs256.token, key),
      Jws.sign(utf8("payload"), key)
    ]
    for (const operation of operations) {
      const error = yield* operation.pipe(Effect.provide(failing), Effect.flip)
      assert.isTrue(JoseError.isJoseError(error))
      assert.notInclude(NodeUtil.inspect(error, { depth: Infinity }), marker)
    }
  }).pipe(Effect.provide(layer)))
