#!/usr/bin/env node

/**
 * Command-line interface for generating Effect API documentation.
 *
 * @since 0.6.0
 */
import * as Array from "effect/Array"
import * as CliError from "effect/cli/CliError"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import PackageJson from "../package.json" with { type: "json" }
import * as Configuration from "./Configuration.ts"
import * as Core from "./Core.ts"
import * as Domain from "./Domain.ts"

const projectHomepage = Flag.String("homepage").pipe(
  Flag.withFallbackConfig(Config.String("projectHomepage")),
  Flag.withDescription(
    "The link to the project homepage (will be shown in the Auxiliary Links of the generated documentation)"
  ),
  Flag.optional
)

const srcLink = Flag.String("srcLink").pipe(
  Flag.withFallbackConfig(Config.String("srcLink")),
  Flag.withDescription("The link to the project source code"),
  Flag.optional
)

const srcDir = Flag.Directory("src", { mustExist: true }).pipe(
  Flag.withFallbackConfig(Config.String("src").pipe(Config.withDefault("src"))),
  Flag.withDescription("The directory in which docgen will search for TypeScript files to parse")
)

const outDir = Flag.Directory("out").pipe(
  Flag.withFallbackConfig(Config.String("out").pipe(Config.withDefault("docs"))),
  Flag.withDescription("The directory to which docgen will generate its output markdown documents")
)

const theme = Flag.String("theme").pipe(
  Flag.withFallbackConfig(Config.String("theme").pipe(Config.withDefault(Configuration.DEFAULT_THEME))),
  Flag.withDescription("The Jekyll theme that should be used for the generated documentation")
)

const disableSearch = Flag.Boolean("disable-search").pipe(
  Flag.withDescription("Whether or not search should be enabled in the generated documentation"),
  Flag.optional
)

const enableSearchAlias = Flag.Boolean("enable-search").pipe(
  Flag.withDescription("Whether or not search should be enabled in the generated documentation"),
  Flag.optional
)

const enforceDescriptions = Flag.Boolean("enforce-descriptions").pipe(
  Flag.withDescription("Whether or not a description for each module export should be required"),
  Flag.optional
)

const enforceExamples = Flag.Boolean("enforce-examples").pipe(
  Flag.withDescription(
    "Whether or not @example tags for each module export should be required " +
      "(Note: examples will not be enforced in module documentation)"
  ),
  Flag.optional
)

const noEnforceVersion = Flag.Boolean("no-enforce-version").pipe(
  Flag.withDescription("Whether or not @since tags for each module export should be required"),
  Flag.optional
)

const enforceVersionAlias = Flag.Boolean("enforce-version").pipe(
  Flag.withDescription("Whether or not @since tags for each module export should be required"),
  Flag.optional
)

const runExamples = Flag.Boolean("run-examples").pipe(
  Flag.withDescription("Whether or not to execute examples discovered in the TypeScript source files"),
  Flag.optional
)

const exclude = Flag.String("exclude").pipe(
  Flag.between(0, Infinity),
  Flag.withFallbackConfig(
    Config.Array(Schema.String, "exclude").pipe(
      Config.withDefault(Array.empty<string>())
    )
  ),
  Flag.withDescription(
    "An array of glob patterns specifying files that should be excluded from the generated documentation"
  )
)

const compilerOptionsSchema = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown))

const parseCompilerOptionsFlag = (name: string, description: string) =>
  Flag.String(name).pipe(
    Flag.withDescription(description),
    Flag.mapEffect((value) =>
      Schema.decodeUnknownEffect(compilerOptionsSchema)(value).pipe(
        Effect.mapError((error) =>
          new CliError.InvalidValue({
            option: name,
            value,
            expected: `a JSON record (${globalThis.String(error)})`,
            kind: "flag"
          })
        )
      )
    )
  )

const parseCompilerOptionsFile = Flag.File("parse-tsconfig-file", { mustExist: true }).pipe(
  Flag.withDescription("The TypeScript TSConfig file to use for parsing source files"),
  Flag.optional
)

const parseCompilerOptionsInline = parseCompilerOptionsFlag(
  "parse-compiler-options",
  "The TypeScript compiler options to use for parsing source files"
).pipe(Flag.optional)

const examplesCompilerOptionsFile = Flag.File("examples-tsconfig-file", { mustExist: true }).pipe(
  Flag.withDescription("The TypeScript TSConfig file to use for examples"),
  Flag.optional
)

const examplesCompilerOptionsInline = parseCompilerOptionsFlag(
  "examples-compiler-options",
  "The TypeScript compiler options to use for examples"
).pipe(Flag.optional)

const options = {
  projectHomepage,
  srcLink,
  srcDir,
  outDir,
  theme,
  disableSearch,
  enableSearchAlias,
  enforceDescriptions,
  enforceExamples,
  noEnforceVersion,
  enforceVersionAlias,
  runExamples,
  exclude,
  parseCompilerOptionsFile,
  parseCompilerOptionsInline,
  examplesCompilerOptionsFile,
  examplesCompilerOptionsInline
}

/** @internal */
export const docgenCommand = Command.make("docgen", options)

/** @internal */
export const loadConfiguration = Effect.fnUntraced(function*(
  args: Command.Command.Config.Infer<typeof options>
) {
  const {
    enableSearchAlias,
    disableSearch,
    enforceDescriptions,
    enforceExamples,
    enforceVersionAlias,
    noEnforceVersion,
    runExamples,
    examplesCompilerOptionsFile,
    examplesCompilerOptionsInline,
    parseCompilerOptionsFile,
    parseCompilerOptionsInline,
    ...config
  } = args
  if (Option.isSome(parseCompilerOptionsFile) && Option.isSome(parseCompilerOptionsInline)) {
    return yield* new CliError.InvalidValue({
      option: "parse-compiler-options",
      value: JSON.stringify(parseCompilerOptionsInline.value),
      expected: "only one of --parse-tsconfig-file or --parse-compiler-options",
      kind: "flag"
    })
  }
  if (Option.isSome(examplesCompilerOptionsFile) && Option.isSome(examplesCompilerOptionsInline)) {
    return yield* new CliError.InvalidValue({
      option: "examples-compiler-options",
      value: JSON.stringify(examplesCompilerOptionsInline.value),
      expected: "only one of --examples-tsconfig-file or --examples-compiler-options",
      kind: "flag"
    })
  }
  const configuredEnableSearch = yield* Config.Boolean("enableSearch").pipe(Effect.orElseSucceed(() => true))
  const configuredEnforceDescriptions = yield* Config.Boolean("enforceDescriptions").pipe(
    Effect.orElseSucceed(() => false)
  )
  const configuredEnforceExamples = yield* Config.Boolean("enforceExamples").pipe(
    Effect.orElseSucceed(() => false)
  )
  const configuredEnforceVersion = yield* Config.Boolean("enforceVersion").pipe(Effect.orElseSucceed(() => true))
  const configuredRunExamples = yield* Config.Boolean("runExamples").pipe(Effect.orElseSucceed(() => false))
  return yield* Configuration.load({
    ...config,
    enableSearch: Option.match(disableSearch, {
      onNone: () => Option.getOrElse(enableSearchAlias, () => configuredEnableSearch),
      onSome: (disabled) => !disabled
    }),
    enforceDescriptions: Option.getOrElse(enforceDescriptions, () => configuredEnforceDescriptions),
    enforceExamples: Option.getOrElse(enforceExamples, () => configuredEnforceExamples),
    enforceVersion: Option.match(noEnforceVersion, {
      onNone: () => Option.getOrElse(enforceVersionAlias, () => configuredEnforceVersion),
      onSome: (disabled) => !disabled
    }),
    runExamples: Option.getOrElse(runExamples, () => configuredRunExamples),
    parseCompilerOptions: Option.orElse(parseCompilerOptionsFile, () => parseCompilerOptionsInline),
    examplesCompilerOptions: Option.orElse(examplesCompilerOptionsFile, () => examplesCompilerOptionsInline)
  })
})

const command = docgenCommand.pipe(
  Command.withHandler(() =>
    Effect.scoped(Core.program).pipe(
      Effect.catchTag("DocgenError", (error) =>
        Effect.gen(function*() {
          const config = yield* Configuration.Configuration
          return yield* new Domain.DocgenError({ message: `[${config.projectName}] ${error.message}` })
        }))
    )
  ),
  Command.provideEffect(Configuration.Configuration, loadConfiguration)
)

/**
 * Runs the docgen command-line program.
 *
 * @category running
 * @since 0.6.0
 */
export const cli = Command.runWith(command, {
  version: PackageJson["version"]
})
