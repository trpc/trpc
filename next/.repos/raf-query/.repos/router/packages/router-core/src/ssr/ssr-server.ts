import { crossSerializeStream } from 'seroval'
import { invariant } from '../invariant'
import {
  createInlineCssPlaceholderAsset,
  createInlineCssStyleAsset,
  getStylesheetHref,
} from '../manifest'
import { decodePath } from '../utils'
import { createSieveCache } from '../sieve-cache'
import { rootRouteId } from '../root'
import { _getRenderedMatches } from '../load-client'
import { waitForReason } from '../await-signal'
import {
  SSR_SERIALIZATION_SCOPE_ID,
  createHydrationScripts,
} from './hydrationScripts'
import { dehydrateSsrMatchId } from './ssr-match-id'
import { ssrSerovalPlugins } from './serializer/seroval-plugins.ssr'
import { makeSsrSerovalPlugin } from './serializer/makeSsrSerovalPlugin'
import type { SieveCache } from '../sieve-cache'
import type { DehydratedMatch, DehydratedRouter } from './types'
import type { AnyRouter, ServerSsr } from '../router'
import type { AnyRouteMatch } from '../Matches'
import type {
  Manifest,
  ManifestRoute,
  ManifestRouteAssets,
  ServerManifest,
} from '../manifest'

type DehydrationPhase = 'idle' | 'started' | 'disabled'

export function dehydrateMatch(match: AnyRouteMatch): DehydratedMatch {
  const dehydratedMatch: DehydratedMatch = {
    i: dehydrateSsrMatchId(match.id),
    u: match.updatedAt,
    s: match.status,
  }

  const properties = [
    ['__beforeLoadContext', 'b'],
    ['loaderData', 'l'],
    ['error', 'e'],
    ['ssr', 'ssr'],
  ] as const

  for (const [key, shorthand] of properties) {
    if (match[key] !== undefined) {
      dehydratedMatch[shorthand] = match[key]
    }
  }
  if (match._notFound) {
    dehydratedMatch.g = true
  }
  return dehydratedMatch
}

function disposeSerializationSafely(dispose?: () => void) {
  try {
    dispose?.()
  } catch (err) {
    console.error('Error disposing SSR serialization:', err)
  }
}

function notifyAndClearListeners<T>(
  listeners: Array<(arg: T) => void>,
  errorMessage: string,
  arg: T,
) {
  const pending = listeners.slice()
  listeners.length = 0
  for (const listener of pending) {
    try {
      listener(arg)
    } catch (error) {
      console.error(errorMessage, error)
    }
  }
}

const isProd = process.env.NODE_ENV === 'production'

type FilteredRoutes = Manifest['routes']

type PreparedMatchedManifestRoutes = {
  routes: FilteredRoutes
  hasStrippedRoutes: boolean
  inlineCssHrefs?: Array<string>
}

type ManifestCache = SieveCache<string, PreparedMatchedManifestRoutes>

const MANIFEST_CACHE_SIZE = 100
const manifestCaches = new WeakMap<ServerManifest, ManifestCache>()

function getManifestCache(manifest: ServerManifest): ManifestCache {
  const cache = manifestCaches.get(manifest)
  if (cache) {
    return cache
  }
  const newCache = createSieveCache<string, PreparedMatchedManifestRoutes>(
    MANIFEST_CACHE_SIZE,
  )
  manifestCaches.set(manifest, newCache)
  return newCache
}

function getInlineCssForPreparedRoutes(
  manifest: ServerManifest,
  preparedRoutes: PreparedMatchedManifestRoutes,
) {
  const styles = manifest.inlineCss?.styles
  const hrefs = preparedRoutes.inlineCssHrefs
  if (!styles || !hrefs?.length) {
    return undefined
  }

  // Joined once per matched route set and request. Retaining the joined copy
  // on the module cache entry would permanently duplicate shared CSS across
  // up to MANIFEST_CACHE_SIZE route combinations.
  let css = ''
  for (const href of hrefs) {
    css += styles[href]!
  }

  return css
}

function getInlineCssAssetForPreparedRoutes(
  manifest: ServerManifest,
  preparedRoutes: PreparedMatchedManifestRoutes,
) {
  const css = getInlineCssForPreparedRoutes(manifest, preparedRoutes)

  return css === undefined ? undefined : createInlineCssStyleAsset(css)
}

function getMatchedRoutesCacheKey(matches: Array<AnyRouteMatch>) {
  let cacheKey = ''
  for (let i = 0; i < matches.length; i++) {
    cacheKey += (i === 0 ? '' : '\0') + matches[i]!.routeId
  }
  return cacheKey
}

function getPreparedMatchedManifestRoutes(
  manifest: ServerManifest,
  matches: Array<AnyRouteMatch>,
  cacheKey: string,
) {
  if (isProd) {
    const cached = getManifestCache(manifest).get(cacheKey)
    if (cached) {
      return cached
    }
  }

  const preparedRoutes = prepareMatchedManifestRoutes(manifest, matches)

  if (isProd) {
    getManifestCache(manifest).set(cacheKey, preparedRoutes)
  }

  return preparedRoutes
}

function prepareMatchedManifestRoutes(
  manifest: ServerManifest,
  matches: Array<AnyRouteMatch>,
): PreparedMatchedManifestRoutes {
  const inlineStyles = manifest.inlineCss?.styles
  const routes: FilteredRoutes = {}

  if (!inlineStyles) {
    for (const match of matches) {
      const route = manifest.routes[match.routeId]
      if (route) {
        routes[match.routeId] = route
      }
    }
    return { routes, hasStrippedRoutes: false }
  }

  const inlineCssHrefs: Array<string> = []
  const seenInlineCssHrefs = new Set<string>()
  let hasStrippedRoutes = false

  for (const match of matches) {
    const routeId = match.routeId
    const route = manifest.routes[routeId]
    if (!route) {
      continue
    }

    const nextRoute = stripInlinedStylesheetAssetsFromRoute(
      inlineStyles,
      route,
      inlineCssHrefs,
      seenInlineCssHrefs,
    )

    if (nextRoute !== route) {
      hasStrippedRoutes = true
    }
    routes[routeId] = nextRoute
  }

  return {
    routes,
    hasStrippedRoutes,
    ...(inlineCssHrefs.length ? { inlineCssHrefs } : {}),
  }
}

function stripInlinedStylesheetAssetsFromRoute(
  inlineStyles: Record<string, string>,
  route: ManifestRoute,
  inlineCssHrefs: Array<string>,
  seenInlineCssHrefs: Set<string>,
): ManifestRoute {
  const css = route.css
  if (!css) {
    return route
  }

  if (css.length === 0) {
    const nextRoute = { ...route }
    delete nextRoute.css
    return nextRoute
  }

  let cssLinks: typeof css | undefined
  for (let i = 0; i < css.length; i++) {
    const link = css[i]!
    const href = getStylesheetHref(link)
    if (inlineStyles[href] === undefined) {
      if (cssLinks) {
        cssLinks.push(link)
      }
      continue
    }

    if (!seenInlineCssHrefs.has(href)) {
      seenInlineCssHrefs.add(href)
      inlineCssHrefs.push(href)
    }

    if (!cssLinks) {
      cssLinks = css.slice(0, i)
    }
  }

  if (!cssLinks) {
    return route
  }

  if (cssLinks.length > 0) {
    return { ...route, css: cssLinks }
  }

  const nextRoute = { ...route }
  delete nextRoute.css
  return nextRoute
}

function hasRouteAssets(route: ManifestRoute) {
  return !!route.scripts?.length || !!route.css?.length
}

function hasRequestAssets(assets: ManifestRouteAssets | undefined) {
  return !!assets && (!!assets.preloads?.length || hasRouteAssets(assets))
}

function mergeRequestAssetsIntoRootRoute(
  rootRoute: ManifestRoute | undefined,
  requestAssets: ManifestRouteAssets | undefined,
): ManifestRoute {
  const preloads = requestAssets?.preloads?.length
    ? [...requestAssets.preloads, ...(rootRoute?.preloads ?? [])]
    : rootRoute?.preloads
  const scripts = requestAssets?.scripts?.length
    ? [...requestAssets.scripts, ...(rootRoute?.scripts ?? [])]
    : rootRoute?.scripts
  const cssLinks = requestAssets?.css?.length
    ? [...requestAssets.css, ...(rootRoute?.css ?? [])]
    : rootRoute?.css

  return {
    ...(rootRoute ?? {}),
    ...(preloads?.length ? { preloads } : {}),
    ...(scripts?.length ? { scripts } : {}),
    ...(cssLinks?.length ? { css: cssLinks } : {}),
  }
}

/**
 * Compose a client-facing manifest from prepared routes, an optional inline
 * style, and optional request-scoped assets merged into the root route.
 * Shared by the `router.ssr.manifest` getter and `dehydrate()` so the two
 * compositions cannot drift.
 */
function composeManifest(
  scriptFormat: ServerManifest['scriptFormat'],
  inlineStyle: Manifest['inlineStyle'],
  routes: FilteredRoutes,
  requestAssets: ManifestRouteAssets | undefined,
): Manifest {
  const base: Manifest = {
    ...(scriptFormat ? { scriptFormat } : {}),
    ...(inlineStyle ? { inlineStyle } : {}),
    routes,
  }
  if (!hasRequestAssets(requestAssets)) {
    return base
  }
  // Merge request-scoped assets into the root route without mutating any
  // cached route map.
  return {
    ...base,
    routes: {
      ...routes,
      [rootRouteId]: mergeRequestAssetsIntoRootRoute(
        routes[rootRouteId],
        requestAssets,
      ),
    },
  }
}

export function attachRouterServerSsrUtils({
  router,
  manifest,
  getRequestAssets,
}: {
  router: AnyRouter
  manifest: ServerManifest | undefined
  getRequestAssets?: () => ManifestRouteAssets | undefined
}) {
  // Inline CSS joining and route filtering depend only on matched route ids,
  // so keep that immutable preparation request-local. Request assets can be
  // discovered between head and Scripts reads and may mutate in place; always
  // compose their current contents instead of caching by object identity.
  let memoizedPreparedManifest:
    | {
        cacheKey: string
        inlineCssAsset: Manifest['inlineStyle'] | undefined
        routes: FilteredRoutes
      }
    | undefined
  router.ssr = {
    get manifest() {
      if (!manifest) {
        return manifest
      }

      const requestAssets = getRequestAssets?.()
      const hasAssets = hasRequestAssets(requestAssets)

      if (!hasAssets && !manifest.inlineCss) {
        return manifest
      }

      let inlineCssAsset: Manifest['inlineStyle'] | undefined
      let routes = manifest.routes
      if (manifest.inlineCss) {
        const matches = _getRenderedMatches(router.stores.matches.get())
        const cacheKey = getMatchedRoutesCacheKey(matches)
        if (memoizedPreparedManifest?.cacheKey === cacheKey) {
          inlineCssAsset = memoizedPreparedManifest.inlineCssAsset
          routes = memoizedPreparedManifest.routes
        } else {
          const preparedManifest = getPreparedMatchedManifestRoutes(
            manifest,
            matches,
            cacheKey,
          )
          inlineCssAsset = getInlineCssAssetForPreparedRoutes(
            manifest,
            preparedManifest,
          )
          if (preparedManifest.hasStrippedRoutes) {
            routes = { ...manifest.routes, ...preparedManifest.routes }
          }
          memoizedPreparedManifest = { cacheKey, inlineCssAsset, routes }
        }
      }

      return composeManifest(
        manifest.scriptFormat,
        inlineCssAsset,
        routes,
        hasAssets ? requestAssets : undefined,
      )
    },
  }
  let dehydrationPhase: DehydrationPhase = 'idle'
  let renderFinished = false
  const renderFinishedListeners: Array<() => void> = []
  const cleanupListeners: Array<(settled: boolean) => void> = []
  let cleanupStarted = false
  // Every value the router dehydrated has settled: nothing it started can
  // still be pending when the response ends.
  let settled = false
  let disposeSerialization: (() => void) | undefined
  const hydrationScripts = createHydrationScripts(router.options.ssr?.nonce)

  const serverSsr: ServerSsr = {
    hydrationScripts,
    dehydrate: async (opts?: {
      requestAssets?: ManifestRouteAssets
      signal?: AbortSignal
    }) => {
      // Guard synchronously before the first await: a concurrent second call
      // would double-serialize and corrupt the hydration payload.
      if (dehydrationPhase !== 'idle') {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error(
            dehydrationPhase === 'disabled'
              ? 'Invariant failed: hydration is disabled for this request!'
              : 'Invariant failed: router is already dehydrated!',
          )
        }

        invariant()
      }
      opts?.signal?.throwIfAborted()
      dehydrationPhase = 'started'
      let matchesToDehydrate = _getRenderedMatches(router.stores.matches.get())
      const isShell = router.isShell()
      if (isShell) {
        // In SPA mode we only want to dehydrate the root match
        matchesToDehydrate = matchesToDehydrate.slice(0, 1)
      }
      const matches = matchesToDehydrate.map(dehydrateMatch)

      let manifestToDehydrate: Manifest | undefined = undefined
      // Only currently matched routes are dehydrated. Other route assets are
      // loaded through dynamic imports when those routes become active.
      if (manifest) {
        const cacheKey = getMatchedRoutesCacheKey(matchesToDehydrate)
        const preparedManifest = getPreparedMatchedManifestRoutes(
          manifest,
          matchesToDehydrate,
          cacheKey,
        )

        manifestToDehydrate = composeManifest(
          manifest.scriptFormat,
          preparedManifest.inlineCssHrefs
            ? createInlineCssPlaceholderAsset()
            : undefined,
          preparedManifest.routes,
          opts?.requestAssets,
        )
      }
      const dehydratedRouter: DehydratedRouter = {
        manifest: manifestToDehydrate,
        matches,
      }
      const dehydrate = router.options.dehydrate
      const dehydratedData = dehydrate
        ? opts?.signal
          ? await waitForReason(dehydrate.call(router.options), opts.signal)
          : await dehydrate.call(router.options)
        : undefined
      opts?.signal?.throwIfAborted()
      if (cleanupStarted) {
        return
      }
      if (dehydratedData !== undefined) {
        dehydratedRouter.dehydratedData = dehydratedData
      }
      const trackPlugins = { didRun: false }
      const serializationAdapters = router.options.serializationAdapters
      const plugins = serializationAdapters
        ? [
            ...serializationAdapters.map((adapter) =>
              makeSsrSerovalPlugin(adapter, trackPlugins),
            ),
            ...ssrSerovalPlugins,
          ]
        : ssrSerovalPlugins

      let serializationCompleteSignaled = false
      let initialSerialized = false
      const completeScriptSerialization = (
        result: boolean | { error: unknown },
      ) => {
        if (serializationCompleteSignaled || cleanupStarted) {
          return
        }
        serializationCompleteSignaled = true
        const dispose = disposeSerialization
        disposeSerialization = undefined
        if (result === true) {
          settled = true
          hydrationScripts.finish()
        } else if (result) {
          hydrationScripts.fail(result.error)
        }
        if (dispose) {
          // Seroval invokes completion callbacks before it marks its stream as
          // inactive. Clear ownership before notifying the hydration consumer,
          // which can synchronously clean up this request, then dispose later.
          queueMicrotask(() => disposeSerializationSafely(dispose))
        }
      }

      let synchronousFailure: { error: unknown } | undefined
      const dispose = crossSerializeStream(dehydratedRouter, {
        refs: new Map(),
        plugins,
        onSerialize: (data, initial) => {
          if (serializationCompleteSignaled || cleanupStarted) {
            return
          }
          initialSerialized ||= initial
          if (
            !hydrationScripts.pushSerializedSource(
              data,
              initial,
              trackPlugins.didRun,
            )
          ) {
            // Rejected output stops the producer while deferred work may remain.
            completeScriptSerialization(false)
          }
        },
        onError: (err: unknown) => {
          if (serializationCompleteSignaled || cleanupStarted) {
            return
          }
          console.error('Serialization error:', err)
          synchronousFailure = { error: err }
          completeScriptSerialization({ error: err })
        },
        scopeId: SSR_SERIALIZATION_SCOPE_ID,
        onDone: () => {
          if (initialSerialized) {
            completeScriptSerialization(true)
          }
        },
      })
      // Seroval can call onDone synchronously before it returns dispose().
      if (cleanupStarted || serializationCompleteSignaled) {
        disposeSerializationSafely(dispose)
      } else {
        disposeSerialization = dispose
      }
      if (synchronousFailure) {
        throw synchronousFailure.error
      }
    },
    onRenderFinished: (listener) => {
      if (cleanupStarted) {
        return
      }
      if (renderFinished) {
        try {
          listener()
        } catch (error) {
          console.error('Error in render finished listener:', error)
        }
        return
      }
      renderFinishedListeners.push(listener)
    },
    onCleanup: (listener) => {
      if (cleanupStarted) {
        // Cleanup already happened (or is running). Invoke immediately so
        // late registrants can still release their resources instead of
        // silently retaining them (standard disposer convention).
        try {
          listener(settled)
        } catch (error) {
          console.error('Error in SSR cleanup listener:', error)
        }
        return
      }
      cleanupListeners.push(listener)
    },
    setRenderFinished: () => {
      if (cleanupStarted || renderFinished) {
        return
      }
      renderFinished = true
      hydrationScripts.liftBarrier()
      notifyAndClearListeners(
        renderFinishedListeners,
        'Error in render finished listener:',
        undefined,
      )
    },
    disableHydration: () => {
      if (cleanupStarted || dehydrationPhase === 'disabled') {
        return
      }
      if (dehydrationPhase !== 'idle') {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error(
            'Invariant failed: cannot disable hydration after dehydrate()!',
          )
        }

        invariant()
      }
      // The owner rejects later takes/claims; guard order matters so a
      // throwing owner does not leave the phase half-set.
      hydrationScripts.disableHydration()
      dehydrationPhase = 'disabled'
    },
    takeInitialHydrationScriptTags:
      hydrationScripts.takeInitialHydrationScriptTags,
    cleanup() {
      // Guard against multiple/reentrant cleanup calls. A listener could call
      // cleanup() again indirectly; snapshot + clear before invoking so each
      // listener runs exactly once and reentry is a no-op.
      if (cleanupStarted) {
        return
      }
      cleanupStarted = true
      hydrationScripts.cleanup()
      const dispose = disposeSerialization
      disposeSerialization = undefined
      disposeSerializationSafely(dispose)
      notifyAndClearListeners(
        cleanupListeners,
        'Error in SSR cleanup listener:',
        settled,
      )
      renderFinishedListeners.length = 0
      router.ssr = undefined
      router.serverSsr = undefined
    },
  }

  router.serverSsr = serverSsr
  for (const listener of router.serverSsrLifecycle?.onServerSsrAttach ?? []) {
    try {
      listener(serverSsr)
    } catch (err) {
      console.error('SSR attach listener error:', err)
    }
  }
}

/**
 * Get the origin for the request.
 *
 * SECURITY: We intentionally do NOT trust the Origin header for determining
 * the router's origin. The Origin header can be spoofed by attackers, which
 * could lead to SSRF-like vulnerabilities where redirects are constructed
 * using a malicious origin (CVE-2024-34351).
 *
 * Instead, we derive the origin from request.url, which is typically set by
 * the server infrastructure (not client-controlled headers).
 *
 * For applications behind proxies that need to trust forwarded headers,
 * use the router's `origin` option to explicitly configure a trusted origin.
 */
export function getOrigin(request: Request) {
  try {
    return new URL(request.url).origin
  } catch {}
  return 'http://localhost'
}

// server and browser can decode/encode characters differently in paths and search params.
// Server generally strictly follows the WHATWG URL Standard, while browsers may differ for legacy reasons.
// for example, in paths "|" is not encoded on the server but is encoded on chromium (and not on firefox) while "대" is encoded on both sides.
// Another anomaly is that in Node new URLSearchParams and new URL also decode/encode characters differently.
// new URLSearchParams() encodes "|" while new URL() does not, and in this instance
// chromium treats search params differently than paths, i.e. "|" is not encoded in search params.
export function getNormalizedURL(url: string | URL, base?: string | URL) {
  // ensure backslashes are encoded correctly in the URL
  if (typeof url === 'string') {
    url = url.replace('\\', '%5C')
  }

  const rawUrl = new URL(url, base)
  // URL parsing has already handled backslashes and ignored controls. A pathname
  // like "//evil.example" would become a protocol-relative URL when rebuilt below.
  const handledProtocolRelativeURL = rawUrl.pathname.startsWith('//')
  const decodedPathname = decodePath(
    handledProtocolRelativeURL
      ? rawUrl.pathname.replace(/^\/+/, '/')
      : rawUrl.pathname,
  )
  const searchParams = new URLSearchParams(rawUrl.search)
  const normalizedHref =
    decodedPathname +
    (searchParams.size > 0 ? '?' : '') +
    searchParams.toString() +
    rawUrl.hash

  return {
    url: new URL(normalizedHref, rawUrl.origin),
    handledProtocolRelativeURL,
  }
}
