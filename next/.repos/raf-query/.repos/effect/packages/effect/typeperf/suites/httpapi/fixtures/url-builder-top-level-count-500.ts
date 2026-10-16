// Measures top-level URL builder method derivation from 500 same-shaped endpoints.
import { Schema } from "effect"
import { HttpApi, HttpApiClient, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import type { Endpoint } from "./_grouped-api-500.ts"

Schema.String
HttpApi.make("Api")
HttpApiGroup.make("top", { topLevel: true })
HttpApiEndpoint.get("warmup", "/warmup")

type TopGroup = HttpApiGroup.HttpApiGroup<"top", Endpoint, true>
type Api = HttpApi.HttpApi<"Api", TopGroup>
type UrlBuilder = HttpApiClient.UrlBuilder<Api>
type Methods = UrlBuilder[keyof UrlBuilder]

export type GeneratedUrlBuilder = UrlBuilder
export type UrlBuilderMethodNames = keyof UrlBuilder
export type UrlBuilderMethods = Methods
export type UrlBuilderMethodRequests = Parameters<Methods>[0]
export type UrlBuilderMethodResults = ReturnType<Methods>
