/** Generated modules load without binding collisions; cyclic fragment imports are rejected. */
import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { assertNoErrors, type Generated, generateIn, importGenerated } from "./utils/generator.ts"

const config = { schema: "./schema.graphql", documents: ["src/*.graphql"] }

const located = (generated: Generated) =>
  generated.result.diagnostics.map(({ column, line, path, severity }) => ({ severity, path, line, column }))

describe("Generator module graph", () => {
  it.effect("fragments spread across two files in both directions are a located error, not a module cycle", () =>
    Effect.gen(function*() {
      const generated = yield* generateIn({
        "schema.graphql": "type Query { x: Int! }",
        "src/a.graphql": "fragment A2 on Query { x }\nfragment A1 on Query { ...B1 }\nquery Q { ...A1 }",
        "src/b.graphql": "fragment B1 on Query { ...A2 }"
      }, config)
      assert.deepStrictEqual(located(generated), [{ severity: "error", path: "src/a.graphql", line: 2, column: 24 }])
      const message = generated.result.diagnostics[0]!.message
      assert.match(message, /cycle/i)
      assert.include(message, "a.graphql")
      assert.include(message, "b.graphql")
      assert.deepStrictEqual(generated.result.files, [])
    }).pipe(Effect.provide(NodeServices.layer)))
})

describe("Generator group bindings", () => {
  it.effect("digit-leading filenames export a loadable underscore-prefixed GraphQL group", () =>
    Effect.gen(function*() {
      const generated = yield* generateIn({
        "schema.graphql": "type Query { x: Int! }",
        "src/123-ops.graphql": "query Q { x }"
      }, config)
      assertNoErrors(generated)
      const ops = yield* importGenerated(generated, "src/123-ops.graphql.ts")
      assert.isDefined(ops._123OpsGraphQLGroup)
      assert.isUndefined(ops._123OpsGroup)
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("an empty PascalCase filename reports the GraphQLGroup import collision without emitting files", () =>
    Effect.gen(function*() {
      const generated = yield* generateIn({
        "schema.graphql": "type Query { x: Int! }",
        "src/---.graphql": "query Q { x }"
      }, config)
      assert.strictEqual(generated.result.diagnostics.length, 1)
      const diagnostic = generated.result.diagnostics[0]!
      assert.strictEqual(diagnostic.severity, "error")
      assert.strictEqual(diagnostic.path, "src/---.graphql")
      assert.include(diagnostic.message, "GraphQLGroup")
      assert.deepStrictEqual(generated.result.files, [])
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("a local fragment named like the file's group is a located error", () =>
    Effect.gen(function*() {
      const generated = yield* generateIn({
        "schema.graphql": "type Query { x: Int! }",
        "src/ops.graphql": "fragment OpsGraphQLGroup on Query { x }\nquery Q { ...OpsGraphQLGroup }"
      }, config)
      assert.deepStrictEqual(located(generated), [{ severity: "error", path: "src/ops.graphql", line: 1, column: 10 }])
      assert.include(generated.result.diagnostics[0]!.message, `"OpsGraphQLGroup"`)
      assert.match(generated.result.diagnostics[0]!.message, /group/)
      assert.deepStrictEqual(generated.result.files, [])
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("a fragment named like the file's group, imported only because a spread was inlined, is a located error", () =>
    Effect.gen(function*() {
      // `y` overlaps `Outer`, so `Outer` is written out inline and its `...OpsGraphQLGroup`
      // becomes an import of `OpsGraphQLGroup` into ops.graphql.ts.
      const generated = yield* generateIn({
        "schema.graphql": "type Query { x: Int! y: Int! }",
        "src/frags.graphql":
          "fragment OpsGraphQLGroup on Query { x }\nfragment Outer on Query { ...OpsGraphQLGroup y }",
        "src/ops.graphql": "query Q { y ...Outer }"
      }, config)
      assert.deepStrictEqual(located(generated), [{ severity: "error", path: "src/ops.graphql", line: 1, column: 13 }])
      assert.include(generated.result.diagnostics[0]!.message, `"OpsGraphQLGroup"`)
      assert.match(generated.result.diagnostics[0]!.message, /group/)
      assert.deepStrictEqual(generated.result.files, [])
    }).pipe(Effect.provide(NodeServices.layer)))
})

describe("Generator schema names", () => {
  it.effect("an enum named Schema and an input object named default load and round-trip", () =>
    Effect.gen(function*() {
      const generated = yield* generateIn({
        "schema.graphql":
          "enum Schema { X Y }\ninput default { value: Schema }\ntype Query { value(filter: default): Schema! }",
        "src/ops.graphql": "query Q($filter: default) { value(filter: $filter) }"
      }, config)
      assertNoErrors(generated)
      const shared = yield* importGenerated(generated, "schema.graphql.ts")
      assert.deepStrictEqual(shared.Schema.literals, ["X", "Y"])
      assert.isDefined(shared.default)
      const ops = yield* importGenerated(generated, "src/ops.graphql.ts")
      assert.deepStrictEqual(Schema.decodeUnknownSync(ops.Q.result)({ value: "X" }), { value: "X" })
      assert.deepStrictEqual(Schema.encodeSync(ops.Q.variables)({ filter: { value: "Y" } }), { filter: { value: "Y" } })
    }).pipe(Effect.provide(NodeServices.layer)))
})

describe("Generator __proto__ keys", () => {
  it.effect("a __proto__ alias and variable are own struct fields that decode and encode", () =>
    Effect.gen(function*() {
      const generated = yield* generateIn({
        "schema.graphql": "type Query { x(n: Int): Int! }",
        "src/ops.graphql": "query Q($__proto__: Int) { __proto__: x(n: $__proto__) }"
      }, config)
      assertNoErrors(generated)
      const ops = yield* importGenerated(generated, "src/ops.graphql.ts")
      assert.deepStrictEqual(Object.keys(ops.Q.result.fields), ["__proto__"])
      assert.deepStrictEqual(Object.keys(ops.Q.variables.fields), ["__proto__"])
      const decoded = Schema.decodeUnknownSync(ops.Q.result)(JSON.parse(`{"__proto__":1}`))
      assert.isTrue(Object.hasOwn(decoded, "__proto__"))
      assert.strictEqual(decoded["__proto__"], 1)
      const encoded = Schema.encodeSync(ops.Q.variables)(JSON.parse(`{"__proto__":3}`))
      assert.isTrue(Object.hasOwn(encoded, "__proto__"))
      assert.strictEqual(encoded["__proto__"], 3)
    }).pipe(Effect.provide(NodeServices.layer)))
})
