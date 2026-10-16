import { describe, expect, it, vi } from 'vitest'
import { waitForHydrationPrefetchStrategy } from '../src/hydration/runtime'
import type { HydrationPrefetchStrategy } from '../src/hydration/types'

describe('waitForHydrationPrefetchStrategy', () => {
  it('cleans up a strategy that finishes during synchronous setup', async () => {
    const abortController = new AbortController()
    const cleanupHydrate = vi.fn()
    const cleanupStrategy = vi.fn()
    let hydrate = () => {}

    const strategy: HydrationPrefetchStrategy = {
      _s: ({ prefetch }) => {
        prefetch?.()
        return cleanupStrategy
      },
    }

    const result = waitForHydrationPrefetchStrategy(strategy, {
      element: null,
      signal: abortController.signal,
      onHydrate: (listener) => {
        hydrate = listener
        return cleanupHydrate
      },
    })

    await expect(result).resolves.toBe('prefetch')
    expect(cleanupHydrate).toHaveBeenCalledTimes(1)
    expect(cleanupStrategy).toHaveBeenCalledTimes(1)

    hydrate()
    abortController.abort()
    expect(cleanupHydrate).toHaveBeenCalledTimes(1)
    expect(cleanupStrategy).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['abort', 'abort'],
    ['hydrate', 'hydrate'],
  ] as const)(
    'settles an abort/hydrate race with %s first and cleans up once',
    async (winner, expectedReason) => {
      const abortController = new AbortController()
      const cleanupHydrate = vi.fn()
      const cleanupStrategy = vi.fn()
      let hydrate = () => {}
      let prefetch = () => {}

      const strategy: HydrationPrefetchStrategy = {
        _s: (context) => {
          prefetch = context.prefetch ?? (() => {})
          return cleanupStrategy
        },
      }

      const result = waitForHydrationPrefetchStrategy(strategy, {
        element: null,
        signal: abortController.signal,
        onHydrate: (listener) => {
          hydrate = listener
          return cleanupHydrate
        },
      })

      if (winner === 'abort') {
        abortController.abort()
        hydrate()
      } else {
        hydrate()
        abortController.abort()
      }
      prefetch()

      await expect(result).resolves.toBe(expectedReason)
      expect(cleanupHydrate).toHaveBeenCalledTimes(1)
      expect(cleanupStrategy).toHaveBeenCalledTimes(1)
    },
  )

  it('does not set up a strategy when the signal is already aborted', async () => {
    const abortController = new AbortController()
    abortController.abort()
    const setup = vi.fn()
    const onHydrate = vi.fn()

    const result = waitForHydrationPrefetchStrategy(
      { _s: setup },
      {
        element: null,
        signal: abortController.signal,
        onHydrate,
      },
    )

    await expect(result).resolves.toBe('abort')
    expect(setup).not.toHaveBeenCalled()
    expect(onHydrate).not.toHaveBeenCalled()
  })
})
