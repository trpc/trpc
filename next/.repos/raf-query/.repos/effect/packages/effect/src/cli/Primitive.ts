/**
 * Parses raw command-line strings into typed values.
 *
 * A `Primitive<A>` receives one string and returns an `Effect` that either
 * produces an `A` or fails with a parser message. `Argument` and `Flag` build
 * on these primitives to add names, aliases, defaults, prompts, configuration
 * fallbacks, repetition, and help metadata. Primitive parsers cover common
 * scalar values, paths, files, structured config files, schema-decoded input,
 * redacted values, and key-value pairs.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Effect from "../Effect.ts"
import * as Ini from "../encoding/Ini.ts"
import * as Toml from "../encoding/Toml.ts"
import * as Yaml from "../encoding/Yaml.ts"
import * as FileSystem from "../FileSystem.ts"
import { format } from "../Formatter.ts"
import { identity } from "../Function.ts"
import * as Path_ from "../Path.ts"
import * as Redacted_ from "../Redacted.ts"
import * as Schema from "../Schema.ts"
import type { Formatter } from "../SchemaIssue.ts"
import type * as Struct from "../Struct.ts"
import type { Covariant } from "../Types.ts"
import type { Environment } from "./Command.ts"

const TypeId = "~effect/cli/Primitive"

/**
 * Represents a primitive type that can parse string input into a typed value.
 *
 * **Example** (Parsing values with primitives)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Primitive } from "effect/cli"
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
 * const program = Effect.gen(function*() {
 *   const stringResult = yield* Primitive.String.parse("hello")
 *   const numberResult = yield* Primitive.Int.parse("42")
 *   const boolResult = yield* Primitive.Boolean.parse("true")
 *   return [stringResult, numberResult, boolResult] as const
 * })
 *
 * await Effect.runPromise(program.pipe(Effect.provide(CliTestLayer))) // => ["hello", 42, true]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Primitive<out A> extends Primitive.Variance<A> {
  readonly _tag: string
  readonly parse: (value: string) => Effect.Effect<A, string, Environment>
}

/**
 * Namespace containing type-level helpers for `Primitive`.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Primitive {
  /**
   * Type-level variance marker for the value parsed by a `Primitive`.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface Variance<out A> {
    readonly [TypeId]: {
      readonly _A: Covariant<A>
    }
  }
}

const Proto = {
  [TypeId]: {
    _A: identity
  }
}

/**
 * @internal
 */
export const isTrueLiteral = Schema.is(Schema.TrueLiterals)

/**
 * @internal
 */
export const isFalseLiteral = Schema.is(Schema.FalseLiterals)

/**
 * @internal
 */
export const isBoolean = (p: Primitive<unknown>): p is Primitive<boolean> => p._tag === "Boolean"

const makePrimitive = <A>(
  tag: string,
  parse: (value: string) => Effect.Effect<A, string, Environment>
): Primitive<A> =>
  Object.assign(Object.create(Proto), {
    _tag: tag,
    parse
  })

const makeSchemaPrimitive = <T>(
  tag: string,
  schema: Schema.ConstraintDecoder<T, Environment>
): Primitive<T> => {
  const toCodecStringTree = Schema.toCodecStringTree(schema)
  const decode = Schema.decodeUnknownEffect(toCodecStringTree)
  return makePrimitive(tag, (value) => Effect.mapError(decode(value), (error) => error.message))
}

/**
 * Creates a primitive that parses boolean values from string input.
 *
 * **Details**
 *
 * Recognizes various forms of true/false values:
 * - True values: "true", "1", "y", "yes", "on"
 * - False values: "false", "0", "n", "no", "off"
 *
 * **Example** (Parsing boolean values)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Primitive } from "effect/cli"
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
 * const parseBoolean = Effect.all([
 *   Primitive.Boolean.parse("true"),
 *   Primitive.Boolean.parse("yes"),
 *   Primitive.Boolean.parse("false"),
 *   Primitive.Boolean.parse("0")
 * ])
 *
 * await Effect.runPromise(parseBoolean.pipe(Effect.provide(CliTestLayer))) // => [true, true, false, false]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Boolean: Primitive<boolean> = makeSchemaPrimitive(
  "Boolean",
  Schema.BooleanLiterals
)

/**
 * Creates a primitive that parses finite numbers from string input.
 *
 * **Example** (Parsing finite numbers)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Primitive } from "effect/cli"
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
 * const parseFloat = Effect.all([
 *   Primitive.Finite.parse("3.14"),
 *   Primitive.Finite.parse("-42.5"),
 *   Primitive.Finite.parse("0")
 * ])
 *
 * await Effect.runPromise(parseFloat.pipe(Effect.provide(CliTestLayer))) // => [3.14, -42.5, 0]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Finite: Primitive<number> = makeSchemaPrimitive(
  "Finite",
  Schema.Finite
)

/**
 * Creates a primitive that parses integer numbers from string input.
 *
 * **Example** (Parsing integer values)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Primitive } from "effect/cli"
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
 * const parseInteger = Effect.all([
 *   Primitive.Int.parse("42"),
 *   Primitive.Int.parse("-123"),
 *   Primitive.Int.parse("0")
 * ])
 *
 * await Effect.runPromise(parseInteger.pipe(Effect.provide(CliTestLayer))) // => [42, -123, 0]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Int: Primitive<number> = makeSchemaPrimitive(
  "Int",
  Schema.Int
)

/**
 * Creates a primitive that parses Date objects from string input.
 *
 * **Example** (Parsing date values)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Primitive } from "effect/cli"
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
 * const parseDate = Effect.gen(function*() {
 *   const result = yield* Primitive.Date.parse("2023-12-25")
 *   return result.toISOString()
 * })
 *
 * await Effect.runPromise(parseDate.pipe(Effect.provide(CliTestLayer))) // => "2023-12-25T00:00:00.000Z"
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Date: Primitive<globalThis.Date> = makeSchemaPrimitive(
  "Date",
  Schema.Date
)

/**
 * Creates a primitive that accepts any string value without validation.
 *
 * **Example** (Parsing string values)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Primitive } from "effect/cli"
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
 * const parseString = Effect.all([
 *   Primitive.String.parse("hello world"),
 *   Primitive.String.parse(""),
 *   Primitive.String.parse("123")
 * ])
 *
 * await Effect.runPromise(parseString.pipe(Effect.provide(CliTestLayer))) // => ["hello world", "", "123"]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const String: Primitive<string> = makePrimitive("String", (value) => Effect.succeed(value))

/**
 * Creates a primitive that accepts only specific choice values mapped to custom types.
 *
 * **Example** (Parsing choices)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Primitive } from "effect/cli"
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
 * type LogLevel = "debug" | "info" | "warn" | "error"
 *
 * const logLevelPrimitive = Primitive.Choice<LogLevel>([
 *   ["debug", "debug"],
 *   ["info", "info"],
 *   ["warn", "warn"],
 *   ["error", "error"]
 * ])
 *
 * const parseLogLevel = Effect.all([
 *   logLevelPrimitive.parse("info"),
 *   logLevelPrimitive.parse("debug")
 * ])
 *
 * await Effect.runPromise(parseLogLevel.pipe(Effect.provide(CliTestLayer))) // => ["info", "debug"]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Choice = <A>(
  choices: ReadonlyArray<readonly [string, A]>
): Primitive<A> => {
  const choiceMap = new Map(choices)
  const validChoices = choices.map(([key]) => format(key)).join(" | ")
  const primitive = makePrimitive("Choice", (value) => {
    if (choiceMap.has(value)) {
      return Effect.succeed(choiceMap.get(value)!)
    }
    return Effect.fail(validChoices)
  })
  return Object.assign(primitive, { choiceKeys: choices.map(([key]) => key) })
}

/**
 * Specifies the type of path validation to perform.
 *
 * **Example** (Choosing path validation)
 *
 * ```ts import.meta.vitest
 * import { Primitive } from "effect/cli"
 *
 * // Only accept files
 * const filePath = Primitive.Path("file", true)
 *
 * // Only accept directories
 * const dirPath = Primitive.Path("directory", true)
 *
 * // Accept either files or directories
 * const anyPath = Primitive.Path("either", false)
 *
 * const tags = [filePath._tag, dirPath._tag, anyPath._tag] // => ["Path", "Path", "Path"]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type PathType = "file" | "directory" | "either"

/**
 * Creates a primitive that validates and resolves file system paths.
 *
 * **Example** (Parsing file system paths)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Primitive } from "effect/cli"
 * import { ChildProcessSpawner } from "effect/process"
 *
 * const services = Layer.mergeAll(
 *   Path.layer,
 *   FileSystem.layerNoop({
 *     exists: () => Effect.succeed(true),
 *     stat: () => Effect.succeed({ type: "File" } as FileSystem.File.Info)
 *   }),
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
 * const program = Effect.gen(function*() {
 *   const filePrimitive = Primitive.Path("file", true)
 *   const filePath = yield* filePrimitive.parse("./package.json")
 *   return filePath.endsWith("/package.json")
 * }).pipe(Effect.provide(services))
 *
 * await Effect.runPromise(program) // => true
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Path = (
  pathType: PathType,
  mustExist?: boolean
): Primitive<string> => {
  const primitive = makePrimitive(
    "Path",
    Effect.fnUntraced(function*(value) {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path_.Path

      // Resolve the path to absolute
      const absolutePath = path.isAbsolute(value) ? value : path.resolve(value)

      // Check if path exists
      const exists = yield* Effect.mapError(
        fs.exists(absolutePath),
        (error) => `Failed to check path existence: ${error.message}`
      )

      // Validate existence requirements
      if (mustExist === true && !exists) {
        return yield* Effect.fail(`Path does not exist: ${absolutePath}`)
      }

      // Validate path type if it exists
      if (exists && pathType !== "either") {
        const stat = yield* Effect.mapError(
          fs.stat(absolutePath),
          (error) => `Failed to stat path: ${error.message}`
        )

        if (pathType === "file" && stat.type !== "File") {
          return yield* Effect.fail(`Path is not a file: ${absolutePath}`)
        }
        if (pathType === "directory" && stat.type !== "Directory") {
          return yield* Effect.fail(`Path is not a directory: ${absolutePath}`)
        }
      }

      return absolutePath
    })
  )
  return Object.assign(primitive, { pathType })
}

/**
 * Creates a primitive that wraps string input in `Redacted`.
 *
 * **Details**
 *
 * The wrapped value is hidden when formatted or inspected, while the original
 * string remains available through the `Redacted` API when explicitly needed.
 *
 * **Example** (Parsing redacted values)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Redacted, Stdio, Terminal } from "effect"
 * import { Primitive } from "effect/cli"
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
 * const parseRedacted = Effect.gen(function*() {
 *   const result = yield* Primitive.Redacted.parse("secret-password")
 *   return [Redacted.value(result), String(result)] as const
 * })
 *
 * await Effect.runPromise(parseRedacted.pipe(Effect.provide(CliTestLayer))) // => ["secret-password", "<redacted>"]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Redacted: Primitive<Redacted_.Redacted<string>> = makePrimitive(
  "Redacted",
  (value) => Effect.succeed(Redacted_.make(value))
)

/**
 * Creates a primitive that reads and returns the contents of a file as a string.
 *
 * **Example** (Reading file text)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Primitive } from "effect/cli"
 * import { ChildProcessSpawner } from "effect/process"
 *
 * const services = Layer.mergeAll(
 *   Path.layer,
 *   FileSystem.layerNoop({
 *     exists: () => Effect.succeed(true),
 *     stat: () => Effect.succeed({ type: "File" } as FileSystem.File.Info),
 *     readFileString: () => Effect.succeed('{"private":true}')
 *   }),
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
 * const readConfigFile = Effect.gen(function*() {
 *   const content = yield* Primitive.FileText.parse("./package.json")
 *   return JSON.parse(content) as { private: boolean }
 * }).pipe(Effect.provide(services))
 *
 * await Effect.runPromise(readConfigFile) // => { private: true }
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const FileText: Primitive<string> = makePrimitive(
  "FileText",
  Effect.fnUntraced(function*(filePath) {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path_.Path

    // Resolve to absolute path
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(filePath)

    // Check if file exists
    const exists = yield* Effect.mapError(
      fs.exists(absolutePath),
      (error) => `Failed to check file existence: ${error.message}`
    )

    if (!exists) {
      return yield* Effect.fail(`File does not exist: ${absolutePath}`)
    }

    // Check if it's actually a file
    const stat = yield* Effect.mapError(
      fs.stat(absolutePath),
      (error) => `Failed to stat file: ${error.message}`
    )

    if (stat.type !== "File") {
      return yield* Effect.fail(`Path is not a file: ${absolutePath}`)
    }

    // Read file content
    const content = yield* Effect.mapError(
      fs.readFileString(absolutePath),
      (error) => `Failed to read file: ${error.message}`
    )

    return content
  })
)

/**
 * Represents options which can be provided to methods that deal with parsing
 * file content.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export type FileParseOptions = {
  readonly format?: "ini" | "json" | "toml" | "yaml"
}

const fileParsers: Record<string, (content: string) => unknown> = {
  ini: (content: string) => Ini.parse(content),
  json: (content: string) => JSON.parse(content),
  toml: (content: string) => Toml.parse(content),
  yml: (content: string) => Yaml.parse(content),
  yaml: (content: string) => Yaml.parse(content)
}

/**
 * Creates a primitive that reads a file and parses its content as structured
 * data.
 *
 * **Details**
 *
 * The parser is selected from `options.format` when provided, otherwise from
 * the file extension. Supported formats include INI, JSON, TOML, YAML, and YML.
 *
 * **Example** (Parsing file content)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Primitive } from "effect/cli"
 * import { ChildProcessSpawner } from "effect/process"
 *
 * const services = Layer.mergeAll(
 *   Path.layer,
 *   FileSystem.layerNoop({
 *     exists: () => Effect.succeed(true),
 *     stat: () => Effect.succeed({ type: "File" } as FileSystem.File.Info),
 *     readFileString: () => Effect.succeed('{"private":true}')
 *   }),
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
 * const jsonFilePrimitive = Primitive.FileParse({ format: "json" })
 *
 * const loadConfig = Effect.gen(function*() {
 *   const config = yield* jsonFilePrimitive.parse("./package.json")
 *   return config as { private: boolean }
 * }).pipe(Effect.provide(services))
 *
 * await Effect.runPromise(loadConfig) // => { private: true }
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const FileParse = (options?: FileParseOptions): Primitive<unknown> => {
  return makePrimitive(
    "FileParse",
    Effect.fnUntraced(function*(filePath) {
      const fileFormat = options?.format ?? filePath.split(".").pop() as string
      const parser = fileParsers[fileFormat]
      if (parser === undefined) {
        return yield* Effect.fail(`Unsupported file format: ${fileFormat}`)
      }
      const content = yield* FileText.parse(filePath)
      return yield* Effect.try({
        try: () => parser(content),
        catch: (error) => `Failed to parse '.${fileFormat}' file content: ${error}`
      })
    })
  )
}

/**
 * Represents options which can be provided to methods that deal with parsing
 * file content and decoding the file content with a `Schema`.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export type FileSchemaOptions = Struct.Simplify<
  FileParseOptions & {
    readonly errorFormatter?: Formatter<string> | undefined
  }
>

/**
 * Reads and parses file content using the specified schema.
 *
 * **Example** (Parsing file content with a schema)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Schema, Stdio, Terminal } from "effect"
 * import { Primitive } from "effect/cli"
 * import { ChildProcessSpawner } from "effect/process"
 *
 * const services = Layer.mergeAll(
 *   Path.layer,
 *   FileSystem.layerNoop({
 *     exists: () => Effect.succeed(true),
 *     stat: () => Effect.succeed({ type: "File" } as FileSystem.File.Info),
 *     readFileString: () => Effect.succeed('{"private":true}')
 *   }),
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
 * const ConfigSchema = Schema.Struct({
 *   private: Schema.Boolean
 * })
 *
 * const jsonConfigPrimitive = Primitive.FileSchema(ConfigSchema, {
 *   format: "json"
 * })
 *
 * const loadConfig = Effect.gen(function*() {
 *   return yield* jsonConfigPrimitive.parse("./package.json")
 * }).pipe(Effect.provide(services))
 *
 * await Effect.runPromise(loadConfig) // => { private: true }
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const FileSchema = <A>(
  schema: Schema.ConstraintDecoder<A, Environment>,
  options?: FileSchemaOptions | undefined
): Primitive<A> => {
  const decode = Schema.decodeUnknownEffect(schema)
  return makePrimitive(
    "FileSchema",
    Effect.fnUntraced(function*(filePath) {
      const content = yield* FileParse(options).parse(filePath)
      return yield* Effect.mapError(
        decode(content),
        (error) => options?.errorFormatter?.(error.issue) ?? error.toString()
      )
    })
  )
}

/**
 * Parses a single `key=value` pair into a record object.
 *
 * **Details**
 *
 * Splits at the first `=`. Keys and values must be non-empty; values may contain `=`.
 *
 * **Example** (Parsing key-value pairs)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Primitive } from "effect/cli"
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
 * const parseKeyValue = Effect.all([
 *   Primitive.KeyValuePair.parse("name=john"),
 *   Primitive.KeyValuePair.parse("port=3000"),
 *   Primitive.KeyValuePair.parse("debug=true")
 * ])
 *
 * const result = await Effect.runPromise(parseKeyValue.pipe(Effect.provide(CliTestLayer)))
 * result // => [{ name: "john" }, { port: "3000" }, { debug: "true" }]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const KeyValuePair: Primitive<Record<string, string>> = makePrimitive(
  "KeyValuePair",
  Effect.fnUntraced(function*(value) {
    const separator = value.indexOf("=")
    if (separator === -1) {
      return yield* Effect.fail(
        `Invalid key=value format. Expected format: key=value, got: ${value}`
      )
    }
    const key = value.slice(0, separator)
    const val = value.slice(separator + 1)
    if (!key || !val) {
      return yield* Effect.fail(
        `Invalid key=value format. Both key and value must be non-empty. Got: ${value}`
      )
    }
    return { [key]: val }
  })
)

/**
 * A primitive that always fails to parse.
 *
 * **Example** (Rejecting option values)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Primitive } from "effect/cli"
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
 * const program = Effect.gen(function*() {
 *   return yield* Primitive.Never.parse("any-value")
 * })
 *
 * await Effect.runPromise(Effect.flip(program).pipe(Effect.provide(CliTestLayer))) // => "This option does not accept values"
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Never: Primitive<never> = makePrimitive("Never", () => Effect.fail("This option does not accept values"))

/**
 * Gets a human-readable type name for a primitive.
 *
 * **When to use**
 *
 * Use when you need the display type name for a `Primitive`, such as when
 * generating CLI help documentation.
 *
 * **Example** (Getting primitive type names)
 *
 * ```ts import.meta.vitest
 * import { Primitive } from "effect/cli"
 *
 * Primitive.getTypeName(Primitive.String) // => "string"
 * Primitive.getTypeName(Primitive.Int) // => "integer"
 * Primitive.getTypeName(Primitive.Boolean) // => "boolean"
 * Primitive.getTypeName(Primitive.Date) // => "date"
 * Primitive.getTypeName(Primitive.KeyValuePair) // => "key=value"
 *
 * const logLevelChoice = Primitive.Choice([
 *   ["debug", "debug"],
 *   ["info", "info"]
 * ])
 * Primitive.getTypeName(logLevelChoice) // => "choice"
 * ```
 *
 * @stability unstable
 * @category getters
 * @since 4.0.0
 */
export const getTypeName = <A>(primitive: Primitive<A>): string => {
  switch (primitive._tag) {
    case "Boolean":
      return "boolean"
    case "String":
      return "string"
    case "Int":
      return "integer"
    case "Finite":
      return "number"
    case "Date":
      return "date"
    case "Path":
      return "path"
    case "Choice":
      return "choice"
    case "Redacted":
      return "string"
    case "FileText":
      return "file"
    case "FileParse":
      return "file"
    case "FileSchema":
      return "file"
    case "KeyValuePair":
      return "key=value"
    case "Never":
      return "none"
    default:
      return "value"
  }
}

/**
 * @internal
 */
export const getChoiceKeys = (primitive: Primitive<unknown>): ReadonlyArray<string> | undefined =>
  primitive._tag === "Choice" ? (primitive as any).choiceKeys : undefined

/**
 * @internal
 */
export const getPathType = (primitive: Primitive<unknown>): PathType | undefined =>
  primitive._tag === "Path" ? (primitive as any).pathType : undefined
