/**
 * Static Fish completion script generator.
 *
 * Produces a self-contained completion script from a `CommandDescriptor` —
 * no re-invocation of the CLI at runtime.
 *
 * @internal
 */
import type * as Completions from "../../Completions.ts"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const escapeFishString = (s: string): string => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")

/** Escape choices for Fish's second expansion of `complete -a`. */
const escapeFishChoice = (s: string): string => escapeFishString(s.replace(/[^A-Za-z0-9_.,/@%+-]/gu, "\\$&"))

/**
 * Build a Fish condition that checks the current subcommand context.
 *
 * For root-level completions with subcommands: `__fish_use_subcommand`
 * For nested commands: verify the full parent path is active AND none of its
 * child subcommands have been entered yet.
 */
const subcommandCondition = (
  parentPath: ReadonlyArray<string>,
  childSubcommandNames: ReadonlyArray<string>
): string => {
  if (parentPath.length === 0) {
    if (childSubcommandNames.length > 0) {
      return `__fish_use_subcommand`
    }
    return ``
  }
  const parentCondition = parentPath.map((parent) => `__fish_seen_subcommand_from ${parent}`).join("; and ")
  if (childSubcommandNames.length > 0) {
    // Show only when the parent path is active but no child subcommand has been entered
    return `${parentCondition}; and not __fish_seen_subcommand_from ${childSubcommandNames.join(" ")}`
  }
  return parentCondition
}

/**
 * Build a __fish_contains_opt condition that checks whether any form of this
 * flag has already been typed. Returns the condition string without wrapping
 * quotes (the caller adds those).
 */
const flagContainsOptCondition = (flag: Completions.FlagDescriptor): string => {
  const optArgs: Array<string> = []
  for (const alias of flag.aliases) {
    if (alias.length === 1) {
      optArgs.push(`-s ${alias}`)
    }
  }
  // Long names (fish __fish_contains_opt uses bare words for long opts)
  optArgs.push(flag.name)
  for (const alias of flag.aliases) {
    if (alias.length > 1) {
      optArgs.push(alias)
    }
  }
  if (flag.type._tag === "Boolean") {
    optArgs.push(`no-${flag.name}`)
  }
  return `not __fish_contains_opt ${optArgs.join(" ")}`
}

/** Hide used value flags without suppressing their value completions. */
const valueFlagDedupCondition = (flag: Completions.FlagDescriptor): string => {
  const forms = [`--${flag.name}`]
  for (const alias of flag.aliases) {
    forms.push(alias.length === 1 ? `-${alias}` : `--${alias}`)
  }
  return `begin; ${flagContainsOptCondition(flag)}; or contains -- (commandline -poc)[-1] ${forms.join(" ")}; end`
}

const flagCompletionArgs = (flag: Completions.FlagDescriptor): Array<string> => {
  const args: Array<string> = [`-l ${flag.name}`]
  for (const alias of flag.aliases) {
    if (alias.length === 1) {
      args.push(`-s ${alias}`)
    } else {
      args.push(`-l ${alias}`)
    }
  }
  if (flag.description) {
    args.push(`-d '${escapeFishString(flag.description)}'`)
  }
  const valueArgs = flagValueArgs(flag.type)
  if (valueArgs) {
    args.push(valueArgs)
  }
  return args
}

const flagValueArgs = (type: Completions.FlagType): string | undefined => {
  switch (type._tag) {
    case "Boolean":
      return undefined
    case "Choice":
      return `-r -f -a '${type.values.map(escapeFishChoice).join(" ")}'`
    case "Path":
      if (type.pathType === "directory") return `-r -F`
      return `-r -F`
    default:
      // -r: requires a value, -f: don't fall back to file completion
      return `-r -f`
  }
}

const argValueArgs = (type: Completions.ArgumentType): string | undefined => {
  switch (type._tag) {
    case "Choice":
      return `-r -f -a '${type.values.map(escapeFishChoice).join(" ")}'`
    case "Path":
      return `-r -F`
    default:
      return undefined
  }
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

const generateCompletions = (
  executableName: string,
  descriptor: Completions.CommandDescriptor,
  parentPath: ReadonlyArray<string>,
  lines: Array<string>
): void => {
  const allSubNames = descriptor.subcommands.map((s) => s.name)
  const condition = subcommandCondition(parentPath, allSubNames)
  const conditionArg = condition ? `-n '${condition}'` : ``

  // Suppress default file completion unless the command has path-type
  // positional arguments. Without this, fish falls back to listing files
  // even when only flags are valid.
  const hasPathArgs = descriptor.arguments.some((a) => a.type._tag === "Path")
  if (!hasPathArgs) {
    const parts = [`complete -c ${executableName}`]
    if (conditionArg) parts.push(conditionArg)
    parts.push(`-f`)
    lines.push(parts.join(" "))
  }

  // Subcommand completions
  for (const sub of descriptor.subcommands) {
    const parts = [`complete -c ${executableName}`]
    if (conditionArg) parts.push(conditionArg)
    parts.push(`-f -a '${escapeFishString(sub.name)}'`)
    if (sub.description) {
      parts.push(`-d '${escapeFishString(sub.description)}'`)
    }
    lines.push(parts.join(" "))
  }

  // Flag completions
  for (const flag of descriptor.flags) {
    const isBoolean = flag.type._tag === "Boolean"
    const dedup = isBoolean ? flagContainsOptCondition(flag) : valueFlagDedupCondition(flag)
    const flagCondition = condition ? `${condition}; and ${dedup}` : dedup
    const flagCondArg = flagCondition ? `-n '${flagCondition}'` : ``

    const parts = [`complete -c ${executableName}`]
    if (flagCondArg) parts.push(flagCondArg)
    parts.push(...flagCompletionArgs(flag))
    lines.push(parts.join(" "))

    // Boolean negation
    if (isBoolean) {
      const negParts = [`complete -c ${executableName}`]
      if (flagCondArg) negParts.push(flagCondArg)
      negParts.push(`-l no-${flag.name}`)
      if (flag.description) {
        negParts.push(`-d '${escapeFishString(`Disable ${flag.name}`)}'`)
      }
      lines.push(negParts.join(" "))
    }
  }

  // Flags as -a entries for bare <TAB> visibility.
  // Fish only shows -l/-s entries when the current word starts with -, so
  // without this, flags are invisible on bare <TAB>. Guarded to only show
  // when NOT already typing an option (avoids duplication with -l/-s above)
  // and hidden once a flag has been used (__fish_contains_opt).
  if (descriptor.flags.length > 0) {
    const notDash = `not string match -q -- "-*" (commandline -ct)`
    const bareBase = condition ? `${condition}; and ${notDash}` : notDash

    for (const flag of descriptor.flags) {
      const bareCondition = `${bareBase}; and ${flagContainsOptCondition(flag)}`
      const isBoolean = flag.type._tag === "Boolean"

      const parts = [`complete -c ${executableName}`]
      parts.push(`-n '${bareCondition}'`)
      parts.push(`-f -a '--${flag.name}'`)
      if (flag.description) {
        parts.push(`-d '${escapeFishString(flag.description)}'`)
      }
      lines.push(parts.join(" "))

      if (isBoolean) {
        const negParts = [`complete -c ${executableName}`]
        negParts.push(`-n '${bareCondition}'`)
        negParts.push(`-f -a '--no-${flag.name}'`)
        if (flag.description) {
          negParts.push(`-d '${escapeFishString(`Disable ${flag.name}`)}'`)
        }
        lines.push(negParts.join(" "))
      }
    }
  }

  // Argument completions (type hints only)
  for (const arg of descriptor.arguments) {
    const valueArg = argValueArgs(arg.type)
    if (valueArg) {
      const parts = [`complete -c ${executableName}`]
      if (conditionArg) parts.push(conditionArg)
      parts.push(valueArg)
      if (arg.description) {
        parts.push(`-d '${escapeFishString(arg.description)}'`)
      }
      lines.push(parts.join(" "))
    }
  }

  // Recurse into subcommands
  for (const sub of descriptor.subcommands) {
    generateCompletions(executableName, sub, [...parentPath, sub.name], lines)
  }
}

/**
 * @internal
 */
export const generate = (
  executableName: string,
  descriptor: Completions.CommandDescriptor
): string => {
  const lines: Array<string> = []

  lines.push(`###-begin-${executableName}-completions-###`)
  lines.push(`#`)
  lines.push(`# Static completion script for Fish`)
  lines.push(`#`)
  lines.push(`# Installation:`)
  lines.push(`#   ${executableName} --completions fish > ~/.config/fish/completions/${executableName}.fish`)
  lines.push(`#`)
  lines.push(``)

  generateCompletions(executableName, descriptor, [], lines)

  lines.push(``)
  lines.push(`###-end-${executableName}-completions-###`)

  return lines.join("\n")
}
