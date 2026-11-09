import { describe, it } from "@effect/vitest"
import { strictEqual } from "@effect/vitest/utils"
import { HttpStatus } from "effect/http"

describe("HttpStatus", () => {
  it("fromLiteral returns the numeric status code", () => {
    strictEqual(HttpStatus.fromLiteral("Continue"), 100)
    strictEqual(HttpStatus.fromLiteral("OK"), 200)
    strictEqual(HttpStatus.fromLiteral("Ok"), 200)
    strictEqual(HttpStatus.fromLiteral("Created"), 201)
    strictEqual(HttpStatus.fromLiteral("MovedPermanently"), 301)
    strictEqual(HttpStatus.fromLiteral("Conflict"), 409)
    strictEqual(HttpStatus.fromLiteral("InternalServerError"), 500)
    strictEqual(HttpStatus.fromLiteral("NetworkAuthenticationRequired"), 511)
  })
})
