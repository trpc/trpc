import { bench, describe, expect } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

describe.each(['stable', 'new-router', 'no-update'] as const)(
  'path decoder: %s configuration',
  (mode) => {
    const makeRouter = (allowed: ReadonlyArray<'@' | '+'>) => {
      const root = new BaseRootRoute({})
      const item = new BaseRoute({
        getParentRoute: () => root,
        path: '/items/$id',
      })
      const router = createTestRouter({
        routeTree: root.addChildren([item]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
        pathParamsAllowedCharacters: allowed,
        scrollRestoration: false,
      })
      router.history.destroy()
      return router
    }
    let router = makeRouter(['@'])
    const inputs = Array.from({ length: 200 }, (_, index) => ({
      to: '/items/$id',
      params: { id: `item-${index % 40}@+` },
    }))
    let count = 0
    let lastHref = ''
    const run = () => {
      count++
      if (mode === 'new-router') {
        router = makeRouter(count % 2 === 0 ? ['+'] : ['@'])
      } else if (mode === 'stable') {
        router.update({
          ...router.options,
          context: { count },
        })
      }
      for (const input of inputs) {
        lastHref = router.buildLocation(input).href
      }
    }
    const verify = () => {
      expect(lastHref).toBe(
        mode === 'new-router' && count % 2 === 0
          ? '/items/item-39%40+'
          : '/items/item-39@%2B',
      )
    }
    run()
    verify()
    bench('update and build 200 locations', run, {
      time: 1500,
      warmupTime: 500,
      throws: true,
      teardown: verify,
    })
  },
)
