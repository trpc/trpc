import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import {
  assertNoErrors,
  fileLines,
  type Generated,
  generateIn,
  generateTasks,
  taskConfig,
  warnings
} from "./utils/generator.ts"
import { fixture } from "./utils/model.ts"

const located = (generated: Generated) =>
  generated.result.diagnostics.map(({ column, line, message, severity }) => ({ severity, line, column, message }))

describe("Generator diagnostics", () => {
  it.effect("unmapped custom scalars decode as Schema.Json with one warning listing each one reached", () =>
    Effect.gen(function*() {
      const generated = yield* generateTasks({
        "src/a.graphql": "query A { tasks { bodyHTML } }",
        "src/b.graphql": "query B { tasks { bodyHTML due } }"
      })
      assertNoErrors(generated)
      assert.include(fileLines(generated.file("schema/app.graphql.ts")), "export const HTML = Schema.Json")
      assert.deepStrictEqual(warnings(generated).map((warning) => warning.message), [
        "Custom scalars without a mapping decode as Schema.Json: HTML. Map each one to a codec with `scalars` in the config."
      ])
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("a scalars key naming a type that isn't a scalar is a config error", () =>
    Effect.gen(function*() {
      const error = yield* generateTasks(
        { "src/a.graphql": "query A { tasks { id } }" },
        { ...taskConfig, scalars: { Task: "./scalars.ts#Task" } }
      ).pipe(Effect.flip)
      assert.strictEqual(error._tag, "ConfigError")
      assert.include(error.message, "Task")
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("a type-system definition in a document file is a located error", () =>
    Effect.gen(function*() {
      const generated = yield* generateTasks({
        "src/ops.graphql": "query A { tasks { id } }\n\ntype Extra {\n  a: Int\n}\n"
      })
      assert.deepStrictEqual(located(generated), [
        { severity: "error", line: 3, column: 1, message: `The "Extra" definition is not executable.` }
      ])
      assert.deepStrictEqual(generated.result.files, [])
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("a definition named like a binding of the generated module is a located error", () =>
    Effect.gen(function*() {
      const generated = yield* generateTasks({ "src/ops.graphql": "query Schema { tasks { id } }" })
      assert.deepStrictEqual(located(generated), [{
        severity: "error",
        line: 1,
        column: 7,
        message: `The name "Schema" is reserved in generated code; rename this definition.`
      }])
      assert.deepStrictEqual(generated.result.files, [])
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("a field whose type the schema never defines is an Unknown type error, not a crash", () =>
    Effect.gen(function*() {
      const generated = yield* generateIn({
        "schema.graphql": "type Query { a: Missing }",
        "src/a.graphql": "query Q { a }"
      }, { schema: "./schema.graphql", documents: ["src/*.graphql"] })
      assert.deepStrictEqual(generated.result.diagnostics.map(({ message, severity }) => ({ severity, message })), [
        { severity: "error", message: `Unknown type "Missing".` }
      ])
      assert.deepStrictEqual(generated.result.files, [])
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("eval and arguments, which strict mode can't bind, are reserved definition names", () =>
    Effect.gen(function*() {
      const generated = yield* generateTasks({
        "src/ops.graphql": "query eval { tasks { id } }\nquery arguments { tasks { id } }"
      })
      assert.deepStrictEqual(located(generated).map(({ line, message }) => ({ line, message })), [
        { line: 1, message: `The name "eval" is reserved in generated code; rename this definition.` },
        { line: 2, message: `The name "arguments" is reserved in generated code; rename this definition.` }
      ])
      assert.deepStrictEqual(generated.result.files, [])
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("a shared module path that is also a document's output is an error, and nothing is generated", () =>
    Effect.gen(function*() {
      const generated = yield* generateTasks({ "src/ops.graphql": "query Tasks { tasks { id } }" }, {
        ...taskConfig,
        shared: "./src/ops.graphql.ts"
      })
      assert.strictEqual(generated.result.diagnostics.filter((d) => d.severity === "error").length, 1)
      assert.deepStrictEqual(generated.result.files, [])
    }).pipe(Effect.provide(NodeServices.layer)))
})

describe("Generator introspection JSON schema", () => {
  const search =
    `query Search($filter: SearchFilter, $limit: Int = 10) { now search(term: "x", filter: $filter, limit: $limit) }`

  it.effect("a .json schema generates the same files as its SDL, with the shared module named <schema>.graphql.ts", () =>
    Effect.gen(function*() {
      const fromJson = yield* generateIn(
        { "schema/modern.json": fixture("introspection/modern.json"), "src/search.graphql": search },
        { schema: "./schema/modern.json", documents: ["src/*.graphql"] }
      )
      const fromSdl = yield* generateIn(
        { "schema/modern.graphql": fixture("introspection/modern.graphql"), "src/search.graphql": search },
        { schema: "./schema/modern.graphql", documents: ["src/*.graphql"] }
      )
      assertNoErrors(fromJson)
      assert.deepStrictEqual(fromJson.paths, ["schema/modern.graphql.ts", "src/search.graphql.ts"])
      assert.deepStrictEqual(fromSdl.paths, fromJson.paths)
      for (const path of fromJson.paths) {
        assert.strictEqual(fromJson.file(path), fromSdl.file(path), path)
      }
    }).pipe(Effect.provide(NodeServices.layer)))
})
