import { assert, describe, it } from "@effect/vitest"
import { Effect, Redacted } from "effect"
import * as Base64 from "effect/encoding/Base64"
import { HttpClientRequest, HttpServerRequest } from "effect/http"
import { HttpApiBuilder, HttpApiSecurity } from "effect/http-api"

const decode = <Security extends HttpApiSecurity.HttpApiSecurity>(authorization: string, security: Security) =>
  HttpApiBuilder.securityDecode(security).pipe(
    Effect.provideService(
      HttpServerRequest.HttpServerRequest,
      HttpServerRequest.fromWeb(new Request("http://localhost/", { headers: { authorization } }))
    ),
    Effect.provideService(HttpServerRequest.ParsedSearchParams, {})
  )

describe("HttpApiSecurity", () => {
  describe("securityDecode", () => {
    it.effect("decodes a bearer token without a leading space", () =>
      Effect.gen(function*() {
        const token = "abc123"
        const { headers } = HttpClientRequest.get("http://localhost/").pipe(
          HttpClientRequest.bearerToken(token)
        )
        const credential = yield* HttpApiBuilder.securityDecode(HttpApiSecurity.bearer).pipe(
          Effect.provideService(
            HttpServerRequest.HttpServerRequest,
            HttpServerRequest.fromWeb(new Request("http://localhost/", { headers }))
          ),
          Effect.provideService(HttpServerRequest.ParsedSearchParams, {})
        )

        assert.strictEqual(Redacted.value(credential), token)
      }))

    it.effect("decodes a custom http scheme without a leading space", () =>
      Effect.gen(function*() {
        const credential = yield* decode("Token abc123", HttpApiSecurity.http({ scheme: "Token" }))

        assert.strictEqual(Redacted.value(credential), "abc123")
      }))

    it.effect("matches HTTP schemes case-insensitively", () =>
      Effect.gen(function*() {
        const credential = yield* decode("bEaReR abc123", HttpApiSecurity.bearer)

        assert.strictEqual(Redacted.value(credential), "abc123")
      }))

    it.effect("accepts multiple spaces before HTTP credentials", () =>
      Effect.gen(function*() {
        const credential = yield* decode("Bearer   abc123", HttpApiSecurity.bearer)

        assert.strictEqual(Redacted.value(credential), "abc123")
      }))

    it.effect("rejects mismatched and malformed HTTP schemes", () =>
      Effect.gen(function*() {
        const mismatched = yield* decode("Basic abc123", HttpApiSecurity.bearer)
        const malformed = yield* decode("Bearerabc123", HttpApiSecurity.bearer)

        assert.strictEqual(Redacted.value(mismatched), "")
        assert.strictEqual(Redacted.value(malformed), "")
      }))

    it.effect("decodes Basic credentials using the first colon separator", () =>
      Effect.gen(function*() {
        const encoded = Base64.encode("alice:secret:with:colons")
        const credential = yield* decode(`Basic ${encoded}`, HttpApiSecurity.basic)

        assert.strictEqual(credential.username, "alice")
        assert.strictEqual(Redacted.value(credential.password), "secret:with:colons")
      }))

    it.effect("rejects Basic credentials from a different scheme", () =>
      Effect.gen(function*() {
        const encoded = Base64.encode("alice:secret")
        const credential = yield* decode(`Bearer ${encoded}`, HttpApiSecurity.basic)

        assert.strictEqual(credential.username, "")
        assert.strictEqual(Redacted.value(credential.password), "")
      }))
  })
})
