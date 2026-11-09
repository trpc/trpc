// Measures client group derivation for 100 groups with 5 same-shaped endpoints each.
import { Schema } from "effect"
import { HttpApi, HttpApiClient, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import type { Endpoint } from "./_grouped-api-500.ts"

Schema.String
HttpApi.make("Api")
HttpApiGroup.make("group001")
HttpApiEndpoint.get("warmup", "/warmup")

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
type NonZeroDigit = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
type TwoDigit = `0${NonZeroDigit}` | `${NonZeroDigit}${Digit}`
type GroupIdentifier = `group0${TwoDigit}` | "group100"
type EndpointIdentifier = "getUser0001" | "getUser0002" | "getUser0003" | "getUser0004" | "getUser0005"
type FiveEndpoints = Extract<Endpoint, { readonly identifier: EndpointIdentifier }>
type Groups = {
  readonly [Identifier in GroupIdentifier]: HttpApiGroup.HttpApiGroup<Identifier, FiveEndpoints>
}[GroupIdentifier]
type Client = HttpApiClient.Client<Groups>
type GroupClients = Client[keyof Client]
type Methods = GroupClients[keyof GroupClients]

export type GeneratedClient = Client
export type ClientGroupIdentifiers = keyof Client
export type ClientGroups = GroupClients
export type ClientMethodIdentifiers = keyof GroupClients
export type ClientMethods = Methods
export type ClientMethodRequests = Parameters<Methods>[0]
export type ClientMethodResults = ReturnType<Methods>
