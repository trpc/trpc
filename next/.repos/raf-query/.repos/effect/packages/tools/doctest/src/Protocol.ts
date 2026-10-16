/**
 * @since 4.0.0
 */

/**
 * Prefix for virtual doctest collector module requests.
 *
 * @category constants
 * @since 4.0.0
 */
export const collectorPrefix = "virtual:effect-doctest/collector?"

/**
 * Prefix for virtual doctest snippet module requests.
 *
 * @category constants
 * @since 4.0.0
 */
export const snippetPrefix = "virtual:effect-doctest/snippet?"

/**
 * Query parameter used to identify resolved doctest modules.
 *
 * @category constants
 * @since 4.0.0
 */
export const resolvedMarker = "effect-doctest"

/**
 * Describes a virtual doctest module request.
 *
 * @category models
 * @since 4.0.0
 */
export interface Request {
  readonly file: string
  readonly index?: number | undefined
  readonly version?: string | undefined
}

/**
 * Parses a virtual doctest request with the specified prefix.
 *
 * @category protocols
 * @since 4.0.0
 */
export const request = (prefix: string, id: string): Request | undefined => {
  if (!id.startsWith(prefix)) return undefined
  const parameters = new URLSearchParams(id.slice(prefix.length))
  const file = parameters.get("file")
  const index = parameters.get("index")
  const version = parameters.get("version")
  if (file === null || (index !== null && !/^\d+$/.test(index))) {
    return undefined
  }

  return {
    file,
    index: index === null ? undefined : Number(index),
    version: version === null ? undefined : version
  }
}

/**
 * Parses the identifier of a resolved doctest module.
 *
 * @category protocols
 * @since 4.0.0
 */
export const resolvedRequest = (
  id: string
): (Request & { readonly kind: "collector" | "snippet" }) | undefined => {
  const query = id.indexOf("?")
  if (query === -1) {
    return undefined
  }

  const parameters = new URLSearchParams(id.slice(query + 1))
  const kind = parameters.get(resolvedMarker)
  if (kind !== "collector" && kind !== "snippet") {
    return undefined
  }

  const index = parameters.get("index")
  const version = parameters.get("version")
  if (kind === "snippet" && (index === null || !/^\d+$/.test(index))) {
    return undefined
  }

  return {
    file: id.slice(0, query),
    index: index === null ? undefined : Number(index),
    version: version === null ? undefined : version,
    kind
  }
}

/**
 * Creates the identifier of a resolved doctest module.
 *
 * @category protocols
 * @since 4.0.0
 */
export const resolvedId = (kind: "collector" | "snippet", value: Request): string => {
  const parameters = new URLSearchParams({ [resolvedMarker]: kind })
  if (value.index !== undefined) {
    parameters.set("index", String(value.index))
  }

  if (value.version !== undefined) {
    parameters.set("version", value.version)
  }

  return `${value.file}?${parameters}`
}

/**
 * Creates a virtual doctest collector module identifier.
 *
 * @category protocols
 * @since 4.0.0
 */
export const collectorId = (file: string, version?: string | undefined): string => {
  const parameters = new URLSearchParams({ file })
  if (version !== undefined) {
    parameters.set("version", version)
  }

  return `${collectorPrefix}${parameters}`
}

/**
 * Creates a virtual doctest snippet module identifier.
 *
 * @category protocols
 * @since 4.0.0
 */
export const snippetId = (file: string, index: number, version?: string | undefined): string => {
  const parameters = new URLSearchParams({ file, index: String(index) })
  if (version !== undefined) {
    parameters.set("version", version)
  }

  return `${snippetPrefix}${parameters}`
}
