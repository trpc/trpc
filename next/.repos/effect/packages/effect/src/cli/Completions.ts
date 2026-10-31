/**
 * The `Completions` module turns a plain description of an Effect CLI command
 * tree into shell completion scripts for Bash, Zsh, Fish, and PowerShell. It
 * is the low-level script generation surface used by the unstable CLI package
 * and by the built-in completions global flag.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { Command } from "./Command.ts"
import * as Bash from "./internal/completions/bash.ts"
import * as Descriptor from "./internal/completions/descriptor.ts"
import * as Fish from "./internal/completions/fish.ts"
import * as PowerShell from "./internal/completions/powershell.ts"
import * as Zsh from "./internal/completions/zsh.ts"

/**
 * Shell type used to generate completion scripts.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Shell = "bash" | "zsh" | "fish" | "powershell"

/**
 * Describes a command for completion script generation.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface CommandDescriptor {
  readonly name: string
  readonly description: string | undefined
  readonly flags: ReadonlyArray<FlagDescriptor>
  readonly arguments: ReadonlyArray<ArgumentDescriptor>
  readonly subcommands: ReadonlyArray<CommandDescriptor>
}

/**
 * Describes a command flag for completions.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface FlagDescriptor {
  readonly name: string
  readonly aliases: ReadonlyArray<string>
  readonly description: string | undefined
  readonly type: FlagType
  /**
   * Whether the flag's value is optional. Its value can only be attached with
   * `=` (`--name=value`), never given as the next word.
   */
  readonly optionalValue?: boolean | undefined
  /**
   * Long name that sets a boolean flag to `false`. Defaults to `no-<name>`;
   * `false` means the flag has no negated form.
   */
  readonly negation?: string | false | undefined
}

/**
 * Describes the supported flag value shapes.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type FlagType =
  | { readonly _tag: "Boolean" }
  | { readonly _tag: "String" }
  | { readonly _tag: "Int" }
  | { readonly _tag: "Finite" }
  | { readonly _tag: "Date" }
  | { readonly _tag: "Choice"; readonly values: ReadonlyArray<string> }
  | { readonly _tag: "Path"; readonly pathType: "file" | "directory" | "either" }

/**
 * Describes a positional argument for completions.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ArgumentDescriptor {
  readonly name: string
  readonly description: string | undefined
  readonly required: boolean
  readonly variadic: boolean
  readonly type: ArgumentType
}

/**
 * Describes the supported argument value shapes.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ArgumentType =
  | { readonly _tag: "String" }
  | { readonly _tag: "Int" }
  | { readonly _tag: "Finite" }
  | { readonly _tag: "Date" }
  | { readonly _tag: "Choice"; readonly values: ReadonlyArray<string> }
  | { readonly _tag: "Path"; readonly pathType: "file" | "directory" | "either" }

/**
 * Converts a command tree into a `CommandDescriptor` for completion script
 * generation.
 *
 * **When to use**
 *
 * Use when you need to generate a completion script from an existing
 * `Command`, for example in a build step, without running the CLI or
 * capturing the output of the built-in `--completions` flag.
 *
 * **Details**
 *
 * Reads the command's flags, arguments, and subcommands, including flags
 * shared with subcommands and aliases. Hidden flags and unlisted subcommands
 * are omitted, matching `--help`. Command handlers are never run.
 *
 * **Example** (Generating a Zsh completion script at build time)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { Command, Completions, Flag } from "effect/cli"
 *
 * const start = Command.make(
 *   "start",
 *   { port: Flag.Int("port") },
 *   ({ port }) => Effect.log(`Listening on ${port}`)
 * )
 *
 * const cli = Command.make("server").pipe(
 *   Command.withSubcommands([start])
 * )
 *
 * const script = Completions.generate(
 *   "server",
 *   "zsh",
 *   Completions.fromCommand(cli)
 * )
 *
 * script.startsWith("#compdef server") // => true
 * ```
 *
 * @see {@link generate} for turning the descriptor into a shell script
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.7
 */
export const fromCommand = (command: Command.Any): CommandDescriptor => Descriptor.fromCommand(command)

/**
 * Generates a shell completion script for a command descriptor.
 *
 * **When to use**
 *
 * Use when you need an installable completion script from an existing
 * `CommandDescriptor`.
 *
 * **Details**
 *
 * Dispatches by `shell` to Bash, Zsh, Fish, or PowerShell generation and
 * returns a static script string for `executableName`.
 *
 * @see {@link Shell} for supported shell names
 * @see {@link CommandDescriptor} for the command shape used by completion generation
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const generate = (
  executableName: string,
  shell: Shell,
  descriptor: CommandDescriptor
): string => {
  switch (shell) {
    case "bash":
      return Bash.generate(executableName, descriptor)
    case "zsh":
      return Zsh.generate(executableName, descriptor)
    case "fish":
      return Fish.generate(executableName, descriptor)
    case "powershell":
      return PowerShell.generate(executableName, descriptor)
  }
}
