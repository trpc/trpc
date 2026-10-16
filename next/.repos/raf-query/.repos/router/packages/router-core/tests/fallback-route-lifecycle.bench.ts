import { bench, describe, expect } from 'vitest'
import { lifecycleEnd, runRouteLifecycle } from '../src/router'
import type { AnyRouteMatch, AnyRouter, AnyRoute } from '../src'
import type { LoadTransaction } from '../src/load-client'

function baselineEnd(matches: Array<AnyRouteMatch>) {
  const boundary = matches.findIndex(
    (match) =>
      match.status === 'error' ||
      match.status === 'notFound' ||
      match._notFound,
  )
  return boundary < 0 ? matches.length : boundary + 1
}

function hasLifecycleMatch(
  matches: Array<AnyRouteMatch>,
  end: number,
  routeId: string,
) {
  for (let index = 0; index < end; index++) {
    if (matches[index]!.routeId === routeId) {
      return true
    }
  }
  return false
}

/** Run route lifecycle callbacks in leave/enter/stay phases. */
function baselineLifecycle(
  router: AnyRouter,
  previous: Array<AnyRouteMatch>,
  matches: Array<AnyRouteMatch>,
  previousEnd: number,
  nextEnd: number,
  owner?: LoadTransaction,
): void {
  for (let index = 0; index < previousEnd; index++) {
    if (owner && router._tx !== owner) {
      return
    }
    const match = previous[index]!
    if (!hasLifecycleMatch(matches, nextEnd, match.routeId)) {
      ;(router.routesById as Record<string, AnyRoute>)[
        match.routeId
      ]!.options.onLeave?.(match)
    }
  }
  for (let index = 0; index < nextEnd; index++) {
    if (owner && router._tx !== owner) {
      return
    }
    const match = matches[index]!
    ;(router.routesById as Record<string, AnyRoute>)[match.routeId]!.options[
      hasLifecycleMatch(previous, previousEnd, match.routeId)
        ? 'onStay'
        : 'onEnter'
    ]?.(match)
  }
}
// Freeze the published allocation-free dispatcher as the comparison baseline.
// Include membership preparation and compare client/server at every depth.
// Batch small route trees to amortize the timing overhead.
for (const depth of [1, 2, 3, 4, 5, 6]) {
  for (const mode of ['client', 'server'] as const) {
    for (const scenario of [
      'stay',
      'replace',
      'sibling',
      'ascend',
      'descend',
      'hide',
      'reveal',
      'hidden',
      'first-load',
      'no-hooks',
      'sparse-hooks',
      'root-error',
      'leaf-notFound',
    ] as const) {
      if (depth === 1 && ['sibling', 'ascend', 'descend'].includes(scenario)) {
        continue
      }
      if (
        process.env.LIFECYCLE_BENCH_CASE &&
        !`${scenario}, depth ${depth}, ${mode}`.includes(
          process.env.LIFECYCLE_BENCH_CASE,
        )
      ) {
        continue
      }
      describe(`${scenario}, depth ${depth}, ${mode}`, () => {
        let calls: Array<string> | undefined
        let count = 0
        const callback = (name: string) => () => {
          count++
          calls?.push(name)
        }
        const makeMatches = (prefix: string, hidden: boolean) =>
          Array.from({ length: depth }, (_, index) => ({
            routeId: index < 1 ? `shared${index}` : `${prefix}${index}`,
            status: 'success',
            _notFound: hidden && index === Math.min(1, depth - 1),
          })) as Array<AnyRouteMatch>
        const previous =
          scenario === 'first-load'
            ? []
            : makeMatches('a', scenario === 'reveal' || scenario === 'hidden')
        const matches = makeMatches(
          scenario === 'replace' ? 'b' : 'a',
          scenario === 'hide' || scenario === 'hidden',
        )
        if (scenario === 'sibling') {
          matches[depth - 1]!.routeId = `b${depth - 1}`
        }
        if (scenario === 'ascend') {
          matches.pop()
        }
        if (scenario === 'descend') {
          previous.pop()
        }
        if (scenario === 'root-error') {
          matches[0]!.status = 'error'
        }
        if (scenario === 'leaf-notFound') {
          matches[depth - 1]!.status = 'notFound'
        }
        const owner =
          mode === 'server' ? undefined : ([] as unknown as LoadTransaction)
        const router = {
          _tx: owner,
          routesById: Object.fromEntries(
            [...previous, ...matches].map((match) => [
              match.routeId,
              {
                options:
                  scenario === 'no-hooks' ||
                  (scenario === 'sparse-hooks' && match.routeId !== 'shared0')
                    ? {}
                    : {
                        onEnter: callback(`enter:${match.routeId}`),
                        onStay: callback(`stay:${match.routeId}`),
                        onLeave: callback(`leave:${match.routeId}`),
                      },
              },
            ]),
          ),
        } as unknown as AnyRouter
        const previousEnd = lifecycleEnd(previous)
        const baselinePreviousEnd = baselineEnd(previous)
        const candidateLifecycle = (
          router: AnyRouter,
          previous: Array<AnyRouteMatch>,
          matches: Array<AnyRouteMatch>,
          owner?: LoadTransaction,
        ) => {
          const nextEnd = (router._lifecycleEnd = lifecycleEnd(matches))
          runRouteLifecycle(
            router,
            previous,
            matches,
            previousEnd,
            nextEnd,
            owner,
          )
        }
        const originalLifecycle = (
          router: AnyRouter,
          previous: Array<AnyRouteMatch>,
          matches: Array<AnyRouteMatch>,
          owner?: LoadTransaction,
        ) => {
          const nextEnd = (router._lifecycleEnd = baselineEnd(matches))
          baselineLifecycle(
            router,
            previous,
            matches,
            baselinePreviousEnd,
            nextEnd,
            owner,
          )
        }
        calls = []
        originalLifecycle(router, previous, matches, owner)
        const expected = calls
        calls = []
        candidateLifecycle(router, previous, matches, owner)
        expect(calls).toEqual(expected)
        calls = undefined
        for (const [name, run] of [
          ['original', originalLifecycle],
          ['candidate', candidateLifecycle],
        ] as const) {
          bench(
            name,
            () => {
              for (let i = 0; i < 100; i++) {
                router._lifecycleEnd = previousEnd
                run(router, previous, matches, owner)
              }
            },
            { time: 300 },
          )
        }
      })
    }
  }
}
