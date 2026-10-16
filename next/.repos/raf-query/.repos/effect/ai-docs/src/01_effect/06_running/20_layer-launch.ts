/**
 * @title Using Layer.launch as the application entry point
 *
 * Use `Layer.launch` to run a long-running Effect program as your process entrypoint.
 */
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { createServer } from "node:http"

// Build a tiny HTTP app with a health-check endpoint.
export const HealthRoutes = HttpRouter.use(Effect.fn(function*(router) {
  yield* router.add("GET", "/health", Effect.succeed(HttpServerResponse.text("ok")))
  yield* router.add("GET", "/healthz", Effect.succeed(HttpServerResponse.text("ok")))
}))

// Turn the routes into a server layer and provide the Node HTTP server backend.
export const HttpServerLive = HttpRouter.serve(HealthRoutes).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
)

// `Layer.launch` converts the layer into a long-running Effect<never>.
export const main = Layer.launch(HttpServerLive)

// This entrypoint pattern works well when the whole app is represented as
// layers (for example: HTTP server + background workers).
NodeRuntime.runMain(main)
