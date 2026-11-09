import { Context, Effect, type Scope } from "effect"
import type { HttpServer } from "effect/http"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import { describe, expect, it } from "tstyche"

class Config extends Context.Service<Config, { readonly enabled: boolean }>()("Config") {}

declare const server: HttpServer.HttpServer["Service"]

describe("HttpServer", () => {
  it("serve retains middleware services", () => {
    const middleware = <E, R>(app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>) =>
      Effect.flatMap(Config, () => app)
    expect(server.serve(Effect.succeed(HttpServerResponse.empty()), middleware)).type.toBe<
      Effect.Effect<void, never, Config | Scope.Scope>
    >()
  })

  it("serve excludes services provided by middleware and the request", () => {
    const app = Effect.flatMap(Config, () => Effect.as(HttpServerRequest.HttpServerRequest, HttpServerResponse.empty()))
    const middleware = <E, R>(app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>) =>
      Effect.provideService(app, Config, { enabled: true })

    expect(server.serve(app, middleware)).type.toBe<Effect.Effect<void, never, Scope.Scope>>()
  })
})
