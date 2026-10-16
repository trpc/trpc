const endpointIdentifier = (index) => `getUser${String(index).padStart(4, "0")}`

const endpoint = (index, indent = "    ") => `${indent}HttpApiEndpoint.get("${endpointIdentifier(index)}", "/users/:id", {
${indent}  params: Params,
${indent}  success: User
${indent}})`

const endpoints = (count, indent = "    ") =>
  Array.from({ length: count }, (_, index) => endpoint(index + 1, indent)).join(",\n")

const imports = ({ builder = false, client = false, effect = false, httpClient = false } = {}) => {
  const effectImports = effect ? "Effect, Schema" : "Schema"
  const httpApiImports = ["HttpApi", builder ? "HttpApiBuilder" : undefined, client ? "HttpApiClient" : undefined,
    "HttpApiEndpoint", "HttpApiGroup"].filter((name) => name !== undefined).join(", ")
  return `import { ${effectImports} } from "effect"
${httpClient ? `import { HttpClient } from "effect/http"\n` : ""}import { ${httpApiImports} } from "effect/http-api"`
}

const warmup = `Schema.String
HttpApi.make("Api")
HttpApiGroup.make("users")
HttpApiEndpoint.get("warmup", "/warmup")`

const schemas = `const Params = Schema.Struct({
  id: Schema.FiniteFromString
})

const User = Schema.Struct({
  id: Schema.String,
  name: Schema.String
})`

const assertions = `type Assert<T extends true> = T
type IsNever<T> = [T] extends [never] ? true : false`

const api = (count, options = {}) => {
  const groupIdentifier = options.groupIdentifier ?? "users"
  const topLevel = options.topLevel === true ? ", { topLevel: true }" : ""
  return `const api = HttpApi.make("Api").add(
  HttpApiGroup.make("${groupIdentifier}"${topLevel}).add(
${endpoints(count)}
  )
)`
}

const endpointDeclarationFixture = (count) => `// Compares endpoint declaration for ${count} same-shaped endpoints.
${imports()}

${warmup}

${schemas}

${api(count)}

type Groups = typeof api extends HttpApi.HttpApi<string, infer Groups> ? Groups : never
type EndpointUnion = HttpApiGroup.Endpoints<Groups>

${assertions}

export type Api = typeof api
export type EndpointsExist = Assert<IsNever<EndpointUnion> extends false ? true : false>
export type EndpointRequests = HttpApiEndpoint.Request<EndpointUnion>
export type ServerServices = HttpApiEndpoint.ServerServices<EndpointUnion>
export type ClientServices = HttpApiEndpoint.ClientServices<EndpointUnion>
`

const clientMethodsFixture = () => `// Compares grouped client method derivation from 500 same-shaped endpoints.
${imports({ client: true })}

${warmup}

${schemas}

${api(500)}

type Client = HttpApiClient.ForApi<typeof api>
type Users = Client["users"]
type Methods = Users[keyof Users]

${assertions}

export type HasUsersGroup = Assert<"users" extends keyof Client ? true : false>
export type HasLastEndpoint = Assert<"getUser0500" extends keyof Users ? true : false>
export type MethodsExist = Assert<IsNever<Methods> extends false ? true : false>
export type ClientMethodRequests = Parameters<Methods>[0]
export type ClientMethodResults = ReturnType<Methods>
`

const topLevelClientMethodsFixture = () => `// Compares top-level client method derivation from 500 same-shaped endpoints.
${imports({ client: true })}

${warmup}

${schemas}

${api(500, { groupIdentifier: "top", topLevel: true })}

type Client = HttpApiClient.ForApi<typeof api>
type Methods = Client[keyof Client]

${assertions}

export type HasLastEndpoint = Assert<"getUser0500" extends keyof Client ? true : false>
export type MethodsExist = Assert<IsNever<Methods> extends false ? true : false>
export type ClientMethodRequests = Parameters<Methods>[0]
export type ClientMethodResults = ReturnType<Methods>
`

const group = (groupIndex, endpointCount) => {
  const identifier = `group${String(groupIndex).padStart(3, "0")}`
  return `  HttpApiGroup.make("${identifier}").add(
${endpoints(endpointCount)}
  )`
}

const multipleGroupsApi = (groupCount, endpointCount) => `const api = HttpApi.make("Api").add(
${Array.from({ length: groupCount }, (_, index) => group(index + 1, endpointCount)).join(",\n")}
)`

const clientGroupsFixture = () => `// Compares client derivation for 100 groups with 5 same-shaped endpoints each.
${imports({ client: true })}

${warmup}

${schemas}

${multipleGroupsApi(100, 5)}

type Client = HttpApiClient.ForApi<typeof api>
type GroupClients = Client[keyof Client]
type Methods = GroupClients[keyof GroupClients]

${assertions}

export type HasLastGroup = Assert<"group100" extends keyof Client ? true : false>
export type HasLastEndpoint = Assert<"getUser0005" extends keyof GroupClients ? true : false>
export type MethodsExist = Assert<IsNever<Methods> extends false ? true : false>
export type ClientMethodRequests = Parameters<Methods>[0]
export type ClientMethodResults = ReturnType<Methods>
`

const clientEndpointFixture = () => `// Compares HttpApiClient.endpoint selection from 500 same-shaped endpoints.
${imports({ client: true, effect: true, httpClient: true })}

${warmup}

${schemas}

${api(500)}

declare const httpClient: HttpClient.HttpClient

const endpointClient = HttpApiClient.endpoint(api, {
  group: "users",
  endpoint: "getUser0500",
  httpClient
})

type Method = Effect.Success<typeof endpointClient>

${assertions}

export type MethodExists = Assert<IsNever<Method> extends false ? true : false>
export type EndpointClientRequest = Parameters<Method>[0]
export type EndpointClientResult = ReturnType<Method>
`

const urlBuilderFixture = (topLevel) => `// Compares ${topLevel ? "top-level" : "grouped"} URL builder derivation from 500 same-shaped endpoints.
${imports({ client: true })}

${warmup}

${schemas}

${api(500, topLevel ? { groupIdentifier: "top", topLevel: true } : {})}

type UrlBuilder = HttpApiClient.UrlBuilder<typeof api>
type Methods = ${topLevel ? "UrlBuilder[keyof UrlBuilder]" : "UrlBuilder[\"users\"][keyof UrlBuilder[\"users\"]]"}

${assertions}

export type HasLastEndpoint = Assert<"getUser0500" extends ${topLevel ? "keyof UrlBuilder" : "keyof UrlBuilder[\"users\"]"} ? true : false>
export type MethodsExist = Assert<IsNever<Methods> extends false ? true : false>
export type UrlBuilderMethodRequests = Parameters<Methods>[0]
export type UrlBuilderMethodResults = ReturnType<Methods>
`

const builderEndpointFixture = () => `// Compares HttpApiBuilder.endpoint selection from 500 same-shaped endpoints.
${imports({ builder: true, effect: true })}

${warmup}

${schemas}

${api(500)}

const endpointHandler = HttpApiBuilder.endpoint(
  api,
  "users",
  "getUser0500",
  ({ params }) => Effect.succeed({ id: String(params.id), name: "Ada" })
)

type HttpEffect = Effect.Success<typeof endpointHandler>

${assertions}

export type EndpointHandlerExists = Assert<IsNever<typeof endpointHandler> extends false ? true : false>
export type HttpEffectExists = Assert<IsNever<HttpEffect> extends false ? true : false>
export type EndpointHandlerServices = Effect.Services<typeof endpointHandler>
export type HttpEffectServices = Effect.Services<HttpEffect>
`

const handlerCall = (index, raw) => `    .${raw ? "handleRaw" : "handle"}("${endpointIdentifier(index)}", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))`

const handlersFixture = (count, raw = false) => `// Compares chained builder ${raw ? "handleRaw" : "handle"} registration for ${count} same-shaped endpoints.
${imports({ builder: true, effect: true })}

${warmup}

${schemas}

const group = HttpApiGroup.make("users").add(
${endpoints(count, "  ")}
)

const api = HttpApi.make("Api").add(group)

const layer = HttpApiBuilder.group(api, "users", (handlers) =>
  handlers
${Array.from({ length: count }, (_, index) => handlerCall(index + 1, raw)).join("\n")}
)

${assertions}

export type LayerExists = Assert<IsNever<typeof layer> extends false ? true : false>
export type Layer = typeof layer
`

export const httpapi = {
  name: "httpapi",
  baseline: `// Shared cross-ref HttpApi baseline.
${imports()}

${warmup}
`,
  fixtures: [
    ...[10, 50, 100, 500].map((count) => ({
      name: `endpoint-count-${count}`,
      source: endpointDeclarationFixture(count)
    })),
    { name: "client-methods-count-500", source: clientMethodsFixture() },
    { name: "client-top-level-methods-count-500", source: topLevelClientMethodsFixture() },
    { name: "client-groups-100x5-count-500", source: clientGroupsFixture() },
    { name: "client-endpoint-method-count-500", source: clientEndpointFixture() },
    { name: "url-builder-count-500", source: urlBuilderFixture(false) },
    { name: "url-builder-top-level-count-500", source: urlBuilderFixture(true) },
    { name: "builder-endpoint-count-500", source: builderEndpointFixture() },
    ...[10, 50, 100, 500].map((count) => ({
      name: `builder-handlers-count-${count}`,
      source: handlersFixture(count)
    })),
    { name: "builder-raw-handlers-count-500", source: handlersFixture(500, true) }
  ]
}
