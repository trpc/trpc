import { Context, Effect, hole, type Layer, Stream } from "effect"
import { type GraphQL, GraphQLProtocol } from "effect/graphql"
import type { HttpClient } from "effect/http"
import type { Socket } from "effect/socket"
import { describe, expect, it } from "tstyche"

const GitHubHost = Context.Reference<string>("GitHubHost", { defaultValue: () => "api.github.com" })
class CurrentUser extends Context.Service<CurrentUser, { readonly host: string }>()("CurrentUser") {}

type UrlFunction = (options: {
  readonly context: Context.Context<never>
  readonly kind: GraphQL.Kind
  readonly operationName: string
}) => string

const url: UrlFunction = ({ context }) => `https://${Context.get(context, GitHubHost)}/graphql`
const effectUrl = Effect.map(Effect.service(GitHubHost), (host) => `https://${host}/graphql`)
const webSocket = { url: "wss://example.com/graphql" }

describe("GraphQLProtocol", () => {
  it("layerHttp and makeHttp accept a url function of the context, kind and operation name", () => {
    const layer = GraphQLProtocol.layerHttp({
      url: ({ context, kind, operationName }) => `https://${Context.get(context, GitHubHost)}/${kind}/${operationName}`
    })
    expect(layer).type.toBe<Layer.Layer<GraphQLProtocol.GraphQLProtocol, never, HttpClient.HttpClient>>()
    expect(GraphQLProtocol.makeHttp({ url, queryMethod: "GET" })).type.toBe<
      Effect.Effect<GraphQLProtocol.GraphQLProtocol["Service"], never, HttpClient.HttpClient>
    >()
  })

  it("layerHttp and makeHttp accept an Effect url that has no errors or requirements", () => {
    expect(GraphQLProtocol.layerHttp({ url: effectUrl })).type.toBe<
      Layer.Layer<GraphQLProtocol.GraphQLProtocol, never, HttpClient.HttpClient>
    >()
    expect(GraphQLProtocol.makeHttp({ url: effectUrl })).type.toBe<
      Effect.Effect<GraphQLProtocol.GraphQLProtocol["Service"], never, HttpClient.HttpClient>
    >()
    expect(GraphQLProtocol.layerHttp).type.not.toBeCallableWith({ url: hole<Effect.Effect<string, Error>>() })
    expect(GraphQLProtocol.layerHttp).type.not.toBeCallableWith({
      url: hole<Effect.Effect<string, never, CurrentUser>>()
    })
    expect(GraphQLProtocol.makeHttp).type.not.toBeCallableWith({ url: hole<Effect.Effect<string, Error>>() })
    expect(GraphQLProtocol.makeHttp).type.not.toBeCallableWith({
      url: hole<Effect.Effect<string, never, CurrentUser>>()
    })
  })

  it("a url function or Effect can't be combined with subscriptions.webSocket; a static url can", () => {
    for (const dynamic of [url, effectUrl]) {
      expect(GraphQLProtocol.layerHttp).type.not.toBeCallableWith({ url: dynamic, subscriptions: { webSocket } })
      expect(GraphQLProtocol.makeHttp).type.not.toBeCallableWith({ url: dynamic, subscriptions: { webSocket } })
    }
    expect(GraphQLProtocol.layerHttp({ url: "https://example.com/graphql", subscriptions: { webSocket } })).type.toBe<
      Layer.Layer<GraphQLProtocol.GraphQLProtocol, never, HttpClient.HttpClient | Socket.WebSocketConstructor>
    >()
  })

  it("the service has an optional url that resolves to an Effect, so hand-written protocols without one still compile", () => {
    expect<GraphQLProtocol.GraphQLProtocol["Service"]["url"]>().type.toBe<
      | ((options: { readonly kind: GraphQL.Kind; readonly operationName: string }) => Effect.Effect<string>)
      | undefined
    >()
    expect(GraphQLProtocol.GraphQLProtocol.of).type.toBeCallableWith({
      execute: () => Effect.succeed({ body: null }),
      subscribe: () => Stream.empty
    })
  })
})
