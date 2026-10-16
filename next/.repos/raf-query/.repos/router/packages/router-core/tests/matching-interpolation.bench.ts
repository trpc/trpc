import { bench, describe, expect } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'
import type { AnyRoute } from '../src'

const cases = [
  {
    name: 'nested required params',
    segments: ['/orgs/$org', '/items/$id'],
    paths: Array.from(
      { length: 32 },
      (_, id) => `/orgs/team%20one/items/item%20${id}`,
    ),
  },
  {
    name: 'non-overlapping params',
    segments: ['/items/$id'],
    paths: Array.from({ length: 256 }, (_, id) => `/items/item%20${id}`),
    misses: true,
  },
  {
    name: 'missing optional params',
    segments: ['/items/{-$lang}/$id'],
    paths: Array.from({ length: 32 }, (_, id) => `/items/item%20${id}`),
  },
  {
    name: 'present optional params',
    segments: ['/items/{-$lang}/$id'],
    paths: Array.from({ length: 32 }, (_, id) => `/items/en/item%20${id}`),
  },
  {
    name: 'affixed splats',
    segments: ['/files/prefix{$}.txt'],
    paths: Array.from(
      { length: 32 },
      (_, id) => `/files/prefixdocs/file%20${id}.txt`,
    ),
  },
]

for (const server of [false, true]) {
  for (const primeLinks of [false, true]) {
    describe(`matching interpolation (server: ${server}, Link-primed: ${primeLinks})`, () => {
      for (const scenario of cases) {
        const root = new BaseRootRoute({})
        let parent: AnyRoute = root
        for (const path of scenario.segments) {
          const parentRoute = parent
          const route = new BaseRoute({
            getParentRoute: () => parentRoute,
            path,
          })
          parent.addChildren([route])
          parent = route
        }
        const history = createMemoryHistory({ initialEntries: ['/'] })
        const router = createTestRouter({
          routeTree: root,
          history,
          isServer: server,
          scrollRestoration: false,
        })
        history.destroy()
        const options = { _controller: new AbortController() }

        for (const path of scenario.paths) {
          router.getMatchedRoutes(path)
        }
        if (primeLinks) {
          const paths = scenario.misses
            ? scenario.paths
                .slice(0, 32)
                .map((path) => path.replace('item%20', 'cached%20'))
            : scenario.paths
          for (const path of paths) {
            const [routes, params] = router.getMatchedRoutes(path)
            for (const route of routes) {
              const to: string = route.fullPath
              if (to.includes('$')) {
                router.buildLocation({ to, params })
              }
            }
          }
        }

        let expected = 0
        for (const path of scenario.paths) {
          const matches = router.matchRoutes(path, {}, options)
          expect(matches.at(-1)?.routeId).toBe(parent.id)
          for (const match of matches) {
            expect(match.paramsError).toBeUndefined()
            expected +=
              match.id.length + Object.keys(match._strictParams).length
          }
        }
        let checksum = 0
        bench(
          scenario.name,
          () => {
            let length = 0
            for (const path of scenario.paths) {
              for (const match of router.matchRoutes(path, {}, options)) {
                length +=
                  match.id.length + Object.keys(match._strictParams).length
              }
            }
            checksum = length
          },
          {
            time: 1000,
            warmupTime: 300,
            throws: true,
            teardown: () => expect(checksum).toBe(expected),
          },
        )
      }
    })
  }
}
