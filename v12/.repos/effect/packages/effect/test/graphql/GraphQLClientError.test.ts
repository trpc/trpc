import { assert, describe, it } from "@effect/vitest"
import { Duration, Effect, Schema } from "effect"
import { GraphQLClientError, GraphQLError, ResponseError, TransportError } from "effect/graphql/GraphQLClientError"
import * as Headers from "effect/http/Headers"

describe("GraphQLClientError", () => {
  it("decoding a GitHub error preserves its top-level type", () => {
    const error = {
      type: "NOT_FOUND",
      path: ["repository"],
      locations: [{ line: 1, column: 3 }],
      message: "Could not resolve to a Repository with the name 'Effect-TS/missing'."
    }
    assert.deepStrictEqual(Schema.decodeUnknownSync(GraphQLError)(error), error)
  })

  it.effect("round trips both error headers as JSON records, encoding retryAfter as milliseconds", () =>
    Effect.gen(function*() {
      const headers = Headers.fromInput({ "X-RateLimit-Remaining": "0" })
      for (
        const reason of [
          new TransportError({ description: "503", status: 503, retryAfter: Duration.seconds(30), headers }),
          new ResponseError({ errors: [{ message: "Rate limited" }], status: 200, headers })
        ]
      ) {
        const error = new GraphQLClientError({ operation: "Viewer", reason })
        const encoded = yield* Schema.encodeEffect(GraphQLClientError)(error)
        if (encoded.reason._tag !== "TransportError" && encoded.reason._tag !== "ResponseError") {
          assert.fail("Expected an encoded transport or response error")
        }
        assert.deepStrictEqual(encoded.reason.headers, { "x-ratelimit-remaining": "0" })
        const decoded = yield* Schema.decodeUnknownEffect(GraphQLClientError)(JSON.parse(JSON.stringify(encoded)))
        assert.strictEqual(decoded.reason._tag, reason._tag)
        if (decoded.reason._tag !== "TransportError" && decoded.reason._tag !== "ResponseError") {
          assert.fail("Expected a decoded transport or response error")
        }
        assert.isTrue(Headers.isHeaders(decoded.reason.headers))
        assert.deepStrictEqual(decoded.reason.headers, headers)
        if (reason._tag === "TransportError") {
          assert.strictEqual((encoded.reason as { retryAfter?: number }).retryAfter, 30_000)
          assert.deepStrictEqual(decoded.retryAfter, Duration.seconds(30))
        }
      }
    }))

  it("TransportError is retryable for 429, 5xx and non-fatal close codes", () => {
    const transport = (fields: { status?: number; closeCode?: number }) =>
      new TransportError({ description: "transport", ...fields }).isRetryable
    assert.isTrue(transport({ status: 429 }))
    assert.isTrue(transport({ status: 503 }))
    assert.isFalse(transport({ status: 400 }))
    assert.isFalse(transport({ status: 600 }))
    assert.isTrue(transport({ closeCode: 1006 }))
    assert.isFalse(transport({ closeCode: 4401 }))
    assert.isFalse(transport({ closeCode: 4500 }))
    assert.isFalse(transport({ closeCode: 1011 }))
  })

  it("a Retry-After that is neither whole seconds nor an HTTP date is ignored", () => {
    for (const retryAfter of ["1.5", "-1"]) {
      const reason = new ResponseError({
        errors: [{ message: "Bad request" }],
        status: 400,
        headers: Headers.fromInput({ "retry-after": retryAfter })
      })
      assert.isUndefined(reason.retryAfter, retryAfter)
      assert.isFalse(reason.isRetryable, retryAfter)
    }
  })

  it("a 403 with Retry-After is retryable, and its status and headers are on the error", () => {
    const headers = Headers.fromInput({ "retry-after": "30" })
    for (
      const reason of [
        new ResponseError({ errors: [{ message: "Rate limited" }], status: 403, headers }),
        new TransportError({ description: "403", status: 403, headers, retryAfter: Duration.seconds(30) })
      ]
    ) {
      const error = new GraphQLClientError({ operation: "Viewer", reason })
      assert.isTrue(error.isRetryable)
      assert.strictEqual(error.status, 403)
      assert.deepStrictEqual(error.headers, headers)
    }
  })
})
