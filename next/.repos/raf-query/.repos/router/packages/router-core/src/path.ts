import { last } from './utils'
import {
  SEGMENT_TYPE_OPTIONAL_PARAM,
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_WILDCARD,
} from './new-process-route-tree'
import type { SieveCache } from './sieve-cache'
import type { DynamicPathSegment } from './new-process-route-tree'
import type { AnyRoute } from './route'

/** Join path segments, cleaning duplicate slashes between parts. */
export function joinPaths(paths: Array<string | undefined>) {
  return cleanPath(
    paths
      .filter((val) => {
        return val !== undefined
      })
      .join('/'),
  )
}

/** Remove repeated slashes from a path string. */
export function cleanPath(path: string) {
  // remove double slashes
  return path.replace(/\/{2,}/g, '/')
}

/** Trim leading slashes (except preserving root '/'). */
export function trimPathLeft(path: string) {
  return path === '/' ? path : path.replace(/^\/+/, '')
}

/** Trim trailing slashes (except preserving root '/'). */
export function trimPathRight(path: string) {
  const len = path.length
  return len > 1 && path[len - 1] === '/' ? path.replace(/\/+$/, '') : path
}

/** Trim both leading and trailing slashes. */
export function trimPath(path: string) {
  return trimPathRight(trimPathLeft(path))
}

/** Remove a trailing slash from value when appropriate for comparisons. */
export function removeTrailingSlash(value: string, basepath: string): string {
  if (value?.endsWith('/') && value !== '/' && value !== `${basepath}/`) {
    return value.slice(0, -1)
  }
  return value
}

// intended to only compare path name
// see the usage in the isActive under useLinkProps
// /sample/path1 = /sample/path1/
// /sample/path1/some <> /sample/path1
/**
 * Compare two pathnames for exact equality after normalizing trailing slashes
 * relative to the provided `basepath`.
 */
export function exactPathTest(
  pathName1: string,
  pathName2: string,
  basepath: string,
): boolean {
  return (
    removeTrailingSlash(pathName1, basepath) ===
    removeTrailingSlash(pathName2, basepath)
  )
}

// When resolving relative paths, we treat all paths as if they are trailing slash
// documents. All trailing slashes are removed after the path is resolved.
// Here are a few examples:
//
// /a/b/c + ./d = /a/b/c/d
// /a/b/c + ../d = /a/b/d
// /a/b/c + ./d/ = /a/b/c/d
// /a/b/c + ../d/ = /a/b/d
// /a/b/c + ./ = /a/b/c
//
// Absolute paths that start with `/` short circuit the resolution process to the root
// path.
//
// Here are some examples:
//
// /a/b/c + /d = /d
// /a/b/c + /d/ = /d
// /a/b/c + / = /
//
// Non-.-prefixed paths are still treated as relative paths, resolved like `./`
//
// Here are some examples:
//
// /a/b/c + d = /a/b/c/d
// /a/b/c + d/ = /a/b/c/d
// /a/b/c + d/e = /a/b/c/d/e
/**
 * Resolve a destination path against a base, honoring trailing-slash policy
 * and supporting relative segments (`.`/`..`) and absolute `to` values.
 *
 * Internal: parameters are positional so the router's hot callers pass no
 * options object.
 */
export function resolvePath(
  base: string,
  to: string,
  trailingSlash: 'always' | 'never' | 'preserve' = 'never',
  cache?: SieveCache<string, string>,
) {
  if (to.includes('//')) {
    to = cleanPath(to)
  }

  if (to.startsWith('/')) {
    if (to.length === 1 || trailingSlash === 'preserve') {
      return to
    }
    if (trailingSlash === 'always') {
      return to.endsWith('/') ? to : `${to}/`
    }
    return to.endsWith('/') ? to.slice(0, -1) : to
  }

  const isBase = to === '.'
  let key
  if (cache) {
    // `trailingSlash` is static per router, so it doesn't need to be part of the cache key
    key = isBase ? base : base + '\0' + to
    const cached = cache.get(key)
    if (cached) return cached
  }

  let baseSegments: Array<string>
  if (isBase) {
    baseSegments = base.split('/')
  } else {
    if (base.includes('//')) {
      base = cleanPath(base)
    }
    baseSegments = base.split('/')
    while (baseSegments.length > 1 && last(baseSegments) === '') {
      baseSegments.pop()
    }

    const toSegments = to.split('/')
    for (let index = 0, length = toSegments.length; index < length; index++) {
      const value = toSegments[index]!
      if (value === '') {
        if (!index) {
          // Leading slash
          baseSegments = [value]
        } else if (index === length - 1) {
          // Trailing Slash
          baseSegments.push(value)
        } else {
          // ignore inter-slashes
        }
      } else if (value === '..') {
        if (baseSegments.length > 1) {
          baseSegments.pop()
        } else {
          baseSegments = ['']
        }
      } else if (value === '.') {
        // ignore
      } else {
        baseSegments.push(value)
      }
    }
  }

  if (baseSegments.length > 1) {
    if (last(baseSegments) === '') {
      if (trailingSlash === 'never') {
        baseSegments.pop()
      }
    } else if (trailingSlash === 'always') {
      baseSegments.push('')
    }
  }

  const joined = baseSegments.join('/')
  const result = (isBase ? cleanPath(joined) : joined) || '/'
  if (key && cache) cache.set(key, result)
  return result
}

/**
 * Create a pre-compiled decode config from allowed characters.
 * Created once for the router's fixed encoding configuration.
 */
export function compileDecodeCharMap(
  pathParamsAllowedCharacters: ReadonlyArray<string>,
) {
  const charMap = new Map(
    pathParamsAllowedCharacters.map((char) => [encodeURIComponent(char), char]),
  )
  // Encoded keys contain no '|', and only these four regexp metacharacters.
  const regex = new RegExp(
    [...charMap.keys()].join('|').replace(/[.*()]/g, '\\$&'),
    'g',
  )
  return (encoded: string) =>
    encoded.replace(regex, (match) => charMap.get(match) ?? match)
}

export type InterpolationSegment = string | DynamicPathSegment

export type RouteInterpolation = Array<InterpolationSegment> & {
  names?: Array<string>
}

export function getRouteSegments(route: AnyRoute) {
  return route._interpolation
}

/** A splat is missing when it has no value; `0` and `false` are stringified like any other param. */
function isMissingSplat(value: unknown): boolean {
  return value == null || value === ''
}

/** Devtools checks navigation availability separately from the hot formatter. */
export function hasMissingPathParams(
  segments: RouteInterpolation,
  params: Record<string, unknown>,
): boolean {
  return segments.some((part) => {
    if (typeof part === 'string') {
      return false
    }
    const [kind, key] = part
    return kind === SEGMENT_TYPE_WILDCARD
      ? isMissingSplat(params[key])
      : kind === SEGMENT_TYPE_PARAM && !(key in params)
  })
}

function encodeParam(
  key: string,
  value: unknown,
  decoder: ((encoded: string) => string) | undefined,
): string {
  if (typeof value !== 'string') {
    return '' + (value ?? undefined)
  }

  const splat = key === '_splat'
  // Early return if the splat contains only URL-safe characters.
  if (splat && (!value || /^[a-zA-Z0-9\-._~!/]*$/.test(value))) {
    return value
  }
  let encoded = encodeURIComponent(value)
  if (splat) {
    // Splats preserve '/', but still encode spaces, '+', '?' and '#'.
    // Restore separators before allowed characters can decode a literal '%2F'.
    encoded = encoded.replaceAll('%2F', '/')
  }
  return decoder ? decoder(encoded) : encoded
}

/** Substitute current values into parsed segments, optionally collecting raw params. */
export function interpolatePath(
  path: string,
  segments: RouteInterpolation,
  params: Record<string, unknown>,
  decoder?: (encoded: string) => string,
  usedParams?: Record<string, unknown>,
): string {
  // One parsed template serves both trailing-slash variants.
  const trailingSlash = path.endsWith('/') ? '/' : ''
  let joined = ''
  for (const part of segments) {
    if (typeof part === 'string') {
      joined += part
      continue
    }
    const [kind, key, prefix, rawSuffix] = part
    const splat = kind === SEGMENT_TYPE_WILDCARD
    const suffix =
      splat && rawSuffix !== undefined ? rawSuffix + trailingSlash : rawSuffix
    let paramValue = params[key]
    // An omitted optional contributes neither a segment nor used-param metadata.
    if (kind === SEGMENT_TYPE_OPTIONAL_PARAM && paramValue == null) {
      continue
    }
    if (usedParams) {
      // Match identity needs current raw values, never data retained from another call.
      usedParams[key] = paramValue
      // TODO: Deprecate *
      if (splat) {
        usedParams['*'] = paramValue
      }
    }
    if (splat && isMissingSplat(paramValue)) {
      // A missing wildcard keeps its affixes, but omits a bare segment.
      if (prefix === '/' && !suffix) {
        continue
      }
      paramValue = ''
    }

    joined += prefix + encodeParam(key, paramValue, decoder) + (suffix || '')
  }

  return joined + trailingSlash || '/'
}
