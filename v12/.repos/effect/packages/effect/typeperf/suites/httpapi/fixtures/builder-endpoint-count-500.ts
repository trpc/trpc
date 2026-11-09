// Measures HttpApiBuilder.endpoint selection from one type-only group with 500 same-shaped endpoints.
import { Effect, Schema } from "effect"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import type { Api } from "./_endpoint-selection-types.ts"

Schema.String
HttpApi.make("Api")
HttpApiGroup.make("users")
HttpApiEndpoint.get("warmup", "/warmup")

declare const api: Api<500>

const endpointHandler = HttpApiBuilder.endpoint(
  api,
  "users",
  "getUser0500",
  ({ params }) => Effect.succeed({ id: String(params.id), name: "Ada" })
)

type HttpEffect = Effect.Success<typeof endpointHandler>

export type BuilderEndpoint = typeof endpointHandler
export type BuilderEndpointServices = Effect.Services<typeof endpointHandler>
export type BuilderHttpEffect = HttpEffect
export type BuilderHttpEffectServices = Effect.Services<HttpEffect>
