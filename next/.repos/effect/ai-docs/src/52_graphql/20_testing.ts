/**
 * @title Testing code that uses a GraphQL client
 *
 * Replace a client service with `GraphQLClient.layerTest`, answering each
 * operation from a handler instead of a server.
 */
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { GitHub } from "./10_basics.ts"

// Code under test that depends on the `GitHub` client service.
const issueTitles = (owner: string, name: string) =>
  GitHub.use((github) => github.RepoIssues({ owner, name })).pipe(
    Effect.map(({ repository }) => repository?.issues.nodes?.map((issue) => issue?.title) ?? [])
  )

// The service binds `GraphQLClient.layerTest(GitHub, GitHubGraphQLGroup)` once
// as a static helper. Handlers are keyed by operation name, receive the
// caller's variables and options, and return results in their decoded form.
// Nothing is encoded or decoded and no middleware runs. An operation without
// a handler dies with an `UnimplementedError` defect.
const GitHubTest = GitHub.layerTest({
  RepoIssues: ({ owner, name }) =>
    Effect.succeed({
      repository: {
        issues: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [{ number: 1, title: `Hello from ${owner}/${name}` }]
        }
      }
    })
})

describe("issueTitles", () => {
  it.effect("returns the titles of the first page", () =>
    Effect.gen(function*() {
      const titles = yield* issueTitles("Effect-TS", "effect")
      assert.deepStrictEqual(titles, ["Hello from Effect-TS/effect"])
    }).pipe(Effect.provide(GitHubTest)))
})

// `layerTest` uses `makeTest`, which skips the protocol and cannot return
// partial data together with `errors`. To test that, or the encode and decode
// path, build the real client with `GraphQLClient.make` over a scripted
// `GraphQLProtocol` layer (see `GraphQLProtocol`).
