// Shared type-only endpoint groups for client-group and endpoint-selection fixtures.
import type { Schema } from "effect"
import type { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

type EndpointCount = 10 | 50 | 100 | 500

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
type ZeroToFour = "0" | "1" | "2" | "3" | "4"

type EndpointIdentifiers10 = Exclude<`getUser000${Digit}`, "getUser0000"> | "getUser0010"
type EndpointIdentifiers50 = Exclude<`getUser00${ZeroToFour}${Digit}`, "getUser0000"> | "getUser0050"
type EndpointIdentifiers100 = Exclude<`getUser00${Digit}${Digit}`, "getUser0000"> | "getUser0100"
type EndpointIdentifiers500 =
  | Exclude<`getUser0${ZeroToFour}${Digit}${Digit}`, "getUser0000">
  | "getUser0500"

type EndpointIdentifiers<Count extends EndpointCount> = Count extends 10 ? EndpointIdentifiers10
  : Count extends 50 ? EndpointIdentifiers50
  : Count extends 100 ? EndpointIdentifiers100
  : EndpointIdentifiers500

type Params = Schema.toCodecStringTree<Schema.Struct<{ id: Schema.FiniteFromString }>>
type Success = Schema.toCodecJson<Schema.Struct<{ id: Schema.String; name: Schema.String }>>

type Endpoint<Identifier extends string> = Identifier extends string ? HttpApiEndpoint.HttpApiEndpoint<
    Identifier,
    "GET",
    "/users/:id",
    Params,
    never,
    never,
    never,
    Success
  >
  : never

export type Group<Count extends EndpointCount, TopLevel extends boolean = false> = HttpApiGroup.HttpApiGroup<
  "users",
  Endpoint<EndpointIdentifiers<Count>>,
  TopLevel
>
