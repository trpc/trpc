/**
 * Defines named options for command-line applications.
 *
 * A `Flag<A>` describes how to read one named value from parsed command-line
 * input, validate it, and produce an `A`. Flags are useful for inputs such as
 * ports, verbosity switches, configuration files, output directories, choices,
 * secrets, and repeated values. The helpers here build flags with aliases,
 * defaults, optional values, prompts, configuration fallbacks, validation, and
 * value transformations.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as Config from "../Config.ts"
import type * as Effect from "../Effect.ts"
import { dual, type LazyArg } from "../Function.ts"
import type * as Option from "../Option.ts"
import type * as Redacted_ from "../Redacted.ts"
import type * as Result from "../Result.ts"
import type * as Schema from "../Schema.ts"
import type * as CliError from "./CliError.ts"
import type { Environment } from "./Command.ts"
import * as Param from "./Param.ts"
import type * as Primitive from "./Primitive.ts"

// -------------------------------------------------------------------------------------
// models
// -------------------------------------------------------------------------------------

/**
 * Represents a command-line flag.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Flag<A> extends Param.Param<typeof Param.flagKind, A> {}

// -------------------------------------------------------------------------------------
// constructors
// -------------------------------------------------------------------------------------

/**
 * Creates a string flag that accepts text input.
 *
 * **Example** (Creating string flags)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * const nameFlag = Flag.String("name")
 * // Usage: --name "John Doe"
 * nameFlag.kind // => "flag"
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const String = (name: string): Flag<string> => Param.String(Param.flagKind, name)

/**
 * Creates a boolean flag that can be enabled or disabled.
 *
 * **Example** (Creating boolean flags)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * const verboseFlag = Flag.Boolean("verbose")
 * // Usage: --verbose (true) or --no-verbose (false)
 * // Omission fails unless the flag is made optional or given a fallback.
 * verboseFlag.kind // => "flag"
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Boolean = (name: string): Flag<boolean> => Param.Boolean(Param.flagKind, name)

/**
 * Creates an integer flag that accepts whole number input.
 *
 * **Example** (Creating integer flags)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * const portFlag = Flag.Int("port")
 * // Usage: --port 8080
 * portFlag.kind // => "flag"
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Int = (name: string): Flag<number> => Param.Int(Param.flagKind, name)

/**
 * Creates a float flag that accepts decimal number input.
 *
 * **Example** (Creating float flags)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * const rateFlag = Flag.Finite("rate")
 * // Usage: --rate 3.14
 * rateFlag.kind // => "flag"
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Finite = (name: string): Flag<number> => Param.Finite(Param.flagKind, name)

/**
 * Creates a date flag that accepts date input in ISO format.
 *
 * **Example** (Creating date flags)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * const startDateFlag = Flag.Date("start-date")
 * // Usage: --start-date 2023-12-25
 * startDateFlag.kind // => "flag"
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Date = (name: string): Flag<globalThis.Date> => Param.Date(Param.flagKind, name)

/**
 * Constructs option parameters that represent a choice between several inputs.
 * Each tuple maps a string flag value to an associated typed value.
 *
 * **Example** (Creating flag choices with values)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * // simple enum like choice mapping directly to string union
 * const color = Flag.Literals("color", ["red", "green", "blue"])
 *
 * // choice with custom value mapping
 * const logLevel = Flag.ChoiceWithValue("log-level", [
 *   ["debug", "Debug" as const],
 *   ["info", "Info" as const],
 *   ["error", "Error" as const]
 * ])
 * const kinds = [color.kind, logLevel.kind] // => ["flag", "flag"]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const ChoiceWithValue = <const Choice extends ReadonlyArray<readonly [string, any]>>(
  name: string,
  choices: Choice
): Flag<Choice[number][1]> => Param.ChoiceWithValue(Param.flagKind, name, choices)

/**
 * Accepts one of the provided strings. An empty array rejects all input.
 *
 * @see {@link ChoiceWithValue} for mapping accepted strings to different typed values
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Literals = <const Literals extends ReadonlyArray<string>>(
  name: string,
  literals: Literals
): Flag<Literals[number]> => Param.Literals(Param.flagKind, name, literals)

/**
 * Creates a path flag that accepts file system path input with validation options.
 *
 * **Example** (Creating path flags)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * // Basic path flag
 * const pathFlag = Flag.Path("config-path")
 *
 * // File-only path that must exist
 * const fileFlag = Flag.Path("input-file", {
 *   pathType: "file",
 *   mustExist: true
 * })
 *
 * // Directory path with custom type name
 * const dirFlag = Flag.Path("output-dir", {
 *   pathType: "directory",
 *   typeName: "OUTPUT_DIRECTORY"
 * })
 * const kinds = [pathFlag.kind, fileFlag.kind, dirFlag.kind] // => ["flag", "flag", "flag"]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Path = (name: string, options?: {
  readonly pathType?: "file" | "directory" | "either" | undefined
  readonly mustExist?: boolean | undefined
  readonly typeName?: string | undefined
}): Flag<string> => Param.Path(Param.flagKind, name, options)

/**
 * Creates a file path flag that accepts file paths with optional existence validation.
 *
 * **Example** (Creating file flags)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * // Basic file flag
 * const inputFlag = Flag.File("input")
 * // Usage: --input ./data.json
 *
 * // File that must exist
 * const configFlag = Flag.File("config", { mustExist: true })
 * // Usage: --config ./config.yaml (file must exist)
 * const kinds = [inputFlag.kind, configFlag.kind] // => ["flag", "flag"]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const File = (name: string, options?: {
  readonly mustExist?: boolean | undefined
}): Flag<string> => Param.File(Param.flagKind, name, options)

/**
 * Creates a directory path flag that accepts directory paths with optional existence validation.
 *
 * **Example** (Creating directory flags)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * // Basic directory flag
 * const outputFlag = Flag.Directory("output")
 * // Usage: --output ./build
 *
 * // Directory that must exist
 * const sourceFlag = Flag.Directory("source", { mustExist: true })
 * // Usage: --source ./src (directory must exist)
 * const kinds = [outputFlag.kind, sourceFlag.kind] // => ["flag", "flag"]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Directory = (name: string, options?: {
  readonly mustExist?: boolean | undefined
}): Flag<string> => Param.Directory(Param.flagKind, name, options)

/**
 * Creates a string flag whose parsed value is wrapped in `Redacted.Redacted` so
 * stringification and logging redact the value.
 *
 * **Gotchas**
 *
 * Values supplied on the command line may still be visible to the operating
 * system or shell history.
 *
 * **Example** (Creating redacted flags)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Redacted, Stdio, Terminal } from "effect"
 * import { Flag } from "effect/cli"
 * import { ChildProcessSpawner } from "effect/process"
 *
 * const CliTestLayer = Layer.mergeAll(
 *   FileSystem.layerNoop({}),
 *   Path.layer,
 *   Stdio.layerTest({}),
 *   Layer.succeed(Terminal.Terminal, Terminal.make({
 *     columns: Effect.succeed(80),
 *     rows: Effect.succeed(24),
 *     readInput: Effect.die("unused"),
 *     readLine: Effect.die("unused"),
 *     display: () => Effect.void
 *   })),
 *   Layer.succeed(
 *     ChildProcessSpawner.ChildProcessSpawner,
 *     ChildProcessSpawner.make(() => Effect.die("unused"))
 *   )
 * )
 *
 * const passwordFlag = Flag.Redacted("password")
 *
 * const program = Effect.gen(function*() {
 *   const [, password] = yield* passwordFlag.parse({
 *     arguments: [],
 *     flags: { "password": ["abc123"] }
 *   })
 *   return Redacted.value(password).length
 * })
 *
 * await Effect.runPromise(program.pipe(Effect.provide(CliTestLayer))) // => 6
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Redacted = (name: string): Flag<Redacted_.Redacted<string>> => Param.Redacted(Param.flagKind, name)

/**
 * Creates a flag that reads and returns file content as a string.
 *
 * **Example** (Reading file text)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * const config = Flag.FileText("config-file")
 * // --config-file ./app.json will read the file content
 * config.kind // => "flag"
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const FileText = (name: string): Flag<string> => Param.FileText(Param.flagKind, name)

/**
 * Creates a flag that reads and parses the content of the specified file.
 *
 * **Details**
 *
 * The parser that is utilized will depend on the specified `format`, or the
 * extension of the file passed on the command-line if no `format` is specified.
 *
 * **Example** (Parsing file contents)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * // Will use the extension of the file passed on the command line to determine
 * // the parser to use
 * const config = Flag.FileParse("config")
 *
 * // Will use the JSON parser
 * const jsonConfig = Flag.FileParse("json-config", { format: "json" })
 * const kinds = [config.kind, jsonConfig.kind] // => ["flag", "flag"]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const FileParse = (
  name: string,
  options?: Primitive.FileParseOptions | undefined
): Flag<unknown> => Param.FileParse(Param.flagKind, name, options)

/**
 * Creates a flag that reads and validates file content using the specified
 * schema.
 *
 * **Example** (Validating file contents)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Flag } from "effect/cli"
 *
 * const ConfigSchema = Schema.Struct({
 *   port: Schema.Number,
 *   host: Schema.String
 * })
 *
 * const config = Flag.FileSchema("config", ConfigSchema, { format: "json" })
 * config.kind // => "flag"
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const FileSchema = <A>(
  name: string,
  schema: Schema.ConstraintDecoder<A, Environment>,
  options?: Primitive.FileSchemaOptions | undefined
): Flag<A> => Param.FileSchema(Param.flagKind, name, schema, options)

/**
 * Creates a flag that parses key=value pairs.
 *
 * **When to use**
 *
 * Use when you need a CLI flag that accepts one or more `key=value`
 * configuration entries.
 *
 * **Details**
 *
 * Requires at least one key=value pair. Multiple pairs are merged into a single
 * record.
 *
 * **Example** (Parsing key-value pairs)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * const env = Flag.KeyValuePair("env")
 * // --env FOO=bar --env BAZ=qux will parse to { FOO: "bar", BAZ: "qux" }
 * env.kind // => "flag"
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const KeyValuePair = (name: string): Flag<Record<string, string>> => Param.KeyValuePair(Param.flagKind, name)

/**
 * A flag that always fails to parse.
 *
 * **Example** (Creating sentinel flags)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * const makeValueFlag = (includeValue: boolean) =>
 *   includeValue ? Flag.String("value") : Flag.Never
 *
 * makeValueFlag(true) === Flag.Never // => false
 * makeValueFlag(false) === Flag.Never // => true
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Never: Flag<never> = Param.Never(Param.flagKind)

// -------------------------------------------------------------------------------------
// combinators
// -------------------------------------------------------------------------------------

/**
 * Adds an alias to a flag, allowing it to be referenced by multiple names.
 *
 * **Example** (Adding flag aliases)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * // Flag can be used as both --verbose and -v
 * const verboseFlag = Flag.Boolean("verbose").pipe(
 *   Flag.withAlias("v")
 * )
 *
 * // Multiple aliases can be chained
 * const helpFlag = Flag.Boolean("help").pipe(
 *   Flag.withAlias("h"),
 *   Flag.withAlias("?")
 * )
 * const kinds = [verboseFlag.kind, helpFlag.kind] // => ["flag", "flag"]
 * ```
 *
 * @stability unstable
 * @category aliasing
 * @since 4.0.0
 */
export const withAlias: {
  <A>(alias: string): (self: Flag<A>) => Flag<A>
  <A>(self: Flag<A>, alias: string): Flag<A>
} = dual(2, <A>(self: Flag<A>, alias: string): Flag<A> => Param.withAlias(self, alias))

/**
 * Adds a description to a flag for help documentation.
 *
 * **Example** (Adding help descriptions)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * const portFlag = Flag.Int("port").pipe(
 *   Flag.withDescription("The port number to listen on")
 * )
 *
 * const configFlag = Flag.File("config").pipe(
 *   Flag.withDescription("Path to the configuration file")
 * )
 * const kinds = [portFlag.kind, configFlag.kind] // => ["flag", "flag"]
 * ```
 *
 * @stability unstable
 * @category metadata
 * @since 4.0.0
 */
export const withDescription: {
  <A>(description: string): (self: Flag<A>) => Flag<A>
  <A>(self: Flag<A>, description: string): Flag<A>
} = dual(2, <A>(self: Flag<A>, description: string) => Param.withDescription(self, description))

// -------------------------------------------------------------------------------------
// metadata
// -------------------------------------------------------------------------------------

/**
 * Sets a custom metavar (placeholder name) for the flag in help documentation.
 *
 * **Details**
 *
 * The metavar is displayed in usage text to indicate what value the user should
 * provide. For example, `--output FILE` shows `FILE` as the metavar.
 *
 * **Example** (Setting metavars)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * const databaseFlag = Flag.String("database-url").pipe(
 *   Flag.withMetavar("URL"),
 *   Flag.withDescription("Database connection URL")
 * )
 * // In help: --database-url URL
 *
 * const timeoutFlag = Flag.Int("timeout").pipe(
 *   Flag.withMetavar("SECONDS")
 * )
 * // In help: --timeout SECONDS
 * const kinds = [databaseFlag.kind, timeoutFlag.kind] // => ["flag", "flag"]
 * ```
 *
 * @stability unstable
 * @category metadata
 * @since 4.0.0
 */
export const withMetavar: {
  <A>(metavar: string): (self: Flag<A>) => Flag<A>
  <A>(self: Flag<A>, metavar: string): Flag<A>
} = dual(2, <A>(self: Flag<A>, metavar: string) => Param.withMetavar(self, metavar))

/**
 * Hides a flag from generated help output and shell completions while keeping
 * it fully parseable on the command line.
 *
 * **When to use**
 *
 * Use when experimental or internal flags should be accepted but not advertised, such as
 * `--experimental-foo`, debug toggles, or escape hatches that are not yet committed to the
 * public CLI surface.
 *
 * **Example** (Hiding a flag from help)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * // Flag still parses --experimental-foo, but it does not appear in --help.
 * const experimental = Flag.Boolean("experimental-foo").pipe(
 *   Flag.withHidden
 * )
 * experimental.kind // => "flag"
 * ```
 *
 * @stability unstable
 * @category metadata
 * @since 4.0.0
 */
export const withHidden = <A>(self: Flag<A>): Flag<A> => Param.withHidden(self)

/**
 * Makes a flag optional, returning an Option type that can be None if not provided.
 *
 * **Example** (Making flags optional)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Option, Path, Stdio, Terminal } from "effect"
 * import { Flag } from "effect/cli"
 * import { ChildProcessSpawner } from "effect/process"
 *
 * const CliTestLayer = Layer.mergeAll(
 *   FileSystem.layerNoop({}),
 *   Path.layer,
 *   Stdio.layerTest({}),
 *   Layer.succeed(Terminal.Terminal, Terminal.make({
 *     columns: Effect.succeed(80),
 *     rows: Effect.succeed(24),
 *     readInput: Effect.die("unused"),
 *     readLine: Effect.die("unused"),
 *     display: () => Effect.void
 *   })),
 *   Layer.succeed(
 *     ChildProcessSpawner.ChildProcessSpawner,
 *     ChildProcessSpawner.make(() => Effect.die("unused"))
 *   )
 * )
 *
 * const optionalPort = Flag.optional(Flag.Int("port"))
 *
 * const program = Effect.gen(function*() {
 *   const [, port] = yield* optionalPort.parse({
 *     arguments: [],
 *     flags: { "port": ["4000"] }
 *   })
 *   return port
 * })
 *
 * await Effect.runPromise(program.pipe(Effect.provide(CliTestLayer))) // => Option.some(4000)
 * ```
 *
 * @stability unstable
 * @category optionality
 * @since 4.0.0
 */
export const optional = <A>(param: Flag<A>): Flag<Option.Option<A>> => Param.optional(param)

/**
 * Provides a default value for a flag when it's not specified.
 *
 * **Example** (Providing default values)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * const portFlag = Flag.Int("port").pipe(
 *   Flag.withDefault(8080)
 * )
 * // If --port is not provided, defaults to 8080
 *
 * const hostFlag = Flag.String("host").pipe(
 *   Flag.withDefault("localhost")
 * )
 * // If --host is not provided, defaults to "localhost"
 * const kinds = [portFlag.kind, hostFlag.kind] // => ["flag", "flag"]
 * ```
 *
 * @stability unstable
 * @category optionality
 * @since 4.0.0
 */
export const withDefault: {
  <const B>(defaultValue: B | Effect.Effect<B, CliError.CliError, Environment>): <A>(self: Flag<A>) => Flag<A | B>
  <A, const B>(self: Flag<A>, defaultValue: B | Effect.Effect<B, CliError.CliError, Environment>): Flag<A | B>
} = Param.withDefault

/**
 * Adds a fallback config that is loaded when a required flag is missing.
 *
 * **Example** (Falling back to config)
 *
 * ```ts import.meta.vitest
 * import { Config } from "effect"
 * import { Flag } from "effect/cli"
 *
 * const verbose = Flag.Boolean("verbose").pipe(
 *   Flag.withFallbackConfig(Config.Boolean("VERBOSE"))
 * )
 * verbose.kind // => "flag"
 * ```
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const withFallbackConfig: {
  <B>(config: Config.Config<B>): <A>(self: Flag<A>) => Flag<A | B>
  <A, B>(self: Flag<A>, config: Config.Config<B>): Flag<A | B>
} = dual(2, <A, B>(self: Flag<A>, config: Config.Config<B>) => Param.withFallbackConfig(self, config))

/**
 * Adds a fallback prompt that is shown when a required flag is missing.
 *
 * **Example** (Falling back to prompts)
 *
 * ```ts import.meta.vitest
 * import { Flag, Prompt } from "effect/cli"
 *
 * const name = Flag.String("name").pipe(
 *   Flag.withFallbackPrompt(Prompt.String({ message: "Name" }))
 * )
 * name.kind // => "flag"
 * ```
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const withFallbackPrompt: {
  <B>(prompt: Param.FallbackPrompt<B>): <A>(self: Flag<A>) => Flag<A | B>
  <A, B>(self: Flag<A>, prompt: Param.FallbackPrompt<B>): Flag<A | B>
} = dual(2, <A, B>(self: Flag<A>, prompt: Param.FallbackPrompt<B>) => Param.withFallbackPrompt(self, prompt))

/**
 * Transforms the parsed value of a flag using a mapping function.
 *
 * **Example** (Mapping parsed values)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * // Convert string to uppercase
 * const nameFlag = Flag.String("name").pipe(
 *   Flag.map((name) => name.toUpperCase())
 * )
 *
 * // Convert port to URL
 * const urlFlag = Flag.Int("port").pipe(
 *   Flag.map((port) => `http://localhost:${port}`)
 * )
 * const kinds = [nameFlag.kind, urlFlag.kind] // => ["flag", "flag"]
 * ```
 *
 * @stability unstable
 * @category mapping
 * @since 4.0.0
 */
export const map: {
  <A, B>(f: (a: A) => B): (self: Flag<A>) => Flag<B>
  <A, B>(self: Flag<A>, f: (a: A) => B): Flag<B>
} = dual(2, <A, B>(self: Flag<A>, f: (a: A) => B) => Param.map(self, f))

/**
 * Transforms the parsed value using an Effect that can perform IO operations.
 *
 * **Example** (Mapping parsed values effectfully)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Flag } from "effect/cli"
 * import { ChildProcessSpawner } from "effect/process"
 *
 * const CliTestLayer = Layer.mergeAll(
 *   FileSystem.layerNoop({}),
 *   Path.layer,
 *   Stdio.layerTest({}),
 *   Layer.succeed(Terminal.Terminal, Terminal.make({
 *     columns: Effect.succeed(80),
 *     rows: Effect.succeed(24),
 *     readInput: Effect.die("unused"),
 *     readLine: Effect.die("unused"),
 *     display: () => Effect.void
 *   })),
 *   Layer.succeed(
 *     ChildProcessSpawner.ChildProcessSpawner,
 *     ChildProcessSpawner.make(() => Effect.die("unused"))
 *   )
 * )
 *
 * const upperName = Flag.String("name").pipe(
 *   Flag.mapEffect((name) => Effect.succeed(name.toUpperCase()))
 * )
 *
 * const [, value] = await Effect.runPromise(
 *   upperName.parse({
 *     arguments: [],
 *     flags: { name: ["alice"] }
 *   }).pipe(Effect.provide(CliTestLayer))
 * )
 * value // => "ALICE"
 * ```
 *
 * @stability unstable
 * @category mapping
 * @since 4.0.0
 */
export const mapEffect: {
  <A, B>(
    f: (a: A) => Effect.Effect<B, CliError.CliError, Environment>
  ): (self: Flag<A>) => Flag<B>
  <A, B>(
    self: Flag<A>,
    f: (a: A) => Effect.Effect<B, CliError.CliError, Environment>
  ): Flag<B>
} = dual(2, <A, B>(
  self: Flag<A>,
  f: (a: A) => Effect.Effect<B, CliError.CliError, Environment>
) => Param.mapEffect(self, f))

/**
 * Transforms the parsed value using a function that might throw, with error handling.
 *
 * **Example** (Mapping thrown errors)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Flag } from "effect/cli"
 * import { ChildProcessSpawner } from "effect/process"
 *
 * const CliTestLayer = Layer.mergeAll(
 *   FileSystem.layerNoop({}),
 *   Path.layer,
 *   Stdio.layerTest({}),
 *   Layer.succeed(Terminal.Terminal, Terminal.make({
 *     columns: Effect.succeed(80),
 *     rows: Effect.succeed(24),
 *     readInput: Effect.die("unused"),
 *     readLine: Effect.die("unused"),
 *     display: () => Effect.void
 *   })),
 *   Layer.succeed(
 *     ChildProcessSpawner.ChildProcessSpawner,
 *     ChildProcessSpawner.make(() => Effect.die("unused"))
 *   )
 * )
 *
 * // Parse JSON string with error handling
 * const jsonFlag = Flag.String("config").pipe(
 *   Flag.mapTryCatch(
 *     (json) => JSON.parse(json),
 *     (error) => `Invalid JSON: ${error}`
 *   )
 * )
 *
 * // Parse URL with error handling
 * const urlFlag = Flag.String("url").pipe(
 *   Flag.mapTryCatch(
 *     (url) => new URL(url),
 *     (error) => `Invalid URL: ${error}`
 *   )
 * )
 *
 * const [, value] = await Effect.runPromise(
 *   jsonFlag.parse({
 *     arguments: [],
 *     flags: { config: ['{"enabled":true}'] }
 *   }).pipe(Effect.provide(CliTestLayer))
 * )
 * value // => { enabled: true }
 * ```
 *
 * @stability unstable
 * @category mapping
 * @since 4.0.0
 */
export const mapTryCatch: {
  <A, B>(f: (a: A) => B, onError: (error: unknown) => string): (self: Flag<A>) => Flag<B>
  <A, B>(self: Flag<A>, f: (a: A) => B, onError: (error: unknown) => string): Flag<B>
} = dual(3, <A, B>(
  self: Flag<A>,
  f: (a: A) => B,
  onError: (error: unknown) => string
) => Param.mapTryCatch(self, f, onError))

/**
 * Ensures a flag is specified at least a minimum number of times.
 *
 * **Example** (Requiring repeated values)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * const sourceFlag = Flag.atLeast(Flag.File("source"), 2)
 * // Requires at least 2 source files
 * // Usage: --source file1.ts --source file2.ts
 *
 * const tagFlag = Flag.String("tag").pipe(
 *   Flag.atLeast(1)
 * )
 * // Requires at least 1 tag
 * const kinds = [sourceFlag.kind, tagFlag.kind] // => ["flag", "flag"]
 * ```
 *
 * @stability unstable
 * @category repetition
 * @since 4.0.0
 */
export const atLeast: {
  <A>(min: number): (self: Flag<A>) => Flag<ReadonlyArray<A>>
  <A>(self: Flag<A>, min: number): Flag<ReadonlyArray<A>>
} = dual(2, <A>(self: Flag<A>, min: number) => Param.atLeast(self, min))

/**
 * Ensures a flag is specified at most a maximum number of times.
 *
 * **Example** (Limiting repeated values)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * const warningFlag = Flag.atMost(Flag.String("warning"), 3)
 * // Allows up to 3 warning flags
 * // Usage: --warning w1 --warning w2 --warning w3
 *
 * const debugFlag = Flag.String("debug").pipe(
 *   Flag.atMost(1)
 * )
 * // Allows at most 1 debug flag
 * const kinds = [warningFlag.kind, debugFlag.kind] // => ["flag", "flag"]
 * ```
 *
 * @stability unstable
 * @category repetition
 * @since 4.0.0
 */
export const atMost: {
  <A>(max: number): (self: Flag<A>) => Flag<ReadonlyArray<A>>
  <A>(self: Flag<A>, max: number): Flag<ReadonlyArray<A>>
} = dual(2, <A>(self: Flag<A>, max: number) => Param.atMost(self, max))

/**
 * Ensures a flag is specified between a minimum and maximum number of times.
 *
 * **Example** (Bounding repeated values)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * const hostFlag = Flag.between(Flag.String("host"), 1, 3)
 * // Requires 1-3 host flags
 * // Usage: --host host1 --host host2
 *
 * const excludeFlag = Flag.String("exclude").pipe(
 *   Flag.between(0, 5)
 * )
 * // Allows 0-5 exclude patterns
 * const kinds = [hostFlag.kind, excludeFlag.kind] // => ["flag", "flag"]
 * ```
 *
 * @stability unstable
 * @category repetition
 * @since 4.0.0
 */
export const between: {
  <A>(min: number, max: number): (self: Flag<A>) => Flag<ReadonlyArray<A>>
  <A>(self: Flag<A>, min: number, max: number): Flag<ReadonlyArray<A>>
} = dual(3, <A>(self: Flag<A>, min: number, max: number) => Param.between(self, min, max))

/**
 * Transforms and filters a flag value, failing with a custom error if the transformation returns None.
 *
 * **Example** (Filtering and transforming values)
 *
 * ```ts import.meta.vitest
 * import { Option } from "effect"
 * import { Flag } from "effect/cli"
 *
 * // Parse positive integers only
 * const positiveInt = Flag.Int("count").pipe(
 *   Flag.filterMap(
 *     (n) => n > 0 ? Option.some(n) : Option.none(),
 *     (n) => `Expected positive integer, got ${n}`
 *   )
 * )
 *
 * // Parse valid email addresses
 * const emailFlag = Flag.String("email").pipe(
 *   Flag.filterMap(
 *     (email) => email.includes("@") ? Option.some(email) : Option.none(),
 *     (email) => `Invalid email address: ${email}`
 *   )
 * )
 * const kinds = [positiveInt.kind, emailFlag.kind] // => ["flag", "flag"]
 * ```
 *
 * @stability unstable
 * @category filtering
 * @since 4.0.0
 */
export const filterMap: {
  <A, B>(f: (a: A) => Option.Option<B>, onNone: (a: A) => string): (self: Flag<A>) => Flag<B>
  <A, B>(self: Flag<A>, f: (a: A) => Option.Option<B>, onNone: (a: A) => string): Flag<B>
} = dual(3, <A, B>(
  self: Flag<A>,
  f: (a: A) => Option.Option<B>,
  onNone: (a: A) => string
) => Param.filterMap(self, f, onNone))

/**
 * Filters a flag value based on a predicate, failing with a custom error if the predicate returns false.
 *
 * **Example** (Filtering parsed values)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * // Ensure port is in valid range
 * const portFlag = Flag.Int("port").pipe(
 *   Flag.filter(
 *     (port) => port >= 1 && port <= 65535,
 *     (port) => `Port ${port} is out of range (1-65535)`
 *   )
 * )
 *
 * // Ensure non-empty string
 * const nameFlag = Flag.String("name").pipe(
 *   Flag.filter(
 *     (name) => name.trim().length > 0,
 *     () => "Name cannot be empty"
 *   )
 * )
 * const kinds = [portFlag.kind, nameFlag.kind] // => ["flag", "flag"]
 * ```
 *
 * @stability unstable
 * @category filtering
 * @since 4.0.0
 */
export const filter: {
  <A>(predicate: (a: A) => boolean, onFalse: (a: A) => string): (self: Flag<A>) => Flag<A>
  <A>(self: Flag<A>, predicate: (a: A) => boolean, onFalse: (a: A) => string): Flag<A>
} = dual(3, <A>(
  self: Flag<A>,
  predicate: (a: A) => boolean,
  onFalse: (a: A) => string
) => Param.filter(self, predicate, onFalse))

/**
 * Provides an alternative flag if the first one fails to parse.
 *
 * **Example** (Falling back to another flag)
 *
 * ```ts import.meta.vitest
 * import { Flag } from "effect/cli"
 *
 * // Try parsing as integer, fallback to string
 * const valueFlag = Flag.orElse(
 *   Flag.Int("value"),
 *   () => Flag.String("value")
 * )
 *
 * // Multiple input sources with fallback
 * const configFlag = Flag.orElse(
 *   Flag.File("config"),
 *   () => Flag.String("config-url")
 * )
 * const kinds = [valueFlag.kind, configFlag.kind] // => ["flag", "flag"]
 * ```
 *
 * @stability unstable
 * @category alternatives
 * @since 4.0.0
 */
export const orElse: {
  <B>(that: LazyArg<Flag<B>>): <A>(self: Flag<A>) => Flag<A | B>
  <A, B>(self: Flag<A>, that: LazyArg<Flag<B>>): Flag<A | B>
} = dual(2, <A, B>(self: Flag<A>, that: LazyArg<Flag<B>>) => Param.orElse(self, that))

/**
 * Tries to parse with the first flag, then the second, returning a Result that indicates which succeeded.
 *
 * **Example** (Returning fallback results)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Result, Stdio, Terminal } from "effect"
 * import { Flag } from "effect/cli"
 * import { ChildProcessSpawner } from "effect/process"
 *
 * const CliTestLayer = Layer.mergeAll(
 *   FileSystem.layerNoop({}),
 *   Path.layer,
 *   Stdio.layerTest({}),
 *   Layer.succeed(Terminal.Terminal, Terminal.make({
 *     columns: Effect.succeed(80),
 *     rows: Effect.succeed(24),
 *     readInput: Effect.die("unused"),
 *     readLine: Effect.die("unused"),
 *     display: () => Effect.void
 *   })),
 *   Layer.succeed(
 *     ChildProcessSpawner.ChildProcessSpawner,
 *     ChildProcessSpawner.make(() => Effect.die("unused"))
 *   )
 * )
 *
 * const sourceFlag = Flag.orElseResult(
 *   Flag.String("source"),
 *   () => Flag.String("source-url")
 * )
 *
 * const program = Effect.gen(function*() {
 *   const [, source] = yield* sourceFlag.parse({
 *     arguments: [],
 *     flags: { "source-url": ["https://example.com"] }
 *   })
 *   return source
 * })
 *
 * await Effect.runPromise(program.pipe(Effect.provide(CliTestLayer))) // => Result.fail("https://example.com")
 * ```
 *
 * @stability unstable
 * @category alternatives
 * @since 4.0.0
 */
export const orElseResult: {
  <B>(that: LazyArg<Flag<B>>): <A>(self: Flag<A>) => Flag<Result.Result<A, B>>
  <A, B>(self: Flag<A>, that: LazyArg<Flag<B>>): Flag<Result.Result<A, B>>
} = dual(2, <A, B>(self: Flag<A>, that: LazyArg<Flag<B>>) => Param.orElseResult(self, that))

/**
 * Validates and transforms a flag value using a Schema codec.
 *
 * **Example** (Validating with schemas)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Flag } from "effect/cli"
 *
 * const isEmail = Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
 *   message: "Must be a valid email address"
 * })
 *
 * // Parse and validate email with custom schema
 * const EmailSchema = Schema.String.pipe(
 *   Schema.check(isEmail)
 * )
 *
 * const emailFlag = Flag.String("email").pipe(
 *   Flag.withSchema(EmailSchema)
 * )
 *
 * // Parse JSON configuration with schema validation
 * const ConfigSchema = Schema.Struct({
 *   port: Schema.Number,
 *   host: Schema.String,
 *   ssl: Schema.optional(Schema.Boolean)
 * }).pipe(Schema.fromJsonString)
 *
 * const configFlag = Flag.String("config").pipe(
 *   Flag.withSchema(ConfigSchema)
 * )
 * const kinds = [emailFlag.kind, configFlag.kind] // => ["flag", "flag"]
 * ```
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const withSchema: {
  <A, B>(schema: Schema.ConstraintCodec<B, A, Environment, unknown>): (self: Flag<A>) => Flag<B>
  <A, B>(self: Flag<A>, schema: Schema.ConstraintCodec<B, A, Environment, unknown>): Flag<B>
} = dual(
  2,
  <A, B>(self: Flag<A>, schema: Schema.ConstraintCodec<B, A, Environment, unknown>) => Param.withSchema(self, schema)
)
