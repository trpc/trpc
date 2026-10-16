import { describe, it } from "@effect/vitest"
import { strictEqual } from "@effect/vitest/utils"
import { Effect, Schema } from "effect"
import { HttpServerRespondable, HttpServerResponse } from "effect/http"

describe("HttpServerRespondable", () => {
  it.effect("maps SchemaError to a 400 response", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(Schema.decodeUnknownEffect(Schema.String)(123))
      strictEqual(Schema.isSchemaError(error), true)
      const fallback = HttpServerResponse.empty({ status: 500 })
      const response = yield* HttpServerRespondable.toResponseOrElse(error, fallback)
      strictEqual(response.status, 400)
    }))

  it.effect("falls back for other errors", () =>
    Effect.gen(function*() {
      const fallback = HttpServerResponse.empty({ status: 500 })
      const response = yield* HttpServerRespondable.toResponseOrElse(new Error("boom"), fallback)
      strictEqual(response, fallback)
    }))
})
