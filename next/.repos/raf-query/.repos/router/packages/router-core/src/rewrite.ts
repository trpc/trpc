import { cleanPath, trimPath } from './path'
import type { LocationRewrite } from './router'

/** Compose multiple rewrite pairs into a single in/out rewrite. */
export function composeRewrites(rewrites: Array<LocationRewrite>) {
  return {
    input: ({ url }) => {
      for (const rewrite of rewrites) {
        url = executeRewriteInput(rewrite, url)
      }
      return url
    },
    output: ({ url }) => {
      for (let i = rewrites.length - 1; i >= 0; i--) {
        url = executeRewriteOutput(rewrites[i], url)
      }
      return url
    },
  } satisfies LocationRewrite
}

/** Create a rewrite pair that strips/adds a basepath on input/output. */
export function rewriteBasepath(
  basepath: string,
  caseSensitive?: boolean,
  rewrite?: LocationRewrite,
) {
  const trimmedBasepath = trimPath(basepath)
  const normalizedBasepath = `/${trimmedBasepath}`
  const checkBasepath = caseSensitive
    ? normalizedBasepath
    : normalizedBasepath.toLowerCase()
  const checkBasepathWithSlash = `${checkBasepath}/`

  const basepathRewrite = {
    input: ({ url }) => {
      const pathname = caseSensitive ? url.pathname : url.pathname.toLowerCase()

      // Handle exact basepath match (e.g., /my-app -> /)
      if (pathname === checkBasepath) {
        url.pathname = '/'
      } else if (pathname.startsWith(checkBasepathWithSlash)) {
        // Handle basepath with trailing content (e.g., /my-app/users -> /users)
        url.pathname = url.pathname.slice(normalizedBasepath.length)
      }
      return url
    },
    output: ({ url }) => {
      // `url.pathname` always starts with "/", so only slashes already inside
      // it can repeat; cleanPath keeps the joinPaths normalization.
      url.pathname = cleanPath(`/${trimmedBasepath}${url.pathname}`)
      return url
    },
  } satisfies LocationRewrite

  // Strip the basepath before custom input and restore it after custom output.
  return rewrite
    ? ({
        input: ({ url }) =>
          executeRewriteInput(rewrite, basepathRewrite.input({ url })),
        output: ({ url }) =>
          basepathRewrite.output({ url: executeRewriteOutput(rewrite, url) }),
      } satisfies LocationRewrite)
    : basepathRewrite
}

/** Execute a location input rewrite if provided. */
export function executeRewriteInput(
  rewrite: LocationRewrite | undefined,
  url: URL,
): URL {
  const res = rewrite?.input?.({ url })
  if (res) {
    if (typeof res === 'string') {
      return new URL(res)
    } else if (res instanceof URL) {
      return res
    }
  }
  return url
}

/** Execute a location output rewrite if provided. */
export function executeRewriteOutput(
  rewrite: LocationRewrite | undefined,
  url: URL,
): URL {
  const res = rewrite?.output?.({ url })
  if (res) {
    if (typeof res === 'string') {
      return new URL(res)
    } else if (res instanceof URL) {
      return res
    }
  }
  return url
}
