// @vitest-environment jsdom

import {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
  trimPathRight,
} from '@tanstack/router-core'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Fragment, act, createElement } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory } from '../../history/src'
import { HeadContent } from '../../react-router/src/HeadContent'
import { RouterContextProvider } from '../../react-router/src/RouterProvider'
import { Scripts } from '../../react-router/src/Scripts'
import { Router as ReactRouter } from '../../react-router/src/router'
import { getHandleRouteUpdateCode } from '../src/core/hmr'
import type { AnyRoute, GetStoreConfig } from '@tanstack/router-core'

vi.mock('@tanstack/router-core/isServer', async (importOriginal) => ({
  ...(await importOriginal()),
  isServer: undefined,
}))

const getStoreConfig: GetStoreConfig = () => ({
  createMutableStore: createNonReactiveMutableStore,
  createReadonlyStore: createNonReactiveReadonlyStore,
  batch: (fn) => fn(),
})

const getHandleRouteUpdate = () => {
  return new Function(`return ${getHandleRouteUpdateCode([])}`)() as (
    routeId: string,
    newRoute: AnyRoute,
  ) => void
}

function asAnyRoute<TRoute>(route: TRoute): TRoute & AnyRoute {
  return route as unknown as TRoute & AnyRoute
}

function createTestHistory() {
  const location = {
    href: '/',
    pathname: '/',
    search: '',
    hash: '',
    state: { __TSR_index: 0 },
  }

  return {
    location,
    length: 1,
    subscribers: new Set(),
    subscribe: () => () => {},
    push: () => {},
    replace: () => {},
    go: () => {},
    back: () => {},
    forward: () => {},
    canGoBack: () => false,
    createHref: (href: string) => href,
    block: () => () => {},
    flush: () => {},
    destroy: () => {},
    notify: () => {},
  }
}

function createTestRouter<TRouteTree>(routeTree: TRouteTree) {
  return new RouterCore(
    {
      routeTree: asAnyRoute(routeTree),
      history: createTestHistory() as any,
      isServer: true,
    },
    getStoreConfig,
  )
}

function createClientTestRouter<TRouteTree>(
  routeTree: TRouteTree,
  initialEntry: string,
) {
  return new RouterCore(
    {
      routeTree: asAnyRoute(routeTree),
      history: createMemoryHistory({ initialEntries: [initialEntry] }),
      isServer: false,
      origin: 'http://localhost',
    },
    getStoreConfig,
  )
}

function createReactClientTestRouter<TRouteTree>(
  routeTree: TRouteTree,
  initialEntry: string,
) {
  return new ReactRouter({
    routeTree: asAnyRoute(routeTree),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    isServer: false,
    origin: 'http://localhost',
  })
}

function withWindowRouter(router: RouterCore<any, any, any, any, any>) {
  const testWindow = globalThis.window as any
  const hadOwnRouter = Object.prototype.hasOwnProperty.call(
    testWindow,
    '__TSR_ROUTER__',
  )
  const previousRouter = testWindow.__TSR_ROUTER__
  testWindow.__TSR_ROUTER__ = router

  return () => {
    if (hadOwnRouter) {
      testWindow.__TSR_ROUTER__ = previousRouter
    } else {
      delete testWindow.__TSR_ROUTER__
    }
  }
}

function runHandleRouteUpdate<TRoute>(
  router: RouterCore<any, any, any, any, any>,
  routeId: string,
  newRoute: TRoute,
) {
  const restoreWindow = withWindowRouter(router)
  try {
    getHandleRouteUpdate()(routeId, asAnyRoute(newRoute))
  } finally {
    restoreWindow()
  }
}

function getProcessedTreeRouteForPath(
  router: RouterCore<any, any, any, any, any>,
  path: string,
) {
  return router.buildRouteTree().routesByPath[path]?.id
}

describe('handleRouteUpdate', () => {
  it('keeps routesByPath pointed at an index route when a pathless layout updates', () => {
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/livestock/$farmId/medicine',
    })
    const pathlessRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(parentRoute),
      id: '_form',
    })
    const newRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(pathlessRoute),
      path: 'new',
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(parentRoute),
      path: '/',
    })
    const routeTree = rootRoute.addChildren([
      parentRoute.addChildren([
        pathlessRoute.addChildren([asAnyRoute(newRoute)]),
        asAnyRoute(indexRoute),
      ]),
    ])
    const router = createTestRouter(routeTree)
    const key = trimPathRight(indexRoute.fullPath)

    expect(router.routesByPath[key]?.id).toBe(indexRoute.id)

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(
        pathlessRoute.id,
        asAnyRoute(new BaseRoute({} as any)),
      )
    } finally {
      restoreWindow()
    }

    expect(router.routesByPath[key]?.id).toBe(indexRoute.id)
    expect(router.routesByPath[key]?.id).toBe(
      getProcessedTreeRouteForPath(router, key),
    )
  })

  it('keeps an index route winning the trimmed path key when its parent updates', () => {
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/path',
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(parentRoute),
      path: '/',
    })
    const routeTree = rootRoute.addChildren([
      parentRoute.addChildren([asAnyRoute(indexRoute)]),
    ])
    const router = createTestRouter(routeTree)
    const key = trimPathRight(indexRoute.fullPath)

    expect(router.routesByPath[key]?.id).toBe(indexRoute.id)

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(
        parentRoute.id,
        asAnyRoute(new BaseRoute({} as any)),
      )
    } finally {
      restoreWindow()
    }

    expect(router.routesByPath[key]?.id).toBe(indexRoute.id)
    expect(router.routesByPath[key]?.id).toBe(
      getProcessedTreeRouteForPath(router, key),
    )
  })

  it('refreshes matching data when params.parse changes', () => {
    const rootRoute = new BaseRootRoute({})
    const itemRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/items/$itemId',
      params: {
        parse: ({ itemId }: { itemId: string }) => {
          return /^\d+$/.test(itemId) ? { itemId } : false
        },
      },
    })
    const routeTree = rootRoute.addChildren([asAnyRoute(itemRoute)])
    const router = createTestRouter(routeTree)

    expect(router.getMatchedRoutes('/items/abc')[2]?.id).toBeUndefined()

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(
        itemRoute.id,
        asAnyRoute(
          new BaseRoute({
            params: {
              parse: ({ itemId }: { itemId: string }) => ({ itemId }),
            },
          } as any),
        ),
      )
    } finally {
      restoreWindow()
    }

    expect(router.getMatchedRoutes('/items/abc')[2]?.id).toBe(itemRoute.id)
  })

  it('hydrates the hot module route export with generated route tree state', () => {
    const rootRoute = new BaseRootRoute({})
    const itemRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/items/$itemId',
    })
    const routeTree = rootRoute.addChildren([asAnyRoute(itemRoute)])
    const router = createTestRouter(routeTree)
    const newRoute = new BaseRoute({} as any)

    expect((newRoute as any).to).toBeUndefined()

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(itemRoute.id, asAnyRoute(newRoute))
    } finally {
      restoreWindow()
    }

    expect(newRoute.id).toBe(itemRoute.id)
    expect(newRoute.path).toBe(itemRoute.path)
    expect(newRoute.fullPath).toBe(itemRoute.fullPath)
    expect(newRoute.to).toBe(itemRoute.to)
    expect((newRoute as any).parentRoute).toBe(rootRoute)
    expect((newRoute as any).options).toBe((itemRoute as any).options)
  })

  it('clears lazy ownership and delegates rematerialization to the router', () => {
    const rootRoute = new BaseRootRoute({})
    const itemRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/items/$itemId',
    })
    const router = createTestRouter(
      rootRoute.addChildren([asAnyRoute(itemRoute)]),
    )
    const lazyOwner = Promise.resolve()
    const refreshRoute = vi.fn(async () => {})
    ;(itemRoute as any)._lazy = lazyOwner
    ;(router as any)._refreshRoute = refreshRoute

    expect((itemRoute as any)._lazy).toBe(lazyOwner)

    runHandleRouteUpdate(router, itemRoute.id, new BaseRoute({} as any))

    expect((itemRoute as any)._lazy).toBeUndefined()
    expect(refreshRoute).toHaveBeenCalledTimes(1)
    expect(refreshRoute).toHaveBeenCalledWith()
  })

  it('uses a fresh source lazy importer without erasing an omitted one', () => {
    const oldImporter = vi.fn(async () => ({ options: {} }) as any)
    const newImporter = vi.fn(async () => ({ options: {} }) as any)
    const rootRoute = new BaseRootRoute({})
    const itemRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/items/$itemId',
    }).lazy(oldImporter)
    const router = createTestRouter(
      rootRoute.addChildren([asAnyRoute(itemRoute)]),
    )

    runHandleRouteUpdate(
      router,
      itemRoute.id,
      new BaseRoute({} as any).lazy(newImporter),
    )
    expect(itemRoute.lazyFn).toBe(newImporter)

    runHandleRouteUpdate(router, itemRoute.id, new BaseRoute({} as any))
    expect(itemRoute.lazyFn).toBe(newImporter)
  })

  it('removes stale loader data when a hot route removes its loader', async () => {
    const rootRoute = new BaseRootRoute({})
    const hotRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/hot',
      loader: () => 'stale loader data',
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([asAnyRoute(hotRoute)]),
      '/hot',
    )
    await router.load()

    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      hotRoute.id,
    ])
    expect(router.state.matches[1]!.loaderData).toBe('stale loader data')

    const restoreWindow = withWindowRouter(router)
    try {
      getHandleRouteUpdate()(hotRoute.id, asAnyRoute(new BaseRoute({} as any)))
      await vi.waitFor(() => {
        expect(router.state.matches.map((match) => match.routeId)).toEqual([
          rootRoute.id,
          hotRoute.id,
        ])
        expect(router.state.matches[1]!.loaderData).toBeUndefined()
      })
    } finally {
      restoreWindow()
    }
  })

  it('keeps hot loader data when an older refresh settles later', async () => {
    let resolveStaleRefresh!: (value: string) => void
    const staleRefresh = new Promise<string>((resolve) => {
      resolveStaleRefresh = resolve
    })
    const oldLoader = vi
      .fn<() => string | Promise<string>>()
      .mockReturnValueOnce('initial')
      .mockReturnValueOnce(staleRefresh)
    const newLoader = vi.fn(() => 'hot')
    const rootRoute = new BaseRootRoute({ loader: oldLoader })
    const router = createClientTestRouter(rootRoute, '/')

    await router.load()
    expect(router.state.matches[0]?.loaderData).toBe('initial')

    const oldRefresh = router.invalidate()
    await vi.waitFor(() => expect(oldLoader).toHaveBeenCalledTimes(2))

    runHandleRouteUpdate(
      router,
      rootRoute.id,
      new BaseRootRoute({ loader: newLoader }),
    )

    await vi.waitFor(() => {
      expect(router.state.matches[0]?.loaderData).toBe('hot')
    })

    resolveStaleRefresh('stale')
    await oldRefresh

    expect(newLoader).toHaveBeenCalledTimes(1)
    expect(router.state.matches[0]!.routeId).toBe(rootRoute.id)
    expect(router.state.matches[0]!.loaderData).toBe('hot')
  })

  it('does not cache an obsolete inactive preload that settles after a hot update', async () => {
    let resolveOldLoader!: (value: string) => void
    const oldLoaderResult = new Promise<string>((resolve) => {
      resolveOldLoader = resolve
    })
    const oldLoader = vi.fn(() => oldLoaderResult)
    const newLoader = vi.fn(() => 'hot')
    const rootRoute = new BaseRootRoute({})
    const hotRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/hot',
      loader: oldLoader,
      preloadStaleTime: Infinity,
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([asAnyRoute(hotRoute)]),
      '/',
    )

    await router.load()
    const preload = router.preloadRoute({ to: '/hot' })
    await vi.waitFor(() => expect(oldLoader).toHaveBeenCalledOnce())

    runHandleRouteUpdate(
      router,
      hotRoute.id,
      new BaseRoute({ loader: newLoader } as any),
    )

    resolveOldLoader('obsolete')
    await preload
    await router.navigate({ to: '/hot' })

    expect(newLoader).toHaveBeenCalledOnce()
    expect(router.state.matches.at(-1)?.loaderData).toBe('hot')
  })

  it('observes hot parser and route-context changes on the active route', async () => {
    const rootRoute = new BaseRootRoute({})
    const itemRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/items/$itemId',
      params: {
        parse: ({ itemId }: { itemId: string }) => ({
          itemId,
          parser: 'old',
        }),
      },
      context: () => ({ source: 'old' }),
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([asAnyRoute(itemRoute)]),
      '/items/abc',
    )

    await router.load()
    expect(router.state.matches[1]!.routeId).toBe(itemRoute.id)
    expect(router.state.matches[1]!.params).toEqual({
      itemId: 'abc',
      parser: 'old',
    })
    expect(router.state.matches[1]!.context).toMatchObject({ source: 'old' })

    runHandleRouteUpdate(
      router,
      itemRoute.id,
      new BaseRoute({
        params: {
          parse: ({ itemId }: { itemId: string }) => ({
            itemId,
            parser: 'new',
          }),
        },
        context: () => ({ source: 'new' }),
      } as any),
    )

    await vi.waitFor(() => {
      expect(router.state.matches[1]!.routeId).toBe(itemRoute.id)
      expect(router.state.matches[1]!.params).toEqual({
        itemId: 'abc',
        parser: 'new',
      })
      expect(router.state.matches[1]!.context).toMatchObject({ source: 'new' })
    })
  })

  it('rematerializes descendants when a parent route definition changes', async () => {
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/parent',
      context: () => ({ source: 'old' }),
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(parentRoute),
      path: '/child',
      context: ({ context }) => ({ inheritedSource: context.source }),
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([
        parentRoute.addChildren([asAnyRoute(childRoute)]),
      ]),
      '/parent/child',
    )

    await router.load()
    expect(router.state.matches[2]?.context).toMatchObject({
      inheritedSource: 'old',
    })

    runHandleRouteUpdate(
      router,
      parentRoute.id,
      new BaseRoute({ context: () => ({ source: 'new' }) } as any),
    )

    await vi.waitFor(() => {
      expect(router.state.matches[2]?.context).toMatchObject({
        inheritedSource: 'new',
      })
    })
  })

  it('does not run removed loader or beforeLoad callbacks on a later visit', async () => {
    const beforeLoad = vi.fn(() => ({ hotBeforeLoad: true }))
    const loader = vi.fn(() => 'hot loader data')
    const rootRoute = new BaseRootRoute({})
    const hotRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/hot',
      beforeLoad,
      loader,
      staleTime: Infinity,
      gcTime: Infinity,
    })
    const otherRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/other',
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([asAnyRoute(hotRoute), asAnyRoute(otherRoute)]),
      '/hot',
    )

    await router.load()
    await router.navigate({ to: '/other' })
    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(1)

    runHandleRouteUpdate(router, hotRoute.id, new BaseRoute({} as any))
    await router.navigate({ to: '/hot' })

    const match = router.state.matches.find(
      (candidate) => candidate.routeId === hotRoute.id,
    )
    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(match).toBeDefined()
    expect(match!.loaderData).toBeUndefined()
    expect(match!.context).not.toHaveProperty('hotBeforeLoad')
  })

  it('removes rendered HeadContent and Scripts output after a hot update', async () => {
    const rootRoute = new BaseRootRoute({})
    const hotRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/hot',
      head: () => ({
        meta: [{ title: 'hot title' }],
        scripts: [{ src: '/hot-head.js' }],
      }),
      scripts: () => [{ src: '/hot-body.js' }],
    })
    const router = createReactClientTestRouter(
      rootRoute.addChildren([asAnyRoute(hotRoute)]),
      '/hot',
    )

    await router.load()
    expect(router.state.matches[1]!).toMatchObject({
      routeId: hotRoute.id,
      meta: [{ title: 'hot title' }],
      headScripts: [{ src: '/hot-head.js' }],
      scripts: [{ src: '/hot-body.js' }],
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const reactRoot = createRoot(container)
    const previousActEnvironment = (globalThis as any).IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    onTestFinished(() => {
      if (previousActEnvironment === undefined) {
        delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT
      } else {
        ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
      }
    })
    onTestFinished(() => {
      container.remove()
    })
    onTestFinished(async () => {
      await act(async () => {
        reactRoot.unmount()
      })
    })

    await act(async () => {
      reactRoot.render(
        createElement(RouterContextProvider, {
          router,
          children: createElement(
            Fragment,
            null,
            createPortal(createElement(HeadContent), document.head),
            createElement(Scripts),
          ),
        }),
      )
    })

    expect(document.head.querySelector('title')?.textContent).toBe('hot title')
    expect(
      document.head.querySelector('script[src="/hot-head.js"]'),
    ).not.toBeNull()
    expect(
      document.head.querySelector('script[src="/hot-body.js"]'),
    ).not.toBeNull()

    await act(async () => {
      runHandleRouteUpdate(router, hotRoute.id, new BaseRoute({} as any))
      await vi.waitFor(() => {
        expect(router.state.matches[1]!.routeId).toBe(hotRoute.id)
        expect(router.state.matches[1]!.meta).toBeUndefined()
        expect(router.state.matches[1]!.headScripts).toBeUndefined()
        expect(router.state.matches[1]!.scripts).toBeUndefined()
      })
    })

    expect(document.head.querySelector('title')).toBeNull()
    expect(document.head.querySelector('script[src="/hot-head.js"]')).toBeNull()
    expect(document.head.querySelector('script[src="/hot-body.js"]')).toBeNull()
  })
})
