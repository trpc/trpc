/** Variable @skip/@include conditions produce optional fields; literal conditions are folded. */
import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { assertNoErrors, generateTasks, importGenerated, member, members } from "./utils/generator.ts"

// In its own file, so the fields it declares don't repeat in `src/ops.graphql.ts`.
// Only written for operations that spread it, since an unused fragment is an error.
const fragments = `
fragment TaskCore on Task {
  title
  estimate
}
`

const generate = (operations: string) =>
  generateTasks({
    ...(operations.includes("...TaskCore") ? { "src/fragments.graphql": fragments } : {}),
    "src/ops.graphql": operations
  }).pipe(
    Effect.map((generated) => {
      assertNoErrors(generated)
      return { ops: generated.file("src/ops.graphql.ts"), generated }
    })
  )

describe("Generator @skip and @include", () => {
  it.effect("a variable condition on a field makes it an optional key", () =>
    Effect.gen(function*() {
      const { generated, ops } = yield* generate(`
query One($show: Boolean!, $taskId: ID!) {
  task(id: $taskId) {
    id
    title @include(if: $show)
    estimate @skip(if: $show)
  }
}
`)
      assert.strictEqual(member(ops, "id"), "Shared.ID")
      assert.strictEqual(member(ops, "title"), "Schema.optionalKey(Schema.String)")
      assert.strictEqual(member(ops, "estimate"), "Schema.optionalKey(Schema.NullOr(Shared.Float))")
      const module = yield* importGenerated(generated, "src/ops.graphql.ts")
      assert.strictEqual(
        module.One.document,
        "query One($show:Boolean!$taskId:ID!){task(id:$taskId){id title@include(if:$show)estimate@skip(if:$show)}}"
      )
      assert.deepStrictEqual(Schema.decodeUnknownSync(module.One.result)({ task: { id: "1" } }), { task: { id: "1" } })
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("a variable condition on a spread makes every field it contributes an optional key", () =>
    Effect.gen(function*() {
      const { ops } = yield* generate(`
query One($hide: Boolean!, $taskId: ID!) {
  task(id: $taskId) {
    id
    ...TaskCore @skip(if: $hide)
  }
}
`)
      assert.strictEqual(member(ops, "title"), "Schema.optionalKey(Schema.String)")
      assert.strictEqual(member(ops, "estimate"), "Schema.optionalKey(Schema.NullOr(Shared.Float))")
      assert.notInclude(ops, "...TaskCore.fields")
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("literal conditions are folded: the field is dropped or the directive ignored", () =>
    Effect.gen(function*() {
      const { ops } = yield* generate(`
query One($taskId: ID!) {
  task(id: $taskId) {
    id
    title @include(if: false)
    done @skip(if: false)
    estimate @include(if: true)
    due @skip(if: true)
  }
}
`)
      assert.deepStrictEqual(members(ops, "title"), [])
      assert.deepStrictEqual(members(ops, "due"), [])
      assert.strictEqual(member(ops, "done"), "Schema.Boolean")
      assert.strictEqual(member(ops, "estimate"), "Schema.NullOr(Shared.Float)")
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("a conditional occurrence of a merged field keeps its condition on the children it adds", () =>
    Effect.gen(function*() {
      const { ops } = yield* generate(`
query One($show: Boolean!, $taskId: ID!) {
  task(id: $taskId) {
    id
  }
  task(id: $taskId) @include(if: $show) {
    title
  }
}
`)
      assert.strictEqual(member(ops, "task"), "Schema.NullOr(Task)")
      assert.strictEqual(member(ops, "id"), "Shared.ID")
      assert.strictEqual(member(ops, "title"), "Schema.optionalKey(Schema.String)")
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("the children of a field whose only occurrence is conditional stay required", () =>
    Effect.gen(function*() {
      const { ops } = yield* generate(`
query One($show: Boolean!, $taskId: ID!) {
  task(id: $taskId) @include(if: $show) {
    title
  }
}
`)
      assert.strictEqual(member(ops, "task"), "Schema.optionalKey(Schema.NullOr(Task))")
      assert.strictEqual(member(ops, "title"), "Schema.String")
    }).pipe(Effect.provide(NodeServices.layer)))
})
