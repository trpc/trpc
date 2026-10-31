import { assert, it } from "@effect/vitest"
import type * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import { Jwe, Jwk, Jwks, Jwt } from "effect/jose"
import type * as JoseError from "effect/jose/JoseError"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import { TestClock } from "effect/testing"
import * as jose from "jose"
import { assertReason, layer, rfc7515, secret, secretJwk, utf8 } from "./utils.ts"

const RootClaims = Schema.Struct({
  iss: Schema.String,
  "http://example.com/is_root": Schema.Boolean
})

it.effect("verifies the RFC 7515 A.1 token as a JWT against the clock", () =>
  Effect.gen(function*() {
    const key = yield* Jwk.importSecret(Redacted.make(rfc7515.hs256.jwk), "HS256")

    yield* TestClock.setTime(1300819379_000)
    const verified = yield* Jwt.verify(RootClaims, rfc7515.hs256.token, key, { issuer: "joe", typ: "JWT" })
    assert.deepStrictEqual(verified.claims, { iss: "joe", "http://example.com/is_root": true })
    assert.deepStrictEqual(verified.registeredClaims, { iss: "joe", exp: 1300819380 })
    assert.strictEqual(verified.protectedHeader.alg, "HS256")

    // `exp` is exclusive: the token is invalid from the expiry second on.
    yield* TestClock.setTime(1300819380_000)
    const expired = yield* Jwt.verify(RootClaims, rfc7515.hs256.token, key).pipe(Effect.flip)
    assertReason(expired, "ClaimValidationFailed")
    assert.deepInclude(expired.reason, { claim: "exp", reason: "expired" })

    yield* Jwt.verify(RootClaims, rfc7515.hs256.token, key, { clockTolerance: "5 seconds" })

    // No options means signature and present temporal claims only.
    yield* TestClock.setTime(0)
    yield* Jwt.verify(RootClaims, rfc7515.hs256.token, key)
  }).pipe(Effect.provide(layer)))

const Claims = Schema.Struct({
  sub: Schema.String,
  role: Schema.Literals(["admin", "member"]),
  quota: Schema.FiniteFromString
})

it.effect("encodes claims through the schema before signing and decodes them after verification", () =>
  Effect.gen(function*() {
    const key = yield* Jwk.importSecret(Redacted.make({ ...secretJwk, kid: "k1" }), "HS256")
    const token = yield* Jwt.sign(Claims, { sub: "user_1", role: "member", quota: 3 }, key, { typ: "JWT" })

    const theirs = yield* Effect.promise(() => jose.jwtVerify(Redacted.value(token), secret))
    assert.deepStrictEqual(theirs.payload, { sub: "user_1", role: "member", quota: "3" })
    assert.deepStrictEqual(theirs.protectedHeader, { alg: "HS256", kid: "k1", typ: "JWT" })

    const verified = yield* Jwt.verify(Claims, token, key, { subject: "user_1", typ: "JWT" })
    assert.deepStrictEqual(verified.claims, { sub: "user_1", role: "member", quota: 3 })
    assert.deepStrictEqual(verified.registeredClaims, { sub: "user_1" })

    const unverified = yield* Jwt.decodeUnverified(token)
    assert.deepStrictEqual(unverified.claims, { sub: "user_1", role: "member", quota: "3" })
    assert.strictEqual(unverified.protectedHeader.kid, "k1")

    // Application schema failures surface as SchemaError, after authentication.
    const guest = yield* Effect.promise(() =>
      new jose.SignJWT({ sub: "user_2", role: "guest", quota: "1" }).setProtectedHeader({ alg: "HS256" }).sign(secret)
    )
    assert.strictEqual((yield* Jwt.verify(Claims, guest, key).pipe(Effect.flip))._tag, "SchemaError")
  }).pipe(Effect.provide(layer)))

it.effect("encrypts schema-encoded claims and decrypts encrypted JWTs interoperably", () =>
  Effect.gen(function*() {
    const key = yield* Jwk.importSecret(Redacted.make({ ...secretJwk, kid: "enc-1" }), "dir")
    const token = yield* Jwt.encrypt(Claims, { sub: "user_1", role: "member", quota: 3 }, key, { typ: "JWT" })

    const theirs = yield* Effect.promise(() => jose.jwtDecrypt(Redacted.value(token), secret))
    assert.deepStrictEqual(theirs.payload, { sub: "user_1", role: "member", quota: "3" })
    assert.deepStrictEqual(theirs.protectedHeader, { alg: "dir", enc: "A256GCM", kid: "enc-1", typ: "JWT" })

    const encrypted = yield* Effect.promise(() =>
      new jose.EncryptJWT({ sub: "user_2", role: "admin", quota: "4" })
        .setProtectedHeader({ alg: "dir", enc: "A256GCM", kid: "enc-1", typ: "JWT" })
        .encrypt(secret)
    )
    const decrypted = yield* Jwt.decrypt(Claims, encrypted, (header) => {
      assert.strictEqual(header.kid, "enc-1")
      return Effect.succeed(key)
    }, { subject: "user_2", typ: "JWT" })
    assert.deepStrictEqual(decrypted.claims, { sub: "user_2", role: "admin", quota: 4 })
    assert.deepStrictEqual(decrypted.protectedHeader, { alg: "dir", enc: "A256GCM", kid: "enc-1", typ: "JWT" })
    assert.strictEqual(decrypted.key, key)
  }).pipe(Effect.provide(layer)))

const now = 1604416038

it.effect("validates registered claims against the verification policy", () =>
  Effect.gen(function*() {
    yield* TestClock.setTime(now * 1000)
    const key = yield* Jwk.importSecret(Redacted.make(secretJwk), "HS256")
    const registered: Jwt.RegisteredClaims = {
      iss: "https://issuer.example",
      sub: "user_1",
      aud: ["api", "web"],
      exp: now + 10,
      nbf: now - 10,
      iat: now - 20
    }
    const token = yield* Jwt.sign(Jwt.RegisteredClaims, registered, key, { typ: "at+jwt" })

    const accepted = yield* Jwt.verify(Jwt.RegisteredClaims, token, key, {
      issuer: ["https://other.example", "https://issuer.example"],
      audience: "web",
      subject: "user_1",
      typ: "application/at+jwt",
      maxTokenAge: "30 seconds",
      requiredClaims: ["iss", "aud", "exp", "iat"]
    })
    assert.deepStrictEqual(accepted.registeredClaims, registered)

    const failures: Array<[Jwt.VerifyOptions, Pick<JoseError.ClaimValidationFailed, "claim" | "reason">]> = [
      [{ issuer: "https://other.example" }, { claim: "iss", reason: "mismatch" }],
      [{ audience: ["mobile"] }, { claim: "aud", reason: "mismatch" }],
      [{ subject: "user_2" }, { claim: "sub", reason: "mismatch" }],
      [{ typ: "JWT" }, { claim: "typ", reason: "mismatch" }],
      [{ requiredClaims: ["jti"] }, { claim: "jti", reason: "missing" }],
      [{ maxTokenAge: "10 seconds" }, { claim: "iat", reason: "tooOld" }]
    ]
    for (const [options, expected] of failures) {
      const error = yield* Jwt.verify(Jwt.RegisteredClaims, token, key, options).pipe(Effect.flip)
      assertReason(error, "ClaimValidationFailed")
      assert.deepInclude(error.reason, expected)
    }

    // Inputs that `Duration` would read as zero are rejected: NaN in any form,
    // non-finite components, and components that overflow.
    for (
      const clockTolerance of [
        NaN,
        [NaN, 0],
        { seconds: NaN },
        { seconds: Infinity, minutes: -Infinity },
        { milliseconds: Infinity, nanoseconds: -Infinity },
        { seconds: Number.MAX_VALUE, minutes: -Number.MAX_VALUE }
      ] satisfies Array<Duration.Input>
    ) {
      assertReason(
        yield* Jwt.verify(Jwt.RegisteredClaims, token, key, { clockTolerance }).pipe(Effect.flip),
        "InvalidArgument"
      )
    }

    yield* TestClock.setTime((now - 11) * 1000)
    const early = yield* Jwt.verify(Jwt.RegisteredClaims, token, key).pipe(Effect.flip)
    assertReason(early, "ClaimValidationFailed")
    assert.deepInclude(early.reason, { claim: "nbf", reason: "notYetValid" })
    yield* Jwt.verify(Jwt.RegisteredClaims, token, key, { clockTolerance: 1000 })

    // Registered claims with the wrong shape are rejected before any schema.
    const malformed = yield* Effect.promise(() =>
      new jose.CompactSign(utf8("{\"exp\":\"tomorrow\"}")).setProtectedHeader({ alg: "HS256" }).sign(secret)
    )
    const invalid = yield* Jwt.verify(Jwt.RegisteredClaims, malformed, key).pipe(Effect.flip)
    assertReason(invalid, "ClaimValidationFailed")
    assert.deepInclude(invalid.reason, { claim: "exp", reason: "invalid" })
  }).pipe(Effect.provide(layer)))

it.effect("authenticates and checks encrypted JWT claims before decoding the application schema", () =>
  Effect.gen(function*() {
    yield* TestClock.setTime(now * 1000)
    const key = yield* Jwk.importSecret(Redacted.make(secretJwk), "dir")
    let decoded = false
    const ApplicationClaims = Schema.Struct({ role: Schema.String }).check(Schema.makeFilter(({ role }) => {
      decoded = true
      return role === "admin"
    }))
    const token = yield* Jwe.encrypt(utf8(JSON.stringify({ role: "member", exp: now })), key)
    const parts = Redacted.value(token).split(".")
    parts[4] = jose.base64url.encode(
      jose.base64url.decode(parts[4]).map((byte, index) => index === 0 ? byte ^ 1 : byte)
    )

    assertReason(yield* Jwt.decrypt(ApplicationClaims, parts.join("."), key).pipe(Effect.flip), "DecryptionFailed")
    const expired = yield* Jwt.decrypt(ApplicationClaims, token, key).pipe(Effect.flip)
    assertReason(expired, "ClaimValidationFailed")
    assert.deepInclude(expired.reason, { claim: "exp", reason: "expired" })
    assert.isFalse(decoded)

    const member = yield* Jwe.encrypt(utf8("{\"role\":\"member\"}"), key)
    assert.strictEqual((yield* Jwt.decrypt(ApplicationClaims, member, key).pipe(Effect.flip))._tag, "SchemaError")
    assert.isTrue(decoded)
  }).pipe(Effect.provide(layer)))

it.effect("verifies with a key resolved from the Jwks service", () =>
  Effect.gen(function*() {
    const pair = yield* Jwk.generateKeyPair({ algorithm: "EdDSA", kid: "ed" })
    const signingKey = yield* Jwk.importPrivate(pair.privateKey, "EdDSA")
    const token = yield* Jwt.sign(Claims, { sub: "user_1", role: "admin", quota: 1 }, signingKey)

    const verified = yield* Jwt.verifyWithKeySet(Claims, token, { algorithms: ["EdDSA"], subject: "user_1" }).pipe(
      Effect.provide(Jwks.layerLocal({ keys: [pair.publicKey] }))
    )
    assert.deepStrictEqual(verified.claims, { sub: "user_1", role: "admin", quota: 1 })
    assert.strictEqual(verified.key.kid, "ed")
  }).pipe(Effect.provide(layer)))
