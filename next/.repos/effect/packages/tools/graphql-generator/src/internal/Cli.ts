/**
 * Pieces of the `graphqlgen` command shared by a single run and the watch
 * loop: config loading, diagnostic formatting and writing changed files.
 *
 * @internal
 */
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import type { PlatformError } from "effect/PlatformError"
import * as Runtime from "effect/Runtime"
import * as Schema from "effect/Schema"
import * as Config from "../Config.ts"
import type * as Generator from "../Generator.ts"

export class ConfigLoadError extends Data.TaggedError("ConfigLoadError")<{
  readonly message: string
}> {
  override readonly [Runtime.errorExitCode] = 2
  override readonly [Runtime.errorReported] = false
}

export class GenerateError extends Data.TaggedError("GenerateError")<{
  readonly message: string
}> {
  override readonly [Runtime.errorExitCode] = 1
  override readonly [Runtime.errorReported] = false
}

export const toGenerateError = (error: PlatformError): GenerateError =>
  new GenerateError({ message: `error: ${error.message}` })

// -----------------------------------------------------------------------------
// Config loading
// -----------------------------------------------------------------------------

/**
 * Imports and decodes the config file. `version`, when given, is added to the
 * import URL as `?t=<version>` so an edited config is imported again instead
 * of coming from the module cache.
 */
export const loadConfig = Effect.fnUntraced(function*(configPath: string, version?: number) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const display = displayPath(path, configPath)
  const exists = yield* fs.exists(configPath).pipe(Effect.orElseSucceed(() => false))
  if (!exists) {
    return yield* new ConfigLoadError({ message: `error: config file not found: ${display}` })
  }
  const url = yield* path.toFileUrl(configPath).pipe(
    Effect.mapError((error) => new ConfigLoadError({ message: `error: ${display}: ${error.message}` }))
  )
  if (version !== undefined) url.searchParams.set("t", String(version))
  const module = yield* Effect.tryPromise({
    try: () => import(/* @vite-ignore */ url.href) as Promise<{ readonly default?: unknown }>,
    catch: (cause) => new ConfigLoadError({ message: importFailure(display, cause) })
  })
  if (module.default === undefined) {
    return yield* new ConfigLoadError({
      message:
        `error: ${display}: the config file has no default export. Export the config with \`export default defineConfig({ ... })\`.`
    })
  }
  return yield* Schema.decodeUnknownEffect(Config.Config)(module.default).pipe(
    Effect.mapError((error) =>
      new ConfigLoadError({
        message: `error: ${display}: the default export is not a valid config:\n${error.message}`
      })
    )
  )
})

/** Errors Node raises when it can't import a `.ts` file through type stripping. */
const typeStrippingCodes = new Set(["ERR_UNKNOWN_FILE_EXTENSION", "ERR_NO_TYPESCRIPT"])

/** Errors Node raises for TypeScript syntax that type stripping can't erase. */
const strippableSyntaxCodes = new Set([
  "ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX",
  "ERR_INVALID_TYPESCRIPT_SYNTAX"
])

const importFailure = (display: string, cause: unknown): string => {
  const code = typeof cause === "object" && cause !== null && "code" in cause ? String(cause.code) : undefined
  const detail = cause instanceof Error ? cause.message : String(cause)
  if (code !== undefined && typeStrippingCodes.has(code) && display.endsWith(".ts")) {
    return [
      `error: ${display}: this runtime cannot import a TypeScript config file (${code}).`,
      `graphqlgen loads the config with import(), which needs Node.js >= 22.18 (where type stripping is on by default), Bun or Deno.`,
      `Upgrade Node.js, or run graphqlgen with Bun or Deno.`,
      `  ${detail}`
    ].join("\n")
  }
  if (code === "ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING") {
    return [
      `error: ${display}: Node.js does not strip types from files under node_modules (${code}).`,
      `Move the config out of node_modules, or run graphqlgen with Bun or Deno.`,
      `  ${detail}`
    ].join("\n")
  }
  if (code !== undefined && strippableSyntaxCodes.has(code)) {
    return [
      `error: ${display}: Node.js type stripping cannot load this config (${code}).`,
      `Type stripping only erases type annotations, so the config can't use enums, namespaces or parameter properties.`,
      `  ${detail}`
    ].join("\n")
  }
  return `error: ${display}: could not import the config: ${detail}`
}

// -----------------------------------------------------------------------------
// Diagnostics
// -----------------------------------------------------------------------------

export const formatDiagnostic = (path: Path.Path, cwd: string, diagnostic: Generator.Diagnostic): string => {
  let location = displayPath(path, path.resolve(cwd, diagnostic.path))
  if (diagnostic.line !== undefined) {
    location += diagnostic.column === undefined ? `:${diagnostic.line}` : `:${diagnostic.line}:${diagnostic.column}`
  }
  const message = `${location}: ${diagnostic.severity}: ${diagnostic.message}`
  return diagnostic.codeFrame === undefined ? message : `${message}\n${diagnostic.codeFrame}`
}

export const errorSummary = (errors: number): string =>
  `${errors} ${errors === 1 ? "error" : "errors"}; no files were written.`

/** A path relative to the current directory, with `/` separators. */
export const displayPath = (path: Path.Path, absolute: string): string => {
  const relative = path.relative(path.resolve("."), absolute)
  return (relative === "" || path.isAbsolute(relative) ? absolute : relative).split(path.sep).join("/")
}

// -----------------------------------------------------------------------------
// Writing
// -----------------------------------------------------------------------------

export interface Changes {
  readonly creates: ReadonlyArray<Generator.GeneratedFile>
  readonly updates: ReadonlyArray<Generator.GeneratedFile>
  readonly deletes: ReadonlyArray<string>
}

/** Compares the generated files with what is on disk; unchanged files are left out. */
export const planChanges = Effect.fnUntraced(function*(result: Generator.GenerateResult) {
  const fs = yield* FileSystem.FileSystem
  const creates: Array<Generator.GeneratedFile> = []
  const updates: Array<Generator.GeneratedFile> = []
  for (const file of result.files) {
    if (!(yield* fs.exists(file.path))) {
      creates.push(file)
    } else if ((yield* fs.readFileString(file.path)) !== file.contents) {
      updates.push(file)
    }
  }
  return { creates, updates, deletes: result.deletes } satisfies Changes
}, Effect.mapError(toGenerateError))

/** Writes the created and updated files, then deletes the stale ones. */
export const writeChanges = Effect.fnUntraced(function*(changes: Changes) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  for (const file of [...changes.creates, ...changes.updates]) {
    yield* fs.makeDirectory(path.dirname(file.path), { recursive: true })
    yield* fs.writeFileString(file.path, file.contents)
  }
  for (const file of changes.deletes) {
    yield* fs.remove(file)
  }
}, Effect.mapError(toGenerateError))
