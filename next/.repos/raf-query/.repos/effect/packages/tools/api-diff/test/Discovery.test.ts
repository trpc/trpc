import { Discovery } from "@effect/api-diff/Discovery"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import { writeFixturePackage } from "./utils.ts"

const MainLayer = Discovery.layer.pipe(
  Layer.provideMerge(NodeServices.layer)
)

describe("entrypoint discovery", () => {
  it.effect("expands wildcards and respects null exclusions", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const discovery = yield* Discovery
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "api-diff-discovery-" })
      yield* writeFixturePackage(root, {
        "index.d.ts": `export * as Foo from "./Foo.js"\n`,
        "Foo.d.ts": `export declare const value: string\n`,
        "internal/Secret.d.ts": `export declare const secret: string\n`
      })

      const result = yield* discovery.discoverEntrypoints(root, [
        "@fixture/sample",
        "@fixture/sample/Foo",
        "@fixture/sample/internal/Secret"
      ])
      assert.deepStrictEqual(result.entrypoints.map((entrypoint) => entrypoint.module), [
        "@fixture/sample",
        "@fixture/sample/Foo"
      ])
      assert.deepStrictEqual(result.missing, ["@fixture/sample/internal/Secret"])

      const all = yield* discovery.discoverEntrypoints(root)
      assert.deepStrictEqual(all.entrypoints.map((entrypoint) => entrypoint.module), [
        "@fixture/sample",
        "@fixture/sample/Foo",
        "@fixture/sample/index"
      ])
      assert.deepStrictEqual(all.missing, [])
    }).pipe(Effect.provide(MainLayer)))

  it.effect("supports conditional export targets", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const discovery = yield* Discovery
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "api-diff-discovery-" })
      yield* writeFixturePackage(root, {
        "Foo.d.ts": `export declare const value: string\n`
      }, {
        "./Foo": {
          types: "./Foo.d.ts",
          import: "./Foo.js"
        }
      })
      const result = yield* discovery.discoverEntrypoints(root, ["@fixture/sample/Foo"])
      assert.strictEqual(result.missing.length, 0)
      assert.strictEqual(result.entrypoints[0]?.module, "@fixture/sample/Foo")
    }).pipe(Effect.provide(MainLayer)))
})
