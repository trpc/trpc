/**
 * Static PowerShell completion script generator.
 *
 * Produces a self-contained completion script from a `CommandDescriptor`,
 * without invoking the CLI at runtime. The script sticks to Windows
 * PowerShell 5.1 syntax and APIs.
 *
 * @internal
 */
import type * as Completions from "../../Completions.ts"
import { negatedName } from "./descriptor.ts"

/**
 * Encode non-ASCII and control characters as `[char]` code units. Windows
 * PowerShell 5.1 can misread BOM-less UTF-8 as ANSI, turning some bytes into
 * PowerShell quote delimiters.
 */
const quotePs = (s: string): string => {
  const parts: Array<string> = []
  let literal = ""
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    if (code >= 0x20 && code < 0x80) {
      literal += s[i] === "'" ? "''" : s[i]
      continue
    }
    if (literal !== "" || parts.length === 0) parts.push(`'${literal}'`)
    literal = ""
    parts.push(`[char]0x${code.toString(16).toUpperCase().padStart(4, "0")}`)
  }
  if (literal !== "" || parts.length === 0) parts.push(`'${literal}'`)
  return parts.length === 1 ? parts[0] : `(${parts.join(" + ")})`
}

const psArray = (items: ReadonlyArray<string>): string => `@(${items.map(quotePs).join(", ")})`

const psOptional = (s: string | undefined): string => s ? quotePs(s) : "$null"

const sanitize = (s: string): string => s.replace(/[^a-zA-Z0-9_]/g, "_")

const flagForms = (flag: Completions.FlagDescriptor): Array<string> => [
  `--${flag.name}`,
  ...flag.aliases.map((alias) => alias.length === 1 ? `-${alias}` : `--${alias}`)
]

const valueFields = (type: Completions.FlagType | Completions.ArgumentType): string =>
  `values = ${psArray(type._tag === "Choice" ? type.values : [])}; ` +
  `pathType = ${type._tag === "Path" ? quotePs(type.pathType) : "$null"}`

const flagEntry = (flag: Completions.FlagDescriptor): string => {
  const negation = negatedName(flag)
  return `@{ name = ${quotePs(flag.name)}; forms = ${psArray(flagForms(flag))}; ` +
    `takesValue = $${flag.type._tag !== "Boolean"}; ` +
    (negation === undefined ? "" : `negation = ${quotePs(`--${negation}`)}; `) +
    (flag.optionalValue === true ? `optionalValue = $true; ` : "") +
    `${valueFields(flag.type)}; ` +
    `description = ${psOptional(flag.description)} }`
}

const argumentEntry = (argument: Completions.ArgumentDescriptor): string =>
  `@{ name = ${quotePs(argument.name)}; variadic = $${argument.variadic}; ${valueFields(argument.type)}; ` +
  `description = ${psOptional(argument.description)} }`

const pushList = (lines: Array<string>, field: string, entries: ReadonlyArray<string>): void => {
  if (entries.length === 0) {
    lines.push(`  ${field} = @()`)
    return
  }
  lines.push(`  ${field} = @(`)
  for (const entry of entries) {
    lines.push(`    ${entry}`)
  }
  lines.push(`  )`)
}

/**
 * Emit one context per subcommand path. Subcommands are case-sensitive, so
 * contexts go in an ordinal hashtable instead of a hash literal, whose keys
 * ignore case.
 */
const generateContexts = (
  dataName: string,
  descriptor: Completions.CommandDescriptor,
  path: ReadonlyArray<string>,
  lines: Array<string>,
  seen: Set<string>
): void => {
  const key = path.join(" ")
  if (seen.has(key)) return
  seen.add(key)
  lines.push(`${dataName}[${quotePs(key)}] = @{`)
  pushList(
    lines,
    "subcommands",
    descriptor.subcommands.map((sub) =>
      `@{ name = ${quotePs(sub.name)}; description = ${psOptional(sub.description)} }`
    )
  )
  pushList(lines, "flags", descriptor.flags.map(flagEntry))
  pushList(lines, "arguments", descriptor.arguments.map(argumentEntry))
  lines.push(`}`)
  for (const sub of descriptor.subcommands) {
    generateContexts(dataName, sub, [...path, sub.name], lines, seen)
  }
}

/**
 * Replay the committed words with the CLI lexer and parser rules: `--`, short
 * flag clusters, inline values, boolean literals, negative numbers, and
 * subcommand selection by the first value only.
 */
const completer = (dataName: string): string =>
  String.raw`  param($wordToComplete, $commandAst, $cursorPosition)

  $spec = ${dataName}
  $results = [System.Collections.Generic.List[System.Management.Automation.CompletionResult]]::new()
  $booleanLiterals = @('true', 'yes', 'on', '1', 'y', 'false', 'no', 'off', '0', 'n')

  $index = {
    param($context)
    $lookup = [hashtable]::new([System.StringComparer]::Ordinal)
    foreach ($flag in $context.flags) {
      foreach ($form in $flag.forms) { $lookup[$form] = $flag }
    }
    $lookup
  }

  $add = {
    param([string]$value, [string]$type, $tooltip, [string]$typed, [string]$textPrefix)
    if (-not $value.StartsWith($typed, [System.StringComparison]::OrdinalIgnoreCase)) { return }
    $text = $value
    if ($value -notmatch '^[\w./:%+=\\-]+$') { $text = "'" + ($value -replace "['\u2018-\u201b]", '$0$0') + "'" }
    $text = $textPrefix + $text
    $label = $value
    if (-not $label) { $label = $text }
    if (-not $tooltip) { $tooltip = $label }
    $results.Add([System.Management.Automation.CompletionResult]::new($text, $label, $type, $tooltip))
  }

  $addValues = {
    param($entry, [string]$typed, [string]$textPrefix)
    foreach ($value in $entry.values) {
      if ($textPrefix -eq '' -and (& $optionLike $value)) { continue }
      & $add $value 'ParameterValue' $entry.description $typed $textPrefix
    }
    if ($entry.pathType) {
      foreach ($file in [System.Management.Automation.CompletionCompleters]::CompleteFilename($typed)) {
        if ($entry.pathType -eq 'directory' -and $file.ResultType -ne 'ProviderContainer') { continue }
        $results.Add([System.Management.Automation.CompletionResult]::new($textPrefix + $file.CompletionText, $file.ListItemText, $file.ResultType, $file.ToolTip))
      }
    }
  }

  $addFlags = {
    param([string]$typed)
    foreach ($flag in $context.flags) {
      if ($used.ContainsKey($flag.name)) { continue }
      foreach ($form in $flag.forms) {
        & $add $form 'ParameterName' $flag.description $typed ''
      }
      if ($flag.negation) {
        $tooltip = $null
        if ($flag.description) { $tooltip = 'Disable ' + $flag.name }
        & $add $flag.negation 'ParameterName' $tooltip $typed ''
      }
    }
  }

  # As in the CLI lexer, nothing after '--' is an option, and negative numbers
  # and a lone '-' are values.
  $optionLike = {
    param([string]$word)
    -not $endOfOptions -and $word -match '^-.' -and $word -notmatch '^-(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$'
  }

  # A typed value that has no candidates completes to itself, so the engine
  # does not fall back to listing files.
  $keepTyped = {
    if ($results.Count -eq 0 -and $current) {
      $results.Add([System.Management.Automation.CompletionResult]::new($current, $current, 'ParameterValue', $current))
    }
  }

  $path = ''
  $context = $spec[$path]
  $lookup = & $index $context
  $used = [hashtable]::new([System.StringComparer]::Ordinal)
  $pending = $null
  $endOfOptions = $false
  $position = 0

  # The engine strips the quotes from a quoted word.
  $typed = [string]$wordToComplete
  if ($typed -match '^([''"])(.*?)\1?$') { $typed = $Matches[2] }
  $current = $null

  $elements = $commandAst.CommandElements
  for ($i = 1; $i -lt $elements.Count; $i++) {
    $element = $elements[$i]
    $word = $element.Extent.Text
    if ($element -is [System.Management.Automation.Language.StringConstantExpressionAst]) { $word = $element.Value }
    if ($element.Extent.EndOffset -ge $cursorPosition) {
      if ($element -is [System.Management.Automation.Language.ConstantExpressionAst] -and $element.Extent.StartOffset -le $cursorPosition) {
        $current = $element.Extent.Text
        if ($element.Extent.EndOffset -eq $cursorPosition) { $typed = $word }
      }
      break
    }

    # A flag takes the next word as its value unless it is an option or '--';
    # a boolean flag only takes a boolean literal.
    $isOption = & $optionLike $word
    if ($null -ne $pending) {
      $flag = $pending
      $pending = $null
      if ($flag.takesValue) {
        if (-not $isOption) { continue }
      } elseif ($booleanLiterals -ccontains $word) { continue }
    }
    if ($endOfOptions) { $position++; continue }
    if ($word -ceq '--') { $endOfOptions = $true; continue }

    if ($isOption) {
      $hasValue = $word.Contains('=')
      if ($hasValue) {
        $forms = @($word.Substring(0, $word.IndexOf('=')))
      } elseif ($word.StartsWith('--')) {
        $forms = @($word)
      } else {
        $forms = @(foreach ($char in $word.Substring(1).ToCharArray()) { '-' + $char })
      }
      foreach ($form in $forms) {
        $pending = $null
        $flag = $lookup[$form]
        # As in the CLI parser, a negation wins over an alias but not over a
        # canonical name.
        if ($null -eq $flag -or $form -cne ('--' + $flag.name)) {
          $negated = $null
          foreach ($candidate in $context.flags) {
            if ($candidate.negation -ceq $form) { $negated = $candidate }
          }
          if ($null -ne $negated) {
            $used[$negated.name] = $true
            continue
          }
        }
        if ($null -eq $flag) { continue }
        $used[$flag.name] = $true
        # A flag with an optional value only takes a value attached with '='.
        if (-not $hasValue -and -not $flag.optionalValue) { $pending = $flag }
      }
      continue
    }

    if ($position -eq 0 -and $context.subcommands.name -ccontains $word) {
      if ($path) { $path = $path + ' ' + $word } else { $path = $word }
      $context = $spec[$path]
      $lookup = & $index $context
      $used = [hashtable]::new([System.StringComparer]::Ordinal)
      continue
    }
    $position++
  }

  $typedIsOption = & $optionLike $typed
  if ($null -ne $pending -and $pending.takesValue -and -not $typedIsOption) {
    & $addValues $pending $typed ''
    & $keepTyped
    return $results
  }

  if ($typedIsOption) {
    if ($typed -match '^(-[^=]+)=(.*)$') {
      $form = $Matches[1]
      $flag = $lookup[$form]
      if ($null -ne $flag -and $flag.takesValue) {
        & $addValues $flag $Matches[2] ($form + '=')
        & $keepTyped
      }
    } else {
      & $addFlags $typed
    }
    return $results
  }

  if (-not $endOfOptions -and $position -eq 0) {
    foreach ($sub in $context.subcommands) {
      & $add $sub.name 'Command' $sub.description $typed ''
    }
  }

  $arguments = $context.arguments
  if ($position -lt $arguments.Count) {
    & $addValues $arguments[$position] $typed ''
  } elseif ($arguments.Count -gt 0 -and $arguments[-1].variadic) {
    & $addValues $arguments[-1] $typed ''
  }

  if (-not $endOfOptions) {
    & $addFlags $typed
  }
  return $results`

/** @internal */
export const generate = (
  executableName: string,
  descriptor: Completions.CommandDescriptor
): string => {
  const dataName = `$global:_${sanitize(executableName)}_Completions`
  const lines: Array<string> = []

  lines.push(`###-begin-${executableName}-completions-###`)
  lines.push(`#`)
  lines.push(`# Static completion script for PowerShell`)
  lines.push(`#`)
  lines.push(`# Installation:`)
  // `>>` on Windows PowerShell 5.1 appends UTF-16LE to the profile, so the
  // script goes in its own file.
  lines.push(`#   ${executableName} --completions powershell > ${executableName}-completion.ps1`)
  lines.push(`#   then add this line to your $PROFILE (use the full path to the file):`)
  lines.push(`#   . <PATH>\\${executableName}-completion.ps1`)
  lines.push(`#`)
  lines.push(``)
  lines.push(`${dataName} = [hashtable]::new([System.StringComparer]::Ordinal)`)
  generateContexts(dataName, descriptor, [], lines, new Set())
  lines.push(``)
  lines.push(`Register-ArgumentCompleter -Native -CommandName ${quotePs(executableName)} -ScriptBlock {`)
  lines.push(completer(dataName))
  lines.push(`}`)
  lines.push(``)
  lines.push(`###-end-${executableName}-completions-###`)

  return lines.join("\n")
}
