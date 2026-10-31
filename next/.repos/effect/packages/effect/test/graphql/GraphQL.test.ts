import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { GraphQL, GraphQLMiddleware } from "effect/graphql"
import { renderSlices } from "effect/internal/graphql"

class Auth extends GraphQLMiddleware.Service<Auth>()("Auth") {}

// A pull request lookup. Odd entries in a `body` are names renamed per slice:
// `PR` references `$withBody`, so it is per-slice; `Author` is shared. The
// root `__typename` checks that joining keeps the printer's spacing.
const pullRequestTemplate: GraphQL.DocumentTemplate = {
  variables: [
    { name: "owner", body: "String!" },
    { name: "number", body: "Int!" },
    { name: "withBody", body: "Boolean!=false" }
  ],
  selections: [
    { name: "__typename", body: [""] },
    {
      alias: "repo",
      name: "repository",
      body: ["(owner:$", "owner", ",name:\"effect\"){pullRequest(number:$", "number", "){...", "PR", "}}"]
    }
  ],
  fragments: [
    { name: "PR", body: ["on PullRequest{title body@include(if:$", "withBody", ")...Author}"] },
    { name: "Author", body: ["on PullRequest{author{login}}"] }
  ]
}

describe("GraphQL", () => {
  it("middleware returns a new operation and leaves the original unchanged", () => {
    const Viewer = GraphQL.query("Viewer", { document: "query Viewer{viewer{login}}", result: Schema.Struct({}) })
    const authed = Viewer.middleware(Auth)
    assert.deepStrictEqual(authed.middlewares, [Auth])
    assert.deepStrictEqual(Viewer.middlewares, [])
  })

  it("an operation built from a template sends the joined document", () => {
    const PullRequest = GraphQL.query("PullRequest", { document: pullRequestTemplate, result: Schema.Struct({}) })
    assert.strictEqual(
      PullRequest.document,
      "query PullRequest($owner:String!$number:Int!$withBody:Boolean!=false){__typename repo:repository(owner:$owner,name:\"effect\"){pullRequest(number:$number){...PR}}}fragment PR on PullRequest{title body@include(if:$withBody)...Author}fragment Author on PullRequest{author{login}}"
    )
    assert.strictEqual(PullRequest.template, pullRequestTemplate)
  })

  it("renderSlices aliases root fields and renames variables and per-slice fragments", () => {
    assert.strictEqual(
      renderSlices("query", "PullRequest", pullRequestTemplate, ["_0_", "_1_"]),
      "query PullRequest($_0_owner:String!$_0_number:Int!$_0_withBody:Boolean!=false$_1_owner:String!$_1_number:Int!$_1_withBody:Boolean!=false){_0___typename:__typename _0_repo:repository(owner:$_0_owner,name:\"effect\"){pullRequest(number:$_0_number){..._0_PR}}_1___typename:__typename _1_repo:repository(owner:$_1_owner,name:\"effect\"){pullRequest(number:$_1_number){..._1_PR}}}fragment _0_PR on PullRequest{title body@include(if:$_0_withBody)...Author}fragment _1_PR on PullRequest{title body@include(if:$_1_withBody)...Author}fragment Author on PullRequest{author{login}}"
    )
  })

  it.effect("otherTypename accepts any type name except the selected ones", () =>
    Effect.gen(function*() {
      const decode = Schema.decodeUnknownEffect(GraphQL.otherTypename<"Issue" | "PullRequest">()(["Issue"]))
      assert.strictEqual(yield* decode("PullRequest"), "PullRequest")
      assert.strictEqual(yield* decode("AddedLater"), "AddedLater")
      assert.instanceOf(yield* Effect.flip(decode("Issue")), Schema.SchemaError)
    }))

  it.effect("enumLiterals accepts a value the server added later", () =>
    Effect.gen(function*() {
      const decode = Schema.decodeUnknownEffect(GraphQL.enumLiterals(["OPEN", "CLOSED"]))
      assert.strictEqual(yield* decode("MERGED"), "MERGED")
    }))
})
