import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { Jwe, Jwk } from "effect/jose"
import * as Redacted from "effect/Redacted"
import * as jose from "jose"
import { assertReason, layer, secret, secretJwk, text, utf8 } from "./utils.ts"

it.effect("encrypts and decrypts compact dir/A256GCM tokens interoperably", () =>
  Effect.gen(function*() {
    const key = yield* Jwk.importSecret(Redacted.make({ ...secretJwk, kid: "enc-1" }), "dir")

    const header = { cty: "text/plain", tenant: { id: "one", roles: ["reader"] } }
    const ours = yield* Jwe.encrypt(utf8("private message"), key, {
      ...header,
      alg: "RSA-OAEP",
      enc: "A128GCM"
    } as unknown as Jwe.Header)
    const theirs = yield* Effect.promise(() => jose.compactDecrypt(Redacted.value(ours), secret))
    assert.strictEqual(text(theirs.plaintext), "private message")
    assert.deepStrictEqual(theirs.protectedHeader, { alg: "dir", enc: "A256GCM", kid: "enc-1", ...header })

    const again = yield* Jwe.encrypt(utf8("private message"), key)
    assert.notStrictEqual(Redacted.value(again), Redacted.value(ours))

    const token = yield* Effect.promise(() =>
      new jose.CompactEncrypt(utf8("from jose"))
        .setProtectedHeader({ alg: "dir", enc: "A256GCM", ...header })
        .encrypt(secret)
    )
    const decrypted = yield* Jwe.decrypt(token, key)
    assert.strictEqual(text(decrypted.plaintext), "from jose")
    assert.deepStrictEqual(decrypted.protectedHeader, { alg: "dir", enc: "A256GCM", ...header })
    assert.strictEqual(decrypted.key, key)
  }).pipe(Effect.provide(layer)))

it.effect("rejects tampered ciphertext, other content encryption, and foreign keys", () =>
  Effect.gen(function*() {
    const key = yield* Jwk.importSecret(Redacted.make(secretJwk), "dir")
    const other = yield* Jwk.importSecret(
      Redacted.make({ kty: "oct", k: jose.base64url.encode(new Uint8Array(32).fill(9)) }),
      "dir"
    )
    const token = Redacted.value(yield* Jwe.encrypt(utf8("secret"), key))
    const [header, , iv, ciphertext, tag] = token.split(".")

    assertReason(yield* Jwe.decrypt(token, other).pipe(Effect.flip), "DecryptionFailed")

    const flipped = jose.base64url.encode(
      jose.base64url.decode(tag).map((byte, index) => index === 0 ? byte ^ 1 : byte)
    )
    assertReason(
      yield* Jwe.decrypt(`${header}..${iv}.${ciphertext}.${flipped}`, key).pipe(Effect.flip),
      "DecryptionFailed"
    )

    // Authenticated header changes fail decryption, not parsing.
    const kid = jose.base64url.encode(utf8("{\"alg\":\"dir\",\"enc\":\"A256GCM\",\"kid\":\"x\"}"))
    assertReason(yield* Jwe.decrypt(`${kid}..${iv}.${ciphertext}.${tag}`, key).pipe(Effect.flip), "DecryptionFailed")

    const a128 = yield* Effect.promise(() =>
      new jose.CompactEncrypt(utf8("x"))
        .setProtectedHeader({ alg: "dir", enc: "A128GCM" })
        .encrypt(new Uint8Array(16))
    )
    assertReason(yield* Jwe.decrypt(a128, key).pipe(Effect.flip), "InvalidToken")

    // A non-empty encrypted key is not `dir`.
    assertReason(yield* Jwe.decrypt(`${header}.AAAA.${iv}.${ciphertext}.${tag}`, key).pipe(Effect.flip), "InvalidToken")
    assertReason(yield* Jwe.decrypt(`${header}.${iv}.${ciphertext}.${tag}`, key).pipe(Effect.flip), "InvalidToken")
  }).pipe(Effect.provide(layer)))

it.effect("resolves current and previous keys by kid and preserves lookup failures", () =>
  Effect.gen(function*() {
    const previous = yield* Jwk.importSecret(Redacted.make({ ...secretJwk, kid: "previous" }), "dir")
    const current = yield* Jwk.importSecret(
      Redacted.make({ kty: "oct", k: jose.base64url.encode(new Uint8Array(32).fill(9)), kid: "current" }),
      "dir"
    )
    const missing = { _tag: "UnknownKey" } as const
    const resolve = (header: Jwe.ProtectedHeader): Effect.Effect<Jwk.SecretKey<"dir">, typeof missing> => {
      const key = [previous, current].find((key) => key.kid === header.kid)
      return key === undefined ? Effect.fail(missing) : Effect.succeed(key)
    }

    for (const key of [previous, current]) {
      const token = yield* Jwe.encrypt(utf8("private message"), key)
      const decrypted = yield* Jwe.decrypt(token, resolve)
      assert.strictEqual(text(decrypted.plaintext), "private message")
      assert.strictEqual(decrypted.protectedHeader.kid, key.kid)
      assert.strictEqual(decrypted.key, key)
    }

    const unknown = yield* Jwe.encrypt(utf8("private message"), current, { kid: "unknown" })
    assert.strictEqual(yield* Jwe.decrypt(unknown, resolve).pipe(Effect.flip), missing)
  }).pipe(Effect.provide(layer)))

it.effect("rejects malformed tokens before resolving a key", () =>
  Effect.gen(function*() {
    const key = yield* Jwk.importSecret(Redacted.make(secretJwk), "dir")
    const [header, , iv, ciphertext, tag] = Redacted.value(yield* Jwe.encrypt(utf8("private message"), key)).split(".")
    let resolutions = 0
    const resolve = (): Effect.Effect<Jwk.SecretKey<"dir">> => {
      resolutions++
      return Effect.succeed(key)
    }
    for (const extension of [{ zip: "DEF" }, { crit: ["tenant"], tenant: "one" }]) {
      const unsupported = jose.base64url.encode(JSON.stringify({ alg: "dir", enc: "A256GCM", ...extension }))
      assertReason(
        yield* Jwe.decrypt(`${unsupported}..${iv}.${ciphertext}.${tag}`, resolve).pipe(Effect.flip),
        "InvalidToken"
      )
      assertReason(
        yield* Jwe.encrypt(utf8("payload"), key, extension as unknown as Jwe.Header).pipe(Effect.flip),
        "InvalidArgument"
      )
    }

    for (
      const invalid of [
        `${header}.AAAA.${iv}.${ciphertext}.${tag}`,
        `${header}..${iv}.${ciphertext}.AA`
      ]
    ) {
      assertReason(yield* Jwe.decrypt(invalid, resolve).pipe(Effect.flip), "InvalidToken")
    }
    assert.strictEqual(resolutions, 0)
  }).pipe(Effect.provide(layer)))
