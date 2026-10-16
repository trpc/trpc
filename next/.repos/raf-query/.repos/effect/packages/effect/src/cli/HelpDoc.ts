/**
 * Structured help documentation model for the unstable CLI package. A
 * `HelpDoc` value captures the user-facing parts of a command, including its
 * description, usage string, positional arguments, flags, global flags,
 * subcommands, annotations, and examples.
 *
 * This module only defines the data shapes used to describe help. Rendering
 * that data as terminal text is handled by `CliOutput`.
 *
 * @stability unstable
 * @since 4.0.0
 */

import type { NonEmptyReadonlyArray } from "../Array.ts"
import type * as Context from "../Context.ts"
import type * as Option from "../Option.ts"

/**
 * Structured representation of help documentation for a command.
 * This data structure is independent of formatting, allowing for
 * different output formats (text, markdown, JSON, etc.).
 *
 * **Example** (Defining command help documentation)
 *
 * ```ts import.meta.vitest
 * import { Context, Option as O } from "effect"
 * import type { HelpDoc } from "effect/cli"
 *
 * const deployCommandHelp: HelpDoc.HelpDoc = {
 *   description: "Deploy your application to the cloud",
 *   usage: "myapp deploy [options] <target>",
 *   annotations: Context.empty(),
 *   flags: [
 *     {
 *       name: "verbose",
 *       aliases: ["-v"],
 *       type: "boolean",
 *       description: O.some("Enable verbose logging"),
 *       required: false
 *     },
 *     {
 *       name: "env",
 *       aliases: ["-e"],
 *       type: "string",
 *       description: O.some("Target environment"),
 *       required: true
 *     }
 *   ],
 *   args: [
 *     {
 *       name: "target",
 *       type: "string",
 *       description: O.some("Deployment target (e.g., 'production', 'staging')"),
 *       required: true,
 *       variadic: false
 *     }
 *   ]
 * }
 *
 * deployCommandHelp.usage // => "myapp deploy [options] <target>"
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface HelpDoc {
  /**
   * Brief description of what the command does
   */
  readonly description: string

  /**
   * Usage syntax showing how to invoke the command
   * Example: "myapp deploy [flags]"
   */
  readonly usage: string

  /**
   * List of available flags/options for this command
   */
  readonly flags: ReadonlyArray<FlagDoc>

  /**
   * Global flags available to all commands (e.g., --help, --version).
   */
  readonly globalFlags?: ReadonlyArray<FlagDoc>

  /**
   * Custom command annotations.
   */
  readonly annotations: Context.Context<never>

  /**
   * List of positional arguments for this command
   */
  readonly args?: ReadonlyArray<ArgDoc>

  /**
   * Optional list of subcommands if this is a parent command
   */
  readonly subcommands?: ReadonlyArray<SubcommandGroupDoc>

  /**
   * Optional concrete usage examples for the command
   */
  readonly examples?: ReadonlyArray<ExampleDoc>
}

/**
 * Documentation for a command usage example
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ExampleDoc {
  /**
   * Command line invocation example
   */
  readonly command: string

  /**
   * Optional explanation for the example
   */
  readonly description?: string | undefined
}

/**
 * Documentation for a single command-line flag/option
 *
 * **Example** (Documenting command flags)
 *
 * ```ts import.meta.vitest
 * import { Option as O } from "effect"
 * import type { HelpDoc } from "effect/cli"
 *
 * const verboseFlag: HelpDoc.FlagDoc = {
 *   name: "verbose",
 *   aliases: ["-v", "--verbose"],
 *   type: "boolean",
 *   description: O.some("Enable verbose output"),
 *   required: false
 * }
 *
 * const portFlag: HelpDoc.FlagDoc = {
 *   name: "port",
 *   aliases: ["-p"],
 *   type: "integer",
 *   description: O.some("Port number to use"),
 *   required: true
 * }
 *
 * const names = [verboseFlag.name, portFlag.name] // => ["verbose", "port"]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface FlagDoc {
  /**
   * Primary name of the flag (e.g., "verbose")
   */
  readonly name: string

  /**
   * Alternative names/aliases for the flag (e.g., ["-v"])
   */
  readonly aliases: ReadonlyArray<string>

  /**
   * Type of the flag value (e.g., "string", "boolean", "integer")
   */
  readonly type: string

  /**
   * Description of what the flag does
   */
  readonly description: Option.Option<string>

  /**
   * Whether this flag is required
   */
  readonly required: boolean
}

/**
 * Documentation for a subcommand
 *
 * **Example** (Documenting subcommands)
 *
 * ```ts import.meta.vitest
 * import { Context, Option as O } from "effect"
 * import type { HelpDoc } from "effect/cli"
 *
 * const deploySubcommand: HelpDoc.SubcommandDoc = {
 *   name: "deploy",
 *   alias: "d",
 *   shortDescription: "Deploy app",
 *   description: "Deploy the application to the cloud"
 * }
 *
 * const buildSubcommand: HelpDoc.SubcommandDoc = {
 *   name: "build",
 *   alias: undefined,
 *   shortDescription: undefined,
 *   description: "Build the application for production"
 * }
 *
 * // Used in parent command's help documentation
 * const mainCommandHelp: HelpDoc.HelpDoc = {
 *   description: "Cloud deployment tool",
 *   usage: "myapp <command> [options]",
 *   annotations: Context.empty(),
 *   flags: [],
 *   subcommands: [{
 *     group: undefined,
 *     commands: [deploySubcommand, buildSubcommand]
 *   }]
 * }
 *
 * mainCommandHelp.subcommands?.[0].commands.map((command) => command.name) // => ["deploy", "build"]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SubcommandDoc {
  /**
   * Name of the subcommand
   */
  readonly name: string

  /**
   * Optional short alias for invoking the subcommand.
   */
  readonly alias: string | undefined

  /**
   * Optional short description of what the subcommand does.
   */
  readonly shortDescription: string | undefined

  /**
   * Brief description of what the subcommand does
   */
  readonly description: string
}

/**
 * Documentation for a grouped subcommand listing
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SubcommandGroupDoc {
  /**
   * Group name used in help output.
   * Undefined means the default ungrouped section.
   */
  readonly group: string | undefined

  /**
   * Subcommands in this group.
   */
  readonly commands: NonEmptyReadonlyArray<SubcommandDoc>
}

/**
 * Documentation for a positional argument
 *
 * **Example** (Documenting positional arguments)
 *
 * ```ts import.meta.vitest
 * import { Context, Option as O } from "effect"
 * import type { HelpDoc } from "effect/cli"
 *
 * const sourceArg: HelpDoc.ArgDoc = {
 *   name: "source",
 *   type: "file",
 *   description: O.some("Source file to process"),
 *   required: true,
 *   variadic: false
 * }
 *
 * const filesArg: HelpDoc.ArgDoc = {
 *   name: "files",
 *   type: "file",
 *   description: O.some("Files to process (can specify multiple)"),
 *   required: false,
 *   variadic: true
 * }
 *
 * // Used in command help documentation
 * const copyCommandHelp: HelpDoc.HelpDoc = {
 *   description: "Copy files from source to destination",
 *   usage: "copy <source> [files...]",
 *   annotations: Context.empty(),
 *   flags: [],
 *   args: [sourceArg, filesArg]
 * }
 *
 * copyCommandHelp.args?.map((arg) => arg.name) // => ["source", "files"]
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ArgDoc {
  /**
   * Name of the argument (e.g., "source", "destination")
   */
  readonly name: string

  /**
   * Type of the argument value (e.g., "string", "file", "directory")
   */
  readonly type: string

  /**
   * Description of what the argument is for
   */
  readonly description: Option.Option<string>

  /**
   * Whether this argument is required or optional
   */
  readonly required: boolean

  /**
   * Whether this argument is variadic (accepts multiple values)
   */
  readonly variadic: boolean
}
