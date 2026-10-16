import { runInNewContext } from 'node:vm'
import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { GLOBAL_TSR } from '../src/ssr/constants'

import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import { createTestRouter } from './routerTestUtils'
import type { AnyRouter } from '../src'
import type {
  ManifestCssLink,
  ManifestRouteAssets,
  ServerManifest,
} from '../src/manifest'
import type { InitialHydrationScriptTags } from '../src/ssr/hydrationScripts'
import type { DehydratedRouter } from '../src/ssr/types'

function buildRouter() {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const postsRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/posts',
    component: () => null,
  })

  const routeTree = rootRoute.addChildren([indexRoute, postsRoute])

  return createTestRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
  })
}

function buildManifest(): ServerManifest {
  const sharedAsset: ManifestCssLink = '/assets/shared.css'

  return {
    routes: {
      __root__: {
        css: [sharedAsset],
        preloads: ['/assets/root.js'],
      },
      '/': {
        css: [sharedAsset],
        preloads: ['/assets/index.js'],
      },
      '/posts': {
        css: [sharedAsset],
        preloads: ['/assets/posts.js'],
      },
    },
  }
}

function buildInlineManifest(): ServerManifest {
  const manifest = buildManifest()
  return {
    ...manifest,
    inlineCss: {
      styles: {
        '/assets/shared.css': '.shared{color:red}',
      },
    },
  }
}

async function dehydrateManifest() {
  const router = buildRouter()
  const manifest = buildManifest()

  attachRouterServerSsrUtils({
    router,
    manifest,
  })

  await router.load()
  await router.serverSsr!.dehydrate()

  const scripts = router.serverSsr!.takeInitialHydrationScriptTags()
  expect(scripts?.boundary.children).toContain('$tsr-stream-boundary')
  expect(scripts?.boundary.attrs).not.toHaveProperty('id')

  return parseSerializedRouter(scripts!).manifest!
}

function parseSerializedRouter(
  scripts: InitialHydrationScriptTags,
): DehydratedRouter {
  const context: Record<string, any> = {
    document: {
      currentScript: {
        remove() {},
      },
    },
  }
  context.self = context

  expect(scripts.boundary.children).toContain('$tsr-stream-boundary')
  expect(scripts.boundary.attrs).not.toHaveProperty('id')

  const streamParts = scripts.before
  expect(streamParts.length).toBeGreaterThan(0)
  for (const script of streamParts) {
    expect(script.tag).toBe('script')
    expect(script.attrs?.['data-tsr-stream-part']).toBe('')
    expect(script.children).toBeTruthy()
    runInNewContext(script.children!, context)
  }

  const router = context[GLOBAL_TSR]?.router
  expect(router).toBeDefined()
  return router
}

describe('attachRouterServerSsrUtils manifest dehydration', () => {
  test.each([
    { label: 'false', value: false, expectedProperty: true },
    { label: 'zero', value: 0, expectedProperty: true },
    { label: 'an empty string', value: '', expectedProperty: true },
    { label: 'null', value: null, expectedProperty: true },
    { label: 'undefined', value: undefined, expectedProperty: false },
  ])(
    'preserves $label custom dehydration values',
    async ({ value, expectedProperty }) => {
      const router: AnyRouter = buildRouter()
      router.options.dehydrate = () => value
      attachRouterServerSsrUtils({ router, manifest: undefined })

      try {
        await router.load()
        await router.serverSsr!.dehydrate()
        const scripts = router.serverSsr!.takeInitialHydrationScriptTags()
        const dehydratedRouter = parseSerializedRouter(scripts!)

        expect(
          Object.prototype.hasOwnProperty.call(
            dehydratedRouter,
            'dehydratedData',
          ),
        ).toBe(expectedProperty)
        if (expectedProperty) {
          expect(dehydratedRouter.dehydratedData).toBe(value)
        }
      } finally {
        router.serverSsr?.cleanup()
      }
    },
  )

  test('omits unmatched route assets by default', async () => {
    const manifest = await dehydrateManifest()

    expect(manifest.routes['/posts']).toBeUndefined()
    expect(manifest.routes['/']?.preloads).toEqual(['/assets/index.js'])
  })

  test('preserves script format when dehydrating the manifest', async () => {
    const router = buildRouter()
    const manifest: ServerManifest = {
      ...buildManifest(),
      scriptFormat: 'iife',
    }

    attachRouterServerSsrUtils({
      router,
      manifest,
    })

    await router.load()
    await router.serverSsr!.dehydrate()

    const scripts = router.serverSsr!.takeInitialHydrationScriptTags()
    const dehydratedManifest = parseSerializedRouter(scripts!).manifest!

    expect(dehydratedManifest.scriptFormat).toBe('iife')
  })

  test('maps request-scoped preload links into SSR manifest data', async () => {
    const router = buildRouter()
    const manifest = buildManifest()
    const requestAssets: ManifestRouteAssets = {
      preloads: [{ href: '/assets/rsc-client.js', crossOrigin: 'anonymous' }],
      scripts: [
        {
          attrs: {
            src: '/assets/request-script.js',
            type: 'module',
          },
          children: 'console.log("request")',
        },
      ],
      css: [{ href: '/assets/rsc-client.css', crossOrigin: 'use-credentials' }],
    }

    attachRouterServerSsrUtils({
      router,
      manifest,
      getRequestAssets: () => requestAssets,
    })

    await router.load()

    expect(router.ssr!.manifest?.routes.__root__).toMatchObject({
      preloads: [
        { href: '/assets/rsc-client.js', crossOrigin: 'anonymous' },
        '/assets/root.js',
      ],
      scripts: [
        {
          attrs: {
            src: '/assets/request-script.js',
            type: 'module',
          },
          children: 'console.log("request")',
        },
      ],
      css: [
        { href: '/assets/rsc-client.css', crossOrigin: 'use-credentials' },
        '/assets/shared.css',
      ],
    })
  })

  test('maps preloads-only request assets into SSR manifest data', async () => {
    const router = buildRouter()
    const manifest = buildManifest()
    const requestAssets: ManifestRouteAssets = {
      preloads: [{ href: '/assets/rsc-client.js', crossOrigin: 'anonymous' }],
    }

    attachRouterServerSsrUtils({
      router,
      manifest,
      getRequestAssets: () => requestAssets,
    })

    await router.load()

    expect(router.ssr!.manifest?.routes.__root__?.preloads).toEqual([
      { href: '/assets/rsc-client.js', crossOrigin: 'anonymous' },
      '/assets/root.js',
    ])
  })

  test('dehydrates request-scoped preload links into manifest data', async () => {
    const router = buildRouter()
    const manifest = buildManifest()

    attachRouterServerSsrUtils({
      router,
      manifest,
    })

    await router.load()
    await router.serverSsr!.dehydrate({
      requestAssets: {
        preloads: [{ href: '/assets/rsc-client.js', crossOrigin: 'anonymous' }],
        scripts: [
          {
            attrs: {
              src: '/assets/request-script.js',
              type: 'module',
            },
            children: 'console.log("request")',
          },
        ],
        css: [
          {
            href: '/assets/rsc-client.css',
            crossOrigin: 'use-credentials',
          },
        ],
      },
    })

    const scripts = router.serverSsr!.takeInitialHydrationScriptTags()
    const dehydratedManifest = parseSerializedRouter(scripts!).manifest!

    expect(dehydratedManifest.routes.__root__).toMatchObject({
      preloads: [
        { href: '/assets/rsc-client.js', crossOrigin: 'anonymous' },
        '/assets/root.js',
      ],
      scripts: [
        {
          attrs: {
            src: '/assets/request-script.js',
            type: 'module',
          },
          children: 'console.log("request")',
        },
      ],
      css: [
        { href: '/assets/rsc-client.css', crossOrigin: 'use-credentials' },
        '/assets/shared.css',
      ],
    })
    expect(Array.isArray(dehydratedManifest.routes.__root__?.css)).toBe(true)
    expect((dehydratedManifest.routes.__root__?.css as any).links).toBe(
      undefined,
    )
  })

  test('dehydrates preloads-only request assets into manifest data', async () => {
    const router = buildRouter()
    const manifest = buildManifest()

    attachRouterServerSsrUtils({
      router,
      manifest,
    })

    await router.load()
    await router.serverSsr!.dehydrate({
      requestAssets: {
        preloads: [{ href: '/assets/rsc-client.js', crossOrigin: 'anonymous' }],
      },
    })

    const scripts = router.serverSsr!.takeInitialHydrationScriptTags()
    const dehydratedManifest = parseSerializedRouter(scripts!).manifest!

    expect(dehydratedManifest.routes.__root__?.preloads).toEqual([
      { href: '/assets/rsc-client.js', crossOrigin: 'anonymous' },
      '/assets/root.js',
    ])
  })

  test('inlines stylesheet assets for SSR and strips stylesheet links from dehydration', async () => {
    const router = buildRouter()
    const manifest = buildInlineManifest()

    attachRouterServerSsrUtils({
      router,
      manifest,
    })

    await router.load()

    const ssrInlineCss = router.ssr!.manifest?.inlineStyle
    expect(ssrInlineCss).toMatchObject({
      children: '.shared{color:red}',
    })

    await router.serverSsr!.dehydrate()

    const scripts = router.serverSsr!.takeInitialHydrationScriptTags()
    const dehydratedRouter = parseSerializedRouter(scripts!)
    const dehydratedManifest = dehydratedRouter.manifest!
    const rootInlineCss = dehydratedManifest.inlineStyle
    const allLinks = Object.values(dehydratedManifest.routes).flatMap(
      (route) => route.css ?? [],
    )

    expect(rootInlineCss).toEqual({
      attrs: {
        suppressHydrationWarning: true,
      },
    })
    expect('inlineCss' in dehydratedManifest).toBe(false)
    expect(
      allLinks.some((asset) =>
        typeof asset === 'string'
          ? asset === '/assets/shared.css'
          : asset.href === '/assets/shared.css',
      ),
    ).toBe(false)
    expect(dehydratedManifest.routes['/']?.preloads).toEqual([
      '/assets/index.js',
    ])
  })

  test('memoizes prepared inline CSS while composing request assets freshly', async () => {
    const router = buildRouter()
    const manifest = buildInlineManifest()
    const requestAssets: ManifestRouteAssets = {
      preloads: ['/assets/request.js'],
    }

    attachRouterServerSsrUtils({
      router,
      manifest,
      getRequestAssets: () => requestAssets,
    })

    await router.load()

    const first = router.ssr!.manifest
    const second = router.ssr!.manifest
    // The composed manifest is fresh because request assets are mutable, while
    // the immutable inline CSS preparation is reused for this route set.
    expect(second).not.toBe(first)
    expect(second?.inlineStyle).toBe(first?.inlineStyle)
    expect(first?.inlineStyle).toMatchObject({
      children: '.shared{color:red}',
    })
    expect(first?.routes.__root__?.preloads).toEqual([
      '/assets/request.js',
      '/assets/root.js',
    ])
  })

  test('refreshes the composed manifest when a stable request-assets object changes', async () => {
    const router = buildRouter()
    const manifest = buildManifest()
    const requestAssets: ManifestRouteAssets = {
      preloads: ['/assets/discovered-early.js'],
    }

    attachRouterServerSsrUtils({
      router,
      manifest,
      getRequestAssets: () => requestAssets,
    })

    try {
      await router.load()

      const beforeDiscovery = router.ssr!.manifest
      expect(beforeDiscovery?.routes.__root__?.preloads).toEqual([
        '/assets/discovered-early.js',
        '/assets/root.js',
      ])

      // React Start RSC retains this object and replaces these members as it
      // discovers client references during the request.
      requestAssets.preloads = ['/assets/discovered-late.js']

      const afterDiscovery = router.ssr!.manifest
      expect(afterDiscovery).not.toBe(beforeDiscovery)
      expect(afterDiscovery?.routes.__root__?.preloads).toEqual([
        '/assets/discovered-late.js',
        '/assets/root.js',
      ])
    } finally {
      router.serverSsr?.cleanup()
    }
  })

  test('strips only inlinable stylesheet links from dehydrated manifest data', async () => {
    const router = buildRouter()
    const manifest: ServerManifest = {
      inlineCss: {
        styles: {
          '/assets/root-inline.css': '.root{color:red}',
          '/assets/index-inline.css': '.index{color:blue}',
        },
      },
      routes: {
        __root__: {
          css: [
            '/assets/root-inline.css',
            {
              href: '/assets/root-linked.css',
              crossOrigin: 'anonymous',
            },
          ],
        },
        '/': {
          css: [
            {
              href: '/assets/index-inline.css',
              crossOrigin: 'use-credentials',
            },
            '/assets/index-linked.css',
          ],
          preloads: ['/assets/index.js'],
        },
      },
    }

    attachRouterServerSsrUtils({
      router,
      manifest,
    })

    await router.load()

    expect(router.ssr!.manifest?.inlineStyle).toMatchObject({
      children: '.root{color:red}.index{color:blue}',
    })

    await router.serverSsr!.dehydrate()

    const scripts = router.serverSsr!.takeInitialHydrationScriptTags()
    const dehydratedManifest = parseSerializedRouter(scripts!).manifest!

    expect(dehydratedManifest.routes.__root__?.css).toEqual([
      {
        href: '/assets/root-linked.css',
        crossOrigin: 'anonymous',
      },
    ])
    expect(dehydratedManifest.routes['/']?.css).toEqual([
      '/assets/index-linked.css',
    ])
    expect(dehydratedManifest.routes['/']?.preloads).toEqual([
      '/assets/index.js',
    ])
  })

  test('omits descendant assets past a terminal parent boundary', async () => {
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: () => {
        throw new Error('parent failed')
      },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      isServer: true,
    })
    const manifest: ServerManifest = {
      inlineCss: {
        styles: {
          '/assets/root.css': '.root{}',
          '/assets/parent.css': '.parent{}',
          '/assets/child.css': '.child{}',
        },
      },
      routes: {
        [rootRoute.id]: { css: ['/assets/root.css'] },
        [parentRoute.id]: { css: ['/assets/parent.css'] },
        [childRoute.id]: {
          css: ['/assets/child.css'],
          preloads: ['/assets/child.js'],
        },
      },
    }

    attachRouterServerSsrUtils({ router, manifest })
    await router.load()

    expect(router.state.matches).toHaveLength(3)
    expect(router.ssr!.manifest?.inlineStyle?.children).toBe('.root{}.parent{}')

    await router.serverSsr!.dehydrate()
    const scripts = router.serverSsr!.takeInitialHydrationScriptTags()
    expect(scripts).toBeDefined()
    const dehydratedManifest = parseSerializedRouter(scripts!).manifest!

    expect(dehydratedManifest.routes[childRoute.id]).toBeUndefined()
  })
})
