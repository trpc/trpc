import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

test('server route lifecycle callbacks run after loaded matches are published', async () => {
  const events: Array<string> = []
  const onEnter = vi.fn((match) => {
    events.push(`enter:${match.routeId}:${match.loaderData}`)
  })
  const onStay = vi.fn((match) => {
    events.push(`stay:${match.routeId}:${match.search.step}`)
  })
  const onLeave = vi.fn((match) => {
    events.push(`leave:${match.routeId}`)
  })
  const barEnter = vi.fn((match) => {
    events.push(`enter:${match.routeId}`)
  })

  const rootRoute = new BaseRootRoute({})
  const fooRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/foo',
    beforeLoad: () => {
      events.push('beforeLoad:/foo')
      return { ready: true }
    },
    loader: ({ context }) => {
      events.push(`loader:/foo:${context.ready}`)
      return 'foo data'
    },
    onEnter,
    onStay,
    onLeave,
  })
  const barRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/bar',
    onEnter: barEnter,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([fooRoute, barRoute]),
    history: createMemoryHistory(),
    isServer: true,
  })

  expect((await loadServerResponse(router, '/foo?step=one')).status).toBe(200)
  expect(events).toEqual([
    'beforeLoad:/foo',
    'loader:/foo:true',
    `enter:${fooRoute.id}:foo data`,
  ])
  expect(onEnter).toHaveBeenCalledWith(
    expect.objectContaining({
      routeId: fooRoute.id,
      status: 'success',
      loaderData: 'foo data',
      context: expect.objectContaining({ ready: true }),
    }),
  )

  events.length = 0
  expect((await loadServerResponse(router, '/foo?step=two')).status).toBe(200)
  expect(events).toEqual([
    'beforeLoad:/foo',
    'loader:/foo:true',
    `stay:${fooRoute.id}:two`,
  ])

  events.length = 0
  expect((await loadServerResponse(router, '/bar')).status).toBe(200)
  expect(events).toEqual([`leave:${fooRoute.id}`, `enter:${barRoute.id}`])
  expect(onLeave).toHaveBeenCalledTimes(1)
  expect(barEnter).toHaveBeenCalledTimes(1)
})
