/**
 * Static Zsh completion script generator.
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

const escapeZsh = (s: string): string => s.replace(/\\/g, "\\\\").replace(/'/g, "'\\''").replace(/:/g, "\\:")

/** Escape choices for the second parse of a Zsh `_arguments` action. */
const escapeZshChoice = (s: string): string => s.replace(/[^A-Za-z0-9_.,/@%+-]/gu, "\\$&").replace(/'/g, "'\\''")

const sanitize = (s: string): string => s.replace(/[^a-zA-Z0-9_]/g, "_")

/**
 * All forms of a flag (--name, -alias, --no-name) for the exclusion group.
 */
const allForms = (flag: Completions.FlagDescriptor): Array<string> => {
  const forms: Array<string> = [`--${flag.name}`]
  for (const alias of flag.aliases) {
    forms.push(alias.length === 1 ? `-${alias}` : `--${alias}`)
  }
  if (flag.type._tag === "Boolean") {
    forms.push(`--no-${flag.name}`)
  }
  return forms
}

const valueAction = (type: Completions.FlagType): string => {
  switch (type._tag) {
    case "Boolean":
      return ""
    case "Choice":
      return `:value:(${type.values.map(escapeZshChoice).join(" ")})`
    case "Path":
      return type.pathType === "directory" ? `:directory:_directories` : `:file:_files`
    case "Int":
      return `:integer:`
    case "Finite":
      return `:float:`
    case "Date":
      return `:date:`
    default:
      return `:value:`
  }
}

const argAction = (type: Completions.ArgumentType): string => {
  switch (type._tag) {
    case "Choice":
      return `(${type.values.map(escapeZshChoice).join(" ")})`
    case "Path":
      return type.pathType === "directory" ? `_directories` : `_files`
    default:
      return ``
  }
}

/**
 * Produce _arguments optspecs for a single flag. Each spec is a complete,
 * single-quoted string — no brace expansion, no line continuations.
 */
const flagSpecs = (flag: Completions.FlagDescriptor): Array<string> => {
  const specs: Array<string> = []
  const desc = flag.description ? `[${escapeZsh(flag.description)}]` : ""
  const action = valueAction(flag.type)
  const excl = `(${allForms(flag).join(" ")})`

  // Primary long name
  specs.push(`'${excl}--${flag.name}${desc}${action}'`)

  // Aliases
  for (const alias of flag.aliases) {
    const prefix = alias.length === 1 ? "-" : "--"
    specs.push(`'${excl}${prefix}${alias}${desc}${action}'`)
  }

  // Boolean negation
  if (flag.type._tag === "Boolean") {
    const negDesc = flag.description ? `[${escapeZsh(`Disable ${flag.name}`)}]` : ""
    specs.push(`'${excl}--no-${flag.name}${negDesc}'`)
  }

  return specs
}

const argSpec = (arg: Completions.ArgumentDescriptor): string => {
  const desc = arg.description ? escapeZsh(arg.description) : arg.name
  const action = argAction(arg.type)
  const prefix = arg.variadic ? "*" : ""
  return `'${prefix}:${desc}:${action}'`
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

const generateFunction = (
  descriptor: Completions.CommandDescriptor,
  parentPath: ReadonlyArray<string>,
  lines: Array<string>
): void => {
  const currentPath = [...parentPath, descriptor.name]
  const funcName = `_${currentPath.map(sanitize).join("_")}`

  lines.push(`${funcName}() {`)

  if (descriptor.subcommands.length > 0) {
    // _arguments -C requires these locals for the state machine
    lines.push(`  local context state state_descr line`)
    lines.push(`  typeset -A opt_args`)
    lines.push(``)

    // Subcommand list
    lines.push(`  local -a commands`)
    lines.push(`  commands=(`)
    for (const sub of descriptor.subcommands) {
      const desc = sub.description ? escapeZsh(sub.description) : ""
      lines.push(`    '${sub.name}:${desc}'`)
    }
    lines.push(`  )`)
    lines.push(``)

    // Build specs array to avoid brace expansion / line continuation issues
    lines.push(`  local -a specs`)
    lines.push(`  specs=(`)
    for (const flag of descriptor.flags) {
      for (const spec of flagSpecs(flag)) {
        lines.push(`    ${spec}`)
      }
    }
    if (descriptor.arguments.length > 0) {
      lines.push(`    -`)
      lines.push(`    parent-arguments`)
      for (const arg of descriptor.arguments) {
        lines.push(`    ${argSpec(arg)}`)
      }
      lines.push(`    -`)
      lines.push(`    subcommands`)
    }
    lines.push(`    '1:command:->command'`)
    lines.push(`    '*::arg:->args'`)
    lines.push(`  )`)
    lines.push(``)
    lines.push(`  _arguments -C "\${specs[@]}"`)
    lines.push(``)

    // State dispatch
    lines.push(`  case "$state" in`)
    lines.push(`    command)`)
    lines.push(`      _describe -t commands 'commands' commands`)
    lines.push(`      ;;`)
    lines.push(`    args)`)
    lines.push(`      case "$words[1]" in`)
    for (const sub of descriptor.subcommands) {
      const subFunc = `_${[...currentPath, sub.name].map(sanitize).join("_")}`
      lines.push(`        ${sub.name})`)
      lines.push(`          ${subFunc}`)
      lines.push(`          ;;`)
    }
    lines.push(`      esac`)
    lines.push(`      ;;`)
    lines.push(`  esac`)
  } else {
    // Leaf command — no subcommands
    const allSpecs: Array<string> = []
    for (const flag of descriptor.flags) {
      allSpecs.push(...flagSpecs(flag))
    }
    for (const arg of descriptor.arguments) {
      allSpecs.push(argSpec(arg))
    }
    if (allSpecs.length > 0) {
      lines.push(`  local -a specs`)
      lines.push(`  specs=(`)
      for (const spec of allSpecs) {
        lines.push(`    ${spec}`)
      }
      lines.push(`  )`)
      lines.push(`  _arguments "\${specs[@]}"`)
    }
  }

  lines.push(`}`)
  lines.push(``)

  for (const sub of descriptor.subcommands) {
    generateFunction(sub, currentPath, lines)
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
  const safeName = sanitize(executableName)

  lines.push(`#compdef ${executableName}`)
  lines.push(`###-begin-${executableName}-completions-###`)
  lines.push(`#`)
  lines.push(`# Static completion script for Zsh`)
  lines.push(`#`)
  lines.push(`# Installation:`)
  lines.push(`#   ${executableName} --completions zsh > ~/.zsh/completions/_${executableName}`)
  lines.push(`#   then add ~/.zsh/completions to your fpath`)
  lines.push(`#`)
  lines.push(``)

  generateFunction(descriptor, [], lines)

  lines.push(`# Handle both direct invocation and autoload`)
  lines.push(`if [[ "\${zsh_eval_context[-1]}" == "loadautofunc" ]]; then`)
  lines.push(`  _${safeName} "$@"`)
  lines.push(`else`)
  lines.push(`  compdef _${safeName} ${executableName}`)
  lines.push(`fi`)
  lines.push(`###-end-${executableName}-completions-###`)

  return lines.join("\n")
}
