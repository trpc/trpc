import { describe, expect, test } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

const asciiControls = [...Array.from({ length: 32 }, (_, code) => code), 127]
const staticPaths = ['/', '/admin', '/profile'] as const
const parameterCases = [
  '{{app_name}}',
  '<test>',
  '"quoted"',
  "apostrophe's",
  'back`tick',
  'file name',
  'a\\b',
  'a%b',
  '대한민국',
  '😀',
  ...asciiControls.map((code) => `a${String.fromCharCode(code)}b`),
].map((value) => ({ value, path: `/params/${encodeURIComponent(value)}` }))
const encodedControls = [
  ...asciiControls.map(
    (code) => `%${code.toString(16).padStart(2, '0').toUpperCase()}`,
  ),
  '%0D%0A',
]

describe.each([false, true])('SSR URL encoding (rewrite: %s)', (rewrite) => {
  function setupRouter() {
    const loaderCalls: Array<string> = []
    const rootRoute = new BaseRootRoute()
    const staticRoutes = staticPaths.map(
      (path) =>
        new BaseRoute({
          getParentRoute: () => rootRoute,
          path,
          loader: () => {
            loaderCalls.push(path)
            return path
          },
        }),
    )
    const paramRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/params/$value',
      loader: ({ params }) => params.value,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([...staticRoutes, paramRoute]),
      isServer: true,
      rewrite: rewrite
        ? { input: ({ url }) => url, output: ({ url }) => url }
        : undefined,
    })
    return { router, paramRoute, loaderCalls }
  }

  test.each(parameterCases)(
    'serves and rebuilds $path without redirecting',
    async ({ value, path }) => {
      const { router, paramRoute } = setupRouter()

      const response = await loadServerResponse(router, path)

      expect(response.status).toBe(200)
      expect(response.headers.get('Location')).toBeNull()
      const match = router.state.matches.find(
        (item) => item.routeId === paramRoute.id,
      )
      expect(match?.params).toEqual({ value })
      expect(match?.loaderData).toBe(value)
      expect(
        router.buildLocation({ to: '/params/$value', params: { value } })
          .publicHref,
      ).toBe(path)
    },
  )

  test.each(staticPaths)('loads the ordinary route %s', async (path) => {
    const { router, loaderCalls } = setupRouter()

    const response = await loadServerResponse(router, path)

    expect(response.status).toBe(200)
    expect(response.headers.get('Location')).toBeNull()
    expect(loaderCalls).toEqual([path])
  })

  test.each(encodedControls)(
    'preserves %s when resolving routes and canonicalizing trailing slashes',
    async (encoded) => {
      for (const variant of new Set([encoded, encoded.toLowerCase()])) {
        for (const path of [
          `/${variant}admin`,
          `/assets/..${variant}/profile`,
          `/assets/..${variant}/`,
        ]) {
          const normalizedPath = path.replace(variant, encoded)
          const { router, loaderCalls } = setupRouter()

          const response = await loadServerResponse(router, path)

          expect(loaderCalls, path).toEqual([])
          expect(router.state.location.pathname, path).toBe(normalizedPath)
          if (path.endsWith('/')) {
            const destination = normalizedPath.slice(0, -1)
            expect(response.status, path).toBe(307)
            expect(response.headers.get('Location'), path).toBe(destination)

            // Removing the trailing slash must preserve the encoded segment
            // and end at a 404, rather than redirecting again or loading '/'.
            const followUp = setupRouter()
            const finalResponse = await loadServerResponse(
              followUp.router,
              destination,
            )
            expect(finalResponse.status, path).toBe(404)
            expect(finalResponse.headers.get('Location'), path).toBeNull()
            expect(followUp.loaderCalls, path).toEqual([])
            expect(followUp.router.state.location.pathname, path).toBe(
              destination,
            )
          } else {
            expect(response.status, path).toBe(404)
            expect(response.headers.get('Location'), path).toBeNull()
          }
        }
      }
    },
  )
})
