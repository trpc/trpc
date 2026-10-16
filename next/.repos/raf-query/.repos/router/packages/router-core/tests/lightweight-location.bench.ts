import { bench, describe, expect } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

describe.each([false, true])(
  'cold lightweight locations (server: %s)',
  (isServer) => {
    for (const count of [1, 8, 32]) {
      const root = new BaseRootRoute({})
      const segments = Array.from({ length: count }, (_, index) => `$p${index}`)
      const source = new BaseRoute({
        getParentRoute: () => root,
        path: `/source/${segments.join('/')}`,
      })
      const target = new BaseRoute({
        getParentRoute: () => root,
        path: '/target',
      })
      const history = createMemoryHistory({ initialEntries: ['/'] })
      const router = createTestRouter({
        routeTree: root.addChildren([source, target]),
        history,
        isServer,
        scrollRestoration: false,
      })
      history.destroy()
      const pathname = `/source/${segments.map((_, index) => String(index)).join('/')}`
      const location = {
        ...router.latestLocation,
        pathname,
        href: pathname,
        publicHref: pathname,
      }
      let checksum = 0
      const iterations = 256
      function run() {
        checksum = 0
        for (let index = 0; index < iterations; index++) {
          checksum += router.buildLocation({
            to: '/target',
            params: true,
            _fromLocation: { ...location },
          }).pathname.length
        }
      }
      run()
      expect(checksum).toBe(iterations * '/target'.length)
      bench(`${count} source params`, run, {
        time: 1000,
        warmupTime: 200,
        throws: true,
        teardown: () => {
          expect(checksum).toBe(iterations * '/target'.length)
        },
      })
    }
  },
)
