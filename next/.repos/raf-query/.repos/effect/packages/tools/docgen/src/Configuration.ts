/**
 * Loads and provides configuration for documentation generation.
 *
 * @since 0.6.0
 */

import * as Array from "effect/Array"
import * as Config from "effect/Config"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import { pipe } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as tsconfck from "tsconfck"
import * as Domain from "./Domain.ts"
import { DocgenError } from "./Domain.ts"

/**
 * Default GitHub Pages theme written to generated configuration.
 *
 * @category constants
 * @since 0.6.0
 */
export const DEFAULT_THEME = "mikearnaldi/just-the-docs"

const PACKAGE_JSON_FILE_NAME = "package.json"
const CONFIG_FILE_NAME = "docgen.json"

const compilerOptionsSchema = Schema.Union([
  Schema.String,
  Schema.Record(Schema.String, Schema.Unknown)
])

/**
 * Schema for docgen configuration files.
 *
 * @category schemas
 * @since 0.6.0
 */
export const ConfigurationSchema = Schema.Struct({
  "$schema": Schema.optional(Schema.String),
  projectHomepage: Schema.optional(Schema.String.annotate({
    description: "Will link to the project homepage from the Auxiliary Links of the generated documentation."
  })),
  srcLink: Schema.optional(Schema.String.annotate({
    description: "Will link to the project source code."
  })),
  srcDir: Schema.optional(Schema.String.annotate({
    description: "The directory in which docgen will search for TypeScript files to parse.",
    default: "src"
  })),
  outDir: Schema.optional(Schema.String.annotate({
    description: "The directory to which docgen will generate its output markdown documents.",
    default: "docs"
  })),
  theme: Schema.optional(Schema.String.annotate({
    description: "The theme that docgen will specify should be used for GitHub Docs in the generated _config.yml file.",
    default: DEFAULT_THEME
  })),
  enableSearch: Schema.optional(Schema.Boolean.annotate({
    description: "Whether or not search should be enabled for GitHub Docs in the generated _config.yml file.",
    default: true
  })),
  enforceDescriptions: Schema.optional(Schema.Boolean.annotate({
    description: "Whether or not descriptions for each module export should be required.",
    default: false
  })),
  enforceExamples: Schema.optional(Schema.Boolean.annotate({
    description:
      "Whether or not @example tags for each module export should be required. (Note: examples will not be enforced in module documentation)",
    default: false
  })),
  enforceVersion: Schema.optional(Schema.Boolean.annotate({
    description: "Whether or not @since tags for each module export should be required.",
    default: true
  })),
  tscExecutable: Schema.optional(Schema.String.annotate({
    description:
      "The path to the TypeScript compiler executable that docgen should use when invoking the compiler programmatically.",
    default: "tsc"
  })),
  runExamples: Schema.optional(Schema.Boolean.annotate({
    description:
      "Whether or not docgen should attempt to run example code snippets and include the output in the generated documentation.",
    default: false
  })),
  exclude: Schema.optional(
    Schema.Array(Schema.String).annotate({
      description: "An array of glob strings specifying files that should be excluded from the documentation.",
      default: []
    })
  ),
  parseCompilerOptions: Schema.optional(compilerOptionsSchema.annotate({
    description: "tsconfig for parsing options (or path to a tsconfig)",
    default: {}
  })),
  examplesCompilerOptions: Schema.optional(compilerOptionsSchema.annotate({
    description: "tsconfig for the examples options (or path to a tsconfig)",
    default: {}
  }))
}).annotate({ identifier: "ConfigurationSchema" })

/**
 * Resolved configuration used by the docgen services.
 *
 * @category services
 * @since 0.6.0
 */
export interface ConfigurationShape {
  readonly projectName: string
  readonly projectHomepage: string
  readonly srcLink: string
  readonly srcDir: string
  readonly outDir: string
  readonly theme: string
  readonly enableSearch: boolean
  readonly enforceDescriptions: boolean
  readonly enforceExamples: boolean
  readonly enforceVersion: boolean
  readonly tscExecutable: string
  readonly runExamples: boolean
  readonly exclude: ReadonlyArray<string>
  readonly parseCompilerOptions: Record<string, unknown>
  readonly examplesCompilerOptions: Record<string, unknown>
}

/**
 * Service that provides resolved docgen configuration.
 *
 * @category services
 * @since 0.6.0
 */
export class Configuration
  extends Context.Service<Configuration, ConfigurationShape>()("@effect/docgen/Configuration")
{}

/** @internal */
export const defaultCompilerOptions = {
  noEmit: true,
  strict: true,
  skipLibCheck: true,
  moduleResolution: "Bundler",
  target: "ES2022",
  lib: [
    "ES2022",
    "DOM"
  ]
}

const readJsonFile = (
  path: string
): Effect.Effect<unknown, never, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const content = yield* Effect.orDie(fs.readFileString(path))
    return yield* pipe(
      Effect.try({
        try: () => JSON.parse(content),
        catch: (error) => `[FileSystem] Unable to read and parse JSON file from '${path}': ${String(error)}`
      }),
      Effect.orDie
    )
  })

const validateJsonFile = <A, I>(
  schema: Schema.Codec<A, I>,
  path: string
): Effect.Effect<A, never, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const content = yield* readJsonFile(path)
    return yield* pipe(
      Schema.decodeUnknownEffect(schema)(content),
      Effect.mapError((error) =>
        new DocgenError({
          message: `[Configuration.validateJsonFile]\n${String(error)}`
        })
      ),
      Effect.orDie
    )
  })

// TODO: this is invoked twice
const readDocgenConfig = (
  path: string
): Effect.Effect<Option.Option<Schema.Schema.Type<typeof ConfigurationSchema>>, never, FileSystem.FileSystem> => {
  return Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const exists = yield* Effect.orDie(fs.exists(path))
    if (exists) {
      const config = yield* validateJsonFile(ConfigurationSchema, path)
      return Option.some(config)
    } else {
      return Option.none()
    }
  })
}

const readTSConfig = (fileName: string): Effect.Effect<
  { readonly [x: string]: unknown },
  never,
  Path.Path | Domain.Process
> =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const process = yield* Domain.Process
    const cwd = yield* process.cwd
    return yield* pipe(
      Effect.tryPromise(() => tsconfck.parse(path.resolve(cwd, fileName))).pipe(
        Effect.map(({ tsconfig }) => tsconfig.compilerOptions ?? defaultCompilerOptions),
        Effect.mapError((error) =>
          new DocgenError({
            message: `[Configuration.readTSConfig] Failed to read TSConfig file\n${String(error)}`
          })
        ),
        Effect.orDie
      )
    )
  })

const loadCompilerOptions = (configKey: string) =>
  Config.String(configKey).pipe(
    Effect.flatMap((config) =>
      Schema.decodeUnknownEffect(JsonRecordSchema)(config).pipe(Effect.orElseSucceed(() => config))
    )
  )

const resolveCompilerOptions = (
  configKey: string,
  fromCLI: Option.Option<string | Record<string, unknown>>,
  fromDocgenJson: Option.Option<string | Record<string, unknown>>
): Effect.Effect<{ readonly [x: string]: unknown }, never, Path.Path | Domain.Process> => {
  const fromConfigProvider = loadCompilerOptions(configKey)
  return Effect.gen(function*() {
    let config: string | Record<string, unknown>
    if (Option.isSome(fromCLI)) {
      config = fromCLI.value
    } else {
      const provided = yield* Effect.result(fromConfigProvider)
      if (Result.isSuccess(provided)) {
        config = provided.success
      } else if (Option.isSome(fromDocgenJson)) {
        config = fromDocgenJson.value
      } else {
        config = defaultCompilerOptions
      }
    }
    return typeof config === "string" ? yield* readTSConfig(config) : config
  })
}

const JsonRecordSchema = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown))

const PackageJsonSchema = Schema.Struct({
  name: Schema.String,
  homepage: Schema.String
})

/** @internal */
export const load = (args: {
  readonly projectHomepage: Option.Option<string>
  readonly srcLink: Option.Option<string>
  readonly srcDir: string
  readonly outDir: string
  readonly theme: string
  readonly enableSearch: boolean
  readonly enforceDescriptions: boolean
  readonly enforceExamples: boolean
  readonly enforceVersion: boolean
  readonly runExamples: boolean
  readonly exclude: ReadonlyArray<string>
  readonly parseCompilerOptions: Option.Option<string | Record<string, unknown>>
  readonly examplesCompilerOptions: Option.Option<string | Record<string, unknown>>
}) =>
  Effect.gen(function*() {
    // Extract the requisite services
    const process = yield* Domain.Process
    const cwd = yield* process.cwd
    const path = yield* Path.Path

    // Read and parse the required fields from the `package.json`
    const packageJsonPath = path.join(cwd, PACKAGE_JSON_FILE_NAME)
    const packageJson = yield* validateJsonFile(PackageJsonSchema, packageJsonPath)
    const projectName = packageJson.name
    const projectHomepage = Option.getOrElse(args.projectHomepage, () => packageJson.homepage)
    const srcLink = Option.getOrElse(args.srcLink, () => `${projectHomepage}/blob/main/src/`)

    // Read the `docgen.json` configuration file to gain access to the TypeScript
    // configuration options
    const configPath = path.join(cwd, CONFIG_FILE_NAME)
    const config = yield* readDocgenConfig(configPath)

    // Resolve the excluded files
    const exclude = yield* Array.match(args.exclude, {
      onEmpty: () =>
        Effect.result(Config.Array(Schema.String, "exclude")).pipe(
          Effect.map((configured) =>
            Result.isSuccess(configured)
              ? configured.success
              : Option.match(config, {
                onNone: () => Array.empty<string>(),
                onSome: ({ exclude }) => exclude || Array.empty<string>()
              })
          )
        ),
      onNonEmpty: (exclude) => Effect.succeed(exclude)
    })

    // Resolve the TypeScript configuration options
    const examplesCompilerOptions = yield* resolveCompilerOptions(
      "examplesCompilerOptions",
      args.examplesCompilerOptions,
      Option.flatMap(config, (config) => Option.fromNullishOr(config.examplesCompilerOptions))
    )
    const parseCompilerOptions = yield* resolveCompilerOptions(
      "parseCompilerOptions",
      args.parseCompilerOptions,
      Option.flatMap(config, (config) => Option.fromNullishOr(config.parseCompilerOptions))
    )

    const srcDir = config.pipe(
      Option.flatMapNullishOr((config) => config.srcDir),
      Option.getOrElse(() => args.srcDir)
    )

    const outDir = config.pipe(
      Option.flatMapNullishOr((config) => config.outDir),
      Option.getOrElse(() => args.outDir)
    )

    const runExamples = config.pipe(
      Option.flatMapNullishOr((config) => config.runExamples),
      Option.getOrElse(() => args.runExamples)
    )

    const tscExecutable = config.pipe(
      Option.flatMapNullishOr((config) => config.tscExecutable),
      Option.getOrElse(() => "tsc")
    )

    return Configuration.of({
      ...args,
      srcDir,
      outDir,
      projectName,
      projectHomepage,
      srcLink,
      exclude,
      examplesCompilerOptions,
      parseCompilerOptions,
      runExamples,
      tscExecutable
    })
  })

/** @internal */
export const configProviderLayer = Layer.effect(ConfigProvider.ConfigProvider)(Effect.gen(function*() {
  // Extract the requisite services
  const process = yield* Domain.Process
  const cwd = yield* process.cwd
  const env = yield* process.env
  const path = yield* Path.Path
  // Attempt to load the `docgen.json` configuration file
  const configPath = path.join(cwd, CONFIG_FILE_NAME)
  const maybeConfig = yield* readDocgenConfig(configPath)
  // Construct a config provider for the environment
  const fromEnv = ConfigProvider.fromEnv({ env }).pipe(
    ConfigProvider.nested("DOCGEN"),
    ConfigProvider.constantCase
  )
  // Construct a config provider for the `docgen.json` file
  const fromDocgenJson = ConfigProvider.fromUnknown(Option.getOrElse(maybeConfig, () => ({})))
  // Prefer the environment over the `docgen.json` file
  const provider = fromEnv.pipe(ConfigProvider.orElse(fromDocgenJson))
  return provider
}))
