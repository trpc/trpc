import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { assertNoErrors, declaration, fileLines, generateIn, member, members } from "./utils/generator.ts"

const schema = `
type User { id: ID! login: String! name: String! }
type AuthorUser { name: String! }
type Issue { id: ID! title: String! author: User assignee: User extra: AuthorUser }
type Pull { id: ID! author: User }
union Item = Issue | Pull
type Wrapper { item: Item }
type Query { issues: [Issue!]! pulls: [Issue!]! items: [Item!]! a: Wrapper b: Wrapper }
`

const generate = (documents: Readonly<Record<string, string>>) =>
  generateIn({ "schema.graphql": schema, ...documents }, { schema: "./schema.graphql", documents: ["src/*.graphql"] })

const generateBoard = (document: string) =>
  generate({ "src/board.graphql": document }).pipe(
    Effect.map((generated) => {
      assertNoErrors(generated)
      return generated.file("src/board.graphql.ts")
    })
  )

const selectionNames = (text: string): ReadonlyArray<string> =>
  fileLines(text).flatMap((line) => {
    const match = /^export const (\w+) = Schema\.Struct\(/.exec(line)
    return match === null ? [] : [match[1]!]
  }).sort()

describe("Generator nested selection names", () => {
  it.effect("nested selections use bare type names, including inside fragments", () =>
    Effect.gen(function*() {
      const board = yield* generateBoard(`
query Board {
  issues { id author { login } }
  pulls { ...IssueSummary }
}

fragment IssueSummary on Issue { title assignee { login } }
`)
      assert.deepStrictEqual(selectionNames(board), ["Issue", "IssueSummary", "User"])
      assert.strictEqual(
        declaration(board, "Issue"),
        "export const Issue = Schema.Struct({"
      )
      assert.include(fileLines(board), "export interface Issue extends Schema.Struct.Type<typeof Issue.fields> {}")
      assert.strictEqual(member(board, "issues"), "Schema.Array(Issue)")
      assert.strictEqual(member(board, "author"), "Schema.NullOr(User)")
      assert.strictEqual(member(board, "pulls"), "Schema.Array(IssueSummary)")
      assert.strictEqual(member(board, "assignee"), "Schema.NullOr(User)")
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("identical selections share one schema across operations, whatever their field order", () =>
    Effect.gen(function*() {
      const reordered = yield* generateBoard(
        "query Board { issues { author { login name } } } query Feed { pulls { id author { name login } } }"
      )
      assert.deepStrictEqual(selectionNames(reordered), ["IssuesIssue", "PullsIssue", "User"])
      assert.deepStrictEqual(members(reordered, "author"), ["Schema.NullOr(User)", "Schema.NullOr(User)"])

      const board = yield* generateBoard("query Board { issues { author { login } assignee { login } } }")
      assert.deepStrictEqual(selectionNames(board), ["Issue", "User"])
      assert.strictEqual(member(board, "author"), "Schema.NullOr(User)")
      assert.strictEqual(member(board, "assignee"), "Schema.NullOr(User)")

      const reorderedMembers = yield* generateBoard(`
query Board {
  a { item { ... on Issue { id } ... on Pull { id } } }
  b { item { ... on Pull { id } ... on Issue { id } } }
}
`)
      assert.deepStrictEqual(selectionNames(reorderedMembers), [
        "Issue",
        "ItemOther",
        "Pull",
        "Wrapper"
      ])

      // The same alias over different fields is a different selection, even though it decodes the same way.
      const aliased = yield* generateBoard(
        "query Board { issues { author { value: login } assignee { value: name } } }"
      )
      assert.deepStrictEqual(selectionNames(aliased), ["AssigneeUser", "AuthorUser", "Issue"])
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("clashing shapes fall back to field keys, then parents, and only then the operation", () =>
    Effect.gen(function*() {
      const board = yield* generateBoard("query Board { issues { author { login } } pulls { author { id login } } }")
      assert.deepStrictEqual(selectionNames(board), [
        "IssuesAuthorUser",
        "IssuesIssue",
        "PullsAuthorUser",
        "PullsIssue"
      ])
      assert.strictEqual(member(board, "issues"), "Schema.Array(IssuesIssue)")
      assert.strictEqual(member(board, "pulls"), "Schema.Array(PullsIssue)")
      assert.deepStrictEqual(members(board, "author").slice().sort(), [
        "Schema.NullOr(IssuesAuthorUser)",
        "Schema.NullOr(PullsAuthorUser)"
      ])

      // The shared `{ login }` takes the path of `assignee`, its first occurrence in the document.
      const feed = yield* generateBoard(`
query Feed {
  items {
    ... on Issue { author { id } }
    ... on Pull { assignee: author { login } }
    ... on Issue { later: author { login } }
  }
}
`)
      assert.deepStrictEqual(selectionNames(feed), [
        "AssigneeUser",
        "AuthorUser",
        "Issue",
        "ItemOther",
        "Pull"
      ])
      assert.strictEqual(member(feed, "later"), "Schema.NullOr(AssigneeUser)")

      const operations = yield* generateBoard(
        "query Board { issues { author { login } } } query Feed { issues { author { id } } }"
      )
      assert.deepStrictEqual(selectionNames(operations), [
        "BoardIssuesAuthorUser",
        "BoardIssuesIssue",
        "FeedIssuesAuthorUser",
        "FeedIssuesIssue"
      ])
      assert.deepStrictEqual(members(operations, "author"), [
        "Schema.NullOr(BoardIssuesAuthorUser)",
        "Schema.NullOr(FeedIssuesAuthorUser)"
      ])
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("names colliding with an operation or named fragment import fall back instead of failing", () =>
    Effect.gen(function*() {
      const generated = yield* generate({
        "src/user.graphql": "fragment User on User { name }",
        "src/board.graphql": "query Issue { issues { title author { login } assignee { ...User } } }"
      })
      assertNoErrors(generated)
      const board = generated.file("src/board.graphql.ts")
      assert.include(board, "import { User } from \"./user.graphql.ts\"")
      assert.deepStrictEqual(selectionNames(board), ["AuthorUser", "IssuesIssue"])
      assert.strictEqual(member(board, "issues"), "Schema.Array(IssuesIssue)")
      assert.strictEqual(member(board, "author"), "Schema.NullOr(AuthorUser)")
      assert.strictEqual(member(board, "assignee"), "Schema.NullOr(User)")
    }).pipe(Effect.provide(NodeServices.layer)))
})
