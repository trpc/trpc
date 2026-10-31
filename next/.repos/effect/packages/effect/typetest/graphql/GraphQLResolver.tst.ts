import { Context, type Effect, hole, Schema } from "effect"
import { GraphQL, type GraphQLClient, GraphQLMiddleware, GraphQLResolver } from "effect/graphql"
import { describe, expect, it } from "tstyche"

class CurrentUser extends Context.Service<CurrentUser, { readonly tenant: string }>()("CurrentUser") {}
class Auth extends GraphQLMiddleware.Service<Auth, { requires: CurrentUser }>()("Auth") {}

const Repository = Schema.Struct({ __typename: Schema.Literal("Repository"), nameWithOwner: Schema.String })
const User = Schema.Struct({ __typename: Schema.Literal("User"), login: Schema.String })

const SearchRepos = GraphQL.query("SearchRepos", {
  document: "",
  variables: { query: Schema.String },
  result: Schema.Struct({
    search: Schema.Struct({ nodes: Schema.NullOr(Schema.Array(Schema.NullOr(Schema.Union([Repository, User])))) })
  })
})

const method = hole<GraphQLClient.OperationMethod<typeof SearchRepos>>()
const authed = hole<GraphQLClient.OperationMethod<GraphQL.AddMiddleware<typeof SearchRepos, Auth>>>()
const variables = (keys: ReadonlyArray<string>) => ({ query: keys.join(" ") })

describe("GraphQLResolver", () => {
  it("key-first findById infers string request keys", () => {
    const get = GraphQLResolver.request(GraphQLResolver.findById(method, {
      key: (repo) => repo.nameWithOwner,
      variables: (names) => ({ query: names.join(" ") }),
      path: ["search", "nodes"],
      typename: "Repository"
    }))
    expect(get).type.toBeCallableWith("Effect-TS/effect")
    expect(get).type.not.toBeCallableWith(123)
  })

  it("rejects a path segment that is not a key of the object at that level", () => {
    expect(GraphQLResolver.ordered).type.not.toBeCallableWith(method, { variables, path: ["search", "edges"] })
    expect(GraphQLResolver.ordered).type.not.toBeCallableWith(method, {
      variables,
      path: ["search", "nodes", "nameWithOwner"]
    })
  })

  it("typename narrows the success type to that union member", () => {
    const narrowed = GraphQLResolver.request(
      GraphQLResolver.ordered(method, { variables, path: ["search", "nodes"], typename: "Repository" })
    )
    expect<Effect.Success<ReturnType<typeof narrowed>>>().type.toBe<typeof Repository.Type>()

    const all = GraphQLResolver.request(GraphQLResolver.ordered(method, { variables, path: ["search", "nodes"] }))
    expect<Effect.Success<ReturnType<typeof all>>>().type.toBe<typeof Repository.Type | typeof User.Type>()
  })

  it("batchKey is required when the method needs services and rejected when it does not", () => {
    const path = ["search", "nodes"] as const
    const batchKey = (context: Context.Context<CurrentUser>) => Context.get(context, CurrentUser).tenant
    expect(GraphQLResolver.ordered).type.toBeCallableWith(authed, { variables, path, batchKey })
    expect(GraphQLResolver.ordered).type.not.toBeCallableWith(authed, { variables, path })
    expect(GraphQLResolver.findById).type.not.toBeCallableWith(authed, {
      variables,
      path,
      key: (node: { readonly __typename: string }) => node.__typename
    })
    expect(GraphQLResolver.ordered).type.not.toBeCallableWith(method, { variables, path, batchKey: () => "tenant" })
  })
})
