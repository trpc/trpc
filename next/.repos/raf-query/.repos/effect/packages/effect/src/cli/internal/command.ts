/**
 * Command Implementation
 * ======================
 *
 * Internal implementation details for CLI commands.
 * Public API is in ../Command.ts
 */
import * as Arr from "../../Array.ts"
import * as Context from "../../Context.ts"
import * as Effect from "../../Effect.ts"
import * as Effectable from "../../Effectable.ts"
import * as Option from "../../Option.ts"
import * as Predicate from "../../Predicate.ts"
import * as CliError from "../CliError.ts"
import type * as GlobalFlag from "../GlobalFlag.ts"
import type { ArgDoc, ExampleDoc, FlagDoc, HelpDoc, SubcommandGroupDoc } from "../HelpDoc.ts"
import * as Param from "../Param.ts"
import * as Primitive from "../Primitive.ts"
import { type ConfigInternal, emptyConfig, reconstructTree } from "./config.ts"

/* ========================================================================== */
/* Types                                                                      */
/* ========================================================================== */

import type { Command, CommandContext, Environment, ParsedTokens } from "../Command.ts"

interface SubcommandGroup {
  readonly group: string | undefined
  readonly commands: Arr.NonEmptyReadonlyArray<Command<any, unknown, any, unknown, unknown>>
}

/**
 * Internal implementation interface with all the machinery.
 * Use toImpl() to access from internal code.
 */
export interface CommandInternal<Name extends string, Input, E, R, ContextInput>
  extends Command<Name, Input, ContextInput, E, R>
{
  readonly config: ConfigInternal
  readonly contextConfig: ConfigInternal
  readonly service: Context.Key<CommandContext<Name>, ContextInput>
  readonly annotations: Context.Context<never>
  readonly globalFlags: ReadonlyArray<GlobalFlag.GlobalFlag<any>>
  readonly parse: (input: ParsedTokens) => Effect.Effect<Input, CliError.CliError, Environment>
  readonly parseContext: (input: ParsedTokens) => Effect.Effect<ContextInput, CliError.CliError, Environment>
  readonly handle: (
    input: Input,
    commandPath: ReadonlyArray<string>
  ) => Effect.Effect<void, E | CliError.CliError, R | Environment>
  readonly buildHelpDoc: (commandPath: ReadonlyArray<string>) => HelpDoc
}

/* ========================================================================== */
/* Type ID                                                                    */
/* ========================================================================== */

export const TypeId = "~effect/cli/Command" as const

/* ========================================================================== */
/* Casting                                                                    */
/* ========================================================================== */

/**
 * Casts a Command to its internal implementation.
 * For use by internal modules that need access to config, parse, handle, etc.
 */
export const toImpl = <Name extends string, Input, E, R, ContextInput = {}>(
  self: Command<Name, Input, ContextInput, E, R>
): CommandInternal<Name, Input, E, R, ContextInput> => self as CommandInternal<Name, Input, E, R, ContextInput>

/* ========================================================================== */
/* Proto                                                                      */
/* ========================================================================== */

export const Proto: Effect.Effect<any, never, any> = {
  ...Effectable.Prototype<Command.Any>({
    label: "Command",
    evaluate() {
      return toImpl(this).service
    }
  })
}

/* ========================================================================== */
/* Constructor                                                                */
/* ========================================================================== */

/**
 * Internal command constructor. Only accepts already-parsed ConfigInternal.
 */
export const makeCommand = <const Name extends string, Input, E, R, ContextInput = {}>(options: {
  readonly name: Name
  readonly config: ConfigInternal
  readonly contextConfig?: ConfigInternal | undefined
  readonly service?: Context.Key<CommandContext<Name>, ContextInput> | undefined
  readonly annotations?: Context.Context<never> | undefined
  readonly globalFlags?: ReadonlyArray<GlobalFlag.GlobalFlag<any>> | undefined
  readonly description?: string | undefined
  readonly shortDescription?: string | undefined
  readonly alias?: string | undefined
  readonly unlisted?: boolean | undefined
  readonly examples?: ReadonlyArray<Command.Example> | undefined
  readonly subcommands?: ReadonlyArray<SubcommandGroup> | undefined
  readonly parse?: ((input: ParsedTokens) => Effect.Effect<Input, CliError.CliError, Environment>) | undefined
  readonly parseContext?:
    | ((input: ParsedTokens) => Effect.Effect<ContextInput, CliError.CliError, Environment>)
    | undefined
  readonly handle?:
    | ((input: Input, commandPath: ReadonlyArray<string>) => Effect.Effect<void, E, R | Environment>)
    | undefined
}): Command<Name, Input, ContextInput, E, R> => {
  const config = options.config
  const contextConfig = options.contextConfig ?? emptyConfig
  const service = options.service ?? Context.Service<CommandContext<Name>, ContextInput>(`${TypeId}/${options.name}`)
  const annotations = options.annotations ?? Context.empty()
  const globalFlags = options.globalFlags ?? []
  const subcommands = options.subcommands ?? []

  const handle = (
    input: Input,
    commandPath: ReadonlyArray<string>
  ): Effect.Effect<void, CliError.CliError | E, R | Environment> =>
    Predicate.isNotUndefined(options.handle)
      ? options.handle(input, commandPath)
      : Effect.fail(new CliError.ShowHelp({ commandPath, errors: [] }))

  const parse = options.parse ?? makeParser(config) as any
  const parseContext = options.parseContext ?? makeParser(contextConfig, { allowLeftovers: true }) as any

  const buildHelpDoc = (commandPath: ReadonlyArray<string>): HelpDoc => {
    const args: Array<ArgDoc> = []
    const flags: Array<FlagDoc> = []

    for (const arg of config.arguments) {
      const singles = Param.extractSingleParams(arg)
      const metadata = Param.getParamMetadata(arg)
      for (const single of singles) {
        args.push({
          name: single.name,
          type: single.typeName ?? Primitive.getTypeName(single.primitiveType),
          description: single.description,
          required: !metadata.isOptional &&
            (!metadata.isVariadic || Option.exists(metadata.variadicMin, (min) => min > 0)),
          variadic: metadata.isVariadic
        })
      }
    }

    let usage = commandPath.length > 0 ? commandPath.join(" ") : options.name
    // Only render `<subcommand>` in usage when at least one visible subcommand
    // exists; an all-unlisted subcommand tree should look like a leaf command.
    if (subcommands.some((group) => group.commands.some((c) => !c.unlisted))) {
      usage += " <subcommand>"
    }
    usage += " [flags]"
    for (const arg of args) {
      const argName = arg.variadic ? `<${arg.name}...>` : `<${arg.name}>`
      usage += ` ${arg.required ? argName : `[${argName}]`}`
    }

    for (const option of config.flags) {
      const singles = Param.extractSingleParams(option)
      const metadata = Param.getParamMetadata(option)
      for (const single of singles) {
        // Hidden flags still parse on the command line but are omitted from
        // generated --help output.
        if (single.hidden) continue
        flags.push(toFlagDoc(single, metadata))
      }
    }

    const subcommandDocs: Array<SubcommandGroupDoc> = []

    for (const group of subcommands) {
      // Unlisted subcommands still parse on the command line but are omitted
      // from --help. Drop the whole group when nothing visible remains so we
      // don't render an empty heading.
      const visible = group.commands.filter((c) => !c.unlisted)
      if (visible.length === 0) continue
      subcommandDocs.push({
        group: group.group,
        commands: Arr.map(visible as unknown as Arr.NonEmptyReadonlyArray<Command.Any>, (subcommand) => ({
          name: subcommand.name,
          alias: subcommand.alias,
          shortDescription: subcommand.shortDescription,
          description: subcommand.description ?? ""
        }))
      })
    }

    const examples: ReadonlyArray<ExampleDoc> = options.examples ?? []

    return {
      description: options.description ?? "",
      usage,
      flags,
      annotations,
      ...(args.length > 0 && { args }),
      ...(subcommandDocs.length > 0 && { subcommands: subcommandDocs }),
      ...(examples.length > 0 && { examples })
    }
  }

  return Object.assign(Object.create(Proto), {
    [TypeId]: TypeId,
    name: options.name,
    examples: options.examples ?? [],
    annotations,
    globalFlags,
    subcommands,
    unlisted: options.unlisted ?? false,
    config,
    contextConfig,
    service,
    parse,
    parseContext,
    handle,
    buildHelpDoc,
    ...(Predicate.isNotUndefined(options.description)
      ? { description: options.description }
      : {}),
    ...(Predicate.isNotUndefined(options.shortDescription)
      ? { shortDescription: options.shortDescription }
      : {}),
    ...(Predicate.isNotUndefined(options.alias)
      ? { alias: options.alias }
      : {})
  })
}

/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */

/**
 * Converts a single flag param into a FlagDoc for help display.
 *
 * @internal
 */
export const toFlagDoc = (
  single: Param.Single<typeof Param.flagKind, unknown>,
  metadata: ReturnType<typeof Param.getParamMetadata>
): FlagDoc => {
  const formattedAliases = single.aliases.map((alias) => alias.length === 1 ? `-${alias}` : `--${alias}`)
  return {
    name: single.name,
    aliases: formattedAliases,
    type: single.typeName ?? Primitive.getTypeName(single.primitiveType),
    description: appendChoiceKeys(single.description, Primitive.getChoiceKeys(single.primitiveType)),
    required: single.primitiveType._tag !== "Boolean" && !metadata.isOptional
  }
}

const appendChoiceKeys = (
  description: Option.Option<string>,
  choiceKeys: ReadonlyArray<string> | undefined
): Option.Option<string> => {
  if (choiceKeys === undefined || choiceKeys.length === 0) {
    return description
  }
  const choiceSuffix = `(choices: ${choiceKeys.join(", ")})`
  return Option.match(description, {
    onNone: () => Option.some(choiceSuffix),
    onSome: (value) => Option.some(`${value} ${choiceSuffix}`)
  })
}

/**
 * Creates a parser for a given config. Used as the default for both `parse`
 * and `parseContext`, and also by `withSharedFlags` to avoid constructing a
 * full throwaway command.
 */
export const makeParser = (
  cfg: ConfigInternal,
  options?: {
    readonly allowLeftovers?: boolean | undefined
  } | undefined
) =>
  Effect.fnUntraced(function*(input: ParsedTokens) {
    const parsedArgs: Param.ParsedArgs = { flags: input.flags, arguments: input.arguments }
    const [remainingArguments, values] = yield* parseParams(parsedArgs, cfg.orderedParams)
    if (options?.allowLeftovers !== true && remainingArguments.length > 0) {
      return yield* new CliError.UnexpectedArgument({ arguments: remainingArguments })
    }
    return reconstructTree(cfg.tree, values)
  })

/**
 * Parses param values from parsed command arguments into their typed
 * representations.
 */
const parseParams: (parsedArgs: Param.ParsedArgs, params: ReadonlyArray<Param.Any>) => Effect.Effect<
  readonly [remainingArguments: ReadonlyArray<string>, values: ReadonlyArray<unknown>],
  CliError.CliError,
  Environment
> = Effect.fnUntraced(function*(parsedArgs, params) {
  const results: Array<unknown> = []
  let currentArguments = parsedArgs.arguments

  for (const option of params) {
    const [remainingArguments, parsed] = yield* option.parse({
      flags: parsedArgs.flags,
      arguments: currentArguments
    })
    results.push(parsed)
    currentArguments = remainingArguments
  }

  return [currentArguments, results] as const
})

/**
 * Checks that inherited parent context flags do not reuse names declared by
 * child command flags.
 *
 * When `contextConfig` is supplied, it is used as the inherited flag set;
 * otherwise the parent's current context config is checked.
 */
export const checkForDuplicateFlags = <Name extends string, Input, ContextInput, E, R>(
  parent: Command<Name, Input, ContextInput, E, R>,
  subcommands: ReadonlyArray<Command.Any>,
  options?: {
    readonly contextConfig?: ConfigInternal | undefined
  } | undefined
): void => {
  const parentImpl = toImpl(parent)
  const parentOptionNames = new Set<string>()

  const extractNames = (flags: ReadonlyArray<Param.Any>): void => {
    for (const option of flags) {
      const singles = Param.extractSingleParams(option)
      for (const single of singles) {
        parentOptionNames.add(single.name)
      }
    }
  }

  extractNames((options?.contextConfig ?? parentImpl.contextConfig).flags)

  for (const subcommand of subcommands) {
    const subImpl = toImpl(subcommand as any)
    for (const option of subImpl.config.flags) {
      const singles = Param.extractSingleParams(option)
      for (const single of singles) {
        if (parentOptionNames.has(single.name)) {
          throw new CliError.DuplicateOption({
            option: single.name,
            parentCommand: parent.name,
            childCommand: subcommand.name
          })
        }
      }
    }
  }
}
