import type { HydrationPrefetchStrategy } from './types'

const visibleType = 'visible'

export type VisibleHydrationOptions = {
  rootMargin?: string
  threshold?: number | Array<number>
}

type VisibleObserverEntry = [
  observer: IntersectionObserver,
  elements: Map<Element, Set<() => void>>,
]

const observerRegistry = /* @__PURE__ */ new Map<string, VisibleObserverEntry>()

function cleanupVisibleObserverEntry(
  key: string,
  observer: IntersectionObserver,
  elements: Map<Element, Set<() => void>>,
) {
  if (elements.size > 0) {
    return
  }
  observer.disconnect()
  observerRegistry.delete(key)
}

/* @__NO_SIDE_EFFECTS__ */
export function visible(
  options: VisibleHydrationOptions = {},
): HydrationPrefetchStrategy<typeof visibleType> {
  const rootMargin = options.rootMargin ?? '600px'
  const threshold = options.threshold ?? 0

  return {
    _t: visibleType,
    _s: ({ element, gate, prefetch }) => {
      const callback = prefetch ?? gate!.resolve

      if (!element) {
        callback()
        return
      }

      const key = `${rootMargin}|${
        Array.isArray(threshold) ? threshold.join(',') : String(threshold)
      }`
      let observerEntry = observerRegistry.get(key)

      if (!observerEntry) {
        const elements = new Map<Element, Set<() => void>>()
        const observer = new IntersectionObserver(
          (entries) => {
            for (const intersectingEntry of entries) {
              if (!intersectingEntry.isIntersecting) {
                continue
              }

              const callbacks = elements.get(intersectingEntry.target)
              if (!callbacks) {
                continue
              }

              callbacks.forEach((callback) => callback())
              elements.delete(intersectingEntry.target)
              observer.unobserve(intersectingEntry.target)
              cleanupVisibleObserverEntry(key, observer, elements)
            }
          },
          { rootMargin, threshold },
        )
        observerEntry = [observer, elements]
        observerRegistry.set(key, observerEntry)
      }

      const [observer, elements] = observerEntry
      let callbacks = elements.get(element)
      if (!callbacks) {
        callbacks = new Set()
        elements.set(element, callbacks)
        observer.observe(element)
      }
      callbacks.add(callback)

      return () => {
        const currentCallbacks = elements.get(element)
        currentCallbacks?.delete(callback)
        if (currentCallbacks?.size === 0) {
          elements.delete(element)
          observer.unobserve(element)
        }
        cleanupVisibleObserverEntry(key, observer, elements)
      }
    },
  }
}
