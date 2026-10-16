import * as Vue from 'vue'

export const useLayoutEffect =
  typeof window !== 'undefined' ? Vue.effect : Vue.effect

export const usePrevious = (fn: () => boolean) => {
  return Vue.computed(
    (
      prev: { current: boolean | null; previous: boolean | null } = {
        current: null,
        previous: null,
      },
    ) => {
      const current = fn()

      if (prev.current !== current) {
        prev.previous = prev.current
        prev.current = current
      }

      return prev
    },
  )
}

/**
 * React hook to wrap `IntersectionObserver`.
 *
 * This hook will create an `IntersectionObserver` and observe the ref passed to it.
 *
 * When the intersection changes, the callback will be called with the `IntersectionObserverEntry`.
 *
 * @param ref - The ref to observe
 * @param callback - The callback to call when the intersection changes
 * @param disabled - Whether observation is disabled
 * @param cleanupWhenDisabled - Whether cleanup is needed without an observer (defaults to true)
 * @example
 * ```tsx
 * const MyComponent = () => {
 * const ref = React.useRef<HTMLDivElement>(null)
 * useIntersectionObserver(
 *  ref,
 *  (entry) => { doSomething(entry) },
 *  () => false
 * )
 * return <div ref={ref} />
 * ```
 */
export function useIntersectionObserver<T extends Element>(
  ref: Vue.Ref<T | null>,
  callback: (entry?: IntersectionObserverEntry) => void,
  disabled: () => boolean,
  cleanupWhenDisabled?: () => boolean,
): void {
  const isIntersectionObserverAvailable =
    typeof IntersectionObserver === 'function'

  // Use watchEffect with cleanup to properly manage the observer lifecycle
  Vue.watchEffect((onCleanup) => {
    const r = ref.value
    if (disabled() || !r || !isIntersectionObserverAvailable) {
      if (cleanupWhenDisabled?.() ?? true) {
        onCleanup(() => callback())
      }
      return
    }

    let active = true
    const observer = new IntersectionObserver(
      (entries) => {
        // Queued notifications can arrive after this effect has cleaned up.
        if (active) {
          callback(entries.pop())
        }
      },
      { rootMargin: '100px' },
    )

    observer.observe(r)

    onCleanup(() => {
      active = false
      observer.disconnect()
      callback()
    })
  })
}

export function splitProps<T extends Record<string, any>>(
  props: T,
  keys: Array<keyof T>,
) {
  // Get the specified props
  const selectedProps = Vue.computed(() => {
    return Object.fromEntries(keys.map((key) => [key, props[key]]))
  })

  // Get remaining props as attrs
  const remainingAttrs = Vue.computed(() => {
    const attrs = Vue.useAttrs()
    return Object.fromEntries(
      Object.entries(attrs).filter(([key]) => !keys.includes(key as keyof T)),
    )
  })

  return [selectedProps, remainingAttrs]
}

export type ParentProps<T = {}> = T & {
  children?: Vue.VNode | Array<Vue.VNode> | string
}
