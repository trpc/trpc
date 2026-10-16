import * as CLI from "@effect/docgen/CLI"
import * as Configuration from "@effect/docgen/Configuration"
import * as Domain from "@effect/docgen/Domain"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, describe, it } from "@effect/vitest"
import * as ByteSize from "effect/ByteSize"
import * as CliOutput from "effect/cli/CliOutput"
import * as Command from "effect/cli/Command"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import * as Stdio from "effect/Stdio"

type DocgenJson = typeof Configuration.ConfigurationSchema.Type

const existingFile = `${import.meta.dirname}/fixtures/invalid-json.txt`

const fileInfo: FileSystem.File.Info = {
  type: "File",
  mtime: Option.none(),
  atime: Option.none(),
  birthtime: Option.none(),
  dev: 0,
  ino: Option.none(),
  mode: 0,
  nlink: Option.none(),
  uid: Option.none(),
  gid: Option.none(),
  rdev: Option.none(),
  size: ByteSize.zero,
  blksize: Option.none(),
  blocks: Option.none()
}

class DocgenJsonTag extends Context.Service<DocgenJsonTag, DocgenJson>()("DocgenJsonTag") {}

const makeDocgenJson = (config: DocgenJson) => Layer.succeed(DocgenJsonTag, config)

const TestFileSystem = Layer.effect(
  FileSystem.FileSystem,
  Effect.gen(function*() {
    const path = yield* Path.Path
    const context = yield* Effect.context<never>()
    const docgenJson = Option.getOrElse(Context.getOption(context, DocgenJsonTag), () => ({} as DocgenJson))
    const readFileString: FileSystem.FileSystem["readFileString"] = (filePath) => {
      const fileName = path.basename(filePath)
      if (fileName === "package.json") {
        return Effect.succeed(JSON.stringify({ name: "name", homepage: "homepage" }))
      } else if (fileName === "docgen.json") {
        return Effect.succeed(JSON.stringify(docgenJson))
      }
      return Effect.die(`file not found: ${filePath}`)
    }
    const exists: FileSystem.FileSystem["exists"] = (filePath) => {
      const fileName = path.basename(filePath)
      if (fileName === "invalid-json.txt") {
        return Effect.succeed(true)
      }
      if (fileName === "docgen.json") {
        return Effect.succeed(Context.getOption(context, DocgenJsonTag).pipe(Option.isSome))
      }
      return Effect.succeed(false)
    }
    const stat: FileSystem.FileSystem["stat"] = (filePath) =>
      path.basename(filePath) === "invalid-json.txt" ? Effect.succeed(fileInfo) : Effect.die("file not found")
    return FileSystem.makeNoop({ exists, readFileString, stat })
  })
).pipe(Layer.provide(Path.layer))

const makeProcess = (env: Record<string, string> = {}) =>
  Layer.succeed(Domain.Process, {
    cwd: Effect.sync(() => process.cwd()),
    platform: Effect.sync(() => process.platform),
    argv: Effect.sync(() => process.argv),
    env: Effect.succeed(env)
  })

const makeTestLayer = (env: Record<string, string> = {}) =>
  Configuration.configProviderLayer.pipe(
    Layer.fresh,
    Layer.provideMerge(Layer.mergeAll(
      CliOutput.layer(CliOutput.defaultFormatter({ colors: false })),
      NodeServices.layer,
      Stdio.layerTest({}),
      makeProcess(env),
      Path.layer,
      TestFileSystem
    ))
  )

const testCliFor = (
  program: Effect.Effect<void, never, Configuration.Configuration | Domain.Process>
) => {
  const command = CLI.docgenCommand.pipe(
    Command.withHandler(() => program),
    Command.provideEffect(Configuration.Configuration, CLI.loadConfiguration)
  )
  return Command.runWith(command, { version: "v1.0.0" })
}

describe("Configuration", () => {
  it.effect("should use the default configuration if no configuration is provided", () => {
    const program = Effect.gen(function*() {
      const config = yield* Configuration.Configuration
      assert.deepStrictEqual(config, {
        projectName: "name",
        projectHomepage: "homepage",
        srcLink: "homepage/blob/main/src/",
        srcDir: "src",
        outDir: "docs",
        theme: "mikearnaldi/just-the-docs",
        enableSearch: true,
        enforceDescriptions: false,
        enforceExamples: false,
        enforceVersion: true,
        runExamples: false,
        tscExecutable: "tsc",
        exclude: [],
        parseCompilerOptions: Configuration.defaultCompilerOptions,
        examplesCompilerOptions: Configuration.defaultCompilerOptions
      })
    })
    return testCliFor(program)([]).pipe(Effect.provide(makeTestLayer()))
  })

  it.effect("should use the configuration contained in docgen.json if it exists", () => {
    const parseCompilerOptions = {
      noEmit: true,
      strict: true,
      skipLibCheck: true,
      exactOptionalPropertyTypes: true,
      moduleResolution: "Bundler",
      target: "ES2022",
      lib: ["ES2022", "DOM"]
    }
    const program = Effect.gen(function*() {
      const config = yield* Configuration.Configuration
      assert.deepStrictEqual(config, {
        projectName: "name",
        projectHomepage: "myproject",
        srcLink: "mygithub",
        srcDir: "src",
        outDir: "docs",
        theme: "mikearnaldi/just-the-docs",
        enableSearch: true,
        enforceDescriptions: false,
        enforceExamples: false,
        enforceVersion: true,
        runExamples: false,
        tscExecutable: "tsc",
        exclude: [],
        parseCompilerOptions,
        examplesCompilerOptions: Configuration.defaultCompilerOptions
      })
    })
    return testCliFor(program)([]).pipe(
      Effect.provide(
        makeTestLayer().pipe(Layer.provide(makeDocgenJson({
          projectHomepage: "myproject",
          srcLink: "mygithub",
          parseCompilerOptions
        })))
      )
    )
  })

  it.effect("should raise a validation error if docgen.json is not valid", () =>
    Effect.gen(function*() {
      const result = yield* Effect.exit(
        testCliFor(Effect.void)([]).pipe(
          Effect.provide(makeTestLayer().pipe(Layer.provide(makeDocgenJson({ projectHomepage: 1 } as any))))
        )
      )
      if (Exit.isSuccess(result)) {
        return assert.fail("expected configuration validation to fail")
      }
      assert.include(globalThis.String(result.cause), "Configuration.validateJsonFile")
      assert.include(globalThis.String(result.cause), "projectHomepage")
    }))

  it.effect("accepts inverse search and version flags", () => {
    const program = Effect.gen(function*() {
      const config = yield* Configuration.Configuration
      assert.isTrue(config.enableSearch)
      assert.isTrue(config.enforceVersion)
    })
    return testCliFor(program)(["--enable-search", "--enforce-version"]).pipe(
      Effect.provide(
        makeTestLayer().pipe(Layer.provide(makeDocgenJson({
          enableSearch: false,
          enforceVersion: false
        })))
      )
    )
  })

  it.effect("retains boolean values from docgen.json", () => {
    const program = Effect.gen(function*() {
      const config = yield* Configuration.Configuration
      assert.isFalse(config.enableSearch)
      assert.isFalse(config.enforceVersion)
    })
    return testCliFor(program)([]).pipe(
      Effect.provide(
        makeTestLayer().pipe(Layer.provide(makeDocgenJson({
          enableSearch: false,
          enforceVersion: false
        })))
      )
    )
  })

  it.effect("retains primary search and version flags", () => {
    const program = Effect.gen(function*() {
      const config = yield* Configuration.Configuration
      assert.isFalse(config.enableSearch)
      assert.isFalse(config.enforceVersion)
    })
    return testCliFor(program)(["--disable-search", "--no-enforce-version"]).pipe(
      Effect.provide(makeTestLayer())
    )
  })

  it.effect("automatic negative flags override true environment configuration", () => {
    const program = Effect.gen(function*() {
      const config = yield* Configuration.Configuration
      assert.isFalse(config.enforceDescriptions)
      assert.isFalse(config.enforceExamples)
      assert.isFalse(config.runExamples)
    })
    return testCliFor(program)([
      "--no-enforce-descriptions",
      "--no-enforce-examples",
      "--no-run-examples"
    ]).pipe(Effect.provide(makeTestLayer({
      DOCGEN_ENFORCE_DESCRIPTIONS: "true",
      DOCGEN_ENFORCE_EXAMPLES: "true",
      DOCGEN_RUN_EXAMPLES: "true"
    })))
  })

  it.effect("docgen.json retains its later runExamples precedence", () => {
    const program = Effect.gen(function*() {
      const config = yield* Configuration.Configuration
      assert.isTrue(config.runExamples)
    })
    return testCliFor(program)(["--no-run-examples"]).pipe(
      Effect.provide(
        makeTestLayer({ DOCGEN_RUN_EXAMPLES: "true" }).pipe(
          Layer.provide(makeDocgenJson({ runExamples: true }))
        )
      )
    )
  })

  it.effect("loads comma-delimited environment arrays before docgen.json", () => {
    const program = Effect.gen(function*() {
      const process = yield* Domain.Process
      assert.deepStrictEqual(yield* process.env, { DOCGEN_EXCLUDE: "a,b" })
      const config = yield* Configuration.Configuration
      assert.deepStrictEqual(config.exclude, ["a", "b"])
    })
    return testCliFor(program)([]).pipe(
      Effect.provide(
        makeTestLayer({ DOCGEN_EXCLUDE: "a,b" }).pipe(
          Layer.provide(makeDocgenJson({ exclude: ["from-docgen"] }))
        )
      )
    )
  })

  it.effect("parses inline compiler options as JSON records", () => {
    const program = Effect.gen(function*() {
      const config = yield* Configuration.Configuration
      assert.deepStrictEqual(config.parseCompilerOptions, { strict: false })
      assert.deepStrictEqual(config.examplesCompilerOptions, { module: "ESNext" })
    })
    return testCliFor(program)([
      "--parse-compiler-options",
      "{\"strict\":false}",
      "--examples-compiler-options",
      "{\"module\":\"ESNext\"}"
    ]).pipe(Effect.provide(makeTestLayer()))
  })

  it.effect("rejects both compiler option forms for the same category", () =>
    Effect.gen(function*() {
      const cases = [
        ["--parse-tsconfig-file", "--parse-compiler-options"],
        ["--examples-tsconfig-file", "--examples-compiler-options"]
      ] as const
      for (const [fileFlag, inlineFlag] of cases) {
        const result = yield* Effect.result(
          testCliFor(Effect.void)([fileFlag, existingFile, inlineFlag, "{}"]).pipe(
            Effect.provide(makeTestLayer())
          )
        )
        if (Result.isSuccess(result)) {
          return assert.fail(`${fileFlag} and ${inlineFlag} should be mutually exclusive`)
        }
        assert.strictEqual(result.failure._tag, "InvalidValue")
        if (result.failure._tag === "InvalidValue") {
          assert.include(result.failure.expected, `only one of ${fileFlag} or ${inlineFlag}`)
        }
      }
    }))

  it.effect("rejects non-record inline compiler options", () =>
    Effect.gen(function*() {
      for (const flag of ["--parse-compiler-options", "--examples-compiler-options"]) {
        for (const value of ["null", "[]", "1", "\"text\""]) {
          const result = yield* Effect.result(
            testCliFor(Effect.void)([flag, value]).pipe(Effect.provide(makeTestLayer()))
          )
          if (Result.isSuccess(result)) {
            return assert.fail(`${flag} should reject ${value}`)
          }
          assert.strictEqual(result.failure._tag, "ShowHelp")
          if (result.failure._tag === "ShowHelp") {
            assert.isTrue(
              result.failure.errors.some((error) =>
                error._tag === "InvalidValue" && error.expected.includes("JSON record")
              )
            )
          }
        }
      }
    }))
})
