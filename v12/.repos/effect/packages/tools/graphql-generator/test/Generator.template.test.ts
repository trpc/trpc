/** Joining a template reproduces the printed document; batched slices remain valid GraphQL. */
import type * as Ast from "@effect/graphql-generator/internal/Ast"
import * as Validate from "@effect/graphql-generator/internal/Validate"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import type { GraphQL } from "effect/graphql"
import { renderSlices } from "effect/internal/graphql"
import { parseOrThrow, source } from "./utils/ast.ts"
import { assertNoErrors, generateTasks, importGenerated, taskSchemaSdl } from "./utils/generator.ts"
import { readSdl } from "./utils/model.ts"

// `TaskCore` references no variable, so a batch shares it. `TaskDue`
// references `$withDue`, so each slice gets its own copy.
const board = `
query Board($first: Int! = 5, $taskId: ID!, $withDue: Boolean! = false, $withTasks: Boolean!) {
  tasks(first: $first) @include(if: $withTasks) {
    ...TaskCore
    ...TaskDue
  }
  current: task(id: $taskId) {
    ...TaskDue
  }
}

fragment TaskCore on Task {
  id
  title
}

fragment TaskDue on Task {
  estimate @include(if: $withDue)
  ...TaskCore
}
`

const importBoard = Effect.gen(function*() {
  const generated = yield* generateTasks({ "src/board.graphql": board })
  assertNoErrors(generated)
  const module = yield* importGenerated(generated, "src/board.graphql.ts")
  return module.Board as GraphQL.Any
}).pipe(Effect.provide(NodeServices.layer))

describe("Generator document templates", () => {
  it.effect("joining the template gives the printed document", () =>
    Effect.gen(function*() {
      const Board = yield* importBoard
      assert.isDefined(Board.template)
      assert.strictEqual(
        Board.document,
        "query Board($first:Int!=5$taskId:ID!$withDue:Boolean!=false$withTasks:Boolean!){tasks(first:$first)@include(if:$withTasks){...TaskCore...TaskDue}current:task(id:$taskId){...TaskDue}}fragment TaskCore on Task{id title}fragment TaskDue on Task{estimate@include(if:$withDue)...TaskCore}"
      )
    }))

  it.effect("two slices render a valid document with renamed variables and per-slice fragments", () =>
    Effect.gen(function*() {
      const Board = yield* importBoard
      assert(Board.template !== undefined)
      const text = renderSlices("query", "Board", Board.template, ["_0_", "_1_"])
      const document = parseOrThrow(text)
      assert.deepStrictEqual(
        Validate.validate(readSdl(taskSchemaSdl), [{ source: source(text), document }]).map(({ message }) => message),
        []
      )

      const [operation, ...fragments] = document.definitions
      assert(operation?._tag === "OperationDefinition")
      assert.deepStrictEqual(operation.variableDefinitions.map((v) => v.variable.name.value), [
        "_0_first",
        "_0_taskId",
        "_0_withDue",
        "_0_withTasks",
        "_1_first",
        "_1_taskId",
        "_1_withDue",
        "_1_withTasks"
      ])
      assert.deepStrictEqual(
        operation.selectionSet.selections.map((s) => s._tag === "Field" ? s.alias?.value : s._tag),
        ["_0_tasks", "_0_current", "_1_tasks", "_1_current"]
      )
      assert.deepStrictEqual(
        fragments.map((f) => (f as Ast.FragmentDefinition).name.value),
        ["TaskCore", "_0_TaskDue", "_1_TaskDue"]
      )
    }))

  it.effect("variable-bearing operation directives round-trip but cannot be sliced", () =>
    Effect.gen(function*() {
      const generated = yield* generateTasks({
        "schema/app.graphql": taskSchemaSdl + "directive @cached(ttl: Int!) on QUERY",
        "src/cached.graphql": "query Cached($ttl: Int!) @cached(ttl: $ttl) { tasks { id } }"
      })
      assertNoErrors(generated)
      const { Cached } = yield* importGenerated(generated, "src/cached.graphql.ts")
      assert(Cached.template !== undefined)
      assert.strictEqual(Cached.document, "query Cached($ttl:Int!)@cached(ttl:$ttl){tasks{id}}")
      assert.throws(
        () => renderSlices("query", "Cached", Cached.template, ["_0_", "_1_"]),
        "Cannot render slices of operation Cached: its operation directives reference variables"
      )
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("root spreads and inline fragments round-trip but cannot be sliced", () =>
    Effect.gen(function*() {
      const generated = yield* generateTasks({
        "src/roots.graphql": `
          query Spread { ...Root }
          query Inline { ... on Query { tasks { id } } }
          fragment Root on Query { tasks { id } }
        `
      })
      assertNoErrors(generated)
      const module = yield* importGenerated(generated, "src/roots.graphql.ts")
      for (
        const [name, expected] of [
          ["Spread", "query Spread{...Root}fragment Root on Query{tasks{id}}"],
          ["Inline", "query Inline{...on Query{tasks{id}}}"]
        ] as const
      ) {
        const operation = module[name] as GraphQL.Any
        const template = operation.template
        assert(template !== undefined)
        assert.strictEqual(operation.document, expected)
        assert.throws(
          () => renderSlices("query", name, template, ["_0_", "_1_"]),
          `Cannot render slices of operation ${name}: it has a fragment spread or inline fragment at the root`
        )
      }
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("slicing rejects a per-slice fragment renamed onto a shared fragment's name", () =>
    Effect.gen(function*() {
      const generated = yield* generateTasks({
        "src/collide.graphql": `
          query Collide($show: Boolean!) { tasks { ...F ..._0_F } }
          fragment F on Task { title @include(if: $show) }
          fragment _0_F on Task { id }
        `
      })
      assertNoErrors(generated)
      const { Collide } = yield* importGenerated(generated, "src/collide.graphql.ts")
      assert(Collide.template !== undefined)
      assert.throws(() => renderSlices("query", "Collide", Collide.template, ["_0_", "_1_"]), /fragment _0_F/)
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("slicing preserves dollar-name literals and renames fragments with transitive variable references", () =>
    Effect.gen(function*() {
      const generated = yield* generateTasks({
        "src/literal.graphql": `
          query Literal($taskId: ID! = "$taskId", $show: Boolean!) {
            task(id: $taskId) { ...Wrapper }
            literal: task(id: "$taskId") { id }
          }
          fragment Wrapper on Task { ...Details }
          fragment Details on Task { title @include(if: $show) }
        `
      })
      assertNoErrors(generated)
      const { Literal } = yield* importGenerated(generated, "src/literal.graphql.ts")
      assert(Literal.template !== undefined)
      assert.strictEqual(
        Literal.document,
        "query Literal($taskId:ID!=\"$taskId\"$show:Boolean!){task(id:$taskId){...Wrapper}literal:task(id:\"$taskId\"){id}}fragment Wrapper on Task{...Details}fragment Details on Task{title@include(if:$show)}"
      )
      const text = renderSlices("query", "Literal", Literal.template, ["_0_", "_1_"])
      assert.strictEqual(
        text,
        "query Literal($_0_taskId:ID!=\"$taskId\"$_0_show:Boolean!$_1_taskId:ID!=\"$taskId\"$_1_show:Boolean!){_0_task:task(id:$_0_taskId){..._0_Wrapper}_0_literal:task(id:\"$taskId\"){id}_1_task:task(id:$_1_taskId){..._1_Wrapper}_1_literal:task(id:\"$taskId\"){id}}fragment _0_Wrapper on Task{..._0_Details}fragment _1_Wrapper on Task{..._1_Details}fragment _0_Details on Task{title@include(if:$_0_show)}fragment _1_Details on Task{title@include(if:$_1_show)}"
      )
      assert.deepStrictEqual(
        Validate.validate(readSdl(taskSchemaSdl), [{ source: source(text), document: parseOrThrow(text) }])
          .map(({ message }) => message),
        []
      )
    }).pipe(Effect.provide(NodeServices.layer)))
})
