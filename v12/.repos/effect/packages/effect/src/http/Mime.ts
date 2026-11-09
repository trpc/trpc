/**
 * Standard MIME type lookup.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Option from "../Option.ts"
import standardTypes from "./internal/mimeTypes.ts"

interface Tables {
  readonly extensionToType: Map<string, string>
  readonly typeToExtension: Map<string, string>
  readonly typeToExtensions: Map<string, Set<string>>
}

// Built on first lookup rather than at module evaluation, so bundles that import this
// module without calling a lookup can drop the tables and the MIME data they index.
let tables: Tables | undefined

const getTables = (): Tables => {
  if (tables !== undefined) {
    return tables
  }
  const extensionToType = new Map<string, string>()
  const typeToExtension = new Map<string, string>()
  const typeToExtensions = new Map<string, Set<string>>()

  for (const [type, extensions] of Object.entries(standardTypes)) {
    const allExtensions = new Set<string>()
    typeToExtensions.set(type, allExtensions)
    for (let index = 0; index < extensions.length; index++) {
      let extension: string = extensions[index]
      const starred = extension.startsWith("*")
      if (starred) {
        extension = extension.slice(1)
      }
      allExtensions.add(extension)
      if (index === 0) {
        typeToExtension.set(type, extension)
      }
      if (!starred) {
        extensionToType.set(extension, type)
      }
    }
  }
  tables = { extensionToType, typeToExtension, typeToExtensions }
  return tables
}

/**
 * Returns the standard MIME type associated with a file name or extension.
 *
 * @stability unstable
 * @category utilities
 * @since 4.0.0
 */
export const getType = (path: string): Option.Option<string> => {
  if (typeof path !== "string") {
    return Option.none()
  }
  const last = path.replace(/^.*[/\\]/s, "").toLowerCase()
  const extension = last.replace(/^.*\./s, "").toLowerCase()
  const hasPath = last.length < path.length
  const hasDot = extension.length < last.length - 1
  if (!hasDot && hasPath) {
    return Option.none()
  }
  return Option.fromUndefinedOr(getTables().extensionToType.get(extension))
}

/**
 * Returns the default file extension associated with a standard MIME type.
 *
 * @stability unstable
 * @category utilities
 * @since 4.0.0
 */
export const getExtension = (type: string): Option.Option<string> => {
  if (typeof type !== "string") {
    return Option.none()
  }
  return Option.fromUndefinedOr(getTables().typeToExtension.get(type.split(";")[0].trim().toLowerCase()))
}

/**
 * Returns every file extension associated with a standard MIME type.
 *
 * @stability unstable
 * @category utilities
 * @since 4.0.0
 */
export const getAllExtensions = (type: string): Option.Option<ReadonlySet<string>> => {
  if (typeof type !== "string") {
    return Option.none()
  }
  return Option.fromUndefinedOr(getTables().typeToExtensions.get(type.split(";")[0].trim().toLowerCase()))
}
