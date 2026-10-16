// Measures grouped client method derivation from one group with 500 same-shaped endpoints.
import { Schema } from "effect"
import { HttpApi, HttpApiClient, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { api } from "./_grouped-api-500.ts"

Schema.String
HttpApi.make("Api")
HttpApiGroup.make("users")
HttpApiEndpoint.get("warmup", "/warmup")

type Client = HttpApiClient.ForApi<typeof api>
type Users = Client["users"]
type Methods = Users[keyof Users]

export type Api = typeof api
export type GeneratedClient = Client
export type ClientMethodNames = keyof Users
export type ClientMethods = Methods
export type ClientMethodRequests = Parameters<Methods>[0]
export type ClientMethodResults = ReturnType<Methods>
