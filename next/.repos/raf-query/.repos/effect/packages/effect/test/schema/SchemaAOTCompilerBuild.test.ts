import { assert, describe, it } from "@effect/vitest"
import { Effect, FileSystem, Path, SchemaParser } from "effect"
import * as CompilerRegistry from "effect/internal/schema/compilerRegistry"
import * as SchemaAOTCompilerBuild from "effect/schema/SchemaAOTCompiler/Build"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import * as Schemas from "./fixtures/aot-build.ts"

describe("SchemaAOTCompilerBuild", { concurrent: false }, () => {
  it.effect("writes a deterministic self-installing module", () =>
    Effect.gen(function*() {
      const directory = yield* Effect.acquireRelease(
        Effect.sync(() => mkdtempSync(fileURLToPath(new URL("../../.schema-aot-build-test-", import.meta.url)))),
        (directory) => Effect.sync(() => rmSync(directory, { recursive: true, force: true }))
      )
      const outFile = join(directory, "generated.mjs")
      const fileSystem = FileSystem.layerNoop({
        makeDirectory: (path, options) =>
          Effect.sync(() => {
            mkdirSync(path, options)
          }),
        writeFileString: (path, source) => Effect.sync(() => writeFileSync(path, source))
      })
      const options = {
        modules: {
          "./fixtures/aot-build.ts": () => Promise.resolve(Schemas)
        },
        baseUrl: import.meta.url,
        outFile,
        operations: ["make", "decode", "is", "encode", "decode"]
      } as const

      const first = yield* SchemaAOTCompilerBuild.build(options).pipe(
        Effect.provide(fileSystem),
        Effect.provide(Path.layer)
      )
      const source = yield* Effect.sync(() => readFileSync(outFile, "utf8"))
      const second = yield* SchemaAOTCompilerBuild.build(options).pipe(
        Effect.provide(fileSystem),
        Effect.provide(Path.layer)
      )
      const secondSource = yield* Effect.sync(() => readFileSync(outFile, "utf8"))

      assert.deepStrictEqual(first, {
        outFile,
        modules: 1,
        schemas: 2
      })
      assert.deepStrictEqual(second, first)
      assert.strictEqual(secondSource, source)
      assert.include(source, "effect/SchemaAST")
      assert.include(source, "A.flip(m0[\"Port\"].ast)")
      assert.include(source, "A.toType(m0[\"Port\"].ast)")
      assert.notInclude(source, "ignored")

      const before = CompilerRegistry.resolve(Schemas.User.ast)
      yield* Effect.promise(() => import(`${pathToFileURL(outFile).href}?test=${Date.now()}`))
      assert.notStrictEqual(CompilerRegistry.resolve(Schemas.User.ast), before)
      assert.deepStrictEqual(SchemaParser.decodeUnknownSync(Schemas.User)({ name: "Ada", port: "8080" }), {
        name: "Ada",
        port: 8080
      })
      assert.strictEqual(SchemaParser.is(Schemas.User)({ name: "Ada", port: 8080 }), true)
      assert.deepStrictEqual(SchemaParser.make(Schemas.User)({ name: "Ada", port: 8080 }), {
        name: "Ada",
        port: 8080
      })
      assert.deepStrictEqual(SchemaParser.encodeUnknownSync(Schemas.User)({ name: "Ada", port: 8080 }), {
        name: "Ada",
        port: "8080"
      })
    }))

  it.effect("uses decoding as the default operation and ignores non-Schema exports", () =>
    Effect.gen(function*() {
      let written = ""
      const result = yield* SchemaAOTCompilerBuild.build({
        modules: {
          "./fixtures/aot-build.ts": () => Promise.resolve(Schemas),
          "./fixtures/ignored.ts": () => Promise.resolve({ value: 1 })
        },
        baseUrl: import.meta.url,
        outFile: "/generated/schema-aot.mjs"
      }).pipe(
        Effect.provide(FileSystem.layerNoop({
          makeDirectory: () => Effect.void,
          writeFileString: (_path, source) =>
            Effect.sync(() => {
              written = source
            })
        })),
        Effect.provide(Path.layer)
      )

      assert.deepStrictEqual(result, {
        outFile: "/generated/schema-aot.mjs",
        modules: 1,
        schemas: 2
      })
      assert.notInclude(written, "import * as A from \"effect/SchemaAST\"")
      assert.notInclude(written, "ignored.ts")
      assert.notInclude(written, "case \"is\":{")
      assert.notInclude(written, "case \"make\":{")
      assert.notInclude(written, "case \"makeEffect\":{")
      assert.include(written, "install([m0[\"Port\"].ast,m0[\"User\"].ast]);")
    }))

  it.effect("reports module loading failures", () =>
    Effect.gen(function*() {
      const error = yield* SchemaAOTCompilerBuild.build({
        modules: {
          "./fixtures/failing.ts": () => Promise.reject("boom")
        },
        baseUrl: import.meta.url,
        outFile: "/generated/schema-aot.mjs"
      }).pipe(
        Effect.provide(FileSystem.layerNoop({})),
        Effect.provide(Path.layer),
        Effect.flip
      )

      assert.instanceOf(error, SchemaAOTCompilerBuild.BuildError)
      assert.strictEqual(error.kind, "LoadModule")
      assert.strictEqual(error.module, "./fixtures/failing.ts")
      assert.strictEqual(error.cause, "boom")
    }))

  it.effect("reports invalid loaded modules", () =>
    Effect.gen(function*() {
      const error = yield* SchemaAOTCompilerBuild.build({
        modules: {
          "./fixtures/invalid.ts": () => Promise.resolve(1)
        },
        baseUrl: import.meta.url,
        outFile: "/generated/schema-aot.mjs"
      }).pipe(
        Effect.provide(FileSystem.layerNoop({})),
        Effect.provide(Path.layer),
        Effect.flip
      )

      assert.instanceOf(error, SchemaAOTCompilerBuild.BuildError)
      assert.strictEqual(error.kind, "InvalidModule")
      assert.strictEqual(error.module, "./fixtures/invalid.ts")
      assert.strictEqual(error.cause, 1)
    }))
})
