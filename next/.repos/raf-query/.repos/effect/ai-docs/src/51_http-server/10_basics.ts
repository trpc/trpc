/**
 * @title Getting started with HttpApi
 *
 * Define a schema-first API, implement handlers, secure endpoints with
 * middleware, serve it over HTTP, and call it using a generated typed client.
 */
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Context, Effect, flow, Layer, Schedule } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpRouter, HttpServer } from "effect/http"
import { HttpApiBuilder, HttpApiClient, HttpApiMiddleware, HttpApiScalar } from "effect/http-api"
import { createServer } from "node:http"
// Api definitions should **always** be seperate from the server implementation,
// so that they can be shared between the server and client without leaking
// server code into clients.
// Ideally, the would use a seperate package in a monorepo.
import { Api } from "./fixtures/api/Api.ts"
import { Authorization } from "./fixtures/api/Authorization.ts"
import { UsersApiHandlers } from "./fixtures/server/Users/http.ts"

// This walkthrough focuses on runtime wiring and typed client usage.
// See the fixture files for the API schemas, endpoint definitions and handlers:

const SystemApiHandlers = HttpApiBuilder.group(
  Api,
  "system",
  Effect.fn(function*(handlers) {
    return handlers.handleAll({
      health: () => Effect.void
    })
  })
)

const ApiRoutes = HttpApiBuilder.layer(Api, {
  openapiPath: "/openapi.json"
}).pipe(
  // Provide all the handler Layers for the API.
  Layer.provide([UsersApiHandlers, SystemApiHandlers])
)

// Define a /docs route that serves scalar documentation
const DocsRoute = HttpApiScalar.layer(Api, {
  path: "/docs"
})

// Merge all the http routes together
const AllRoutes = Layer.mergeAll(ApiRoutes, DocsRoute)

// Create an HTTP server Layer that serves the API routes.
//
// Here we are using the NodeHttpServer, but you could also use the
// BunHttpServer
export const HttpServerLayer = HttpRouter.serve(AllRoutes).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
)

// Then run the server using Layer.launch
Layer.launch(HttpServerLayer).pipe(
  NodeRuntime.runMain
)

// Or create a web handler, which can be used in serverless environments
export const { handler, dispose } = HttpRouter.toWebHandler(AllRoutes.pipe(
  Layer.provide(HttpServer.layerServices)
))

// -----------------
// Client side setup
// -----------------

export const AuthorizationClient = HttpApiMiddleware.layerClient(
  Authorization,
  Effect.fn(function*({ next, request }) {
    // Here you can modify the request and pass it down the middleware chain.
    // This is where you would add authentication tokens, custom headers, etc.
    // For this example, we just add a hardcoded bearer token to all requests.
    return yield* next(HttpClientRequest.bearerToken(request, "dev-token"))
  })
)

// Define the HttpApiClient service, which will be used to make requests to the
// API.
export class ApiClient extends Context.Service<ApiClient, HttpApiClient.ForApi<typeof Api>>()("acme/ApiClient") {
  static readonly layer = Layer.effect(
    ApiClient,
    HttpApiClient.make(Api, {
      // Use transformClient to apply middleware to the generated client. This
      // is useful for settings the base url and applying retry policies.
      transformClient: (client) =>
        client.pipe(
          HttpClient.mapRequest(flow(
            HttpClientRequest.prependUrl("http://localhost:3000")
          )),
          HttpClient.retryTransient({
            schedule: Schedule.exponential(100),
            times: 3
          })
        )
    })
  ).pipe(
    // Provide the client implementation of the Authorization middleware, which
    // is required.
    Layer.provide(AuthorizationClient),
    // Supply a HttpClient implementation to use for making requests. Here we
    // use the FetchHttpClient, but you could also use the NodeHttpClient or
    // BunHttpClient.
    Layer.provide(FetchHttpClient.layer)
  )
}

// The generated client mirrors your API definition, so renames and schema
// changes are checked end-to-end at compile time.
export const callApi = Effect.gen(function*() {
  const client = yield* ApiClient

  yield* client.health()
}).pipe(
  Effect.provide(ApiClient.layer)
)
