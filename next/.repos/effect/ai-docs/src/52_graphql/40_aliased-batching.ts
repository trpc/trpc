/**
 * @title Batching single-item lookups with aliases
 *
 * When an API has no field that takes a list of keys, `GraphQLResolver.aliased`
 * repeats a generated operation under aliases, so concurrent lookups share one
 * request and keep their generated types.
 */
import { Context, Effect, Layer, Schema } from "effect"
import { GraphQL, GraphQLClient, GraphQLGroup, GraphQLProtocol, GraphQLResolver } from "effect/graphql"
import { FetchHttpClient } from "effect/http"
import { GitHubAuth } from "./10_basics.ts"

// The generator's output for `pr.graphql`:
//
//   query PullRequest($owner: String!, $name: String!, $number: Int!) {
//     repository(owner: $owner, name: $name) {
//       pullRequest(number: $number) { number title }
//     }
//   }
//
// Generated modules import shared codecs, such as `Int`, from the module the
// generator writes next to the schema (`import * as Shared from
// "../schema.graphql.ts"`); here `Shared` is declared inline.
const Shared = { Int: Schema.Number.check(Schema.isInt32()) }

export const PullRequestPullRequest = Schema.Struct({
  number: Shared.Int,
  title: Schema.String
})
export interface PullRequestPullRequest extends Schema.Struct.Type<typeof PullRequestPullRequest.fields> {}

export const Repository = Schema.Struct({
  pullRequest: Schema.NullOr(PullRequestPullRequest)
})
export interface Repository extends Schema.Struct.Type<typeof Repository.fields> {}

// The generator gives queries and mutations their document as a
// `GraphQL.DocumentTemplate`. The odd entries of each `body` are the names
// `aliased` renames per slice; joined together they are the printed document.
/** `query PullRequest` */
export const PullRequest = GraphQL.query("PullRequest", {
  document: {
    variables: [
      { name: "owner", body: "String!" },
      { name: "name", body: "String!" },
      { name: "number", body: "Int!" }
    ],
    selections: [
      {
        name: "repository",
        body: ["(owner:$", "owner", " name:$", "name", "){pullRequest(number:$", "number", "){number title}}"]
      }
    ],
    fragments: []
  },
  variables: {
    owner: Schema.String,
    name: Schema.String,
    number: Shared.Int
  },
  result: Schema.Struct({
    repository: Schema.NullOr(Repository)
  })
})
export declare namespace PullRequest {
  export type Variables = typeof PullRequest.variables.Type
  export type Result = typeof PullRequest.result.Type
}

/** Every operation in pr.graphql. */
export const PrGraphQLGroup = GraphQLGroup.make(PullRequest)

// Your code: attach the middleware to the generated group.
export const GitHubGraphQLGroup = PrGraphQLGroup.middleware(GitHubAuth)

export class GitHub extends Context.Service<
  GitHub,
  GraphQLClient.FromGroup<typeof GitHubGraphQLGroup> & {
    readonly getPullRequest: (
      variables: GraphQL.Variables<typeof PullRequest>
    ) => Effect.Effect<GraphQL.Result<typeof PullRequest>, GraphQL.Error<typeof PullRequest>>
  }
>()("app/GitHub") {
  static readonly layer = Layer.effect(
    GitHub,
    Effect.gen(function*() {
      const client = yield* GraphQLClient.make(GitHubGraphQLGroup)

      // Concurrent calls go out as one POST whose root fields are aliased
      // `_0_repository`, `_1_repository`, and so on. Each slice is decoded
      // with the generated result Schema, and a GraphQL error under
      // `_1_repository` fails only that call.
      //
      // A batch holds 10 slices by default, because GitHub's query cost and
      // timeouts grow with the size of the query. Pipe
      // `RequestResolver.batchN` to change it.
      const PullRequests = GraphQLResolver.aliased(client.PullRequest)

      // `request` turns the resolver into a lookup by the operation's
      // variables, as for `ordered` and `findById`.
      return { ...client, getPullRequest: GraphQLResolver.request(PullRequests) }
    })
  ).pipe(
    Layer.provide(GitHubAuth.layer),
    Layer.provide(GraphQLProtocol.layerHttp({ url: "https://api.github.com/graphql" })),
    Layer.provide(FetchHttpClient.layer)
  )
}

export const pullRequestTitles = Effect.fn("pullRequestTitles")(function*(numbers: ReadonlyArray<number>) {
  const github = yield* GitHub
  const results = yield* Effect.forEach(
    numbers,
    (number) => github.getPullRequest({ owner: "Effect-TS", name: "effect", number }),
    { concurrency: "unbounded" }
  )
  // `repository` and `pullRequest` are nullable, so a missing pull request is
  // `null` rather than an error that would fail every slice.
  return results.map((result) => result.repository?.pullRequest?.title ?? null)
})

export const program = pullRequestTitles([1, 2, 3]).pipe(
  Effect.provide(GitHub.layer)
)
