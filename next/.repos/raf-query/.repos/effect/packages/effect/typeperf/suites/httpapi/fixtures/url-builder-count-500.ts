// Measures grouped URL builder method derivation from one group with 500 same-shaped endpoints.
import { Schema } from "effect"
import { HttpApi, HttpApiClient, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { api } from "./_grouped-api-500.ts"

Schema.String
HttpApi.make("Api")
HttpApiGroup.make("users")
HttpApiEndpoint.get("warmup", "/warmup")

type UrlBuilder = HttpApiClient.UrlBuilder<typeof api>
type Users = UrlBuilder["users"]
type Methods = Users[keyof Users]

export type Api = typeof api
export type GeneratedUrlBuilder = UrlBuilder
export type UrlBuilderMethodNames = keyof Users
export type UrlBuilderMethods = Methods
export type UrlBuilderMethodRequests = Parameters<Methods>[0]
export type UrlBuilderMethodResults = ReturnType<Methods>
