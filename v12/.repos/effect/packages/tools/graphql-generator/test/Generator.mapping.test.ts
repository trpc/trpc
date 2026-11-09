import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import {
  assertNoErrors,
  declaration,
  docOf,
  generateIn,
  generateTasks,
  member,
  taskConfig,
  warnings
} from "./utils/generator.ts"

describe("Generator mapping", () => {
  it.effect("DateTime and URI have overridable defaults while other custom scalars stay Json", () =>
    Effect.gen(function*() {
      const inputs = {
        "schema.graphql": `
          scalar DateTime
          scalar URI
          scalar datetime
          scalar uri
          scalar GitObjectID
          type Query { timestamp: DateTime! url: URI! lowerDate: datetime! lowerUri: uri! oid: GitObjectID! }
        `,
        "src/ops.graphql": "query Scalars { timestamp url lowerDate lowerUri oid }"
      }
      const config = { schema: "./schema.graphql", documents: ["src/*.graphql"] }
      const defaults = yield* generateIn(inputs, config)
      const overridden = yield* generateIn(inputs, {
        ...config,
        scalars: { DateTime: "./scalars.ts#Timestamp", URI: "./scalars.ts#Url" }
      })
      for (const generated of [defaults, overridden]) {
        assertNoErrors(generated)
        const shared = generated.file("schema.graphql.ts")
        for (const name of ["GitObjectID", "datetime", "uri"]) {
          assert.strictEqual(declaration(shared, name), `export const ${name} = Schema.Json`)
        }
      }
      const overrideShared = overridden.file("schema.graphql.ts")
      assert.match(declaration(overrideShared, "DateTime"), /^export const DateTime = \w+\.Timestamp$/)
      assert.match(declaration(overrideShared, "URI"), /^export const URI = \w+\.Url$/)
      const shared = defaults.file("schema.graphql.ts")
      assert.deepStrictEqual({
        DateTime: declaration(shared, "DateTime"),
        URI: declaration(shared, "URI"),
        warnings: [defaults, overridden].map((generated) => warnings(generated).map(({ message }) => message))
      }, {
        DateTime: "export const DateTime = Schema.DateTimeUtcFromString",
        URI: "export const URI = Schema.String",
        warnings: [
          ["Custom scalars without a mapping decode as Schema.Json: GitObjectID, datetime, uri. Map each one to a codec with `scalars` in the config."],
          ["Custom scalars without a mapping decode as Schema.Json: GitObjectID, datetime, uri. Map each one to a codec with `scalars` in the config."]
        ]
      })
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("a non-null variable with a default is optional(T) and keeps the default as @default", () =>
    Effect.gen(function*() {
      const generated = yield* generateTasks({
        "src/ops.graphql": "query Tasks($first: Int! = 20) { tasks(first: $first) { id } }"
      })
      assertNoErrors(generated)
      const ops = generated.file("src/ops.graphql.ts")
      assert.strictEqual(member(ops, "first"), "Schema.optional(Shared.Int)")
      assert.deepStrictEqual(docOf(ops, "first"), ["@default 20"])
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("a recursive input object is a Codec, with an Encoded type when a field may transform", () =>
    Effect.gen(function*() {
      const generated = yield* generateIn({
        "schema.graphql": `
          scalar Stamp
          input Tree { child: Tree }
          input Dated { at: Stamp next: Dated }
          input Unused { self: Unused }
          type Query { tree(t: Tree, d: Dated, u: Unused): Int }
        `,
        "src/ops.graphql": "query Q($t: Tree, $d: Dated) { tree(t: $t, d: $d) }"
      }, { schema: "./schema.graphql", documents: ["src/*.graphql"], scalars: { Stamp: "./scalars.ts#Stamp" } })
      assertNoErrors(generated)
      const shared = generated.file("schema.graphql.ts")
      assert.deepStrictEqual({
        Tree: declaration(shared, "Tree"),
        Dated: declaration(shared, "Dated"),
        unused: shared.includes("Unused")
      }, {
        Tree: "export const Tree: Schema.Codec<Tree> = Schema.Struct({",
        Dated: "export const Dated: Schema.Codec<Dated, DatedEncoded> = Schema.Struct({",
        unused: false
      })
      assert.include(shared, "export interface DatedEncoded {\n  readonly at?: typeof Stamp.Encoded | null | undefined")
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("a scalars entry overrides a built-in", () =>
    Effect.gen(function*() {
      const generated = yield* generateTasks(
        { "src/ops.graphql": "query Tasks { tasks { id } }" },
        { ...taskConfig, scalars: { ID: "./scalars.ts#NodeId" } }
      )
      assertNoErrors(generated)
      assert.match(declaration(generated.file("schema/app.graphql.ts"), "ID"), /^export const ID = \w+\.NodeId$/)
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("the shared module defaults to the schema's name and directory", () =>
    Effect.gen(function*() {
      const generated = yield* generateTasks({ "src/ops.graphql": "query Tasks { tasks { id } }" })
      assertNoErrors(generated)
      assert.deepStrictEqual(generated.paths, ["schema/app.graphql.ts", "src/ops.graphql.ts"])
      assert.match(generated.file("src/ops.graphql.ts"), /^import \* as Shared from "\.\.\/schema\/app\.graphql\.ts"$/m)
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("a relative scalar module with an extension other than .ts or .js is imported as written", () =>
    Effect.gen(function*() {
      const generated = yield* generateTasks(
        { "src/ops.graphql": "query Tasks { tasks { due } }" },
        { ...taskConfig, scalars: { Timestamp: "./scalars.mjs#Timestamp" } }
      )
      assertNoErrors(generated)
      assert.match(generated.file("schema/app.graphql.ts"), /^import \* as \w+ from "\.\.\/scalars\.mjs"$/m)
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect("importExtension applies to generated and relative scalar modules, not bare specifiers", () =>
    Effect.gen(function*() {
      const generated = yield* generateTasks(
        { "src/ops.graphql": "query Tasks { tasks { due bodyHTML } }" },
        { ...taskConfig, importExtension: ".js", scalars: { ...taskConfig.scalars, HTML: "@acme/scalars#HTML" } }
      )
      assertNoErrors(generated)
      const shared = generated.file("schema/app.graphql.ts")
      assert.match(generated.file("src/ops.graphql.ts"), /^import \* as Shared from "\.\.\/schema\/app\.graphql\.js"$/m)
      assert.match(shared, /^import \* as \w+ from "\.\.\/scalars\.js"$/m)
      assert.match(shared, /^import \* as \w+ from "@acme\/scalars"$/m)
    }).pipe(Effect.provide(NodeServices.layer)))
})
