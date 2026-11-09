/** Generated interface and union selections decode through their result schemas. */
import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { assertNoErrors, generateIn, importGenerated } from "./utils/generator.ts"

const decoderFor = Effect.fnUntraced(function*(schema: string, document: string) {
  const generated = yield* generateIn(
    { "schema.graphql": schema, "src/ops.graphql": document },
    { schema: "./schema.graphql", documents: ["src/*.graphql"] }
  )
  assertNoErrors(generated)
  const ops = yield* importGenerated(generated, "src/ops.graphql.ts")
  return Schema.decodeUnknownSync(ops.Q.result)
})

describe("Generator abstract members", () => {
  it.effect("a fragment on the only possible type of an interface keeps its own member", () =>
    Effect.gen(function*() {
      const decode = yield* decoderFor(
        "interface Only { id: ID! }\ntype User implements Only { id: ID! name: String! }\ntype Query { only: Only }",
        "query Q { only { ... on User { name } } }"
      )
      const user = { only: { __typename: "User", name: "Ann" } }
      assert.deepStrictEqual(decode(user), user)
      assert.throws(() => decode({ only: { __typename: "User" } }))
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("an interface fragment covering every member of a union generates and decodes", () =>
    Effect.gen(function*() {
      const decode = yield* decoderFor(
        `interface Named { name: String! }
union Result = User | Bot
type User implements Named { id: ID! name: String! }
type Bot implements Named { id: ID! name: String! }
type Query { results: [Result!]! }`,
        "query Q { results { ... on Named { name } } }"
      )
      const results = { results: [{ __typename: "User", name: "Ann" }, { __typename: "Bot", name: "ci" }] }
      assert.deepStrictEqual(decode(results), results)
      assert.throws(() => decode({ results: [{ __typename: "Bot" }] }))
    }).pipe(Effect.provide(NodeServices.layer)))
})
