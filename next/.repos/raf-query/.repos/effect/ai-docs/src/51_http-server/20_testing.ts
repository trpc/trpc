/**
 * @title Testing HttpApi implementations
 *
 * Test handlers through an in-memory typed client with `HttpApiTest`, without
 * starting an HTTP server or touching a real database.
 */
import { assert, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpClientRequest, HttpServer } from "effect/http"
import { HttpApiMiddleware, HttpApiTest } from "effect/http-api"
import { Api } from "./fixtures/api/Api.ts"
import { Authorization } from "./fixtures/api/Authorization.ts"
import { UserId } from "./fixtures/domain/User.ts"
import { AuthorizationLayer } from "./fixtures/server/Authorization.ts"
import { Users } from "./fixtures/server/Users.ts"
import { UsersApiHandlersNoDeps } from "./fixtures/server/Users/http.ts"

// Provide the handlers with the in-memory `Users` implementation, so the full
// HTTP pipeline is exercised without any SQL. The Authorization middleware is
// provided with `Layer.provideMerge`, because the HTTP pipeline also resolves
// it when the routes are built.
const HandlersLayer = UsersApiHandlersNoDeps.pipe(
  Layer.provide(Users.layerMemory),
  Layer.provideMerge(AuthorizationLayer)
)

// The client-side Authorization middleware supplies the bearer token.
// Providing different middleware implementations lets the tests cover both
// authorized and unauthorized requests.
const AuthorizationMiddlewareGood = HttpApiMiddleware.layerClient(
  Authorization,
  ({ next, request }) => next(HttpClientRequest.bearerToken(request, "dev-token"))
)

const AuthorizationMiddlewareBad = HttpApiMiddleware.layerClient(
  Authorization,
  // Forward the request without attaching a token
  ({ next, request }) => next(request)
)

// `HttpApiTest.groups` builds a typed client wired directly to the handlers of
// the selected groups, using the same request encoding, routing, and response
// decoding as a real server.
const makeClient = HttpApiTest.groups(Api, ["users"])

// `HttpServer.layerServices` provides the platform services the HTTP pipeline
// needs in tests.
layer(Layer.mergeAll(HandlersLayer, HttpServer.layerServices))("UsersApi", (it) => {
  it.effect("lists, fetches, and creates users", () =>
    Effect.gen(function*() {
      const client = yield* makeClient

      const created = yield* client.users.create({
        payload: { name: "Alice", email: "alice@acme.dev" }
      })
      assert.strictEqual(created.name, "Alice")

      const fetched = yield* client.users.getById({
        params: { id: created.id }
      })
      assert.deepStrictEqual(fetched, created)

      const all = yield* client.users.list({ query: {} })
      assert.isTrue(all.some((user) => user.id === created.id))
    }).pipe(Effect.provide(AuthorizationMiddlewareGood)))

  it.effect("returns a 404 for a missing user", () =>
    Effect.gen(function*() {
      const client = yield* makeClient

      // Use Effect.flip to assert on the error channel
      const error = yield* client.users.getById({
        params: { id: UserId.make("019845e1-682f-4b02-a706-3b2422d13aec") }
      }).pipe(Effect.flip)
      assert.strictEqual(error._tag, "UserNotFound")
    }).pipe(Effect.provide(AuthorizationMiddlewareGood)))

  it.effect("rejects requests without a valid bearer token", () =>
    Effect.gen(function*() {
      const client = yield* makeClient

      const error = yield* client.users.list({ query: {} }).pipe(Effect.flip)
      assert.strictEqual(error._tag, "Unauthorized")
    }).pipe(Effect.provide(AuthorizationMiddlewareBad)))

  it.effect("rejects requests with an invalid bearer token", () =>
    Effect.gen(function*() {
      const client = yield* makeClient

      const error = yield* client.users.getById({
        params: { id: UserId.make("019845e1-682f-4b02-a706-3b2422d13aec") }
      }).pipe(Effect.flip)
      assert.strictEqual(error._tag, "Unauthorized")
    }).pipe(
      Effect.provide(HttpApiMiddleware.layerClient(
        Authorization,
        ({ next, request }) => next(HttpClientRequest.bearerToken(request, "wrong-token"))
      ))
    ))
})
