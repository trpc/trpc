import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { visible } from '../src/hydration/visible'
import type { HydrationPrefetchStrategy } from '../src/hydration/types'

class IntersectionObserverMock implements IntersectionObserver {
  readonly root: Document | Element | null
  readonly rootMargin: string
  readonly scrollMargin: string
  readonly thresholds: ReadonlyArray<number>
  readonly observe = vi.fn((_target: Element) => {})
  readonly unobserve = vi.fn((_target: Element) => {})
  readonly disconnect = vi.fn(() => {})

  constructor(
    readonly callback: IntersectionObserverCallback,
    options: IntersectionObserverInit = {},
  ) {
    this.root = options.root ?? null
    this.rootMargin = options.rootMargin ?? '0px'
    this.scrollMargin = options.scrollMargin ?? '0px'
    this.thresholds = Array.isArray(options.threshold)
      ? options.threshold
      : [options.threshold ?? 0]
  }

  takeRecords(): Array<IntersectionObserverEntry> {
    return []
  }

  emit(target: Element, isIntersecting = true) {
    this.callback(
      [{ target, isIntersecting } as IntersectionObserverEntry],
      this,
    )
  }
}

describe('visible hydration strategy', () => {
  let observers: Array<IntersectionObserverMock>
  const cleanups: Array<() => void> = []

  beforeEach(() => {
    observers = []
    vi.stubGlobal(
      'IntersectionObserver',
      class extends IntersectionObserverMock {
        constructor(
          callback: IntersectionObserverCallback,
          options?: IntersectionObserverInit,
        ) {
          super(callback, options)
          observers.push(this)
        }
      },
    )
  })

  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup())
    vi.unstubAllGlobals()
  })

  function observe(
    strategy: HydrationPrefetchStrategy,
    element: Element,
    callback: () => void,
  ) {
    const cleanup = strategy._s?.({ element, prefetch: callback })
    if (cleanup) {
      cleanups.push(cleanup)
    }
    return cleanup
  }

  it('shares an observer and tracks multiple callbacks for one element', () => {
    const element = document.createElement('div')
    const first = vi.fn()
    const second = vi.fn()
    const strategy = visible({ rootMargin: '25px', threshold: [0, 0.5] })

    const cleanupFirst = observe(strategy, element, first)
    observe(strategy, element, second)

    expect(observers).toHaveLength(1)
    expect(observers[0]!.observe).toHaveBeenCalledOnce()
    expect(observers[0]!.observe).toHaveBeenCalledWith(element)

    cleanupFirst?.()
    observers[0]!.emit(element)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
    expect(observers[0]!.unobserve).toHaveBeenCalledOnce()
    expect(observers[0]!.unobserve).toHaveBeenCalledWith(element)
    expect(observers[0]!.disconnect).toHaveBeenCalledOnce()
  })

  it('keeps a shared observer until every element is cleaned up', () => {
    const firstElement = document.createElement('div')
    const secondElement = document.createElement('div')
    const options = { rootMargin: '50px', threshold: 0.25 }

    const cleanupFirst = observe(visible(options), firstElement, vi.fn())
    const cleanupSecond = observe(visible(options), secondElement, vi.fn())

    expect(observers).toHaveLength(1)
    expect(observers[0]!.observe).toHaveBeenCalledTimes(2)

    cleanupFirst?.()
    expect(observers[0]!.unobserve).toHaveBeenCalledWith(firstElement)
    expect(observers[0]!.disconnect).not.toHaveBeenCalled()

    cleanupSecond?.()
    expect(observers[0]!.unobserve).toHaveBeenCalledWith(secondElement)
    expect(observers[0]!.disconnect).toHaveBeenCalledOnce()

    const cleanupThird = observe(
      visible(options),
      document.createElement('div'),
      vi.fn(),
    )
    expect(observers).toHaveLength(2)

    cleanupThird?.()
    expect(observers[1]!.disconnect).toHaveBeenCalledOnce()
  })
})
