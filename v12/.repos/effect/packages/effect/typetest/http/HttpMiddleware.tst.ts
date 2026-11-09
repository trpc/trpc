import { Effect } from "effect"
import { HttpMiddleware, type HttpServerRequest, type HttpServerResponse } from "effect/http"
import { IpNetwork } from "effect/net"
import { describe, expect, it } from "tstyche"

declare const app: Effect.Effect<HttpServerResponse.HttpServerResponse, "app-error", "app-service">

describe("HttpMiddleware", () => {
  describe("make", () => {
    it("preserves app types with an explicitly generic Effect.fn", () => {
      const middleware = HttpMiddleware.make(
        Effect.fn("middleware")(function*<E, R>(app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>) {
          return yield* app
        })
      )

      expect(middleware(app)).type.toBe<
        Effect.Effect<HttpServerResponse.HttpServerResponse, "app-error", "app-service">
      >()
    })

    it("preserves app types and adds middleware failures with an arrow function", () => {
      const middleware = HttpMiddleware.make((app) =>
        Effect.gen(function*() {
          const response = yield* app
          if (response.status >= 500) {
            return yield* Effect.fail("middleware-error" as const)
          }
          return response
        })
      )

      expect(middleware(app)).type.toBe<
        Effect.Effect<
          HttpServerResponse.HttpServerResponse,
          "app-error" | "middleware-error",
          "app-service" | HttpServerRequest.HttpServerRequest
        >
      >()
    })
  })

  it("xForwardedHeaders preserves app types", () => {
    const middleware = HttpMiddleware.xForwardedHeaders({ trustedProxies: [IpNetwork.fromStringUnsafe("10.0.0.0/8")] })

    expect(middleware(app)).type.toBe<
      Effect.Effect<
        HttpServerResponse.HttpServerResponse,
        "app-error",
        "app-service" | HttpServerRequest.HttpServerRequest
      >
    >()
  })
})
