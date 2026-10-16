// Measures Client.Group derivation from one type-only group with 500 same-shaped endpoints.
import { Schema } from "effect"
import { HttpApi, HttpApiClient, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import type { Group } from "./_grouped-api-types.ts"

Schema.String
HttpApi.make("Api")
HttpApiGroup.make("users")
HttpApiEndpoint.get("warmup", "/warmup")

type Client = HttpApiClient.Client.Group<Group<500>, never, never>
type Methods = Client[keyof Client]

export type GeneratedClient = Client
export type ClientMethodNames = keyof Client
export type ClientMethodRequests = Parameters<Methods>[0]
export type ClientMethodResults = ReturnType<Methods>
