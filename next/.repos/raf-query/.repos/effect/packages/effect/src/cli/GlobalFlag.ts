/**
 * Global flags for Effect CLI command trees. Global flags are parsed outside a
 * single command's local flags and can apply to a command and its descendants.
 *
 * This module defines two kinds of global flags: action flags, which run an
 * effect and stop normal command execution, and setting flags, which provide a
 * parsed value to the command handler through the Effect context. It also
 * defines the built-in help, version, wizard, shell-completion, and log-level flags
 * used by `Command.run` and `Command.runWith`.
 *
 * @stability unstable
 * @since 4.0.0
 */

import * as Console from "../Console.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import type { LogLevel as LogLevelType } from "../LogLevel.ts"
import * as Option from "../Option.ts"
import * as CliOutput from "./CliOutput.ts"
import type * as Command from "./Command.ts"
import * as Completions_ from "./Completions.ts"
import * as Flag from "./Flag.ts"
import * as CommandDescriptor from "./internal/completions/descriptor.ts"
import * as HelpInternal from "./internal/help.ts"

/* ========================================================================== */
/* Types                                                                      */
/* ========================================================================== */

/**
 * Context passed to action handlers.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface HandlerContext {
  readonly command: Command.Command.Any
  readonly commandPath: ReadonlyArray<string>
  readonly version: string
  readonly builtIns: ReadonlyArray<BuiltIn>
}

/**
 * Action flag: side effect + exit (--help, --version, --completions).
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Action<A> {
  readonly _tag: "Action"
  readonly flag: Flag.Flag<A>
  readonly run: (
    value: A,
    context: HandlerContext
  ) => Effect.Effect<void>
}

/**
 * Setting flag: configure command handler's environment (--log-level, --config).
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export interface Setting<Id extends string, A> extends Context.Service<Setting.Identifier<Id>, A> {
  readonly _tag: "Setting"
  readonly id: Id
  readonly flag: Flag.Flag<A>
}

/**
 * Namespace containing type helpers for global setting flags.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Setting {
  /**
   * Type-level service identifier used by `Setting` global flags for the
   * parsed value associated with a setting id.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type Identifier<Id extends string> = `effect/cli/GlobalFlag/${Id}`
}

/**
 * Global flag discriminated union.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type GlobalFlag<A> = Action<A> | Setting<any, A>

/* ========================================================================== */
/* Constructors                                                               */
/* ========================================================================== */

/**
 * Creates an Action flag that performs a side effect and exits.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Action = <A>(options: {
  readonly flag: Flag.Flag<A>
  readonly run: (
    value: A,
    context: HandlerContext
  ) => Effect.Effect<void>
}): Action<A> => ({
  _tag: "Action",
  flag: options.flag,
  run: options.run
})

/**
 * Creates a Setting flag that configures the command handler's environment.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Setting = <const Id extends string>(
  id: Id
) =>
<A>(options: {
  readonly flag: Flag.Flag<A>
}): Setting<Id, A> => {
  settingIdCounter += 1
  const ref = Context.Service<Setting.Identifier<Id>, A>(
    `effect/cli/GlobalFlag/${id}/${settingIdCounter}`
  )
  return Object.assign(ref, {
    _tag: "Setting" as const,
    id,
    flag: options.flag
  })
}

let settingIdCounter = 0

/* ========================================================================== */
/* Built-in Flag References                                                   */
/* ========================================================================== */

/**
 * Defines the `--help` / `-h` global flag, which shows help documentation for the
 * active command path.
 *
 * @see {@link BuiltIns} for the default list containing this flag
 * @see {@link Action} for defining custom action global flags
 *
 * @stability unstable
 * @category references
 * @since 4.0.0
 */
export const Help: Action<boolean> = Action({
  flag: Flag.Boolean("help").pipe(
    Flag.withAlias("h"),
    Flag.withDescription("Show help information"),
    Flag.withDefault(false)
  ),
  run: Effect.fnUntraced(function*(_, { builtIns, command, commandPath }) {
    const formatter = yield* CliOutput.Formatter
    const helpDoc = yield* HelpInternal.getHelpForCommandPath(command, commandPath, builtIns)
    yield* Console.log(formatter.formatHelpDoc(helpDoc))
  })
})

/**
 * Defines the global action flag for showing command version information.
 *
 * **When to use**
 *
 * Use to add a built-in `--version / -v` flag to a command runner.
 *
 * @stability unstable
 * @category references
 * @since 4.0.0
 */
export const Version: Action<boolean> = Action({
  flag: Flag.Boolean("version").pipe(
    Flag.withAlias("v"),
    Flag.withDescription("Show version information"),
    Flag.withDefault(false)
  ),
  run: Effect.fnUntraced(function*(_, { command, version }) {
    const formatter = yield* CliOutput.Formatter
    yield* Console.log(formatter.formatVersion(command.name, version))
  })
})

/**
 * Defines the global action flag for starting interactive wizard mode.
 *
 * **Details**
 *
 * `Command.run` and `Command.runWith` handle this action specially so the
 * generated arguments can be passed back through the command parser.
 *
 * @stability unstable
 * @category references
 * @since 4.0.0
 */
export const Wizard: Action<boolean> = Action({
  flag: Flag.Boolean("wizard").pipe(
    Flag.withDescription("Start wizard mode for a command"),
    Flag.withDefault(false)
  ),
  run: () => Effect.void
})

/**
 * Defines the `--completions` global flag, which prints a shell completion script for
 * the given shell.
 *
 * **Details**
 *
 * Accepted values are `bash`, `zsh`, `fish`, and `sh`; `sh` is normalized to
 * `bash`.
 *
 * @stability unstable
 * @category references
 * @since 4.0.0
 */
export const Completions: Action<Option.Option<"bash" | "zsh" | "fish">> = Action({
  flag: Flag.Literals("completions", ["bash", "zsh", "fish", "sh"] as const)
    .pipe(
      Flag.optional,
      Flag.map((v) => Option.map(v, (s) => s === "sh" ? "bash" : s)),
      Flag.withMetavar("<bash|zsh|fish|sh>"),
      Flag.withDescription("Print shell completion script")
    ),
  run: Effect.fnUntraced(function*(shell, { command }) {
    if (Option.isNone(shell)) return
    const descriptor = CommandDescriptor.fromCommand(command)
    yield* Console.log(
      Completions_.generate(command.name, shell.value, descriptor)
    )
  })
})

/**
 * Defines the global setting flag for command log level.
 *
 * **When to use**
 *
 * Use to add a built-in `--log-level` option that configures the minimum log
 * level for the command.
 *
 * @stability unstable
 * @category references
 * @since 4.0.0
 */
export const LogLevel: Setting<"log-level", Option.Option<LogLevelType>> = Setting("log-level")({
  flag: Flag.ChoiceWithValue(
    "log-level",
    [
      ["all", "All"],
      ["trace", "Trace"],
      ["debug", "Debug"],
      ["info", "Info"],
      ["warn", "Warn"],
      ["warning", "Warn"],
      ["error", "Error"],
      ["fatal", "Fatal"],
      ["none", "None"]
    ] as const
  ).pipe(
    Flag.optional,
    Flag.withDescription("Sets the minimum log level"),
    Flag.withMetavar("<all|trace|debug|info|warn|warning|error|fatal|none>")
  )
})

/* ========================================================================== */
/* References                                                                 */
/* ========================================================================== */

/**
 * Built-in global flags in default precedence order.
 *
 * **When to use**
 *
 * Use when extending or inspecting the default global-flag set that
 * `Command.runWith` prepends before user-defined global flags.
 *
 * **Details**
 *
 * The built-ins are `Help`, `Version`, `Wizard`, `Completions`, and `LogLevel`.
 * `Command.runWith` prepends these built-ins when collecting and parsing global
 * flags.
 *
 * **Gotchas**
 *
 * Action flags are processed in active flag order and the first present action
 * exits, so this array controls built-in action precedence.
 *
 * @see {@link Help} for the help action flag
 * @see {@link Version} for the version action flag
 * @see {@link Completions} for the shell-completions action flag
 * @see {@link LogLevel} for the built-in log-level setting flag
 *
 * @stability unstable
 * @category references
 * @since 4.0.0
 */
export const BuiltIns: readonly [
  Action<boolean>,
  Action<boolean>,
  Action<boolean>,
  Action<Option.Option<"bash" | "zsh" | "fish">>,
  Setting<"log-level", Option.Option<LogLevelType>>
] = [Help, Version, Wizard, Completions, LogLevel]

/**
 * Global flag included in the default command-runner configuration.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type BuiltIn = typeof BuiltIns[number]
