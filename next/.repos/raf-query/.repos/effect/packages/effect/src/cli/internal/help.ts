/**
 * Help Documentation
 * ================
 *
 * Internal helpers for generating help documentation.
 * Extracted from command.ts to avoid circular dependencies.
 */
import * as Effect from "../../Effect.ts"
import type { Command } from "../Command.ts"
import type * as GlobalFlag from "../GlobalFlag.ts"
import type { FlagDoc, HelpDoc } from "../HelpDoc.ts"
import * as Param from "../Param.ts"
import { toFlagDoc, toImpl } from "./command.ts"

const dedupeGlobalFlags = (
  flags: ReadonlyArray<GlobalFlag.GlobalFlag<any>>
): ReadonlyArray<GlobalFlag.GlobalFlag<any>> => {
  const seen = new Set<GlobalFlag.GlobalFlag<any>>()
  const deduped: Array<GlobalFlag.GlobalFlag<any>> = []
  for (const flag of flags) {
    if (seen.has(flag)) {
      continue
    }
    seen.add(flag)
    deduped.push(flag)
  }
  return deduped
}

/**
 * Returns the resolved command lineage for the provided path.
 * Includes the root command as the first element.
 */
export const getCommandsForCommandPath = <Name extends string, Input, E, R, ContextInput>(
  command: Command<Name, Input, ContextInput, E, R>,
  commandPath: ReadonlyArray<string>
): ReadonlyArray<Command.Any> => {
  const commands: Array<Command.Any> = [command]
  let currentCommand: Command.Any = command

  for (let i = 1; i < commandPath.length; i++) {
    const subcommandName = commandPath[i]
    let subcommand: Command.Any | undefined = undefined

    for (const group of currentCommand.subcommands) {
      subcommand = group.commands.find((sub) => sub.name === subcommandName)
      if (subcommand) {
        break
      }
    }

    if (!subcommand) {
      break
    }

    commands.push(subcommand)
    currentCommand = subcommand
  }

  return commands
}

/**
 * Returns active global flags for a command path.
 * Built-ins are prepended and declarations are collected root -> leaf.
 */
export const getGlobalFlagsForCommandPath = <Name extends string, Input, E, R, ContextInput>(
  command: Command<Name, Input, ContextInput, E, R>,
  commandPath: ReadonlyArray<string>,
  builtIns: ReadonlyArray<GlobalFlag.GlobalFlag<any>>
): ReadonlyArray<GlobalFlag.GlobalFlag<any>> => {
  const commands = getCommandsForCommandPath(command, commandPath)
  const declared = commands.flatMap((current) => toImpl(current).globalFlags)
  return dedupeGlobalFlags([
    ...builtIns,
    ...declared
  ])
}

const collectDeclaredGlobalFlags = (command: Command.Any): ReadonlyArray<GlobalFlag.GlobalFlag<any>> => {
  const collected: Array<GlobalFlag.GlobalFlag<any>> = []

  const visit = (current: Command.Any): void => {
    const impl = toImpl(current)
    for (const flag of impl.globalFlags) {
      collected.push(flag)
    }
    for (const group of current.subcommands) {
      for (const subcommand of group.commands) {
        visit(subcommand)
      }
    }
  }

  visit(command)
  return dedupeGlobalFlags(collected)
}

const getSharedFlagsForCommandPath = (
  commands: ReadonlyArray<Command.Any>,
  currentFlags: ReadonlyArray<FlagDoc>
): ReadonlyArray<FlagDoc> => {
  if (commands.length <= 1) {
    return []
  }

  const seen = new Set(currentFlags.map((flag) => flag.name))
  const sharedFlags: Array<FlagDoc> = []

  for (const ancestor of commands.slice(0, -1)) {
    const ancestorImpl = toImpl(ancestor)
    for (const flag of ancestorImpl.contextConfig.flags) {
      const singles = Param.extractSingleParams(flag)
      const metadata = Param.getParamMetadata(flag)
      for (const single of singles) {
        if (seen.has(single.name)) {
          continue
        }
        // Hidden ancestor flags are excluded from the shared-flags section
        // of subcommand help, the same way they're excluded from the owning
        // command's own help output.
        if (single.hidden) {
          continue
        }
        seen.add(single.name)
        sharedFlags.push(toFlagDoc(single, metadata))
      }
    }
  }

  return sharedFlags
}

/**
 * Returns all global flags declared in a command tree.
 * Built-ins are prepended and command declarations are deduplicated by identity.
 */
export const getGlobalFlagsForCommandTree = <Name extends string, Input, E, R, ContextInput>(
  command: Command<Name, Input, ContextInput, E, R>,
  builtIns: ReadonlyArray<GlobalFlag.GlobalFlag<any>>
): ReadonlyArray<GlobalFlag.GlobalFlag<any>> =>
  dedupeGlobalFlags([
    ...builtIns,
    ...collectDeclaredGlobalFlags(command)
  ])

/**
 * Helper function to get help documentation for a specific command path.
 * Navigates through the command hierarchy to find the right command.
 * Reads active global flags for the path and includes them in the help doc.
 */
export const getHelpForCommandPath = <Name extends string, Input, E, R, ContextInput>(
  command: Command<Name, Input, ContextInput, E, R>,
  commandPath: ReadonlyArray<string>,
  builtIns: ReadonlyArray<GlobalFlag.GlobalFlag<any>>
): Effect.Effect<HelpDoc, never, never> =>
  Effect.gen(function*() {
    const commands = getCommandsForCommandPath(command, commandPath)
    const currentCommand = commands.length > 0 ? commands[commands.length - 1] : command

    const baseDoc = toImpl(currentCommand).buildHelpDoc(commandPath)

    const sharedFlags = getSharedFlagsForCommandPath(commands, baseDoc.flags)

    const flags = getGlobalFlagsForCommandPath(command, commandPath, builtIns)
    const globalFlagDocs: Array<FlagDoc> = []
    for (const flag of flags) {
      const singles = Param.extractSingleParams(flag.flag)
      const metadata = Param.getParamMetadata(flag.flag)
      for (const single of singles) {
        // Same rule as command-local flags: hidden globals are still parsed
        // and still trigger their handlers, they just don't appear under
        // "GLOBAL FLAGS" in --help.
        if (single.hidden) continue
        globalFlagDocs.push({
          ...toFlagDoc(single, metadata),
          required: false
        })
      }
    }

    return { ...baseDoc, flags: [...sharedFlags, ...baseDoc.flags], globalFlags: globalFlagDocs }
  })
