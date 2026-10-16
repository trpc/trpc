import { bench, describe, expect } from 'vitest'
import { commitMatches } from '../src/load-client'
import type { AnyRouteMatch, AnyRouter } from '../src'
import type { LoaderFlight, LoadTransaction } from '../src/load-client'

type Match = AnyRouteMatch & { _flight?: LoaderFlight }

const workloads = [0, 4, 10, 100, 1000, 5000].flatMap((size) => [
  [size, 4],
  [size, 16],
])

// Run each family separately with -t to keep GC from other workloads out of
// short operations. This measures commit/cache maintenance, not navigation.
for (const family of ['snapshots', 'mixed flights', 'preload flights']) {
  describe.each(workloads)(
    `${family}: %i cached matches, %i active matches`,
    (size, activeCount) => {
      for (const retainedFraction of [1, 0.5, 0]) {
        const retainedCount = Math.floor(size * retainedFraction)
        let aborts = 0
        const entries = Array.from({ length: size }, (_, index) => {
          const retained =
            retainedFraction === 1 ||
            (retainedFraction === 0.5 && index % 2 === 1)
          const hasFlight =
            family === 'preload flights' ||
            (family === 'mixed flights' && index % 10 === 0)
          // Keep loader scheduling and AbortController allocation outside this
          // ownership benchmark. Real abort events are covered in the unit tests.
          const flight: LoaderFlight | undefined = hasFlight
            ? [
                Promise.resolve([0, undefined]),
                {
                  abort: () => {
                    aborts++
                  },
                } as AbortController,
                1,
              ]
            : undefined
          const match = {
            id: String(index),
            routeId: retained ? 'retained' : 'expired',
            status: 'success',
            updatedAt: 0,
            _flight: flight,
          } as Match
          return { match, flight, retained }
        })
        const cached = new Map(entries.map(({ match }) => [match.id, match]))
        const departing = entries.filter(
          (entry) => !entry.retained && entry.flight,
        )
        const matches = Array.from({ length: activeCount }, (_, index) => ({
          id: `active-${index}`,
          routeId: 'retained',
          status: 'success',
        })) as Array<Match>
        const tx = [
          new AbortController(),
          0,
          undefined,
          [],
          0,
          Promise.resolve(),
        ] as unknown as LoadTransaction
        const router = {
          _tx: tx,
          _committed: matches,
          _cache: cached,
          options: {},
          routesById: {
            retained: { options: { loader: () => {}, gcTime: Infinity } },
            expired: { options: { loader: () => {}, gcTime: 0 } },
          },
          stores: { setMatches: () => {} },
        } as unknown as AnyRouter
        const run = () => {
          router._cache = cached
          for (const entry of departing) {
            entry.match._flight = entry.flight
            entry.flight![2] = 1
          }
          commitMatches(router, tx, matches)
        }
        run()
        expect(router._cache.size).toBe(retainedCount)
        expect(aborts).toBe(departing.length)
        for (const entry of entries) {
          if (entry.retained) {
            expect(router._cache.get(entry.match.id)).toBe(entry.match)
            expect(entry.match._flight).toBe(entry.flight)
            if (entry.flight) {
              expect(entry.flight[2]).toBe(1)
            }
          } else {
            expect(entry.match._flight).toBeUndefined()
          }
        }
        const batch = size <= 100 ? 100 : 1
        bench(
          `${retainedFraction * 100}% retained (${batch} commits)`,
          () => {
            for (let index = 0; index < batch; index++) {
              run()
            }
          },
          { time: 500, warmupTime: 100 },
        )
      }
    },
  )
}
