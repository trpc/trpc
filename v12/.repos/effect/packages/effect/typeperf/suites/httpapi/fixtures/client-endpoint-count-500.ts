// Measures HttpApiClient.endpoint selection from one type-only group with 500 same-shaped endpoints.
import { Effect, Schema } from "effect"
import { HttpClient } from "effect/http"
import { HttpApi, HttpApiClient, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import type { Api } from "./_endpoint-selection-types.ts"

Schema.String
HttpApi.make("Api")
HttpApiGroup.make("users")
HttpApiEndpoint.get("warmup", "/warmup")

declare const api: Api<500>
declare const httpClient: HttpClient.HttpClient

const endpointClient = HttpApiClient.endpoint(api, {
  group: "users",
  endpoint: "getUser0500",
  httpClient
})

type Method = Effect.Success<typeof endpointClient>

export type GeneratedEndpointClient = typeof endpointClient
export type EndpointClientMethod = Method
export type EndpointClientRequest = Parameters<Method>[0]
export type EndpointClientResult = ReturnType<Method>
