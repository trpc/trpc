/**
 * Config Internal
 * ================
 *
 * The processed internal representation of a Command.Config declaration.
 * Separates the user's declared config shape from the flat parsing representation.
 *
 * Key concepts:
 * - ConfigInternal: The full processed form (flags, arguments, tree)
 * - ConfigInternal.Tree: Maps declaration keys to nodes
 * - ConfigInternal.Node: Param reference, Array, or Nested subtree
 *
 * Example transformation from Command.Config to Command.Config.Internal:
 *
 * ```ts
 * // User declares:
 * const config = {
 *   verbose: Flag.Boolean("verbose").pipe(Flag.withDefault(false)),
 *   server: {
 *     host: Flag.String("host"),
 *     port: Flag.Int("port")
 *   },
 *   files: Argument.String("files").pipe(Argument.variadic)
 * }
 *
 * // Becomes Config.Internal:
 * {
 *   arguments: [filesParam],           // Flat array of arguments
 *   flags: [verboseParam, hostParam, portParam],  // Flat array of flags
 *   orderedParams: [verboseParam, hostParam, portParam, filesParam],
 *   tree: {                            // Preserves nested structure
 *     verbose: { _tag: "Param", index: 0 },
 *     server: {
 *       _tag: "Nested",
 *       tree: {
 *         host: { _tag: "Param", index: 1 },
 *         port: { _tag: "Param", index: 2 }
 *       }
 *     },
 *     files: { _tag: "Param", index: 3 }
 *   }
 * }
 * ```
 *
 * This separation allows:
 * 1. Flat iteration over all params for parsing/validation
 * 2. Reconstruction of original nested shape for handler input
 */
import * as InternalRecord from "../../internal/record.ts"
import * as Param from "../Param.ts"

/* ========================================================================== */
/* Type ID                                                                    */
/* ========================================================================== */

const ConfigInternalTypeId = "~effect/cli/Command/Config/Internal" as const

/* ========================================================================== */
/* Types                                                                      */
/* ========================================================================== */

/**
 * The processed internal representation of a Command.Config declaration.
 *
 * Created by parsing the user's config. Separates parameters by type
 * while preserving the original nested structure via the tree.
 */
export interface ConfigInternal {
  readonly [ConfigInternalTypeId]: typeof ConfigInternalTypeId
  /** The command's positional argument parameters. */
  readonly arguments: ReadonlyArray<Param.AnyArgument>
  /** The command's flag parameters. */
  readonly flags: ReadonlyArray<Param.AnyFlag>
  /** All parameters in declaration order. */
  readonly orderedParams: ReadonlyArray<Param.Any>
  /** Tree structure for reconstructing nested config. */
  readonly tree: ConfigInternal.Tree
}

/**
 * Namespace containing the tree and node types used to reconstruct parsed
 * command configuration values.
 *
 * @since 4.0.0
 */
export declare namespace ConfigInternal {
  /**
   * Maps declaration keys to their node representations.
   * Preserves the shape of the user's config object.
   */
  export interface Tree {
    [key: string]: Node
  }

  /**
   * A node in the config tree.
   *
   * - Param: References a parameter by index in orderedParams
   * - Array: Contains child nodes for tuple/array declarations
   * - Nested: Contains a subtree for nested config objects
   */
  export type Node =
    | { readonly _tag: "Param"; readonly index: number }
    | { readonly _tag: "Array"; readonly children: ReadonlyArray<Node> }
    | { readonly _tag: "Nested"; readonly tree: Tree }
}

/* ========================================================================== */
/* Parsing                                                                    */
/* ========================================================================== */

/**
 * Config interface matching Command.Config (duplicated to avoid circular import).
 * @internal
 */
interface Config {
  readonly [key: string]:
    | Param.Param<Param.ParamKind, any>
    | ReadonlyArray<Param.Param<Param.ParamKind, any> | Config>
    | Config
}

/**
 * Parses a Command.Config into a ConfigInternal.
 *
 * Walks the config structure and:
 * 1. Extracts all Params into flat arrays (flags, arguments, orderedParams)
 * 2. Builds a tree that remembers the original nested structure
 * 3. Assigns each Param an index to link parsed values back
 *
 * @internal
 */
export const parseConfig = (config: Config): ConfigInternal => {
  const orderedParams: Array<Param.Any> = []
  const flags: Array<Param.AnyFlag> = []
  const args: Array<Param.AnyArgument> = []

  function parse(config: Config): ConfigInternal.Tree {
    const tree: ConfigInternal.Tree = Object.create(null)
    for (const key of Object.keys(config)) {
      tree[key] = parseValue(config[key])
    }
    return tree
  }

  function parseValue(
    value: Param.Any | ReadonlyArray<Param.Any | Config> | Config
  ): ConfigInternal.Node {
    if (Array.isArray(value)) {
      return {
        _tag: "Array",
        children: (value as Array<any>).map((v) => parseValue(v))
      }
    } else if (Param.isParam(value)) {
      const index = orderedParams.length
      orderedParams.push(value)

      if (value.kind === "argument") {
        args.push(value as Param.AnyArgument)
      } else {
        flags.push(value as Param.AnyFlag)
      }

      return { _tag: "Param", index }
    } else {
      return {
        _tag: "Nested",
        tree: parse(value as Config)
      }
    }
  }

  return {
    [ConfigInternalTypeId]: ConfigInternalTypeId,
    flags,
    arguments: args,
    orderedParams,
    tree: parse(config)
  }
}

/**
 * @internal
 */
export const emptyConfig: ConfigInternal = parseConfig({})

const shiftNodeIndexes = (node: ConfigInternal.Node, offset: number): ConfigInternal.Node => {
  switch (node._tag) {
    case "Param":
      return {
        _tag: "Param",
        index: node.index + offset
      }
    case "Array":
      return {
        _tag: "Array",
        children: node.children.map((child) => shiftNodeIndexes(child, offset))
      }
    case "Nested":
      return {
        _tag: "Nested",
        tree: shiftTreeIndexes(node.tree, offset)
      }
  }
}

const shiftTreeIndexes = (tree: ConfigInternal.Tree, offset: number): ConfigInternal.Tree => {
  const output: ConfigInternal.Tree = Object.create(null)
  for (const key of Object.keys(tree)) {
    output[key] = shiftNodeIndexes(tree[key], offset)
  }
  return output
}

/**
 * @internal
 */
export const mergeConfig = (
  left: ConfigInternal,
  right: ConfigInternal
): ConfigInternal => {
  const offset = left.orderedParams.length
  return {
    [ConfigInternalTypeId]: ConfigInternalTypeId,
    flags: [...left.flags, ...right.flags],
    arguments: [...left.arguments, ...right.arguments],
    orderedParams: [...left.orderedParams, ...right.orderedParams],
    tree: Object.assign(Object.create(null), left.tree, shiftTreeIndexes(right.tree, offset))
  }
}

/* ========================================================================== */
/* Reconstruction                                                             */
/* ========================================================================== */

/**
 * Reconstructs the original nested config shape from parsed values.
 *
 * Uses the tree as a blueprint to place each parsed value back into
 * its original position in the nested structure.
 *
 * @internal
 */
export const reconstructTree = (
  tree: ConfigInternal.Tree,
  results: ReadonlyArray<any>
): Record<string, any> => {
  const output: Record<string, any> = {}

  for (const key of Object.keys(tree)) {
    InternalRecord.assignProperty(output, key, nodeValue(tree[key]))
  }

  return output

  function nodeValue(node: ConfigInternal.Node): any {
    switch (node._tag) {
      case "Param":
        return results[node.index]
      case "Array":
        return node.children.map((child) => nodeValue(child))
      case "Nested":
        return reconstructTree(node.tree, results)
    }
  }
}
