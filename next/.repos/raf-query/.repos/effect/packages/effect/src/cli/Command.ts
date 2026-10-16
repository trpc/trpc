/**
 * Main building block for defining and running Effect-based command-line
 * applications.
 *
 * A `Command` combines a name, typed flags and positional arguments, optional
 * subcommands, help metadata, and an effectful handler. The module includes
 * builders for command trees and the runners that parse command-line input,
 * handle built-in help and version behavior, render help through `CliOutput`,
 * and execute the selected handler.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { NonEmptyArray, NonEmptyReadonlyArray } from "../Array.ts"
import * as Console from "../Console.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import type * as FileSystem from "../FileSystem.ts"
import { dual } from "../Function.ts"
import type * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import type * as Path from "../Path.ts"
import * as Predicate from "../Predicate.ts"
import type { ChildProcessSpawner } from "../process/ChildProcessSpawner.ts"
import * as References from "../References.ts"
import * as Result from "../Result.ts"
import * as Runtime from "../Runtime.ts"
import * as Stdio from "../Stdio.ts"
import * as Terminal from "../Terminal.ts"
import type { Contravariant, Covariant, NoInfer, Simplify } from "../Types.ts"
import * as CliConfig from "./CliConfig.ts"
import * as CliError from "./CliError.ts"
import * as CliOutput from "./CliOutput.ts"
import * as GlobalFlag from "./GlobalFlag.ts"
import { checkForDuplicateFlags, makeCommand, makeParser, toImpl, TypeId } from "./internal/command.ts"
import { mergeConfig, parseConfig } from "./internal/config.ts"
import { getGlobalFlagsForCommandPath, getGlobalFlagsForCommandTree, getHelpForCommandPath } from "./internal/help.ts"
import * as Lexer from "./internal/lexer.ts"
import * as Parser from "./internal/parser.ts"
import * as Wizard from "./internal/wizard.ts"
import * as Param from "./Param.ts"
import * as Prompt from "./Prompt.ts"

/* ========================================================================== */
/* Public Types                                                               */
/* ========================================================================== */

/**
 * Represents a CLI command with its configuration, handler, and metadata.
 *
 * **Details**
 *
 * Commands are the core building blocks of CLI applications. They define:
 *
 * - The command name and description
 * - Configuration including flags and arguments
 * - Handler function for execution
 * - Optional subcommands for hierarchical structures
 *
 * **Example** (Defining CLI commands)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Argument, Command, Flag } from "effect/cli"
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
 * // Simple command with no configuration
 * const version: Command.Command<"version", {}, {}, never, never> = Command.make(
 *   "version"
 * )
 *
 * // Command with flags and arguments
 * const deploy: Command.Command<
 *   "deploy",
 *   {
 *     readonly env: string
 *     readonly force: boolean
 *     readonly files: ReadonlyArray<string>
 *   },
 *   {},
 *   never,
 *   never
 * > = Command.make("deploy", {
 *   env: Flag.String("env"),
 *   force: Flag.Boolean("force").pipe(Flag.withDefault(false)),
 *   files: Argument.String("files").pipe(Argument.variadic())
 * })
 *
 * // Command with handler
 * const output: Array<string> = []
 * const greet = Command.make("greet", {
 *   name: Flag.String("name")
 * }, (config) => Effect.sync(() => output.push(`Hello, ${config.name}!`)).pipe(Effect.asVoid))
 *
 * await Effect.runPromise(
 *   Command.runWith(greet, { version: "1.0.0" })(["--name", "Alice"]).pipe(Effect.provide(CliTestLayer))
 * )
 * output // => ["Hello, Alice!"]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Command<in out Name extends string, in Input, out ContextInput = {}, out E = never, out R = never>
  extends
    Effect.Effect<
      ContextInput,
      never,
      CommandContext<Name>
    >
{
  readonly [TypeId]: Command.Variance<Input, E, R>

  /**
   * The name of the command.
   */
  readonly name: Name

  /**
   * An optional description of the command.
   */
  readonly description: string | undefined

  /**
   * An optional short description used when listing subcommands.
   */
  readonly shortDescription: string | undefined

  /**
   * An optional alias that can be used as a shorter command name.
   */
  readonly alias: string | undefined

  /**
   * Optional usage examples for the command.
   */
  readonly examples: ReadonlyArray<Command.Example>

  /**
   * The subcommands available under this command.
   */
  readonly subcommands: ReadonlyArray<{
    readonly group: string | undefined
    readonly commands: NonEmptyReadonlyArray<Command.Any>
  }>

  /**
   * Custom annotations associated with this command.
   */
  readonly annotations: Context.Context<never>

  /**
   * Whether this command is omitted from parent help output, shell
   * completions, and unknown-subcommand suggestions. Unlisted commands still
   * parse and execute normally when invoked by exact name.
   */
  readonly unlisted: boolean
}

/**
 * Companion namespace containing type-level helpers and configuration shapes
 * used by `Command`.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Command {
  /**
   * Type-level variance marker for `Command`.
   *
   * **Details**
   *
   * The parsed input type is contravariant, while the command error and service
   * requirement types are covariant.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface Variance<in Input, out E, out R> {
    readonly Input: Contravariant<Input>
    readonly E: Covariant<E>
    readonly R: Covariant<R>
  }

  /**
   * Represents a concrete usage example for a command.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface Example {
    readonly command: string
    readonly description?: string | undefined
  }

  /**
   * Configuration object for defining command flags, arguments, and nested structures.
   *
   * **Details**
   *
   * `Command.Config` can contain individual flags and arguments using `Param`
   * types, nested configuration objects for organization, and arrays of
   * parameters for repeated elements.
   *
   * **Example** (Configuring command input)
   *
   * ```ts import.meta.vitest
   * import { Argument, Flag } from "effect/cli"
   * import type { Command as CliCommand } from "effect/cli"
   *
   * // Simple flat configuration
   * const simpleConfig = {
   *   name: Flag.String("name"),
   *   age: Flag.Int("age"),
   *   file: Argument.String("file")
   * } satisfies CliCommand.Command.Config
   *
   * // Nested configuration for organization
   * const nestedConfig = {
   *   user: {
   *     name: Flag.String("name"),
   *     email: Flag.String("email")
   *   },
   *   server: {
   *     host: Flag.String("host"),
   *     port: Flag.Int("port")
   *   }
   * } satisfies CliCommand.Command.Config
   *
   * [simpleConfig.name.kind, nestedConfig.server.port.kind] // => ["flag", "flag"]
   * ```
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface Config {
    readonly [key: string]:
      | Param.Param<Param.ParamKind, any>
      | ReadonlyArray<Param.Param<Param.ParamKind, any> | Config>
      | Config
  }

  /**
   * Configuration shape accepted by `Command.withSharedFlags`.
   *
   * **Details**
   *
   * Only flags are allowed here; arguments are intentionally excluded.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface FlagConfig {
    readonly [key: string]:
      | Param.Param<typeof Param.flagKind, any>
      | ReadonlyArray<Param.Param<typeof Param.flagKind, any> | FlagConfig>
      | FlagConfig
  }

  /**
   * Utilities for working with command configurations.
   *
   * @stability unstable
   * @since 4.0.0
   */
  export namespace Config {
    /**
     * Infers the TypeScript type from a Command.Config structure.
     *
     * **Details**
     *
     * This type utility extracts the final configuration type that handlers will receive,
     * preserving the nested structure while converting Param types to their values.
     *
     * **Example** (Inferring command input)
     *
     * ```ts import.meta.vitest
     * import { Flag } from "effect/cli"
     * import type { Command as CliCommand } from "effect/cli"
     *
     * const config = {
     *   name: Flag.String("name"),
     *   server: {
     *     host: Flag.String("host"),
     *     port: Flag.Int("port")
     *   }
     * } as const
     *
     * type Result = CliCommand.Command.Config.Infer<typeof config>
     * // {
     * //   readonly name: string
     * //   readonly server: {
     * //     readonly host: string
     * //     readonly port: number
     * //   }
     * // }
     *
     * const inferred: Result = {
     *   name: "Alice",
     *   server: { host: "localhost", port: 8080 }
     * }
     * inferred // => { name: "Alice", server: { host: "localhost", port: 8080 } }
     * ```
     *
     * @stability unstable
     * @category models
     * @since 4.0.0
     */
    export type Infer<A extends Config> = Simplify<
      { readonly [Key in keyof A]: InferValue<A[Key]> }
    >

    /**
     * Helper type utility for recursively inferring types from Config values.
     *
     * @stability unstable
     * @category models
     * @since 4.0.0
     */
    export type InferValue<A> = A extends ReadonlyArray<any> ? { readonly [Key in keyof A]: InferValue<A[Key]> }
      : A extends Param.Param<infer _Kind, infer _Value> ? _Value
      : A extends Config ? Infer<A>
      : never
  }

  /**
   * Represents any Command regardless of its type parameters.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface Any extends Effect.Effect<any, never, any> {
    readonly [TypeId]: any
    readonly name: string
    readonly description: string | undefined
    readonly shortDescription: string | undefined
    readonly alias: string | undefined
    readonly examples: ReadonlyArray<Command.Example>
    readonly subcommands: ReadonlyArray<{
      readonly group: string | undefined
      readonly commands: NonEmptyReadonlyArray<Command.Any>
    }>
    readonly annotations: Context.Context<never>
    readonly unlisted: boolean
  }

  /**
   * A grouped set of subcommands used by `Command.withSubcommands`.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface SubcommandGroup<Commands extends ReadonlyArray<Any> = ReadonlyArray<Any>> {
    readonly group: string
    readonly commands: Commands
  }

  /**
   * Entry type accepted by `Command.withSubcommands`.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type SubcommandEntry = Any | SubcommandGroup<ReadonlyArray<Any>>
}

/**
 * Services required by CLI parsing and execution.
 *
 * **Details**
 *
 * This includes file-system and path services for arguments, terminal and
 * stdio services for running commands, and child-process spawning for
 * process-related CLI features.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Environment = FileSystem.FileSystem | Path.Path | Terminal.Terminal | ChildProcessSpawner | Stdio.Stdio

/**
 * A utility type to extract the error type from a `Command`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Error<C> = C extends Command<
  infer _Name,
  infer _Input,
  infer _ContextInput,
  infer _Error,
  infer _Requirements
> ? _Error :
  never

/**
 * A utility type to extract the required services type from a `Command`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Services<C> = C extends Command<
  infer _Name,
  infer _Input,
  infer _ContextInput,
  infer _Error,
  infer _Requirements
> ? _Requirements :
  never

/**
 * Service context for a specific command, enabling subcommands to access their parent's parsed configuration.
 *
 * **Details**
 *
 * When a subcommand handler needs access to flags or arguments from a parent command,
 * it can yield the parent command directly to retrieve its config. This is powered by
 * Effect's service system - each command automatically creates a service that provides
 * its parsed input to child commands.
 *
 * **Example** (Accessing parent command context)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Command, Flag } from "effect/cli"
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
 * const parent = Command.make("app").pipe(
 *   Command.withSharedFlags({
 *     verbose: Flag.Boolean("verbose").pipe(Flag.withDefault(false)),
 *     config: Flag.String("config")
 *   })
 * )
 *
 * const output: Array<string> = []
 * const child = Command.make("deploy", {
 *   target: Flag.String("target")
 * }, (config) =>
 *   Effect.gen(function*() {
 *     // Access parent's config by yielding the parent command
 *     const parentConfig = yield* parent
 *     yield* Effect.sync(() => output.push(`Verbose: ${parentConfig.verbose}`))
 *     yield* Effect.sync(() => output.push(`Config: ${parentConfig.config}`))
 *     yield* Effect.sync(() => output.push(`Target: ${config.target}`))
 *   }))
 *
 * const app = parent.pipe(Command.withSubcommands([child]))
 *
 * await Effect.runPromise(
 *   Command.runWith(app, { version: "1.0.0" })([
 *     "--verbose",
 *     "--config",
 *     "prod.json",
 *     "deploy",
 *     "--target",
 *     "staging"
 *   ]).pipe(Effect.provide(CliTestLayer))
 * )
 * output // => ["Verbose: true", "Config: prod.json", "Target: staging"]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface CommandContext<Name extends string> {
  readonly _: unique symbol
  readonly name: Name
}

/**
 * Represents the parsed tokens from command-line input before validation.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ParsedTokens {
  readonly flags: Record<string, ReadonlyArray<string>>
  readonly arguments: ReadonlyArray<string>
  readonly errors?: ReadonlyArray<CliError.NonShowHelpErrors>
  readonly subcommand: Option.Option<{
    readonly name: string
    readonly parsedInput: ParsedTokens
  }>
}

/**
 * Returns `true` if the provided value is a `Command`.
 *
 * **Gotchas**
 *
 * This checks for the `Command` type-id property; it does not validate the full
 * command shape.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isCommand = (u: unknown): u is Command.Any => Predicate.hasProperty(u, TypeId)

/* ========================================================================== */
/* Constructors                                                               */
/* ========================================================================== */

/**
 * Creates a `Command` from a name, an optional configuration, and an optional
 * handler.
 *
 * **Details**
 *
 * Use `withDescription` and related metadata combinators to add help text. The
 * overloads support simple commands, configured commands, and commands with
 * effectful handlers.
 *
 * **Example** (Creating commands)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Argument, Command, Flag } from "effect/cli"
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
 * // Simple command with no configuration
 * const version = Command.make("version")
 *
 * // Command with simple flags
 * const greet = Command.make("greet", {
 *   name: Flag.String("name"),
 *   count: Flag.Int("count").pipe(Flag.withDefault(1))
 * })
 *
 * // Command with nested configuration
 * const deploy = Command.make("deploy", {
 *   environment: Flag.String("env").pipe(
 *     Flag.withDescription("Target environment")
 *   ),
 *   server: {
 *     host: Flag.String("host").pipe(Flag.withDefault("localhost")),
 *     port: Flag.Int("port").pipe(Flag.withDefault(3000))
 *   },
 *   files: Argument.String("files").pipe(Argument.variadic),
 *   force: Flag.Boolean("force").pipe(
 *     Flag.withDescription("Force deployment"),
 *     Flag.withDefault(false)
 *   )
 * })
 *
 * // Command with handler
 * const output: Array<string> = []
 * const deployWithHandler = Command.make("deploy", {
 *   environment: Flag.String("env"),
 *   force: Flag.Boolean("force").pipe(Flag.withDefault(false))
 * }, (config) =>
 *   Effect.gen(function*() {
 *     yield* Effect.sync(() => output.push(`Starting deployment to ${config.environment}`))
 *
 *     if (!config.force && config.environment === "production") {
 *       return yield* Effect.fail("Production deployments require --force flag")
 *     }
 *
 *     yield* Effect.sync(() => output.push("Deployment completed successfully"))
 *   }))
 *
 * await Effect.runPromise(
 *   Command.runWith(deployWithHandler, { version: "1.0.0" })([
 *     "--env",
 *     "staging",
 *     "--force"
 *   ]).pipe(Effect.provide(CliTestLayer))
 * )
 * output // => ["Starting deployment to staging", "Deployment completed successfully"]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make: {
  <Name extends string>(name: Name): Command<Name, {}, {}, never, never>

  <Name extends string, const Config extends Command.Config>(
    name: Name,
    config: Config
  ): Command<Name, Command.Config.Infer<Config>, {}, never, never>

  <Name extends string, const Config extends Command.Config, R, E>(
    name: Name,
    config: Config,
    handler: (config: Command.Config.Infer<Config>) => Effect.Effect<void, E, R>
  ): Command<Name, Command.Config.Infer<Config>, {}, E, Exclude<R, BuiltInSettingContext>>
} = ((
  name: string,
  config?: Command.Config,
  handler?: (config: unknown) => Effect.Effect<void, unknown, unknown>
) => {
  const parsedConfig = parseConfig(config ?? {})
  return makeCommand({
    name,
    config: parsedConfig,
    ...(Predicate.isNotUndefined(handler) ? { handle: handler } : {})
  })
}) as any

/* ========================================================================== */
/* Combinators                                                                */
/* ========================================================================== */

/**
 * Adds or replaces the handler for a command.
 *
 * **Example** (Adding command handlers)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Command, Flag } from "effect/cli"
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
 * // Command without initial handler
 * const greet = Command.make("greet", {
 *   name: Flag.String("name")
 * })
 *
 * // Add handler later
 * const output: Array<string> = []
 * const greetWithHandler = greet.pipe(
 *   Command.withHandler((config: { readonly name: string }) =>
 *     Effect.sync(() => output.push(`Hello, ${config.name}!`)).pipe(Effect.asVoid)
 *   )
 * )
 *
 * await Effect.runPromise(
 *   Command.runWith(greetWithHandler, { version: "1.0.0" })(["--name", "Alice"]).pipe(
 *     Effect.provide(CliTestLayer)
 *   )
 * )
 * output // => ["Hello, Alice!"]
 * ```
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const withHandler: {
  <A, R, E>(
    handler: (value: A) => Effect.Effect<void, E, R>
  ): <Name extends string, XR, XE, ContextInput>(
    self: Command<Name, A, ContextInput, XE, XR>
  ) => Command<Name, A, ContextInput, E, Exclude<R, BuiltInSettingContext>>
  <Name extends string, A, XR, XE, R, E, ContextInput>(
    self: Command<Name, A, ContextInput, XE, XR>,
    handler: (value: A) => Effect.Effect<void, E, R>
  ): Command<Name, A, ContextInput, E, Exclude<R, BuiltInSettingContext>>
} = dual(2, <Name extends string, A, XR, XE, R, E, ContextInput>(
  self: Command<Name, A, ContextInput, XE, XR>,
  handler: (value: A) => Effect.Effect<void, E, R>
): Command<Name, A, ContextInput, E, Exclude<R, BuiltInSettingContext>> =>
  makeCommand({ ...toImpl(self), handle: handler } as any))

interface SubcommandGroupInternal {
  readonly group: string | undefined
  readonly commands: NonEmptyReadonlyArray<Command.Any>
}

const normalizeSubcommandEntries = (
  entries: ReadonlyArray<Command.SubcommandEntry>
): {
  readonly flat: ReadonlyArray<Command.Any>
  readonly groups: ReadonlyArray<SubcommandGroupInternal>
} => {
  const flat: Array<Command.Any> = []
  const grouped = new Map<string | undefined, NonEmptyArray<Command.Any>>()

  const addToGroup = (group: string | undefined, command: Command.Any): void => {
    flat.push(command)
    const existing = grouped.get(group)
    if (existing) {
      existing.push(command)
    } else {
      grouped.set(group, [command])
    }
  }

  for (const entry of entries) {
    if (isCommand(entry)) {
      addToGroup(undefined, entry)
      continue
    }
    for (const command of entry.commands) {
      addToGroup(entry.group, command)
    }
  }

  const groups: Array<SubcommandGroupInternal> = []
  const ungroupedCommands = grouped.get(undefined)

  if (ungroupedCommands && ungroupedCommands.length > 0) {
    groups.push({ group: undefined, commands: ungroupedCommands })
  }

  for (const [group, commands] of grouped) {
    if (group === undefined) {
      continue
    }
    groups.push({ group, commands })
  }

  return { flat, groups }
}

/**
 * Adds subcommands to a command, creating a hierarchical command structure.
 *
 * **Details**
 *
 * Subcommands can access their parent's parsed configuration by yielding the parent
 * command within their handler. This enables shared parent flags that affect
 * all subcommands.
 *
 * **Example** (Adding subcommands)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Command, Flag } from "effect/cli"
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
 * // Parent command with shared flags
 * const git = Command.make("git").pipe(
 *   Command.withSharedFlags({
 *     verbose: Flag.Boolean("verbose").pipe(Flag.withDefault(false))
 *   })
 * )
 *
 * // Subcommand that accesses parent config
 * const output: Array<string> = []
 * const clone = Command.make("clone", {
 *   repository: Flag.String("repo")
 * }, (config) =>
 *   Effect.gen(function*() {
 *     const parent = yield* git // Access parent's parsed config
 *     if (parent.verbose) {
 *       yield* Effect.sync(() => output.push("Verbose mode enabled"))
 *     }
 *     yield* Effect.sync(() => output.push(`Cloning ${config.repository}`))
 *   }))
 *
 * const app = git.pipe(Command.withSubcommands([clone]))
 *
 * await Effect.runPromise(
 *   Command.runWith(app, { version: "1.0.0" })([
 *     "--verbose",
 *     "clone",
 *     "--repo",
 *     "github.com/foo/bar"
 *   ]).pipe(Effect.provide(CliTestLayer))
 * )
 * output // => ["Verbose mode enabled", "Cloning github.com/foo/bar"]
 * ```
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const withSubcommands: {
  <const Subcommands extends ReadonlyArray<Command.SubcommandEntry>>(
    subcommands: Subcommands
  ): <Name extends string, Input, E, R, ContextInput>(
    self: Command<Name, Input, ContextInput, E, R>
  ) => Command<
    Name,
    Simplify<Input | ContextInput>,
    ContextInput,
    E | ExtractSubcommandErrors<Subcommands>,
    R | Exclude<ExtractSubcommandContext<Subcommands>, CommandContext<Name>>
  >
  <
    Name extends string,
    Input,
    E,
    R,
    ContextInput,
    const Subcommands extends ReadonlyArray<Command.SubcommandEntry>
  >(
    self: Command<Name, Input, ContextInput, E, R>,
    subcommands: Subcommands
  ): Command<
    Name,
    Simplify<Input | ContextInput>,
    ContextInput,
    E | ExtractSubcommandErrors<Subcommands>,
    R | Exclude<ExtractSubcommandContext<Subcommands>, CommandContext<Name>>
  >
} = dual(2, <
  Name extends string,
  Input,
  E,
  R,
  ContextInput,
  const Subcommands extends ReadonlyArray<Command.SubcommandEntry>
>(
  self: Command<Name, Input, ContextInput, E, R>,
  subcommands: Subcommands
): Command<
  Name,
  Simplify<Input | ContextInput>,
  ContextInput,
  E | ExtractSubcommandErrors<Subcommands>,
  R | Exclude<ExtractSubcommandContext<Subcommands>, CommandContext<Name>>
> => {
  const normalized = normalizeSubcommandEntries(subcommands)
  checkForDuplicateFlags(self, normalized.flat)

  const impl = toImpl(self)
  const byName = new Map(normalized.flat.map((s) => [s.name, toImpl(s as any)] as const))

  type NextInput = Simplify<Input | ContextInput>
  const SubcommandStateSymbol = Symbol("effect/cli/SubcommandState")
  type SubcommandState = { readonly name: string; readonly result: unknown }
  type InternalInput = NextInput & { readonly [SubcommandStateSymbol]?: SubcommandState }

  const parse = Effect.fnUntraced(function*(raw: ParsedTokens) {
    if (Option.isNone(raw.subcommand)) {
      return (yield* impl.parse(raw)) as NextInput
    }

    const sub = byName.get(raw.subcommand.value.name)
    if (!sub) {
      return (yield* impl.parse(raw)) as NextInput
    }

    const context = yield* impl.parseContext(raw)
    const result = yield* sub.parse(raw.subcommand.value.parsedInput)
    return { ...context, [SubcommandStateSymbol]: { name: sub.name, result } } as NextInput
  })

  const handle = Effect.fnUntraced(function*(input: NextInput, path: ReadonlyArray<string>) {
    const internal = input as InternalInput
    const selectedSubcommand = internal[SubcommandStateSymbol]

    if (selectedSubcommand) {
      const child = byName.get(selectedSubcommand.name)
      if (!child) {
        return yield* new CliError.ShowHelp({ commandPath: path, errors: [] })
      }
      return yield* child
        .handle(selectedSubcommand.result, [...path, child.name])
        .pipe(Effect.provideService(impl.service, input as unknown as ContextInput))
    }
    return yield* impl.handle(input as Input, path)
  })

  return makeCommand({
    name: impl.name,
    config: impl.config,
    contextConfig: impl.contextConfig,
    description: impl.description,
    shortDescription: impl.shortDescription,
    alias: impl.alias,
    unlisted: impl.unlisted,
    annotations: impl.annotations,
    globalFlags: impl.globalFlags,
    examples: impl.examples,
    service: impl.service,
    subcommands: normalized.groups,
    parse,
    parseContext: impl.parseContext,
    handle
  }) as any
})

/**
 * Adds flags that are inherited by subcommands.
 *
 * **Details**
 *
 * Shared flags are available to this command's handler and to descendant
 * handlers via `yield* parentCommand`. Shared flags are accepted both before
 * and after a selected subcommand name (npm-style).
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const withSharedFlags: {
  <const SharedFlags extends Command.FlagConfig>(
    sharedFlags: SharedFlags
  ): <Name extends string, Input, E, R, ContextInput>(
    self: Command<Name, Input, ContextInput, E, R>
  ) => Command<
    Name,
    Simplify<Input & Command.Config.Infer<SharedFlags>>,
    Simplify<ContextInput & Command.Config.Infer<SharedFlags>>,
    E,
    R
  >
  <Name extends string, Input, E, R, ContextInput, const SharedFlags extends Command.FlagConfig>(
    self: Command<Name, Input, ContextInput, E, R>,
    sharedFlags: SharedFlags
  ): Command<
    Name,
    Simplify<Input & Command.Config.Infer<SharedFlags>>,
    Simplify<ContextInput & Command.Config.Infer<SharedFlags>>,
    E,
    R
  >
} = dual(
  2,
  <Name extends string, Input, E, R, ContextInput, const SharedFlags extends Command.FlagConfig>(
    self: Command<Name, Input, ContextInput, E, R>,
    sharedFlags: SharedFlags
  ): Command<
    Name,
    Simplify<Input & Command.Config.Infer<SharedFlags>>,
    Simplify<ContextInput & Command.Config.Infer<SharedFlags>>,
    E,
    R
  > => {
    const impl = toImpl(self)
    const sharedConfig = parseConfig(sharedFlags)
    const mergedConfig = mergeConfig(impl.config, sharedConfig)
    const mergedContextConfig = mergeConfig(impl.contextConfig, sharedConfig)

    if (impl.subcommands.length > 0) {
      const flatSubcommands = impl.subcommands.flatMap((group) => group.commands)
      checkForDuplicateFlags(self, flatSubcommands, { contextConfig: mergedContextConfig })
    }

    type SharedInput = Command.Config.Infer<SharedFlags>
    type NextInput = Simplify<Input & SharedInput>
    type NextContextInput = Simplify<ContextInput & SharedInput>

    const parseShared = makeParser(sharedConfig, { allowLeftovers: true }) as (
      input: ParsedTokens
    ) => Effect.Effect<SharedInput, CliError.CliError, Environment>

    const parse = Effect.fnUntraced(function*(raw: ParsedTokens) {
      const base = yield* impl.parse(raw)
      const shared = yield* parseShared(raw)
      return { ...(base as object), ...(shared as object) } as NextInput
    })

    const parseContext = Effect.fnUntraced(function*(raw: ParsedTokens) {
      const base = yield* impl.parseContext(raw)
      const shared = yield* parseShared(raw)
      return { ...(base as object), ...(shared as object) } as NextContextInput
    })

    const handle = (
      input: NextInput,
      commandPath: ReadonlyArray<string>
    ) => impl.handle(input as Input, commandPath)

    return makeCommand({
      name: impl.name,
      config: mergedConfig,
      contextConfig: mergedContextConfig,
      description: impl.description,
      shortDescription: impl.shortDescription,
      alias: impl.alias,
      unlisted: impl.unlisted,
      annotations: impl.annotations,
      globalFlags: impl.globalFlags,
      examples: impl.examples,
      service: impl.service as Context.Key<CommandContext<Name>, NextContextInput>,
      subcommands: impl.subcommands,
      parse,
      parseContext,
      handle
    }) as any
  }
)

/**
 * Adds global flags to a command scope.
 *
 * **Details**
 *
 * Declared global flags apply to the command and all of its descendants.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const withGlobalFlags: {
  <const GlobalFlags extends ReadonlyArray<GlobalFlag.GlobalFlag<any>>>(
    globalFlags: GlobalFlags
  ): <Name extends string, Input, E, R, ContextInput>(
    self: Command<Name, Input, ContextInput, E, R>
  ) => Command<Name, Input, ContextInput, E, Exclude<R, ExtractGlobalFlagContext<GlobalFlags>>>
  <
    Name extends string,
    Input,
    E,
    R,
    ContextInput,
    const GlobalFlags extends ReadonlyArray<GlobalFlag.GlobalFlag<any>>
  >(
    self: Command<Name, Input, ContextInput, E, R>,
    globalFlags: GlobalFlags
  ): Command<Name, Input, ContextInput, E, Exclude<R, ExtractGlobalFlagContext<GlobalFlags>>>
} = dual(
  2,
  <
    Name extends string,
    Input,
    E,
    R,
    ContextInput,
    const GlobalFlags extends ReadonlyArray<GlobalFlag.GlobalFlag<any>>
  >(
    self: Command<Name, Input, ContextInput, E, R>,
    globalFlags: GlobalFlags
  ): Command<Name, Input, ContextInput, E, Exclude<R, ExtractGlobalFlagContext<GlobalFlags>>> => {
    const impl = toImpl(self)
    const next = Array.from(new Set([...impl.globalFlags, ...globalFlags]))
    return makeCommand({ ...impl, globalFlags: next }) as any
  }
)

// Type extractors for subcommand arrays - T[number] gives union of all elements
type ExtractGlobalFlagContext<T extends ReadonlyArray<GlobalFlag.GlobalFlag<any>>> = T[number] extends infer F
  ? F extends GlobalFlag.Setting<infer Id, infer _A> ? GlobalFlag.Setting.Identifier<Id>
  : never
  : never
type BuiltInSettingContext = ExtractGlobalFlagContext<typeof GlobalFlag.BuiltIns>
type ExtractSubcommand<T> = T extends Command<infer _Name, infer _Input, infer _CI, infer _E, infer _R> ? T
  : T extends Command.SubcommandGroup<infer Commands> ? Commands[number]
  : never
type ExtractSubcommandErrors<T extends ReadonlyArray<Command.SubcommandEntry>> = Error<ExtractSubcommand<T[number]>>
type ExtractSubcommandContext<T extends ReadonlyArray<Command.SubcommandEntry>> = Services<ExtractSubcommand<T[number]>>

/**
 * Sets the description for a command.
 *
 * **Details**
 *
 * Descriptions provide users with information about what the command does
 * when they view help documentation.
 *
 * **Example** (Setting descriptions)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Command, Flag } from "effect/cli"
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
 * const output: Array<string> = []
 * const deploy = Command.make("deploy", {
 *   environment: Flag.String("env")
 * }, (config) =>
 *   Effect.gen(function*() {
 *     yield* Effect.sync(() => output.push(`Deploying to ${config.environment}`))
 *   })).pipe(
 *     Command.withDescription("Deploy the application to a specified environment")
 *   )
 *
 * await Effect.runPromise(
 *   Command.runWith(deploy, { version: "1.0.0" })(["--env", "staging"]).pipe(Effect.provide(CliTestLayer))
 * )
 * output // => ["Deploying to staging"]
 * ```
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const withDescription: {
  (description: string): <const Name extends string, Input, E, R, ContextInput>(
    self: Command<Name, Input, ContextInput, E, R>
  ) => Command<Name, Input, ContextInput, E, R>
  <const Name extends string, Input, E, R, ContextInput>(
    self: Command<Name, Input, ContextInput, E, R>,
    description: string
  ): Command<Name, Input, ContextInput, E, R>
} = dual(2, <const Name extends string, Input, E, R, ContextInput>(
  self: Command<Name, Input, ContextInput, E, R>,
  description: string
) => makeCommand({ ...toImpl(self), description }))

/**
 * Sets a short description for a command.
 *
 * **Details**
 *
 * Short descriptions are used when listing subcommands in help output and
 * shell completions. If no short description is provided, the full
 * `description` is used as a fallback.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const withShortDescription: {
  (shortDescription: string): <const Name extends string, Input, E, R, ContextInput>(
    self: Command<Name, Input, ContextInput, E, R>
  ) => Command<Name, Input, ContextInput, E, R>
  <const Name extends string, Input, E, R, ContextInput>(
    self: Command<Name, Input, ContextInput, E, R>,
    shortDescription: string
  ): Command<Name, Input, ContextInput, E, R>
} = dual(2, <const Name extends string, Input, E, R, ContextInput>(
  self: Command<Name, Input, ContextInput, E, R>,
  shortDescription: string
) => makeCommand({ ...toImpl(self), shortDescription }))

/**
 * Sets an alias for a command.
 *
 * **Details**
 *
 * Aliases are accepted as alternate subcommand names during parsing and are
 * shown in help output as `name, alias`.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const withAlias: {
  (alias: string): <const Name extends string, Input, E, R, ContextInput>(
    self: Command<Name, Input, ContextInput, E, R>
  ) => Command<Name, Input, ContextInput, E, R>
  <const Name extends string, Input, E, R, ContextInput>(
    self: Command<Name, Input, ContextInput, E, R>,
    alias: string
  ): Command<Name, Input, ContextInput, E, R>
} = dual(2, <const Name extends string, Input, E, R, ContextInput>(
  self: Command<Name, Input, ContextInput, E, R>,
  alias: string
) => makeCommand({ ...toImpl(self), alias }))

/**
 * Omits a subcommand from parent help output, shell completions, and
 * "did you mean?" suggestions while keeping it fully invocable by exact name.
 *
 * **When to use**
 *
 * Use when experimental or internal subcommands should be accepted but not advertised on
 * the public CLI surface.
 *
 * **Example** (Unlisting a subcommand)
 *
 * ```ts import.meta.vitest
 * import { Command } from "effect/cli"
 *
 * // `experimental` still runs when invoked as `mycli experimental`,
 * // but it does not appear under SUBCOMMANDS in `mycli --help`.
 * const experimental = Command.make("experimental").pipe(
 *   Command.unlisted
 * )
 *
 * const root = Command.make("mycli").pipe(
 *   Command.withSubcommands([experimental])
 * )
 *
 * root.subcommands[0].commands[0].unlisted // => true
 * ```
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const unlisted = <const Name extends string, Input, E, R, ContextInput>(
  self: Command<Name, Input, ContextInput, E, R>
): Command<Name, Input, ContextInput, E, R> =>
  makeCommand({ ...toImpl(self), unlisted: true }) as Command<Name, Input, ContextInput, E, R>

/**
 * Adds a custom annotation to a command.
 *
 * **When to use**
 *
 * Use to attach one command-scoped metadata value under a `Context.Key`,
 * especially for consumers such as custom help formatters.
 *
 * **Details**
 *
 * Annotations are stored on the command's annotation context and flow into
 * generated help document annotations.
 *
 * **Gotchas**
 *
 * Adding the same `Context.Key` again replaces the earlier value.
 *
 * @see {@link annotateMerge} for merging an existing annotation context
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const annotate: {
  <I, S>(
    service: Context.Key<I, S>,
    value: NoInfer<S>
  ): <Name extends string, Input, E, R, ContextInput>(
    self: Command<Name, Input, ContextInput, E, R>
  ) => Command<Name, Input, ContextInput, E, R>
  <Name extends string, Input, E, R, ContextInput, I, S>(
    self: Command<Name, Input, ContextInput, E, R>,
    service: Context.Key<I, S>,
    value: NoInfer<S>
  ): Command<Name, Input, ContextInput, E, R>
} = dual(3, <Name extends string, Input, E, R, ContextInput, I, S>(
  self: Command<Name, Input, ContextInput, E, R>,
  service: Context.Key<I, S>,
  value: NoInfer<S>
) => {
  const impl = toImpl(self)
  return makeCommand({ ...impl, annotations: Context.add(impl.annotations, service, value) })
})

/**
 * Merges a Context of annotations into a command.
 *
 * **When to use**
 *
 * Use when you need to attach an already-built `Context.Context` of command
 * annotations.
 *
 * **Details**
 *
 * Merged annotations are stored on the command and exposed through generated
 * help document annotations.
 *
 * **Gotchas**
 *
 * If both contexts contain the same `Context.Key`, the incoming annotations
 * context wins.
 *
 * @see {@link annotate} for adding a single annotation without constructing a `Context`
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const annotateMerge: {
  <I>(
    annotations: Context.Context<I>
  ): <Name extends string, Input, E, R, ContextInput>(
    self: Command<Name, Input, ContextInput, E, R>
  ) => Command<Name, Input, ContextInput, E, R>
  <Name extends string, Input, E, R, ContextInput, I>(
    self: Command<Name, Input, ContextInput, E, R>,
    annotations: Context.Context<I>
  ): Command<Name, Input, ContextInput, E, R>
} = dual(2, <Name extends string, Input, E, R, ContextInput, I>(
  self: Command<Name, Input, ContextInput, E, R>,
  annotations: Context.Context<I>
) => {
  const impl = toImpl(self)
  return makeCommand({ ...impl, annotations: Context.merge(impl.annotations, annotations) })
})

/**
 * Sets usage examples for a command.
 *
 * **Details**
 *
 * Examples are exposed in structured `HelpDoc` data and rendered by the
 * default formatter in an `EXAMPLES` section.
 *
 * **Example** (Adding usage examples)
 *
 * ```ts import.meta.vitest
 * import { Command } from "effect/cli"
 *
 * const login = Command.make("login").pipe(
 *   Command.withExamples([
 *     { command: "myapp login", description: "Log in with browser OAuth" },
 *     { command: "myapp login --token sbp_abc123", description: "Log in with a token" }
 *   ])
 * )
 *
 * login.examples.map((example) => example.command) // => ["myapp login", "myapp login --token sbp_abc123"]
 * ```
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const withExamples: {
  (examples: ReadonlyArray<Command.Example>): <const Name extends string, Input, E, R, ContextInput>(
    self: Command<Name, Input, ContextInput, E, R>
  ) => Command<Name, Input, ContextInput, E, R>
  <const Name extends string, Input, E, R, ContextInput>(
    self: Command<Name, Input, ContextInput, E, R>,
    examples: ReadonlyArray<Command.Example>
  ): Command<Name, Input, ContextInput, E, R>
} = dual(2, <const Name extends string, Input, E, R, ContextInput>(
  self: Command<Name, Input, ContextInput, E, R>,
  examples: ReadonlyArray<Command.Example>
) => makeCommand({ ...toImpl(self), examples }))

/* ========================================================================== */
/* Providing Services                                                         */
/* ========================================================================== */

// Internal helper: transforms a command's handler while preserving other properties
const mapHandler = <Name extends string, Input, E, R, ContextInput, E2, R2>(
  self: Command<Name, Input, ContextInput, E, R>,
  f: (handler: Effect.Effect<void, E | CliError.CliError, R | Environment>, input: Input) => Effect.Effect<void, E2, R2>
): Command<Name, Input, ContextInput, E2, R2> => {
  const impl = toImpl(self)
  return makeCommand({ ...impl, handle: (input, path) => f(impl.handle(input, path), input) })
}

/**
 * Provides the handler of a command with the services produced by a layer
 * that optionally depends on the command-line input to be created.
 *
 * **Example** (Providing command services)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, PlatformError, Stdio, Terminal } from "effect"
 * import { Command, Flag } from "effect/cli"
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
 * const output: Array<string> = []
 * const deploy = Command.make("deploy", {
 *   env: Flag.String("env")
 * }, (config) =>
 *   Effect.gen(function*() {
 *     const fs = yield* FileSystem.FileSystem
 *     yield* Effect.sync(() => output.push(`Using file system for ${config.env}`))
 *   })).pipe(
 *     // Provide FileSystem based on the --env flag
 *     Command.provide((config) =>
 *       config.env === "local"
 *         ? FileSystem.layerNoop({})
 *         : FileSystem.layerNoop({
 *           access: () =>
 *             Effect.fail(
 *               PlatformError.badArgument({
 *                 module: "FileSystem",
 *                 method: "access"
 *               })
 *             )
 *         })
 *     )
 *   )
 *
 * await Effect.runPromise(
 *   Command.runWith(deploy, { version: "1.0.0" })(["--env", "local"]).pipe(Effect.provide(CliTestLayer))
 * )
 * output // => ["Using file system for local"]
 * ```
 *
 * @stability unstable
 * @category providing services
 * @since 4.0.0
 */
export const provide: {
  <Input, LR, LE, LA>(
    layer: Layer.Layer<LA, LE, LR> | ((input: Input) => Layer.Layer<LA, LE, LR>),
    options?: {
      readonly local?: boolean | undefined
    } | undefined
  ): <const Name extends string, E, R, ContextInput>(
    self: Command<Name, Input, ContextInput, E, R>
  ) => Command<Name, Input, ContextInput, E | LE, Exclude<R, LA> | LR>
  <const Name extends string, Input, E, R, ContextInput, LA, LE, LR>(
    self: Command<Name, Input, ContextInput, E, R>,
    layer: Layer.Layer<LA, LE, LR> | ((input: Input) => Layer.Layer<LA, LE, LR>),
    options?: {
      readonly local?: boolean | undefined
    } | undefined
  ): Command<Name, Input, ContextInput, E | LE, Exclude<R, LA> | LR>
} = dual((args) => isCommand(args[0]), <const Name extends string, Input, E, R, ContextInput, LA, LE, LR>(
  self: Command<Name, Input, ContextInput, E, R>,
  layer: Layer.Layer<LA, LE, LR> | ((input: Input) => Layer.Layer<LA, LE, LR>),
  options?: { readonly local?: boolean | undefined } | undefined
) =>
  mapHandler(
    self,
    (handler, input) => Effect.provide(handler, typeof layer === "function" ? layer(input) : layer, options)
  ))

/**
 * Provides the handler of a command with the implementation of a service that
 * optionally depends on the command-line input to be constructed.
 *
 * **When to use**
 *
 * Use when a command handler needs a pure service implementation, optionally
 * derived from the parsed command input.
 *
 * @stability unstable
 * @category providing services
 * @since 4.0.0
 */
export const provideSync: {
  <I, S, Input>(
    service: Context.Key<I, S>,
    implementation: S | ((input: Input) => S)
  ): <const Name extends string, E, R, ContextInput>(
    self: Command<Name, Input, ContextInput, E, R>
  ) => Command<Name, Input, ContextInput, E, Exclude<R, I>>
  <const Name extends string, Input, E, R, ContextInput, I, S>(
    self: Command<Name, Input, ContextInput, E, R>,
    service: Context.Key<I, S>,
    implementation: S | ((input: Input) => S)
  ): Command<Name, Input, ContextInput, E, Exclude<R, I>>
} = dual(3, <const Name extends string, Input, E, R, ContextInput, I, S>(
  self: Command<Name, Input, ContextInput, E, R>,
  service: Context.Key<I, S>,
  implementation: S | ((input: Input) => S)
) =>
  mapHandler(self, (handler, input) =>
    Effect.provideService(
      handler,
      service,
      typeof implementation === "function" ? (implementation as (input: Input) => S)(input) : implementation
    )))

/**
 * Provides the handler of a command with the service produced by an effect
 * that optionally depends on the command-line input to be created.
 *
 * **When to use**
 *
 * Use to acquire a service effectfully for each command run, optionally using
 * parsed command input.
 *
 * @see {@link provideSync} for synchronous service acquisition
 * @see {@link provide} for providing an already-available service
 * @see {@link provideEffectDiscard} for running an effect before the handler without providing a service
 *
 * @stability unstable
 * @category providing services
 * @since 4.0.0
 */
export const provideEffect: {
  <I, S, Input, R2, E2>(
    service: Context.Key<I, S>,
    effect: Effect.Effect<S, E2, R2> | ((input: Input) => Effect.Effect<S, E2, R2>)
  ): <const Name extends string, E, R, ContextInput>(
    self: Command<Name, Input, ContextInput, E, R>
  ) => Command<Name, Input, ContextInput, E | E2, Exclude<R, I> | R2>
  <const Name extends string, Input, E, R, ContextInput, I, S, R2, E2>(
    self: Command<Name, Input, ContextInput, E, R>,
    service: Context.Key<I, S>,
    effect: Effect.Effect<S, E2, R2> | ((input: Input) => Effect.Effect<S, E2, R2>)
  ): Command<Name, Input, ContextInput, E | E2, Exclude<R, I> | R2>
} = dual(3, <const Name extends string, Input, E, R, ContextInput, I, S, R2, E2>(
  self: Command<Name, Input, ContextInput, E, R>,
  service: Context.Key<I, S>,
  effect: Effect.Effect<S, E2, R2> | ((input: Input) => Effect.Effect<S, E2, R2>)
) =>
  mapHandler(
    self,
    (handler, input) =>
      Effect.provideServiceEffect(handler, service, typeof effect === "function" ? effect(input) : effect)
  ))

/**
 * Allows for execution of an effect, which optionally depends on command-line
 * input to be created, prior to executing the handler of a command.
 *
 * @stability unstable
 * @category providing services
 * @since 4.0.0
 */
export const provideEffectDiscard: {
  <_, Input, E2, R2>(
    effect: Effect.Effect<_, E2, R2> | ((input: Input) => Effect.Effect<_, E2, R2>)
  ): <const Name extends string, E, R, ContextInput>(
    self: Command<Name, Input, ContextInput, E, R>
  ) => Command<Name, Input, ContextInput, E | E2, R | R2>
  <const Name extends string, Input, E, R, ContextInput, _, E2, R2>(
    self: Command<Name, Input, ContextInput, E, R>,
    effect: Effect.Effect<_, E2, R2> | ((input: Input) => Effect.Effect<_, E2, R2>)
  ): Command<Name, Input, ContextInput, E | E2, R | R2>
} = dual(2, <const Name extends string, Input, E, R, ContextInput, _, E2, R2>(
  self: Command<Name, Input, ContextInput, E, R>,
  effect: Effect.Effect<_, E2, R2> | ((input: Input) => Effect.Effect<_, E2, R2>)
) =>
  mapHandler(self, (handler, input) => Effect.andThen(typeof effect === "function" ? effect(input) : effect, handler)))

/* ========================================================================== */
/* Execution                                                                  */
/* ========================================================================== */

/**
 * Interactively constructs command-line arguments for a command.
 *
 * **Details**
 *
 * The returned arguments include the command name and can be inspected,
 * modified, or passed to another command runner by the caller.
 *
 * **Example** (Constructing command arguments)
 *
 * ```ts import.meta.vitest
 * import { Console, Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Command } from "effect/cli"
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
 * const command = Command.make("app")
 * const silentConsole: Console.Console = Object.assign(Object.create(console), {
 *   log: () => {}
 * })
 *
 * const program = Command.wizard(command).pipe(
 *   Effect.provideService(Console.Console, silentConsole),
 *   Effect.provide(CliTestLayer)
 * )
 *
 * await Effect.runPromise(program) // => ["app"]
 * ```
 *
 * @stability unstable
 * @category running
 * @since 4.0.0
 */
export const wizard = <Name extends string, Input, E, R, ContextInput>(
  command: Command<Name, Input, ContextInput, E, R>,
  options?: {
    readonly prefix?: ReadonlyArray<string> | undefined
  } | undefined
): Effect.Effect<Array<string>, CliError.CliError | Terminal.QuitError, Environment> =>
  Effect.map(Wizard.run(command, options), (result) => result.args)

const getOutOfScopeGlobalFlagErrors = (
  allFlags: ReadonlyArray<GlobalFlag.GlobalFlag<any>>,
  activeFlags: ReadonlyArray<GlobalFlag.GlobalFlag<any>>,
  flagMap: Record<string, ReadonlyArray<string>>,
  commandPath: ReadonlyArray<string>
): ReadonlyArray<CliError.UnrecognizedOption> => {
  const activeSet = new Set(activeFlags)
  const errors: Array<CliError.UnrecognizedOption> = []
  const seen = new Set<string>()

  for (const flag of allFlags) {
    if (activeSet.has(flag)) {
      continue
    }

    const singles = Param.extractSingleParams(flag.flag)
    for (const single of singles) {
      const entries = flagMap[single.name]
      if (!entries || entries.length === 0) {
        continue
      }
      const option = `--${single.name}`
      if (seen.has(option)) {
        continue
      }
      seen.add(option)
      errors.push(
        new CliError.UnrecognizedOption({
          option,
          suggestions: [],
          command: commandPath
        })
      )
    }
  }

  return errors
}

const showHelp = <Name extends string, Input, E, R, ContextInput>(
  command: Command<Name, Input, ContextInput, E, R>,
  error: CliError.ShowHelp,
  renderErrors: boolean
): Effect.Effect<void, CliError.CliError, Environment> =>
  Effect.gen(function*() {
    const { builtIns } = yield* CliConfig.CliConfig
    const formatter = yield* CliOutput.Formatter
    const helpDoc = yield* getHelpForCommandPath(command, error.commandPath, builtIns)
    yield* Console.log(formatter.formatHelpDoc(helpDoc))
    if (renderErrors && error.errors.length > 0) {
      yield* Console.error(formatter.formatErrors(error.errors as any))
    }
  })

const showUserError = (error: CliError.UserError): Effect.Effect<void> =>
  Effect.gen(function*() {
    const formatter = yield* CliOutput.Formatter
    yield* Console.error(formatter.formatError(error))
    error[Runtime.errorReported] = false
  })

/**
 * Runs a command using the arguments supplied by the `Stdio` service.
 *
 * **When to use**
 *
 * Use when command-line arguments should come from `Stdio` at the application
 * entry point.
 *
 * Help documents are always rendered. By default, parse error details and
 * `CliError.UserError` failures are also rendered with the installed
 * `CliOutput.Formatter` before the error is rethrown. Set `renderErrors` to
 * `false` when the host application owns error rendering.
 *
 * **Example** (Running commands with standard input)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Command, Flag } from "effect/cli"
 * import { ChildProcessSpawner } from "effect/process"
 *
 * const CliTestLayer = Layer.mergeAll(
 *   FileSystem.layerNoop({}),
 *   Path.layer,
 *   Stdio.layerTest({
 *     args: Effect.succeed(["--name", "Alice"])
 *   }),
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
 * const output: Array<string> = []
 * const greetCommand = Command.make("greet", {
 *   name: Flag.String("name")
 * }, (config) =>
 *   Effect.gen(function*() {
 *     yield* Effect.sync(() => output.push(`Hello, ${config.name}!`))
 *   }))
 *
 * // Automatically gets args from the Stdio service
 * const program = Command.run(greetCommand, {
 *   version: "1.0.0"
 * })
 *
 * await Effect.runPromise(program.pipe(Effect.provide(CliTestLayer)))
 * output // => ["Hello, Alice!"]
 * ```
 *
 * @see {@link runWith} for running a command with an explicit argument array
 *
 * @stability unstable
 * @category running
 * @since 4.0.0
 */
export const run: {
  (config: {
    readonly version: string
    readonly renderErrors?: boolean | undefined
  }): <Name extends string, Input, E, R, ContextInput>(
    command: Command<Name, Input, ContextInput, E, R>
  ) => Effect.Effect<void, E | CliError.CliError, R | Environment>
  <Name extends string, Input, E, R, ContextInput>(
    command: Command<Name, Input, ContextInput, E, R>,
    config: {
      readonly version: string
      readonly renderErrors?: boolean | undefined
    }
  ): Effect.Effect<void, E | CliError.CliError, R | Environment>
} = dual(2, <Name extends string, Input, E, R, ContextInput>(
  command: Command<Name, Input, ContextInput, E, R>,
  config: {
    readonly version: string
    readonly renderErrors?: boolean | undefined
  }
) =>
  Stdio.Stdio.use(({ args }) =>
    Effect.flatMap(
      args,
      (args) => runWith(command, config)(args)
    )
  ))

/**
 * Runs a command with explicitly provided arguments instead of using arguments from `Stdio`.
 *
 * **When to use**
 *
 * Use when you need to test CLI applications or programmatically execute
 * commands with specific arguments.
 *
 * Help documents are always rendered. By default, parse error details and
 * `CliError.UserError` failures are also rendered with the installed
 * `CliOutput.Formatter` before the error is rethrown. Set `renderErrors` to
 * `false` when the host application owns error rendering.
 *
 * **Example** (Running commands with explicit arguments)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
 * import { Command, Flag } from "effect/cli"
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
 * const output: Array<string> = []
 * const greet = Command.make("greet", {
 *   name: Flag.String("name"),
 *   count: Flag.Int("count").pipe(Flag.withDefault(1))
 * }, (config) =>
 *   Effect.gen(function*() {
 *     for (let i = 0; i < config.count; i++) {
 *       yield* Effect.sync(() => output.push(`Hello, ${config.name}!`))
 *     }
 *   }))
 *
 * // Test with specific arguments
 * const testProgram = Effect.gen(function*() {
 *   const runCommand = Command.runWith(greet, { version: "1.0.0" })
 *
 *   yield* runCommand(["--name", "Alice", "--count", "2"])
 * })
 *
 * await Effect.runPromise(testProgram.pipe(Effect.provide(CliTestLayer)))
 * output // => ["Hello, Alice!", "Hello, Alice!"]
 * ```
 *
 * @stability unstable
 * @category running
 * @since 4.0.0
 */
export const runWith = <const Name extends string, Input, E, R, ContextInput>(
  command: Command<Name, Input, ContextInput, E, R>,
  config: {
    readonly version: string
    readonly renderErrors?: boolean | undefined
  }
): (
  input: ReadonlyArray<string>
) => Effect.Effect<void, Exclude<E, Terminal.QuitError> | CliError.CliError, R | Environment> => {
  const commandImpl = toImpl(command)
  return Effect.fnUntraced(
    function*(args: ReadonlyArray<string>) {
      const { builtIns } = yield* CliConfig.CliConfig
      const { tokens, trailingOperands } = Lexer.lex(args)

      // 1. Collect known global flags from the command tree
      const allFlags = getGlobalFlagsForCommandTree(command, builtIns)

      // 2. Extract global flag tokens
      const allFlagParams = allFlags.flatMap((f) => Param.extractSingleParams(f.flag))
      const globalRegistry = Parser.createFlagRegistry(allFlagParams.filter(Param.isFlagParam))
      const { flagMap, remainder, errors: globalFlagErrors } = Parser.consumeGlobalFlags(
        tokens,
        command,
        globalRegistry
      )
      const emptyArgs: Param.ParsedArgs = { flags: flagMap, arguments: [] }

      // 3. Parse command arguments from remaining tokens
      const parsedArgs = yield* Parser.parseArgs({ tokens: remainder, trailingOperands }, command)
      const commandPath = [command.name, ...Parser.getCommandPath(parsedArgs)] as const
      const handlerCtx: GlobalFlag.HandlerContext = { builtIns, command, commandPath, version: config.version }
      const activeFlags = getGlobalFlagsForCommandPath(command, commandPath, builtIns)

      // 4. Reject globals that were passed outside the active command scope
      const outOfScopeErrors = getOutOfScopeGlobalFlagErrors(allFlags, activeFlags, flagMap, commandPath)
      if (outOfScopeErrors.length > 0 || globalFlagErrors.length > 0) {
        const parseErrors = parsedArgs.errors ?? []
        return yield* new CliError.ShowHelp({
          commandPath,
          errors: [...globalFlagErrors, ...outOfScopeErrors, ...parseErrors]
        })
      }

      // 5. Process action flags — first present action wins, then exit
      for (const flag of activeFlags) {
        if (flag._tag !== "Action") continue
        const singles = Param.extractSingleParams(flag.flag)
        const hasEntry = singles.some((s) => {
          const entries = flagMap[s.name]
          return entries !== undefined && entries.length > 0
        })
        if (!hasEntry) continue
        const [, value] = yield* flag.flag.parse(emptyArgs)
        if (flag === GlobalFlag.Wizard) {
          return yield* Effect.gen(function*() {
            yield* Console.log(Wizard.renderIntroduction(command.name, config.version, command.description))
            const prefix = [
              command.name,
              ...args.filter((arg) => arg !== "--wizard" && !arg.startsWith("--wizard="))
            ]
            const wizardResult = yield* Wizard.run(command, { commandPath, prefix })
            yield* Console.log(Wizard.renderCompletion(wizardResult.displayArgs))
            const shouldRun = yield* Prompt.run(Prompt.Toggle({
              message: "Run this command?",
              initial: true,
              active: "yes",
              inactive: "no"
            }))
            if (shouldRun) {
              yield* Console.log()
              yield* runWith(command, { ...config, renderErrors: false })(wizardResult.args.slice(1))
            }
          }).pipe(
            Effect.catchTag("QuitError", () => Console.log(Wizard.renderQuit()))
          )
        }
        yield* flag.run(value, handlerCtx)
        return
      }

      // 6. Handle parsing errors
      if (parsedArgs.errors && parsedArgs.errors.length > 0) {
        return yield* new CliError.ShowHelp({ commandPath, errors: parsedArgs.errors })
      }
      const parseResult = yield* Effect.result(commandImpl.parse(parsedArgs))
      if (parseResult._tag === "Failure") {
        return yield* new CliError.ShowHelp({
          commandPath,
          errors: [parseResult.failure as CliError.NonShowHelpErrors]
        })
      }

      // 7. Provide setting values
      let program = commandImpl.handle(parseResult.success, [command.name])
      const logLevel = activeFlags.includes(GlobalFlag.LogLevel)
        ? (yield* GlobalFlag.LogLevel.flag.parse(emptyArgs))[1]
        : Option.none()
      program = Effect.provideService(program, GlobalFlag.LogLevel, logLevel)
      for (const flag of activeFlags) {
        if (flag._tag !== "Setting" || flag === GlobalFlag.LogLevel) continue
        const [, value] = yield* flag.flag.parse(emptyArgs)
        program = Effect.provideService(program, flag, value)
      }

      // 8. Apply built-in setting behavior
      const services = Option.match(logLevel, {
        onNone: () => Context.empty(),
        onSome: (level) => Context.make(References.MinimumLogLevel, level)
      })

      // 9. Run command handler with composed context
      yield* Effect.provideContext(program, services)
    },
    Effect.catchFilter(
      (error) =>
        CliError.isCliError(error) && error._tag === "ShowHelp"
          ? Result.succeed(error)
          : Result.fail(error),
      (error) => Effect.andThen(showHelp(command, error, config.renderErrors !== false), Effect.fail(error))
    ),
    Effect.catchFilter(
      (error) =>
        config.renderErrors !== false && CliError.isCliError(error) && error._tag === "UserError"
          ? Result.succeed(error)
          : Result.fail(error),
      (error) => Effect.andThen(showUserError(error), Effect.fail(error))
    ),
    Effect.catchFilter(
      (e) =>
        Terminal.isQuitError(e)
          ? Result.succeed(e)
          : Result.fail(e as CliError.CliError | Exclude<E, Terminal.QuitError>),
      (_) => Effect.interrupt
    )
  )
}
