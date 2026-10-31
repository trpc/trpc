/**
 * The `graphqlgen` command.
 *
 * `graphqlgen [--config <path>] [--watch | --check]` loads `graphql.config.ts`
 * from the current directory, or the file `--config` names, generates every
 * `.graphql.ts` module in memory with {@link Generator.generate} and writes
 * the files whose bytes changed. Generated files whose `.graphql` source is
 * gone are deleted. Any error diagnostic means nothing is written.
 *
 * With `--watch` it keeps running and regenerates whenever the config, the
 * schema or a document changes. A failing cycle keeps the last good output.
 *
 * Exit codes: `0` on success, `1` when generation reports an error or
 * `--check` finds out-of-date files, `2` for invalid CLI usage or when the
 * config can't be loaded (with `--watch`, only at startup).
 *
 * @since 4.0.0
 */
import * as CliError from "effect/cli/CliError"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Console from "effect/Console"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Runtime from "effect/Runtime"
import type * as Config from "./Config.ts"
import * as Generator from "./Generator.ts"
import {
  type Changes,
  ConfigLoadError,
  displayPath,
  errorSummary,
  formatDiagnostic,
  GenerateError,
  loadConfig,
  planChanges,
  toGenerateError,
  writeChanges
} from "./internal/Cli.ts"
import * as Watch from "./internal/Watch.ts"

/**
 * The config file could not be found, imported or decoded, or the generator
 * rejected it, exiting with code `2`. Generation reported at least one error
 * diagnostic, or a file could not be read or written, exiting with code `1`.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.0
 */
export { ConfigLoadError, GenerateError } from "./internal/Cli.ts"

/**
 * `--check` found generated files that would be created, changed or deleted.
 * Exits with code `1`.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.0
 */
export class CheckError extends Data.TaggedError("CheckError")<{
  readonly message: string
}> {
  override readonly [Runtime.errorExitCode] = 1
  override readonly [Runtime.errorReported] = false
}

const config = Flag.String("config").pipe(
  Flag.withAlias("c"),
  Flag.withDescription("The config file to load (default: graphql.config.ts in the current directory)"),
  Flag.optional
)

const watch = Flag.Boolean("watch").pipe(
  Flag.withAlias("w"),
  Flag.withDescription("Regenerate whenever the schema, a document or the config changes"),
  Flag.withDefault(false)
)

const check = Flag.Boolean("check").pipe(
  Flag.withDescription("Write nothing; list the files that are out of date and exit 1 if there are any"),
  Flag.withDefault(false)
)

const root = Command.make("graphqlgen", { config, watch, check }).pipe(
  Command.withHandler(Effect.fnUntraced(function*(flags) {
    if (flags.watch && flags.check) {
      return yield* new CliError.UserError({ cause: "--watch and --check cannot be used together." })
    }
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const configPath = path.resolve(Option.getOrElse(flags.config, () => "graphql.config.ts"))
    if (flags.watch) {
      return yield* Watch.run({ configPath, watch: Watch.fileSystemWatch(fs, path) })
    }
    const loaded = yield* loadConfig(configPath)
    const result = yield* generateFiles(loaded, path.dirname(configPath))
    const changes = yield* planChanges(result)
    if (flags.check) return yield* reportCheck(changes)
    yield* writeChanges(changes)
    yield* listChanges(path, changes, { create: "created", update: "updated", delete: "deleted" })
  }))
)

/**
 * Runs the `graphqlgen` command-line program.
 *
 * **Details**
 *
 * Diagnostics go to stderr as `file:line:col: error|warning: message` followed
 * by a code frame. Written, deleted and, with `--check`, out-of-date files are
 * listed on stdout. Failures carry their exit code through
 * `Runtime.errorExitCode`.
 *
 * @stability experimental
 * @category running
 * @since 4.0.0
 */
export const run: Effect.Effect<
  void,
  CliError.CliError | ConfigLoadError | GenerateError | CheckError,
  Command.Environment
> = Command.run(root, { version: "0.0.0" }).pipe(
  Effect.mapError((error) =>
    CliError.isCliError(error) && Runtime.getErrorExitCode(error) !== 0
      ? Object.assign(error, { [Runtime.errorExitCode]: 2 })
      : error
  ),
  // Command.run has already printed CLI errors.
  Effect.tapError((error) => CliError.isCliError(error) ? Effect.void : Console.error(error.message))
)

// -----------------------------------------------------------------------------
// Single run
// -----------------------------------------------------------------------------

const generateFiles = Effect.fnUntraced(function*(config: Config.Config, cwd: string) {
  const path = yield* Path.Path
  const result = yield* Generator.generate(config, { cwd }).pipe(
    Effect.catchTags({
      ConfigError: (error) => Effect.fail(new ConfigLoadError({ message: `error: ${error.message}` })),
      PlatformError: (error) => Effect.fail(toGenerateError(error))
    })
  )
  for (const diagnostic of result.diagnostics) {
    yield* Console.error(formatDiagnostic(path, cwd, diagnostic))
  }
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length
  if (errors > 0) {
    return yield* new GenerateError({ message: errorSummary(errors) })
  }
  return result
})

const reportCheck = Effect.fnUntraced(function*(changes: Changes) {
  const path = yield* Path.Path
  const count = changes.creates.length + changes.updates.length + changes.deletes.length
  if (count === 0) return
  yield* listChanges(path, changes, { create: "would create", update: "would update", delete: "would delete" })
  return yield* new CheckError({
    message: `${count} generated ${count === 1 ? "file is" : "files are"} out of date. Run graphqlgen to update ${
      count === 1 ? "it" : "them"
    }.`
  })
})

const listChanges = (
  path: Path.Path,
  changes: Changes,
  verbs: { readonly create: string; readonly update: string; readonly delete: string }
) =>
  Effect.forEach([
    ...changes.creates.map((file) => `${verbs.create} ${displayPath(path, file.path)}`),
    ...changes.updates.map((file) => `${verbs.update} ${displayPath(path, file.path)}`),
    ...changes.deletes.map((file) => `${verbs.delete} ${displayPath(path, file)}`)
  ], (line) =>
    Console.log(line), { discard: true })
