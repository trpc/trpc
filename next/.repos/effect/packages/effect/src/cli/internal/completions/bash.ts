/**
 * Static Bash completion script generator.
 *
 * Produces a self-contained completion script from a `CommandDescriptor` —
 * no re-invocation of the CLI at runtime.
 *
 * @internal
 */
import type * as Completions from "../../Completions.ts"
import { negatedName, takesSeparateValue } from "./descriptor.ts"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const escapeForBash = (s: string): string => s.replace(/'/g, "'\\''")

const sanitizeFunctionName = (s: string): string => s.replace(/[^a-zA-Z0-9_]/g, "_")

const flagNamesForWordlist = (flag: Completions.FlagDescriptor): Array<string> => {
  const names: Array<string> = [`--${flag.name}`]
  for (const alias of flag.aliases) {
    names.push(alias.length === 1 ? `-${alias}` : `--${alias}`)
  }
  const negation = negatedName(flag)
  if (negation !== undefined) {
    names.push(`--${negation}`)
  }
  return names
}

/** Emit a Bash 3.2-compatible used-flag filter. */
const buildFlagGroupDeclarations = (
  flags: ReadonlyArray<Completions.FlagDescriptor>,
  lines: Array<string>
): void => {
  if (flags.length === 0) return
  const groups = flags.map(flagNamesForWordlist)
  lines.push(`  local ${groups.map((_, index) => `_used_${index}=""`).join(" ")}`)
  lines.push(`  for ((i = 1; i < cword; i++)); do`)
  lines.push(`    case "\${words[i]%%=*}" in`)
  groups.forEach((forms, index) => {
    lines.push(`      ${forms.join("|")}) _used_${index}=1 ;;`)
  })
  lines.push(`    esac`)
  lines.push(`  done`)
  lines.push(`  local _filtered_flags=""`)
  groups.forEach((forms, index) => {
    lines.push(`  [[ -n "$_used_${index}" ]] || _filtered_flags+=" ${forms.join(" ")}"`)
  })
  lines.push(``)
}

// Quoting these substitutions breaks quote matching on Bash 3.2.
const removeQuotes = (variable: string): string =>
  [`\\\\`, `\\"`, `\\'`].map((quote) => `${variable}=\${${variable}//${quote}/}`).join("; ")

/**
 * Complete choices without `compgen -W`, which reparses quoted values. Escape
 * only the portion readline replaces for the active quote context.
 *
 * `!` cannot be escaped inside a user-opened double quote without changing the
 * resulting argument.
 */
const choicesHelper = (helperName: string, lines: Array<string>): void => {
  lines.push(`${helperName}()`)
  lines.push(`{`)
  lines.push(`  local _cur="$1" _word="$2"; shift 2`)
  lines.push(``)
  lines.push(`  local _head="\${_cur%"$_word"}"`)
  lines.push(`  local _open=""`)
  lines.push(`  case "$_head" in`)
  lines.push(`    *\\') _open="'" ;;`)
  lines.push(`    *\\") _open='"' ;;`)
  lines.push(`  esac`)
  lines.push(``)
  lines.push(`  local _prefix="$_cur" _committed="$_head"`)
  lines.push(`  ${removeQuotes("_prefix")}`)
  lines.push(`  ${removeQuotes("_committed")}`)
  lines.push(``)
  lines.push(`  COMPREPLY=()`)
  lines.push(`  local _choice _rest _match`)
  lines.push(`  for _choice in "$@"; do`)
  lines.push(`    [[ "$_choice" == "$_prefix"* ]] || continue`)
  lines.push(`    _rest="\${_choice#"$_committed"}"`)
  lines.push(`    case "$_open" in`)
  lines.push(`      "'")`)
  lines.push(`        if [[ "$_head" == "'" ]]; then`)
  // Use a shell splice for a quote opened at the start of the word.
  lines.push(`          _match=\${_rest//\\'/\\'\\\\\\'\\'}`)
  lines.push(`        else`)
  // A mid-word single-quote context cannot contain another single quote.
  lines.push(`          [[ "$_rest" == *\\'* ]] && continue`)
  lines.push(`          _match="$_rest"`)
  lines.push(`        fi`)
  lines.push(`        ;;`)
  lines.push(`      '"')`)
  lines.push(`        _match="\${_rest//\\\\/\\\\\\\\}"`)
  lines.push(`        _match="\${_match//\\$/\\\\$}"`)
  lines.push("        _match=\"${_match//\\`/\\\\\\`}\"")
  lines.push(`        _match="\${_match//\\"/\\\\\\"}"`)
  lines.push(`        ;;`)
  lines.push(`      *)`)
  lines.push(`        printf -v _match '%q' "$_rest"`)
  // Bash 3.2 leaves a leading tilde unescaped.
  lines.push(`        [[ -z "$_head" && "$_match" == '~'* ]] && _match="\\\\$_match"`)
  lines.push(`        ;;`)
  lines.push(`    esac`)
  // Readline omits a closing quote already present in the match.
  lines.push(`    [[ -n "$_open" && "$_match" == *"$_open" ]] && _match+="$_open"`)
  lines.push(`    COMPREPLY+=("$_match")`)
  lines.push(`  done`)
  lines.push(`}`)
  lines.push(``)
}

interface Helpers {
  readonly choices: string
  readonly paths: string
}

/**
 * Complete paths through the choice helper, one `compgen` line per candidate.
 * The typed directory is kept as written so expansions in it still apply; only
 * the completed name is quoted.
 */
const pathsHelper = (helpers: Helpers, lines: Array<string>): void => {
  lines.push(`${helpers.paths}()`)
  lines.push(`{`)
  lines.push(`  local _kind="$1" _cur="$2" _word="$3"`)
  lines.push(``)
  lines.push(`  local _prefix="$_cur" _committed="\${_cur%"$_word"}"`)
  lines.push(`  ${removeQuotes("_prefix")}`)
  lines.push(`  ${removeQuotes("_committed")}`)
  lines.push(``)
  // Track a quote the typed directory leaves open.
  lines.push(`  local _typed="" _dir="$_committed" _open="" _i`)
  lines.push(`  if [[ "$_word" == */* ]]; then`)
  lines.push(`    _typed="\${_word%/*}/"`)
  lines.push(`    _dir="\${_prefix%/*}/"`)
  lines.push(`    if [[ "$_cur" == "$_word" ]]; then`)
  lines.push(`      for ((_i = 0; _i < \${#_typed}; _i++)); do`)
  lines.push(`        case "$_open\${_typed:_i:1}" in`)
  lines.push(`          \\\\|\\"\\\\) ((_i += 1)) ;;`)
  lines.push(`          \\"|\\') _open="\${_typed:_i:1}" ;;`)
  lines.push(`          \\"\\"|\\'\\') _open="" ;;`)
  lines.push(`        esac`)
  lines.push(`      done`)
  lines.push(`    fi`)
  lines.push(`  fi`)
  lines.push(``)
  lines.push(`  local _path _names=() _rest="\${_word#"$_typed"}"`)
  lines.push(`  while IFS= read -r _path; do`)
  lines.push(`    if [[ "$_path" == "$_dir"* ]]; then`)
  lines.push(`      _names+=("$_committed\${_path#"$_dir"}")`)
  lines.push(`    elif [[ -z "$_committed" ]]; then`)
  // Bash 3.2 returns expanded paths, which replace the whole word.
  lines.push(`      _names+=("$_path")`)
  lines.push(`      _typed="" _rest="" _open=""`)
  lines.push(`    fi`)
  lines.push(`  done < <(compgen "$_kind" -- "$_prefix")`)
  // Close the quote before the name so a common prefix stays balanced.
  lines.push(`  if [[ -n "$_open" ]]; then`)
  lines.push(`    _typed+="$_open"`)
  lines.push(`    _rest="\${_prefix##*/}"`)
  lines.push(`  fi`)
  lines.push(``)
  lines.push(`  ${helpers.choices} "\${_cur%"$_word"}$_rest" "$_rest" "\${_names[@]}"`)
  lines.push(`  for ((_i = 0; _i < \${#COMPREPLY[@]}; _i++)); do`)
  lines.push(`    COMPREPLY[_i]="$_typed\${COMPREPLY[_i]}"`)
  lines.push(`  done`)
  lines.push(`}`)
  lines.push(``)
}

const valueCompletion = (
  type: Completions.FlagType | Completions.ArgumentType,
  helpers: Helpers
): string | undefined => {
  switch (type._tag) {
    case "Choice": {
      const values = type.values.map((value) => `'${escapeForBash(value)}'`).join(" ")
      return `${helpers.choices} "$cur" "$_comp_word" ${values}`
    }
    case "Path":
      return `${helpers.paths} ${type.pathType === "directory" ? "-d" : "-f"} "$cur" "$_comp_word"`
    default:
      return undefined
  }
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

const generateFunction = (
  descriptor: Completions.CommandDescriptor,
  parentPath: ReadonlyArray<string>,
  lines: Array<string>,
  helpers: Helpers
): void => {
  const currentPath = [...parentPath, descriptor.name]
  const funcName = `_${currentPath.map(sanitizeFunctionName).join("_")}`

  lines.push(`${funcName}()`)
  lines.push(`{`)
  lines.push(`  local cur prev words cword i`)
  lines.push(parentPath.length === 0 ? `  local _command_index=0` : `  local _command_index="$1"`)
  // Keep values containing COMP_WORDBREAKS characters in one word.
  lines.push(`  _init_completion -n "$COMP_WORDBREAKS" || return`)
  if (parentPath.length === 0) {
    // Subcommand functions inherit this through Bash's dynamic scope.
    lines.push(`  local _comp_word="$2"`)
  }
  lines.push(``)

  // Build flag-value dispatch
  const flagsWithValues = descriptor.flags.filter(takesSeparateValue)
  if (flagsWithValues.length > 0) {
    lines.push(`  # Flag value completions`)
    lines.push(`  case "$prev" in`)
    for (const flag of flagsWithValues) {
      const longNames = [`--${flag.name}`]
      for (const alias of flag.aliases) {
        longNames.push(alias.length === 1 ? `-${alias}` : `--${alias}`)
      }
      const completion = valueCompletion(flag.type, helpers)
      if (completion) {
        lines.push(`    ${longNames.join("|")})`)
        lines.push(`      ${completion}`)
        lines.push(`      return`)
        lines.push(`      ;;`)
      }
    }
    lines.push(`  esac`)
    lines.push(``)
  }

  // Subcommand dispatch
  if (descriptor.subcommands.length > 0) {
    lines.push(`  # Subcommand dispatch`)
    lines.push(`  local cmd _skip_next=0`)
    lines.push(`  for ((i = _command_index + 1; i < cword; i++)); do`)
    lines.push(`    if (( _skip_next )); then`)
    lines.push(`      _skip_next=0`)
    lines.push(`      continue`)
    lines.push(`    fi`)
    lines.push(`    case "\${words[i]}" in`)
    for (const flag of descriptor.flags) {
      if (!takesSeparateValue(flag)) continue
      const forms = flagNamesForWordlist(flag)
      lines.push(`      ${forms.join("|")}) _skip_next=1 ;;`)
      lines.push(`      ${forms.map((form) => `${form}=*`).join("|")}) ;;`)
    }
    for (const sub of descriptor.subcommands) {
      const subFuncName = `_${[...currentPath, sub.name].map(sanitizeFunctionName).join("_")}`
      lines.push(`      ${sub.name})`)
      lines.push(`        ${subFuncName} "$i"`)
      lines.push(`        return`)
      lines.push(`        ;;`)
    }
    lines.push(`    esac`)
    lines.push(`  done`)
    lines.push(``)
  }

  // Filter already-used flags (entire alias group removed when any form is used)
  buildFlagGroupDeclarations(descriptor.flags, lines)

  if (descriptor.flags.length > 0 || descriptor.subcommands.length > 0) {
    lines.push(`  # Complete flags (filtered) and subcommands`)
    lines.push(`  if [[ "$cur" == -* ]]; then`)
    if (descriptor.flags.length > 0) {
      lines.push(`    COMPREPLY=( $(compgen -W "$_filtered_flags" -- "$cur") )`)
    }
    lines.push(`    return`)
    lines.push(`  fi`)
    lines.push(``)
  }

  // Positional argument completion
  const argsWithCompletions = descriptor.arguments.flatMap((argument, index) => {
    const completion = valueCompletion(argument.type, helpers)
    return completion === undefined ? [] : [{ argument, completion, index }]
  })
  if (argsWithCompletions.length > 0) {
    lines.push(`  # Positional argument completions`)
    lines.push(`  local _position=0 _skip_next=0 _end_of_options=0`)
    lines.push(`  for ((i = _command_index + 1; i < cword; i++)); do`)
    lines.push(`    if (( _skip_next )); then`)
    lines.push(`      _skip_next=0`)
    lines.push(`      continue`)
    lines.push(`    fi`)
    lines.push(`    if (( _end_of_options )); then`)
    lines.push(`      ((_position += 1))`)
    lines.push(`      continue`)
    lines.push(`    fi`)
    lines.push(`    case "\${words[i]}" in`)
    lines.push(`      --) _end_of_options=1 ;;`)
    for (const flag of descriptor.flags) {
      const forms = flagNamesForWordlist(flag)
      if (!takesSeparateValue(flag)) {
        lines.push(`      ${forms.join("|")}) ;;`)
      } else {
        lines.push(`      ${forms.join("|")}) _skip_next=1 ;;`)
        lines.push(`      ${forms.map((form) => `${form}=*`).join("|")}) ;;`)
      }
    }
    lines.push(`      -*) ;;`)
    lines.push(`      *) ((_position += 1)) ;;`)
    lines.push(`    esac`)
    lines.push(`  done`)
    lines.push(`  case "$_position" in`)
    for (const { argument, completion, index } of argsWithCompletions) {
      if (argument.variadic) continue
      lines.push(`    ${index})`)
      lines.push(`      ${completion}`)
      lines.push(`      return`)
      lines.push(`      ;;`)
    }
    lines.push(`  esac`)
    const variadic = argsWithCompletions.find(({ argument }) => argument.variadic)
    if (variadic !== undefined) {
      lines.push(`  if (( _position >= ${variadic.index} )); then`)
      lines.push(`    ${variadic.completion}`)
      lines.push(`    return`)
      lines.push(`  fi`)
    }
  } else if (descriptor.subcommands.length > 0) {
    const subNames = descriptor.subcommands.map((s) => s.name)
    lines.push(`  COMPREPLY=( $(compgen -W '${subNames.join(" ")}' -- "$cur") )`)
  }

  lines.push(`}`)
  lines.push(``)

  // Recurse into subcommands
  for (const sub of descriptor.subcommands) {
    generateFunction(sub, currentPath, lines, helpers)
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
  const safeName = sanitizeFunctionName(executableName)
  // Sanitized command names cannot contain `-`.
  const helpers: Helpers = { choices: `_${safeName}--choices`, paths: `_${safeName}--paths` }

  lines.push(`###-begin-${escapeForBash(executableName)}-completions-###`)
  lines.push(`#`)
  lines.push(`# Static completion script for Bash`)
  lines.push(`#`)
  lines.push(`# Installation:`)
  lines.push(`#   ${escapeForBash(executableName)} --completions bash >> ~/.bashrc`)
  lines.push(`#`)
  lines.push(``)

  // Fallback for environments without bash-completion. Preserve word-break
  // characters inside values.
  lines.push(`if ! type _init_completion &>/dev/null; then`)
  lines.push(`  _init_completion()`)
  lines.push(`  {`)
  lines.push(`    COMPREPLY=()`)
  lines.push(`    local _i _j=0 _piece _line="$COMP_LINE"`)
  lines.push(`    words=("\${COMP_WORDS[0]}")`)
  lines.push(`    cword=0`)
  lines.push(`    _line="\${_line#*"\${COMP_WORDS[0]}"}"`)
  lines.push(`    for ((_i = 1; _i < \${#COMP_WORDS[@]}; _i++)); do`)
  lines.push(`      _piece="\${COMP_WORDS[_i]}"`)
  lines.push(`      if [[ "$_line" == [[:blank:]]* ]]; then`)
  lines.push(`        ((_j++))`)
  lines.push(`        words[_j]="$_piece"`)
  lines.push(`      else`)
  lines.push(`        words[_j]="\${words[_j]}$_piece"`)
  lines.push(`      fi`)
  lines.push(`      ((_i == COMP_CWORD)) && cword=$_j`)
  lines.push(`      _line="\${_line#*"$_piece"}"`)
  lines.push(`    done`)
  lines.push(`    cur="\${words[cword]}"`)
  lines.push(`    prev=""`)
  lines.push(`    ((cword > 0)) && prev="\${words[cword-1]}"`)
  lines.push(`    return 0`)
  lines.push(`  }`)
  lines.push(`fi`)
  lines.push(``)

  choicesHelper(helpers.choices, lines)
  pathsHelper(helpers, lines)
  generateFunction(descriptor, [], lines, helpers)

  lines.push(`complete -F _${safeName} ${escapeForBash(executableName)}`)
  lines.push(`###-end-${escapeForBash(executableName)}-completions-###`)

  return lines.join("\n")
}
