/**
 * The `Completions` module turns a plain description of an Effect CLI command
 * tree into shell completion scripts for Bash, Zsh, and Fish. It is the
 * low-level script generation surface used by the unstable CLI package and by
 * the built-in completions global flag.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Bash from "./internal/completions/bash.ts"
import * as Fish from "./internal/completions/fish.ts"
import * as Zsh from "./internal/completions/zsh.ts"

/**
 * Shell type used to generate completion scripts.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Shell = "bash" | "zsh" | "fish"

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
 * Generates a shell completion script for a command descriptor.
 *
 * **When to use**
 *
 * Use when you need an installable completion script from an existing
 * `CommandDescriptor`.
 *
 * **Details**
 *
 * Dispatches by `shell` to Bash, Zsh, or Fish generation and returns a static
 * script string for `executableName`.
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
  }
}
