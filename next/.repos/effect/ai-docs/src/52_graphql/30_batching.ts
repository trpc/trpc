/**
 * @title Batching lookups with GraphQLResolver
 *
 * Collect concurrent lookups by id into one `nodes(ids:)` request with
 * `GraphQLResolver`, instead of one request per id.
 */
import { type Cause, Context, Effect, Layer, RequestResolver, Schema } from "effect"
import { GraphQL, GraphQLClient, GraphQLGroup, GraphQLProtocol, GraphQLResolver } from "effect/graphql"
import { FetchHttpClient } from "effect/http"
import { GitHubAuth } from "./10_basics.ts"

// The generator's output for `repo-nodes.graphql`:
//
//   query RepoNodes($ids: [ID!]!) {
//     nodes(ids: $ids) { __typename ... on Repository { nameWithOwner } }
//   }
//
// Generated modules import shared codecs and the possible `__typename`s of
// each interface from the module the generator writes next to the schema
// (`import * as Shared from "../schema.graphql.ts"`); here `Shared` is
// declared inline.
const Shared = { ID: Schema.String }
declare namespace Shared {
  export namespace Typename {
    export type Node = "Issue" | "PullRequest" | "Repository" | "User"
  }
}

export const Repository = Schema.Struct({
  __typename: Schema.Literal("Repository"),
  nameWithOwner: Schema.String
})
export interface Repository extends Schema.Struct.Type<typeof Repository.fields> {}

// Unselected node types are represented by `otherTypename`.
export const NodeOther = Schema.Struct({
  __typename: GraphQL.otherTypename<Shared.Typename.Node>()(["Repository"])
})
export interface NodeOther extends Schema.Struct.Type<typeof NodeOther.fields> {}

/** `query RepoNodes` */
export const RepoNodes = GraphQL.query("RepoNodes", {
  document: {
    variables: [
      { name: "ids", body: "[ID!]!" }
    ],
    selections: [
      { name: "nodes", body: ["(ids:$", "ids", "){__typename...on Repository{nameWithOwner}}"] }
    ],
    fragments: []
  },
  variables: {
    ids: Schema.Array(Shared.ID)
  },
  result: Schema.Struct({
    nodes: Schema.Array(Schema.NullOr(Schema.Union([
      Repository,
      NodeOther
    ])))
  })
})
export declare namespace RepoNodes {
  export type Variables = typeof RepoNodes.variables.Type
  export type Result = typeof RepoNodes.result.Type
}

/** Every operation in repo-nodes.graphql. */
export const RepoNodesGraphQLGroup = GraphQLGroup.make(RepoNodes)

// Your code: attach the middleware to the generated group.
export const GitHubGraphQLGroup = RepoNodesGraphQLGroup.middleware(GitHubAuth)

export class GitHub extends Context.Service<
  GitHub,
  GraphQLClient.FromGroup<typeof GitHubGraphQLGroup> & {
    getRepo(id: string): Effect.Effect<
      Repository,
      GraphQL.Error<typeof RepoNodes> | Cause.NoSuchElementError
    >
  }
>()("app/GitHub") {
  static readonly layer = Layer.effect(
    GitHub,
    Effect.gen(function*() {
      const client = yield* GraphQLClient.make(GitHubGraphQLGroup)

      // Null entries and non-Repository nodes fail with NoSuchElementError.
      // GitHub accepts at most 100 ids per request.
      //
      // GitHubAuth reads one token from config, so every lookup can share a
      // batch. If a middleware `requires` a per-request service, such as the
      // signed-in user, `batchKey` is required and keeps lookups for different
      // users in separate calls:
      //
      //   batchKey: (context) => Context.get(context, CurrentUser).id
      const RepoById = GraphQLResolver.ordered(client.RepoNodes, {
        variables: (ids: ReadonlyArray<string>) => ({ ids }),
        path: ["nodes"],
        typename: "Repository"
      }).pipe(RequestResolver.batchN(100))
      return { ...client, getRepo: GraphQLResolver.request(RepoById) }
    })
  ).pipe(
    Layer.provide(GitHubAuth.layer),
    Layer.provide(GraphQLProtocol.layerHttp({ url: "https://api.github.com/graphql" })),
    Layer.provide(FetchHttpClient.layer)
  )
}

export const repoNames = Effect.fn("repoNames")(function*(ids: ReadonlyArray<string>) {
  const github = yield* GitHub
  const repos = yield* Effect.forEach(ids, github.getRepo, { concurrency: "unbounded" })
  return repos.map((repo) => repo.nameWithOwner)
})

export const program = repoNames(["R_1", "R_2"]).pipe(
  Effect.provide(GitHub.layer)
)
