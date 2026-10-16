/**
 * Parsing Pipeline for CLI Commands
 * ==================================
 *
 * The parser transforms raw argv tokens into structured command input through
 * three main phases:
 *
 * 1. **Lexer** (external): Converts argv strings into typed tokens
 *    - LongOption: --name or --name=value
 *    - ShortOption: -n or -n=value (also handles -abc as three flags)
 *    - Value: positional arguments
 *
 * 2. **Built-in Extraction**: Peels off built-in flags (help/version/completions)
 *    before command-specific parsing begins.
 *
 * 3. **Command Parsing**: Recursively processes command levels:
 *    - Collects flags defined at this level
 *    - Detects subcommand from first value token
 *    - Forwards remaining tokens to child command
 *
 * Key Behaviors
 * -------------
 * - Inherited parent flags may appear before OR after the subcommand name (npm-style)
 * - Only the first Value token can open a subcommand
 * - Errors accumulate rather than throwing exceptions
 */
import * as Effect from "../../Effect.ts"
import * as Option from "../../Option.ts"
import * as CliError from "../CliError.ts"
import type { Command, Environment, ParsedTokens } from "../Command.ts"
import * as Param from "../Param.ts"
import * as Primitive from "../Primitive.ts"
import { suggest } from "./auto-suggest.ts"
import { toImpl } from "./command.ts"
import type { LexResult, Token } from "./lexer.ts"

/* ========================================================================== */
/* Public API                                                                 */
/* ========================================================================== */

/**
 * @internal
 */
export const getCommandPath = (parsedInput: ParsedTokens): ReadonlyArray<string> =>
  Option.match(parsedInput.subcommand, {
    onNone: () => [],
    onSome: (subcommand) => [subcommand.name, ...getCommandPath(subcommand.parsedInput)]
  })

/**
 * @internal
 */
export const parseArgs = (
  lexResult: LexResult,
  command: Command.Any,
  commandPath: ReadonlyArray<string> = []
): Effect.Effect<ParsedTokens, never, Environment> =>
  Effect.gen(function*() {
    const { tokens, trailingOperands: afterEndOfOptions } = lexResult
    const newCommandPath = [...commandPath, command.name]

    const commandImpl = toImpl(command)
    const singles = commandImpl.config.flags.flatMap(Param.extractSingleParams)
    const flagParams = singles.filter(Param.isFlagParam)
    const flagRegistry = createFlagRegistry(flagParams)

    const inheritedSingles = commandImpl.contextConfig.flags.flatMap(Param.extractSingleParams)
    const inheritedFlagParams = inheritedSingles.filter(Param.isFlagParam)
    const inheritedFlagRegistry = createFlagRegistry(inheritedFlagParams)
    const inheritedNames = new Set(inheritedFlagParams.map((param) => param.name))

    const context: CommandContext = {
      command,
      commandPath: newCommandPath,
      flagRegistry,
      inheritedFlagRegistry,
      localFlagNames: flagParams.filter((param) => !inheritedNames.has(param.name)).map((param) => param.name)
    }

    const result = scanCommandLevel(tokens, context)

    if (result._tag === "Leaf") {
      return {
        flags: result.flags,
        arguments: [...result.arguments, ...afterEndOfOptions],
        subcommand: Option.none(),
        ...(result.errors.length > 0 && { errors: result.errors })
      }
    }

    const subLex: LexResult = { tokens: result.childTokens, trailingOperands: afterEndOfOptions }
    const subParsed = yield* parseArgs(
      subLex,
      result.sub,
      newCommandPath
    )

    const allErrors = [...result.errors, ...(subParsed.errors ?? [])]
    return {
      flags: result.flags,
      arguments: [],
      subcommand: Option.some({ name: result.sub.name, parsedInput: subParsed }),
      ...(allErrors.length > 0 && { errors: allErrors })
    }
  })

/* ========================================================================== */
/* Types                                                                      */
/* ========================================================================== */

type FlagParam = Param.Single<typeof Param.flagKind, unknown>

/**
 * Mutable map of flag names to their collected string values.
 * Used internally during parsing; converted to readonly at boundaries.
 */
type FlagMap = Record<string, Array<string>>

/**
 * Registry of known flags for a command level.
 * Enables O(1) lookup of flag definitions by name or alias.
 */
type FlagRegistry = {
  /** All flag params declared at this command level */
  readonly params: ReadonlyArray<FlagParam>
  /** Maps canonical names and aliases → flag param */
  readonly index: Map<string, FlagParam>
}

/**
 * Mutable accumulator for collecting flag values during parsing.
 * Provides methods to add values and merge results from sub-scans.
 */
type FlagAccumulator = {
  /** Record a value for a flag. No-op if raw is undefined (for boolean flags). */
  readonly add: (name: string, raw: string | undefined) => void
  /** Merge values from another flag map into this accumulator */
  readonly merge: (from: FlagMap) => void
  /** Return immutable snapshot of accumulated values */
  readonly snapshot: () => Readonly<FlagMap>
}

/**
 * Context for parsing a command level.
 */
type CommandContext = {
  readonly command: Command.Any
  readonly commandPath: ReadonlyArray<string>
  readonly flagRegistry: FlagRegistry
  readonly inheritedFlagRegistry: FlagRegistry
  readonly localFlagNames: ReadonlyArray<string>
}

/**
 * Parsing mode during command-level scanning.
 * Determines how value tokens are interpreted.
 */
type ParseMode =
  | { readonly _tag: "AwaitingFirstValue" }
  | { readonly _tag: "CollectingArguments" }

/**
 * Mutable state accumulated during command-level parsing.
 */
type ParseState = {
  readonly flags: FlagAccumulator
  readonly arguments: Array<string>
  readonly errors: Array<CliError.NonShowHelpErrors>
  mode: ParseMode
}

/**
 * Result when first value token is processed.
 */
type FirstValueResult =
  | { readonly _tag: "Subcommand"; readonly result: SubcommandResult }
  | { readonly _tag: "Argument" }

/**
 * Terminal result: command level has no subcommand.
 */
type LeafResult = {
  readonly _tag: "Leaf"
  readonly flags: Readonly<FlagMap>
  readonly arguments: ReadonlyArray<string>
  readonly errors: ReadonlyArray<CliError.NonShowHelpErrors>
}

/**
 * Continuation result: subcommand detected, child parsing needed.
 */
type SubcommandResult = {
  readonly _tag: "Sub"
  readonly flags: Readonly<FlagMap>
  readonly sub: Command<string, unknown, unknown, unknown, unknown>
  readonly childTokens: ReadonlyArray<Token>
  readonly errors: ReadonlyArray<CliError.NonShowHelpErrors>
}

type LevelResult = LeafResult | SubcommandResult

/* ========================================================================== */
/* Token Cursor                                                               */
/* ========================================================================== */

/**
 * Stateful cursor for navigating a token stream.
 * Provides peek/take semantics for single-pass parsing.
 */
interface TokenCursor {
  /** View next token without consuming */
  readonly peek: () => Token | undefined
  /** Consume and return next token */
  readonly take: () => Token | undefined
  /** Get all remaining tokens (does not consume) */
  readonly rest: () => ReadonlyArray<Token>
}

const makeCursor = (tokens: ReadonlyArray<Token>): TokenCursor => {
  let i = 0
  return {
    peek: () => tokens[i],
    take: () => tokens[i++],
    rest: () => tokens.slice(i)
  }
}

/* ========================================================================== */
/* Flag Registry                                                              */
/* ========================================================================== */

/**
 * Creates a registry for O(1) flag lookup by name or alias.
 * @internal
 */
export const createFlagRegistry = (params: ReadonlyArray<FlagParam>): FlagRegistry => {
  const index = new Map<string, FlagParam>()

  for (const param of params) {
    if (index.has(param.name)) {
      throw new Error(`Duplicate flag name "${param.name}" in command definition`)
    }
    index.set(param.name, param)

    for (const alias of param.aliases) {
      if (index.has(alias)) {
        throw new Error(
          `Duplicate flag/alias "${alias}" in command definition (conflicts with "${index.get(alias)!.name}")`
        )
      }
      index.set(alias, param)
    }
  }

  return { params, index }
}

const buildSubcommandIndex = (
  subcommands: Command.Any["subcommands"]
): Map<string, Command<string, unknown, unknown, unknown, unknown>> => {
  const index = new Map<string, Command<string, unknown, unknown, unknown, unknown>>()
  const setKey = (key: string, command: Command<string, unknown, unknown, unknown, unknown>) => {
    const existing = index.get(key)
    if (existing && existing !== command) {
      throw new Error(
        `Duplicate subcommand name/alias "${key}" in command definition (conflicts with "${existing.name}")`
      )
    }
    index.set(key, command)
  }

  for (const group of subcommands) {
    for (const subcommand of group.commands) {
      setKey(subcommand.name, subcommand)
      if (subcommand.alias && subcommand.alias !== subcommand.name) {
        setKey(subcommand.alias, subcommand)
      }
    }
  }
  return index
}

/* ========================================================================== */
/* Flag Accumulator                                                           */
/* ========================================================================== */

/** Creates an empty flag map with all known flag names initialized to [].
 * @internal
 */
export const createEmptyFlagMap = (params: ReadonlyArray<FlagParam>): FlagMap =>
  Object.fromEntries(params.map((p) => [p.name, []]))

/**
 * Creates a mutable accumulator for collecting flag values.
 * Pre-initializes empty arrays for all known flags.
 */
const createFlagAccumulator = (params: ReadonlyArray<FlagParam>): FlagAccumulator => {
  const map = createEmptyFlagMap(params)

  return {
    add: (name, raw) => {
      if (raw !== undefined) map[name].push(raw)
    },
    merge: (from) => {
      for (const key in from) {
        const values = from[key]
        if (values?.length) {
          for (let i = 0; i < values.length; i++) {
            map[key].push(values[i])
          }
        }
      }
    },
    snapshot: () => map
  }
}

/* ========================================================================== */
/* Token Classification                                                       */
/* ========================================================================== */

type FlagToken = Extract<Token, { _tag: "LongOption" | "ShortOption" }>
type ResolvedFlag = {
  readonly param: FlagParam
  readonly negated: boolean
}
type ConsumedFlagValue =
  | {
    readonly _tag: "Value"
    readonly value: string | undefined
  }
  | {
    readonly _tag: "Error"
    readonly error: CliError.InvalidValue
  }
type ConsumedFlagValueWithTokens =
  | {
    readonly _tag: "Value"
    readonly value: string | undefined
    readonly tokens: ReadonlyArray<Token>
  }
  | {
    readonly _tag: "Error"
    readonly error: CliError.InvalidValue
    readonly tokens: ReadonlyArray<Token>
  }

const isFlagToken = (t: Token): t is FlagToken => t._tag === "LongOption" || t._tag === "ShortOption"

const getFlagName = (t: FlagToken): string => t._tag === "LongOption" ? t.name : t.flag

const resolveFlag = (
  token: FlagToken,
  registry: FlagRegistry
): ResolvedFlag | undefined => {
  const tokenName = getFlagName(token)
  const direct = registry.index.get(tokenName)
  if (direct && direct.name === tokenName) {
    return {
      param: direct,
      negated: false
    }
  }

  if (token._tag === "LongOption" && token.name.startsWith("no-")) {
    const canonicalName = token.name.slice(3)
    const param = registry.index.get(canonicalName)
    if (param && param.name === canonicalName && Primitive.isBoolean(param.primitiveType)) {
      return {
        param,
        negated: true
      }
    }
  }

  if (direct) {
    return {
      param: direct,
      negated: false
    }
  }

  return undefined
}

const invalidNegatedFlagValue = (
  token: FlagToken,
  spec: FlagParam,
  value: string
): CliError.InvalidValue =>
  new CliError.InvalidValue({
    option: spec.name,
    value,
    expected: `omit the value and use ${token.raw} by itself to set --${spec.name} to false`,
    kind: "flag"
  })

const missingFlagValue = (spec: FlagParam): CliError.InvalidValue => {
  const choices = Primitive.getChoiceKeys(spec.primitiveType)
  return new CliError.InvalidValue({
    option: spec.name,
    value: "",
    expected: choices === undefined
      ? spec.typeName ?? Primitive.getTypeName(spec.primitiveType)
      : choices.join(" | "),
    kind: "flag"
  })
}

/**
 * Checks whether a token is a boolean literal value.
 * Recognizes: true/false, yes/no, on/off, 1/0
 */
const asBooleanLiteral = (token: Token | undefined): string | undefined =>
  token?._tag === "Value" && (Primitive.isTrueLiteral(token.value) || Primitive.isFalseLiteral(token.value))
    ? token.value
    : undefined

/* ========================================================================== */
/* Flag Value Consumption                                                     */
/* ========================================================================== */

/**
 * Reads a flag's value from the token stream.
 *
 * Value resolution order:
 * 1. Inline value: --flag=value or -f=value
 * 2. Boolean special case: implicit "true" or explicit boolean literal
 * 3. Next token: consume following Value token if present
 */
const consumeFlagValue = (
  cursor: TokenCursor,
  token: FlagToken,
  spec: FlagParam,
  negated = false
): ConsumedFlagValue => {
  const consumed = consumeFlagValueWithTokens(cursor, token, spec, negated)
  switch (consumed._tag) {
    case "Value":
      return {
        _tag: "Value",
        value: consumed.value
      }
    case "Error":
      return {
        _tag: "Error",
        error: consumed.error
      }
  }
}

const consumeFlagValueWithTokens = (
  cursor: TokenCursor,
  token: FlagToken,
  spec: FlagParam,
  negated = false
): ConsumedFlagValueWithTokens => {
  // Inline value has highest priority
  if (negated) {
    if (token.value !== undefined) {
      return {
        _tag: "Error",
        error: invalidNegatedFlagValue(token, spec, token.value),
        tokens: []
      }
    }

    const literal = asBooleanLiteral(cursor.peek())
    if (literal !== undefined) {
      const literalToken = cursor.take()
      return {
        _tag: "Error",
        error: invalidNegatedFlagValue(token, spec, literal),
        tokens: literalToken === undefined ? [] : [literalToken]
      }
    }

    return {
      _tag: "Value",
      value: "false",
      tokens: []
    }
  }

  if (token.value !== undefined) {
    return {
      _tag: "Value",
      value: token.value,
      tokens: []
    }
  }

  // Boolean flags: check for explicit literal or default to "true"
  if (Primitive.isBoolean(spec.primitiveType)) {
    const literal = asBooleanLiteral(cursor.peek())
    const literalToken = literal !== undefined ? cursor.take() : undefined
    return {
      _tag: "Value",
      value: literal ?? "true",
      tokens: literalToken === undefined ? [] : [literalToken]
    }
  }

  // Non-boolean: try to consume next Value token
  const next = cursor.peek()
  if (next?._tag === "Value") {
    const valueToken = cursor.take()
    return {
      _tag: "Value",
      value: next.value,
      tokens: valueToken === undefined ? [] : [valueToken]
    }
  }

  return {
    _tag: "Error",
    error: missingFlagValue(spec),
    tokens: []
  }
}

/**
 * Consumes known flags from a token stream.
 * Unrecognized tokens are passed through to remainder.
 * Used for both global flag extraction and npm-style parent flag collection.
 * @internal
 */
export const consumeKnownFlags = (
  tokens: ReadonlyArray<Token>,
  registry: FlagRegistry
): { flagMap: FlagMap; remainder: ReadonlyArray<Token>; errors: ReadonlyArray<CliError.InvalidValue> } => {
  const flagMap = createEmptyFlagMap(registry.params)
  const remainder: Array<Token> = []
  const errors: Array<CliError.InvalidValue> = []
  const cursor = makeCursor(tokens)

  for (let t = cursor.take(); t; t = cursor.take()) {
    if (!isFlagToken(t)) {
      remainder.push(t)
      continue
    }

    const resolved = resolveFlag(t, registry)
    if (!resolved) {
      remainder.push(t)
      continue
    }

    const consumed = consumeFlagValue(cursor, t, resolved.param, resolved.negated)
    if (consumed._tag === "Error") {
      errors.push(consumed.error)
      continue
    }
    if (consumed.value !== undefined) {
      flagMap[resolved.param.name].push(consumed.value)
    }
  }

  return { flagMap, remainder, errors }
}

const extractFlagParams = (command: Command.Any): ReadonlyArray<FlagParam> => {
  const commandImpl = toImpl(command)
  const singles = commandImpl.config.flags.flatMap(Param.extractSingleParams)
  return singles.filter(Param.isFlagParam)
}

const extractContextFlagParams = (command: Command.Any): ReadonlyArray<FlagParam> => {
  const commandImpl = toImpl(command)
  const singles = commandImpl.contextConfig.flags.flatMap(Param.extractSingleParams)
  return singles.filter(Param.isFlagParam)
}

const resolveFromRegistries = (
  token: FlagToken,
  registries: ReadonlyArray<FlagRegistry>
): ResolvedFlag | undefined => {
  for (const registry of registries) {
    const resolved = resolveFlag(token, registry)
    if (resolved !== undefined) {
      return resolved
    }
  }
  return undefined
}

const preserveFlag = (
  remainder: Array<Token>,
  cursor: TokenCursor,
  token: FlagToken,
  resolved: ResolvedFlag
): void => {
  remainder.push(token)
  const consumed = consumeFlagValueWithTokens(cursor, token, resolved.param, resolved.negated)
  remainder.push(...consumed.tokens)
}

const localFlagWouldPrecedeSubcommand = (
  token: FlagToken,
  remainingTokens: ReadonlyArray<Token>,
  resolved: ResolvedFlag,
  subIndex: Map<string, Command<string, unknown, unknown, unknown, unknown>>,
  registries: ReadonlyArray<FlagRegistry>
): boolean => {
  const cursor = makeCursor(remainingTokens)
  consumeFlagValueWithTokens(cursor, token, resolved.param, resolved.negated)
  for (let token = cursor.take(); token; token = cursor.take()) {
    if (isFlagToken(token)) {
      const known = resolveFromRegistries(token, registries)
      if (known !== undefined) {
        consumeFlagValueWithTokens(cursor, token, known.param, known.negated)
      }
      continue
    }

    if (token._tag === "Value") {
      return subIndex.has(token.value)
    }
  }
  return false
}

/**
 * Consumes global flags while walking the command tree.
 *
 * Command-local flags take precedence over global flags at the selected command
 * level. This lets commands reuse a global flag name, for example a subcommand
 * with its own `--version <value>` flag overriding the built-in global
 * `--version` action.
 * @internal
 */
export const consumeGlobalFlags = (
  tokens: ReadonlyArray<Token>,
  command: Command.Any,
  registry: FlagRegistry
): { flagMap: FlagMap; remainder: ReadonlyArray<Token>; errors: ReadonlyArray<CliError.InvalidValue> } => {
  const flagMap = createEmptyFlagMap(registry.params)
  const errors: Array<CliError.InvalidValue> = []

  const consumeLevel = (
    tokens: ReadonlyArray<Token>,
    command: Command.Any,
    ignoredRegistries: ReadonlyArray<FlagRegistry>
  ): ReadonlyArray<Token> => {
    const localRegistry = createFlagRegistry(extractFlagParams(command))
    const inheritedRegistry = createFlagRegistry(extractContextFlagParams(command))
    const subIndex = buildSubcommandIndex(command.subcommands)
    const cursor = makeCursor(tokens)
    const remainder: Array<Token> = []
    let awaitingFirstValue = true

    for (let token = cursor.take(); token; token = cursor.take()) {
      if (isFlagToken(token)) {
        const ignored = resolveFromRegistries(token, ignoredRegistries)
        if (ignored !== undefined) {
          preserveFlag(remainder, cursor, token, ignored)
          continue
        }

        const inherited = resolveFlag(token, inheritedRegistry)
        if (inherited !== undefined) {
          preserveFlag(remainder, cursor, token, inherited)
          continue
        }

        const local = resolveFlag(token, localRegistry)
        const global = resolveFlag(token, registry)
        if (local !== undefined) {
          if (
            global === undefined || !awaitingFirstValue ||
            !localFlagWouldPrecedeSubcommand(token, cursor.rest(), local, subIndex, [
              localRegistry,
              inheritedRegistry,
              registry
            ])
          ) {
            preserveFlag(remainder, cursor, token, local)
            continue
          }
        }

        if (global !== undefined) {
          const consumed = consumeFlagValueWithTokens(cursor, token, global.param, global.negated)
          if (consumed._tag === "Error") {
            errors.push(consumed.error)
            continue
          }
          if (consumed.value !== undefined) {
            flagMap[global.param.name].push(consumed.value)
          }
          continue
        }

        remainder.push(token)
        continue
      }

      if (token._tag === "Value" && awaitingFirstValue) {
        const sub = subIndex.get(token.value)
        if (sub !== undefined) {
          remainder.push(token)
          remainder.push(...consumeLevel(cursor.rest(), sub, [...ignoredRegistries, inheritedRegistry]))
          return remainder
        }
        awaitingFirstValue = false
      }

      remainder.push(token)
    }

    return remainder
  }

  return { flagMap, remainder: consumeLevel(tokens, command, []), errors }
}

/* ========================================================================== */
/* Error Creation                                                             */
/* ========================================================================== */

const createUnrecognizedFlagError = (
  token: FlagToken,
  params: ReadonlyArray<FlagParam>,
  commandPath: ReadonlyArray<string>
): CliError.UnrecognizedOption => {
  const printable = token._tag === "LongOption" ? `--${token.name}` : `-${token.flag}`
  const validNames: Array<string> = []

  for (const p of params) {
    // Exclude hidden flags so a near-miss typo cannot reveal a flag name
    // that was intentionally kept out of --help.
    if (p.hidden) continue
    validNames.push(p.name)
    if (Primitive.isBoolean(p.primitiveType)) {
      validNames.push(`no-${p.name}`)
    }
    for (const alias of p.aliases) {
      validNames.push(alias)
    }
  }

  const suggestions = suggest(getFlagName(token), validNames)
    .map((n) => (n.length === 1 ? `-${n}` : `--${n}`))

  return new CliError.UnrecognizedOption({
    option: printable,
    suggestions,
    command: commandPath
  })
}

/* ========================================================================== */
/* Parse State                                                                */
/* ========================================================================== */

const createParseState = (registry: FlagRegistry): ParseState => ({
  flags: createFlagAccumulator(registry.params),
  arguments: [],
  errors: [],
  mode: { _tag: "AwaitingFirstValue" }
})

const toLeafResult = (state: ParseState): LeafResult => ({
  _tag: "Leaf",
  flags: state.flags.snapshot(),
  arguments: state.arguments,
  errors: state.errors
})

/* ========================================================================== */
/* First Value Resolution                                                     */
/* ========================================================================== */

/**
 * Determines how to handle the first value token.
 *
 * If it matches a known subcommand:
 * - Collect inherited parent flags from remaining tokens (npm-style)
 * - Return SubcommandResult with child tokens
 *
 * Otherwise:
 * - Return Argument to treat it as a positional argument
 * - Report error if command expects subcommand but got unknown value
 */
const resolveFirstValue = (
  value: string,
  cursor: TokenCursor,
  context: CommandContext,
  state: ParseState
): FirstValueResult => {
  const { command, commandPath, inheritedFlagRegistry, localFlagNames } = context
  const subIndex = buildSubcommandIndex(command.subcommands)
  const sub = subIndex.get(value)

  if (sub) {
    const selectedPath = [...commandPath, sub.name]

    // Local flags are not inherited by subcommands.
    const parentFlags = state.flags.snapshot()
    for (const localFlagName of localFlagNames) {
      const values = parentFlags[localFlagName]
      if (values !== undefined && values.length > 0) {
        state.errors.push(
          new CliError.UnrecognizedOption({
            option: `--${localFlagName}`,
            suggestions: [],
            command: selectedPath
          })
        )
      }
    }

    // npm-style: inherited parent flags can appear after subcommand name
    const tail = consumeKnownFlags(cursor.rest(), inheritedFlagRegistry)
    state.flags.merge(tail.flagMap)
    state.errors.push(...tail.errors)

    return {
      _tag: "Subcommand",
      result: {
        _tag: "Sub",
        flags: state.flags.snapshot(),
        sub,
        childTokens: tail.remainder,
        errors: state.errors
      }
    }
  }

  // Not a subcommand. Check if this looks like a typo.
  const expectsArgs = toImpl(command).config.arguments.length > 0
  if (!expectsArgs && subIndex.size > 0) {
    // Exclude unlisted subcommands so a typo cannot reveal a subcommand name
    // that was intentionally kept out of --help. Unlisted commands still
    // resolve via subIndex when invoked by exact name.
    const visibleKeys: Array<string> = []
    for (const [key, sub] of subIndex) {
      if (!sub.unlisted) visibleKeys.push(key)
    }
    const suggestions = suggest(value, visibleKeys)
    state.errors.push(
      new CliError.UnknownSubcommand({
        subcommand: value,
        parent: commandPath,
        suggestions
      })
    )
  }

  return { _tag: "Argument" }
}

/* ========================================================================== */
/* Token Processing                                                           */
/* ========================================================================== */

/**
 * Processes a flag token: looks up in registry, consumes value, records it.
 * Reports unrecognized flags as errors.
 */
const processFlag = (
  token: FlagToken,
  cursor: TokenCursor,
  context: CommandContext,
  state: ParseState
): void => {
  const { commandPath, flagRegistry } = context
  const resolved = resolveFlag(token, flagRegistry)

  if (!resolved) {
    state.errors.push(createUnrecognizedFlagError(token, flagRegistry.params, commandPath))
    return
  }

  const consumed = consumeFlagValue(cursor, token, resolved.param, resolved.negated)
  if (consumed._tag === "Error") {
    state.errors.push(consumed.error)
    return
  }

  state.flags.add(resolved.param.name, consumed.value)
}

/**
 * Processes a value token based on current parsing mode.
 *
 * In AwaitingFirstValue mode:
 * - Check if value is a subcommand
 * - If so, return SubcommandResult to exit scanning
 * - If not, switch to CollectingArguments mode
 *
 * In CollectingArguments mode:
 * - Simply add value to arguments list
 */
const processValue = (
  value: string,
  cursor: TokenCursor,
  context: CommandContext,
  state: ParseState
): SubcommandResult | undefined => {
  if (state.mode._tag === "AwaitingFirstValue") {
    const result = resolveFirstValue(value, cursor, context, state)

    if (result._tag === "Subcommand") {
      return result.result
    }

    state.mode = { _tag: "CollectingArguments" }
  }

  state.arguments.push(value)
  return undefined
}

/* ========================================================================== */
/* Command Level Scanning                                                     */
/* ========================================================================== */

/**
 * Scans a single command level, processing all tokens.
 *
 * For each token:
 * - Flags: Look up, consume value, record in accumulator
 * - Values: Check for subcommand (first value only), then collect as arguments
 *
 * Returns LeafResult if no subcommand detected, SubcommandResult otherwise.
 */
const scanCommandLevel = (
  tokens: ReadonlyArray<Token>,
  context: CommandContext
): LevelResult => {
  const cursor = makeCursor(tokens)
  const state = createParseState(context.flagRegistry)

  for (let token = cursor.take(); token; token = cursor.take()) {
    if (isFlagToken(token)) {
      processFlag(token, cursor, context, state)
      continue
    }

    if (token._tag === "Value") {
      const subResult = processValue(token.value, cursor, context, state)
      if (subResult) return subResult
    }
  }

  return toLeafResult(state)
}
