// Measures Client.TopLevelMethods derivation from one type-only top-level group with 500 same-shaped endpoints.
import { Schema } from "effect"
import { HttpApi, HttpApiClient, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import type { Group } from "./_grouped-api-types.ts"

Schema.String
HttpApi.make("Api")
HttpApiGroup.make("top", { topLevel: true })
HttpApiEndpoint.get("warmup", "/warmup")

type TopGroup = Group<500, true>
type Client = HttpApiClient.Client.TopLevelMethods<TopGroup, never, never>
type Methods = Client[keyof Client]

export type GeneratedClient = Client
export type ClientMethodNames = keyof Client
export type ClientMethods = Methods
export type ClientMethodRequests = Parameters<Methods>[0]
export type ClientMethodResults = ReturnType<Methods>
