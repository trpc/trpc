import { decode, encode } from './qss'
import type { AnySchema } from './validators'

// JSON can start with whitespace, ", [, {, -, a digit, or fa/nu/tr.
// False positives safely fall through to JSON.parse.
const jsonStart = /^(?:\s|["[{\d-]|fa|nu|tr)/

/** Default `parseSearch` that strips leading '?' and JSON-parses values. */
export const defaultParseSearch = parseSearchWith(JSON.parse)
/** Default `stringifySearch` using JSON.stringify for complex values. */
export const defaultStringifySearch = stringifySearchWith(
  JSON.stringify,
  JSON.parse,
)

/**
 * Build a `parseSearch` function using a provided JSON-like parser.
 *
 * The returned function strips a leading `?`, decodes values, and attempts to
 * JSON-parse string values using the given `parser`.
 *
 * @param parser Function to parse a string value (e.g. `JSON.parse`).
 * @returns A `parseSearch` function compatible with `Router` options.
 * @link https://tanstack.com/router/latest/docs/framework/react/guide/custom-search-param-serialization
 */
export function parseSearchWith(parser: (str: string) => any) {
  const isJsonParser = parser === JSON.parse
  return (searchStr: string): AnySchema => {
    if (searchStr[0] === '?') {
      searchStr = searchStr.slice(1)
    }

    const query: Record<string, unknown> = decode(searchStr)

    // Try to parse any query params that might be json
    for (const key in query) {
      const value = query[key]
      if (typeof value === 'string') {
        // Skip JSON.parse when the value cannot begin valid JSON.
        if (isJsonParser && !jsonStart.test(value)) {
          continue
        }
        try {
          query[key] = parser(value)
        } catch (_err) {
          // silent
        }
      }
    }

    return query
  }
}

/**
 * Build a `stringifySearch` function using a provided serializer.
 *
 * Non-primitive values are serialized with `stringify`. If a `parser` is
 * supplied, string values that are parseable are re-serialized to ensure
 * symmetry with `parseSearch`.
 *
 * @param stringify Function to serialize a value (e.g. `JSON.stringify`).
 * @param parser Optional parser to detect parseable strings.
 * @returns A `stringifySearch` function compatible with `Router` options.
 * @link https://tanstack.com/router/latest/docs/framework/react/guide/custom-search-param-serialization
 */
export function stringifySearchWith(
  stringify: (search: any) => string,
  parser?: (str: string) => any,
) {
  const isJsonParser = parser === JSON.parse
  function stringifyValue(val: any) {
    if (val && typeof val === 'object') {
      try {
        return stringify(val)
      } catch (_err) {
        // silent
      }
    } else if (parser && typeof val === 'string') {
      // Skip JSON.parse when the value cannot begin valid JSON.
      if (isJsonParser && !jsonStart.test(val)) {
        return val
      }
      try {
        // Check if it's a valid parseable string.
        // If it is, then stringify it again.
        parser(val)
        return stringify(val)
      } catch (_err) {
        // silent
      }
    }
    return val
  }

  return (search: Record<string, any>) => {
    const searchStr = encode(search, stringifyValue)
    return searchStr ? `?${searchStr}` : ''
  }
}

export type SearchSerializer = (searchObj: Record<string, any>) => string
export type SearchParser = (searchStr: string) => Record<string, any>
