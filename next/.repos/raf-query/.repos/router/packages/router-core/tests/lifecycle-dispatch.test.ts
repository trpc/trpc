import { expect, test } from 'vitest'
import { lifecycleEnd, runRouteLifecycle } from '../src/router'
import type { AnyRouteMatch, AnyRouter } from '../src'
import type { LoadTransaction } from '../src/load-client'

test.each(['onLeave', 'onEnter', 'onStay'] as const)(
  '%s supersession stops remaining lifecycle callbacks',
  (callback) => {
    const events: Array<string> = []
    const owner = {} as LoadTransaction
    const matches = ['parent', 'child'].map((routeId) => ({
      routeId,
      status: 'success',
    })) as Array<AnyRouteMatch>
    const router = {
      _tx: owner,
      routesById: Object.fromEntries(
        matches.map(({ routeId }) => [
          routeId,
          {
            options: {
              [callback]: () => {
                events.push(routeId)
                router._tx = {} as LoadTransaction
              },
            },
          },
        ]),
      ),
    } as unknown as AnyRouter
    const previous = callback === 'onEnter' ? [] : matches
    const next = callback === 'onLeave' ? [] : matches
    runRouteLifecycle(
      router,
      previous,
      next,
      lifecycleEnd(previous),
      lifecycleEnd(next),
      owner,
    )
    expect(events).toEqual(['parent'])
    expect(matches).toHaveLength(2)
  },
)

test('saved fallback membership survives statuses changing before dispatch', () => {
  const events: Array<string> = []
  const previous = [
    { routeId: 'parent', status: 'notFound' },
    { routeId: 'child', status: 'success' },
  ] as Array<AnyRouteMatch>
  const previousEnd = lifecycleEnd(previous)
  previous[0]!.status = 'pending'
  const matches = previous.map((match) => ({
    ...match,
    status: 'success' as const,
  }))
  const router = {
    routesById: Object.fromEntries(
      matches.map(({ routeId }) => [
        routeId,
        {
          options: {
            onEnter: () => events.push(`enter:${routeId}`),
            onStay: () => events.push(`stay:${routeId}`),
            onLeave: () => events.push(`leave:${routeId}`),
          },
        },
      ]),
    ),
  } as unknown as AnyRouter
  runRouteLifecycle(
    router,
    previous,
    matches,
    previousEnd,
    lifecycleEnd(matches),
  )
  expect(events).toEqual(['stay:parent', 'enter:child'])
  expect(previous).toHaveLength(2)
  expect(previous[0]!.status).toBe('pending')
})
