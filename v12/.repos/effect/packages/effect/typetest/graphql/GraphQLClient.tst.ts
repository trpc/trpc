import { Context, Effect, hole, type Layer, Schema, type Stream } from "effect"
import { GraphQL, GraphQLClient, GraphQLGroup, GraphQLMiddleware, type GraphQLProtocol } from "effect/graphql"
import type { GraphQLClientError, GraphQLError } from "effect/graphql/GraphQLClientError"
import { describe, expect, it } from "tstyche"

class CurrentUser extends Context.Service<CurrentUser, { readonly id: string }>()("CurrentUser") {}
class TokenExpired extends Schema.TaggedError<TokenExpired>()("TokenExpired", { user: Schema.String }) {}

class Auth extends GraphQLMiddleware.Service<Auth, { requires: CurrentUser; error: TokenExpired }>()("Auth") {}
class Log extends GraphQLMiddleware.Service<Log>()("Log") {}

const Issue = Schema.Struct({ number: Schema.Int, title: Schema.String })
const IssuesConnection = Schema.Struct({
  pageInfo: Schema.Struct({ hasNextPage: Schema.Boolean, endCursor: Schema.NullOr(Schema.String) }),
  nodes: Schema.NullOr(Schema.Array(Schema.NullOr(Issue)))
})
const RepoIssuesResult = Schema.Struct({
  repository: Schema.NullOr(Schema.Struct({ issues: Schema.NullOr(IssuesConnection) }))
})
type RepoIssuesResult = typeof RepoIssuesResult.Type

const Viewer = GraphQL.query("Viewer", {
  document: "",
  result: Schema.Struct({ viewer: Schema.Struct({ login: Schema.String }) })
})

const RepoIssues = GraphQL.query("RepoIssues", {
  document: "",
  variables: { owner: Schema.String, name: Schema.String, after: Schema.optional(Schema.NullOr(Schema.String)) },
  result: RepoIssuesResult
})

const IssueUpdatedResult = Schema.Struct({ issueUpdated: Schema.Struct({ title: Schema.String }) })
const IssueUpdated = GraphQL.subscription("IssueUpdated", {
  document: "",
  variables: { id: Schema.String },
  result: IssueUpdatedResult
})

// The paging helpers omit `after` on the first page and send the previous
// `endCursor` (a string) afterwards.
const RequiredAfter = GraphQL.query("RequiredAfter", {
  document: "",
  variables: { after: Schema.String },
  result: RepoIssuesResult
})
const NumberAfter = GraphQL.query("NumberAfter", {
  document: "",
  variables: { after: Schema.optional(Schema.NullOr(Schema.Number)) },
  result: RepoIssuesResult
})
const StringOnlyAfter = GraphQL.query("StringOnlyAfter", {
  document: "",
  variables: { after: Schema.optional(Schema.String) },
  result: RepoIssuesResult
})

const group = GraphQLGroup.merge(
  GraphQLGroup.make(RepoIssues.middleware(Auth), IssueUpdated),
  GraphQLGroup.make(Viewer, RequiredAfter, NumberAfter, StringOnlyAfter)
).middleware(Log)

const make = GraphQLClient.make(group)
const client = hole<Effect.Success<typeof make>>()

const variables = { owner: "Effect-TS", name: "effect" }
const connection = (r: RepoIssuesResult) => r.repository?.issues

describe("GraphQLClient", () => {
  it("FromGroup is the client type make builds for a group", () => {
    expect<GraphQLClient.FromGroup<typeof group>>().type.toBe<Effect.Success<typeof make>>()
  })

  it("make requires the protocol and every attached middleware tag", () => {
    expect<Effect.Services<typeof make>>().type.toBe<GraphQLProtocol.GraphQLProtocol | Auth | Log>()
  })

  it("layerTest infers handlers from the group and rejects a mismatched service", () => {
    class GitHub extends Context.Service<GitHub>()("test/GitHub", { make }) {
      static readonly layerTest = GraphQLClient.layerTest(GitHub, group)
    }

    const layer = GitHub.layerTest({
      RepoIssues: (variables, options) => {
        expect(variables).type.toBe<GraphQL.Variables<typeof RepoIssues>>()
        expect(options).type.toBe<GraphQLClient.TestCallOptions>()
        return Effect.succeed(hole<RepoIssuesResult>())
      }
    })
    expect(layer).type.toBe<Layer.Layer<GitHub>>()
    expect(GraphQLClient.layerTest).type.not.toBeCallableWith(GitHub, GraphQLGroup.make(Viewer))
  })

  it("middleware requires and error appear only on the operations it is attached to", () => {
    expect(client.RepoIssues(variables)).type.toBe<
      Effect.Effect<RepoIssuesResult, GraphQLClientError | TokenExpired, CurrentUser>
    >()
    expect(client.Viewer()).type.toBe<Effect.Effect<typeof Viewer.result.Type, GraphQLClientError>>()
  })

  it("the context option removes the services it provides from the requirements", () => {
    expect(client.RepoIssues(variables, { context: Context.make(CurrentUser, { id: "tim" }) })).type.toBe<
      Effect.Effect<RepoIssuesResult, GraphQLClientError | TokenExpired>
    >()
  })

  it("partial: true returns { data, errors }", () => {
    expect(client.RepoIssues(variables, { partial: true })).type.toBe<
      Effect.Effect<
        { readonly data: RepoIssuesResult; readonly errors: ReadonlyArray<GraphQLError> },
        GraphQLClientError | TokenExpired,
        CurrentUser
      >
    >()
  })

  it("a subscription returns a Stream", () => {
    expect(client.IssueUpdated({ id: "I_1" })).type.toBe<
      Stream.Stream<typeof IssueUpdatedResult.Type, GraphQLClientError>
    >()
  })

  it("rejects missing required variables", () => {
    expect(client.RepoIssues).type.not.toBeCallableWith({ owner: "Effect-TS" })
  })

  it("items emits each node with the method's error and requirements", () => {
    expect(GraphQLClient.items(client.RepoIssues, { variables, connection })).type.toBe<
      Stream.Stream<typeof Issue.Type | null, GraphQLClientError | TokenExpired, CurrentUser>
    >()
  })

  it("paging rejects a required or non-string after variable", () => {
    expect(GraphQLClient.pages).type.not.toBeCallableWith(client.RequiredAfter, { variables: {}, connection })
    expect(GraphQLClient.pages).type.not.toBeCallableWith(client.NumberAfter, { variables: {}, connection })
  })

  it("paging accepts an optional string-only after variable", () => {
    expect(GraphQLClient.pages).type.toBeCallableWith(client.StringOnlyAfter, { variables: {}, connection })
  })
})
