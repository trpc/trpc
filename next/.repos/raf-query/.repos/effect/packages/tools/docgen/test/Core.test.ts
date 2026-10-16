import * as Configuration from "@effect/docgen/Configuration"
import * as Core from "@effect/docgen/Core"
import * as Domain from "@effect/docgen/Domain"
import * as Parser from "@effect/docgen/Parser"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Sink from "effect/Sink"
import * as Stream from "effect/Stream"
import * as path from "node:path"
import * as ast from "ts-morph"

const assertFencedCode = (
  markdown: string,
  expectedExamples: ReadonlyArray<string>,
  expectedWarnings: ReadonlyArray<string>
) => {
  assert.deepStrictEqual(Core.extractFencedCode(markdown), [expectedExamples, expectedWarnings])
}

const assertExampleFiles = (source: string, expected: ReadonlyArray<string>, runExamples = true) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const cwd = yield* fs.makeTempDirectoryScoped()
    const config: Configuration.ConfigurationShape = {
      projectName: "docgen",
      projectHomepage: "https://example.test",
      srcLink: "https://example.test",
      srcDir: path.relative(process.cwd(), path.join(cwd, "src")),
      outDir: path.relative(process.cwd(), path.join(cwd, "docs")),
      theme: Configuration.DEFAULT_THEME,
      enableSearch: true,
      enforceDescriptions: false,
      enforceExamples: false,
      enforceVersion: false,
      tscExecutable: "tsc",
      runExamples,
      exclude: [],
      parseCompilerOptions: {},
      examplesCompilerOptions: Configuration.defaultCompilerOptions
    }
    yield* fs.makeDirectory(config.srcDir)
    yield* fs.writeFileString(path.join(config.srcDir, "Box.ts"), source)

    const commands: Array<string> = []
    // Inspect the generated inputs without invoking a compiler or executing examples.
    const spawner = ChildProcessSpawner.make((command) =>
      Effect.gen(function*() {
        if (command._tag !== "StandardCommand") return yield* Effect.die("Unexpected pipeline")
        commands.push(command.command)
        const directory = path.join(config.outDir, "examples")
        const names = (yield* fs.readDirectory(directory))
          .filter((name) => name.endsWith(".ts") && name !== "index.ts").sort()
        const contents = yield* Effect.forEach(names, (name) => fs.readFileString(path.join(directory, name)))
        assert.deepStrictEqual(contents.sort(), [...expected].sort())
        const index = yield* fs.readFileString(path.join(directory, "index.ts"))
        assert.deepStrictEqual(index.trim().split("\n").sort(), names.map((name) => `import './${name.slice(0, -3)}'`))
        return ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(1),
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          stdin: Sink.drain,
          stdout: Stream.empty,
          stderr: Stream.empty,
          all: Stream.empty,
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          unref: Effect.succeed(Effect.void)
        })
      })
    )
    yield* Core.program.pipe(
      Effect.provideService(Configuration.Configuration, config),
      Effect.provideService(Domain.Process, {
        cwd: Effect.succeed(process.cwd()),
        platform: Effect.succeed(process.platform),
        argv: Effect.succeed([]),
        env: Effect.succeed({})
      }),
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner)
    )
    const executables = expected.length === 0 ? [] : runExamples ? ["tsc", "tsx"] : ["tsc"]
    assert.deepStrictEqual(commands, executables.map((name) => process.platform === "win32" ? `${name}.cmd` : name))
  }).pipe(Effect.provide(NodeServices.layer))

describe("Core", () => {
  describe("class property examples", { timeout: 20_000 }, () => {
    // These tests run the full docgen program (including ts-morph and Prettier) in parallel.
    // Under Bun with other CI projects running, that can exceed Vitest's 5s default.
    for (const runExamples of [true, false]) {
      it.effect(`collects property-only examples with runExamples: ${runExamples}`, () =>
        assertExampleFiles(
          `export class Box {
            /**
             * @example
             * ~~~ts
             * const value = 1
             * ~~~
             */
            readonly value = 1
          }`,
          ["const value = 1"],
          runExamples
        ))
    }

    it.effect("collects property descriptions and example tags alongside methods, excluding skipped fences", () =>
      assertExampleFiles(
        `export class Box {
          /**
           * ~~~ts
           * const description = 1
           * ~~~
           * @example
           * ~~~ts
           * const first = 1
           * ~~~
           * @example
           * ~~~ts
           * const second = 2
           * ~~~
           * @example
           * ~~~ts skip-type-checking
           * const skipped: string = 1
           * ~~~
           */
          readonly value = 1
          /**
           * @example
           * ~~~ts
           * const method = 3
           * ~~~
           */
          read() { return this.value }
        }`,
        ["const description = 1", "const first = 1", "const second = 2", "const method = 3"]
      ))

    it.effect("does not request validation when all property examples are skipped", () =>
      assertExampleFiles(
        `export class Box {
          /**
           * @example
           * ~~~ts skip-type-checking
           * const skipped: string = 1
           * ~~~
           */
          readonly value = 1
        }`,
        []
      ))
  })

  // The first case initializes ts-morph and renders Markdown for three modules.
  // Concurrent Bun CI projects can push that cold start beyond the 5s default.
  describe("[internal] getModuleMarkdownFiles", { timeout: 20_000 }, () => {
    for (const srcDir of [".", "src", "source/lib", path.resolve("source/lib"), process.cwd()]) {
      it.effect(`generates distinct source-relative pages for ${srcDir}`, () =>
        Effect.gen(function*() {
          const project = new ast.Project({ useInMemoryFileSystem: true })
          const sources = [
            ["left/Shared.ts", "leftMarker"],
            ["right/Shared.ts", "rightMarker"],
            ["Flat.ts", "flatMarker"]
          ] as const
          const modules = yield* Effect.forEach(sources, ([relativePath, marker]) => {
            const filePath = path.join(srcDir, relativePath)
            const content = `/** @since 1.0.0 */\nexport const ${marker} = "${marker}"\n`
            project.createSourceFile(filePath, content)
            return Parser.parseFile(project)(new Domain.File(filePath, content))
          })
          const files = yield* Core.getModuleMarkdownFiles(modules)

          assert.deepStrictEqual(files.map((file) => file.path), [
            path.join("docs", "modules", "left", "Shared.ts.md"),
            path.join("docs", "modules", "right", "Shared.ts.md"),
            path.join("docs", "modules", "Flat.ts.md")
          ])
          for (const [index, file] of files.entries()) {
            assert.deepStrictEqual(
              sources.map(([, marker]) => marker).filter((marker) => file.content.includes(marker)),
              [sources[index][1]]
            )
            assert.isTrue(file.isOverwriteable)
          }
        }).pipe(
          Effect.provideService(Configuration.Configuration, {
            projectName: "docgen",
            projectHomepage: "https://example.com",
            srcLink: "https://example.com/src",
            srcDir,
            outDir: "docs",
            theme: Configuration.DEFAULT_THEME,
            enableSearch: true,
            enforceDescriptions: false,
            enforceExamples: false,
            enforceVersion: true,
            runExamples: false,
            tscExecutable: "tsc",
            exclude: [],
            parseCompilerOptions: {},
            examplesCompilerOptions: {}
          }),
          Effect.provide(NodeServices.layer)
        ))
    }
  })

  it.effect("preserves a type alias name and declared type parameters", () => {
    const sourceFile = new ast.Project({ useInMemoryFileSystem: true }).createSourceFile(
      "Identity.ts",
      `/**
       * A boxed value.
       *
       * @since 1.0.0
       */
      export type Identity<A extends string = string> = A`
    )

    return Parser.parseTypeAliases.pipe(
      Effect.provideService(Parser.Source, { path: ["Identity.ts"], sourceFile }),
      Effect.map(([alias]) => assert.strictEqual(alias?.signature, "type Identity<A extends string = string> = A"))
    )
  })

  describe("[internal] extractFencedCode", () => {
    it("should extract fenced code blocks from markdown (backticks)", () => {
      assertFencedCode("a\n\n```ts\nconst a = 1\n```\n\nb", ["const a = 1"], [])
    })

    it("should extract fenced code blocks from markdown (tildes)", () => {
      assertFencedCode("a\n\n~~~ts\nconst a = 1\n~~~~\n\nb", ["const a = 1"], [])
    })

    it("should skip-type-checking (backticks)", () => {
      assertFencedCode("a\n\n```ts skip-type-checking a=1\nconst a = 1\n```\n\nb", [], [])
    })

    it("should skip-type-checking (tildes)", () => {
      assertFencedCode("a\n\n~~~ts skip-type-checking a=1\nconst a = 1\n~~~~\n\nb", [], [])
    })

    it("should handle metadata (backticks)", () => {
      assertFencedCode("a\n\n```ts a=1\nconst a = 1\n```\n\nb", ["const a = 1"], [])
    })

    it("should handle metadata (tildes)", () => {
      assertFencedCode("a\n\n~~~ts a=1\nconst a = 1\n~~~~\n\nb", ["const a = 1"], [])
    })

    it("should handle non closing fences (backticks)", () => {
      assertFencedCode("a\n\n```ts\nconst a = 1", ["const a = 1"], [
        "Code block does not have a matching closing fence:\na\n\n```ts\nconst a = 1"
      ])
    })

    it("should handle non closing fences (tildes)", () => {
      assertFencedCode("a\n\n~~~ts\nconst a = 1", ["const a = 1"], [
        "Code block does not have a matching closing fence:\na\n\n~~~ts\nconst a = 1"
      ])
    })
  })

  describe("[internal] runCommand", () => {
    it.effect("streams output without a maxBuffer limit", () =>
      Effect.gen(function*() {
        const size = 1024 * 1024 + 1
        const result = yield* Core.runCommand("node", [
          "-e",
          `process.stdout.write("x".repeat(${size})); process.stderr.write("problem"); process.exitCode = 2`
        ], false)
        assert.strictEqual(result.stdout.length, size)
        assert.strictEqual(result.stderr, "problem")
        assert.strictEqual(result.exitCode, 2)
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)))
  })
})
