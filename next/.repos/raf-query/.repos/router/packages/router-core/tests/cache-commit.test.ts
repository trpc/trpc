import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { commitMatches } from '../src/load-client'
import { createTestRouter } from './routerTestUtils'
import type { AnyRouteMatch, AnyRouter } from '../src'
import type { LoaderFlight, LoadTransaction } from '../src/load-client'

type Match = AnyRouteMatch & { _flight?: LoaderFlight }

function resource(leases = 1): LoaderFlight {
  return [Promise.resolve([0, undefined]), new AbortController(), leases]
}

function match(id: string, flight?: LoaderFlight): Match {
  return {
    id,
    routeId: '/items/$id',
    status: 'success',
    updatedAt: 0,
    _flight: flight,
  } as Match
}

function setup(
  previous: Array<Match>,
  cached: Array<Match>,
  next = [match('next')],
) {
  const tx = [
    new AbortController(),
    0,
    undefined,
    next,
    0,
    Promise.resolve(),
  ] as unknown as LoadTransaction
  const publish = vi.fn()
  const router = {
    _tx: tx,
    _committed: previous,
    _cache: new Map(cached.map((entry) => [entry.id, entry])),
    _flights: new Map(
      [...previous, ...cached, ...next]
        .filter((entry) => entry._flight)
        .map((entry) => [entry.id, entry._flight!]),
    ),
    options: {},
    routesById: {
      '/items/$id': {
        options: {
          loader: () => {},
          gcTime: Infinity,
          preloadGcTime: Infinity,
        },
      },
    },
    stores: { setMatches: publish },
  } as unknown as AnyRouter
  return {
    router,
    publish,
    tx,
    next,
    commit: () => commitMatches(router, tx, next),
  }
}

describe('commit cache ownership', () => {
  test.each(['error', 'notFound', 'pending', 'global not found'] as const)(
    'only supersedes the rendered prefix and settled descendants at a %s boundary',
    (boundaryKind) => {
      const cached = [
        'prefix',
        'boundary',
        'settled',
        'pending',
        'failed',
        'unrelated',
      ].map((id) => match(id, resource()))
      const next = cached.slice(0, -1).map((entry) => match(entry.id))
      if (boundaryKind === 'global not found') {
        next[1]!._notFound = true
      } else {
        next[1]!.status = boundaryKind
      }
      next[3]!.status = 'pending'
      next[4]!.status = 'error'
      const { router, commit } = setup([], cached, next)

      commit()

      expect([...router._cache.keys()]).toEqual([
        'pending',
        'failed',
        'unrelated',
      ])
      for (const [index, entry] of cached.entries()) {
        if (index < 3) {
          expect(entry._flight).toBeUndefined()
        } else {
          expect(router._cache.get(entry.id)).toBe(entry)
          expect(entry._flight?.[1].signal.aborted).toBe(false)
        }
      }
    },
  )

  test('retains cached identities and releases the committed owner cloned into cache', () => {
    const retainedFlight = resource()
    const departedFlight = resource()
    const retained = match('retained', retainedFlight)
    const departed = match('departed', departedFlight)
    const { router, commit } = setup([departed], [retained])

    commit()

    expect(router._cache.get('retained')).toBe(retained)
    expect(retained._flight).toBe(retainedFlight)
    expect(retainedFlight[2]).toBe(1)
    expect(retainedFlight[1].signal.aborted).toBe(false)
    expect(router._cache.get('departed')).not.toBe(departed)
    expect((router._cache.get('departed') as Match)._flight).toBeUndefined()
    expect(departed._flight).toBeUndefined()
    expect(departedFlight[1].signal.aborted).toBe(true)
  })

  test('keeps a retained generation alive when a departing generation shares its flight', () => {
    const shared = resource(2)
    const departed = match('same', shared)
    const retained = match('same', shared)
    const { router, commit } = setup([departed], [retained])

    commit()

    expect(router._cache.get('same')).toBe(retained)
    expect(departed._flight).toBeUndefined()
    expect(retained._flight).toBe(shared)
    expect(shared[2]).toBe(1)
    expect(shared[1].signal.aborted).toBe(false)
  })

  test('releases the old same-id generation without releasing its replacement', () => {
    const oldFlight = resource()
    const newFlight = resource()
    const old = match('same', oldFlight)
    const replacement = match('same', newFlight)
    const { router, commit } = setup([], [old], [replacement])

    commit()

    expect(router._cache.has('same')).toBe(false)
    expect(old._flight).toBeUndefined()
    expect(oldFlight[1].signal.aborted).toBe(true)
    expect(replacement._flight).toBe(newFlight)
    expect(newFlight[1].signal.aborted).toBe(false)
    expect(router._flights?.get('same')).toBe(newFlight)
  })

  test('detaches all expired owners before abort listeners run, including duplicate objects', () => {
    const shared = resource(2)
    const first = match('first', shared)
    const second = match('second', shared)
    first.status = second.status = 'error'
    const { router, tx, next, commit } = setup([first], [first, second])
    const onAbort = vi.fn(() => {
      expect(first._flight).toBeUndefined()
      expect(second._flight).toBeUndefined()
      expect(router._cache.size).toBe(0)
      expect(router._committed).toBe(next)
      expect(tx[3]).toEqual([])
    })
    shared[1].signal.addEventListener('abort', onAbort)

    commit()

    expect(shared[2]).toBe(0)
    expect(onAbort).toHaveBeenCalledOnce()
  })

  test('uses cache contents after synchronous publication mutation', () => {
    const retainedFlight = resource()
    const retained = match('retained', retainedFlight)
    const { router, publish, commit } = setup([], [retained])
    publish.mockImplementation(() => router._cache.delete('retained'))

    commit()

    expect(retained._flight).toBeUndefined()
    expect(retainedFlight[1].signal.aborted).toBe(true)
  })

  test('uses the captured cache if publication replaces the router cache', () => {
    const retainedFlight = resource()
    const retained = match('retained', retainedFlight)
    const { router, publish, commit } = setup([], [retained])
    publish.mockImplementation(() => {
      router._cache = new Map()
    })

    commit()

    expect(router._cache.size).toBe(0)
    expect(retained._flight).toBe(retainedFlight)
    expect(retainedFlight[1].signal.aborted).toBe(false)
  })
})

test('an unrelated navigation retains a fresh preload flight and evicts an expired one', async () => {
  let freshSignal: AbortSignal | undefined
  let expiredSignal: AbortSignal | undefined
  const root = new BaseRootRoute({})
  const home = new BaseRoute({ getParentRoute: () => root, path: '/' })
  const other = new BaseRoute({ getParentRoute: () => root, path: '/other' })
  const freshLoader = vi.fn(
    ({ abortController }: { abortController: AbortController }) => {
      freshSignal = abortController.signal
      return 'fresh data'
    },
  )
  const fresh = new BaseRoute({
    getParentRoute: () => root,
    path: '/fresh',
    loader: freshLoader,
    staleTime: Infinity,
    preloadStaleTime: Infinity,
    preloadGcTime: Infinity,
  })
  const expired = new BaseRoute({
    getParentRoute: () => root,
    path: '/expired',
    loader: ({ abortController }) => {
      expiredSignal = abortController.signal
      return 'expired data'
    },
    preloadGcTime: 0,
  })
  const router = createTestRouter({
    routeTree: root.addChildren([home, other, fresh, expired]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  await router.preloadRoute({ to: '/fresh' })
  await router.preloadRoute({ to: '/expired' })
  expect(freshSignal?.aborted).toBe(false)
  expect(expiredSignal?.aborted).toBe(false)

  await router.navigate({ to: '/other' })

  expect(freshSignal?.aborted).toBe(false)
  expect(expiredSignal?.aborted).toBe(true)
  await router.navigate({ to: '/fresh' })
  expect(freshLoader).toHaveBeenCalledOnce()
  expect(router.state.matches.at(-1)?.loaderData).toBe('fresh data')
})
