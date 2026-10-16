import { runInNewContext } from 'node:vm'
import { expect } from 'vitest'
import { batch, createAtom } from '@tanstack/store'
import { createMemoryHistory } from '@tanstack/history'
import { isServer } from '@tanstack/router-core/isServer'
import {
  BaseRootRoute,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '../src'
import { createRequestHandler } from '../src/ssr/createRequestHandler'
import {
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_WILDCARD,
  parseSegment,
  processRouteTree,
} from '../src/new-process-route-tree'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import type { interpolatePath } from '../src/path'
import type { SegmentKind } from '../src/new-process-route-tree'
import type { ServerManifest } from '../src/manifest'
import type { TsrSsrGlobal } from '../src/ssr/types'
import type { RouterHistory } from '@tanstack/history'
import type {
  AnyRoute,
  AnyRouter,
  GetStoreConfig,
  RouterConstructorOptions,
  RouterOptions,
  TrailingSlashOption,
} from '../src'

const getStoreConfig: GetStoreConfig = (opts) => {
  if (isServer ?? opts.isServer) {
    return {
      createMutableStore: createNonReactiveMutableStore,
      createReadonlyStore: createNonReactiveReadonlyStore,
      batch: (fn) => fn(),
    }
  }

  return {
    createMutableStore: createAtom,
    createReadonlyStore: createAtom,
    batch,
  }
}

export function createTestRouter<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
>(
  options: RouterConstructorOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory,
    TDehydrated
  >,
) {
  return new RouterCore(options, getStoreConfig)
}

type RouteTreeInput = Parameters<typeof processRouteTree>[0]
type FixtureNode = {
  init?: RouteTreeInput['init']
  children?: ReadonlyArray<FixtureNode>
}

const fixtureInit = () => {}

function prepareFixture<T extends FixtureNode>(
  route: T,
): asserts route is T & Pick<RouteTreeInput, 'init'> {
  if (!route.init) {
    // Raw matcher fixtures already specify their derived paths and IDs.
    Object.defineProperty(route, 'init', { value: fixtureInit })
  }
  for (const child of route.children ?? []) {
    prepareFixture(child)
  }
}

export function processTestRouteTree<
  TRoute extends Omit<RouteTreeInput, 'init'>,
>(routeTree: TRoute, caseSensitive = false) {
  prepareFixture(routeTree)
  return processRouteTree(routeTree, caseSensitive)
}

export type PathInterpolationTestOptions = {
  path: string
  params: Record<string, unknown>
  decoder?: Parameters<typeof interpolatePath>[3]
  server?: boolean
}

export function createTestPathInterpolator(
  options: Pick<
    RouterOptions<AnyRoute, 'never'>,
    'isServer' | 'pathParamsAllowedCharacters'
  > = {},
) {
  const router = createTestRouter({
    routeTree: new BaseRootRoute({}),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    scrollRestoration: false,
    trailingSlash: 'preserve',
    ...options,
  })
  router.history.destroy()
  return (
    options: Pick<PathInterpolationTestOptions, 'path' | 'params'>,
  ): string => {
    return router.buildLocation({ to: options.path, params: options.params })
      .pathname
  }
}

export function parseTestPathname(to: string | undefined) {
  const path = to ?? ''
  const segments: Array<{
    type: SegmentKind
    value: string
    prefixSegment?: string
    suffixSegment?: string
  }> = []
  let cursor = 0
  while (cursor < path.length) {
    const start = cursor
    const next = path.indexOf('/', start)
    const end = next === -1 ? path.length : next
    const data = parseSegment(path, start, end)
    cursor = end + 1
    if (typeof data === 'string') {
      segments.push({ type: SEGMENT_TYPE_PATHNAME, value: data })
    } else {
      const [type, key, prefix, suffix] = data
      const splat = type === SEGMENT_TYPE_WILDCARD
      if (splat) {
        cursor = path.length + 1
      }
      const segment: (typeof segments)[number] = {
        type,
        value: splat
          ? suffix === undefined
            ? path.substring(start)
            : '$'
          : key,
      }
      if (prefix) {
        segment.prefixSegment = prefix
      }
      if (suffix) {
        segment.suffixSegment = suffix
      }
      segments.push(segment)
    }
  }
  return segments
}

/** Materialize the request-local server result as the HTTP response users see. */
export function loadServerResponse(
  router: AnyRouter,
  path: string,
  signal?: AbortSignal,
) {
  return createRequestHandler({
    createRouter: () => router,
    request: new Request(`http://localhost${path}`, { signal }),
  })(({ router: loadedRouter, responseHeaders }) => {
    const result = loadedRouter._serverResult
    return new Response(null, {
      status:
        result?.type === 'redirect'
          ? result.redirect.status
          : (result?.status ?? 500),
      headers: responseHeaders,
    })
  })
}

export async function dehydrateToBootstrap(
  router: AnyRouter,
  manifest: ServerManifest,
): Promise<TsrSsrGlobal> {
  attachRouterServerSsrUtils({ router, manifest })
  try {
    await router.load()
    await router.serverSsr!.dehydrate()

    const scripts = router.serverSsr!.takeInitialHydrationScriptTags()
    expect(scripts?.before.length).toBeGreaterThan(0)
    expect(scripts?.boundary.children).toContain('$tsr-stream-boundary')
    expect(scripts?.boundary.attrs).not.toHaveProperty('id')

    const context: Record<string, any> = {
      document: {
        currentScript: {
          remove() {},
        },
      },
    }
    context.self = context
    for (const script of scripts!.before) {
      expect(script.attrs?.['data-tsr-stream-part']).toBe('')
      expect(script.children).toBeTruthy()
      runInNewContext(script.children!, context)
    }

    expect(context.$_TSR).toBeDefined()
    return context.$_TSR
  } finally {
    router.serverSsr?.cleanup()
  }
}
