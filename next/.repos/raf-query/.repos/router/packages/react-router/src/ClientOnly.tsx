'use client'

import React from 'react'

const getSnapshot = () => true
const getServerSnapshot = () => false

export interface ClientOnlyProps {
  /**
   * The children to render when the JS is loaded.
   */
  children: React.ReactNode
  /**
   * The fallback component to render if the JS is not yet loaded.
   */
  fallback?: React.ReactNode
}

/**
 * Render the children only after the JS has loaded client-side. Use an optional
 * fallback component if the JS is not yet loaded.
 *
 * @example
 * Render a Chart component if JS loads, renders a simple FakeChart
 * component server-side or if there is no JS. The FakeChart can have only the
 * UI without the behavior or be a loading spinner or skeleton.
 *
 * ```tsx
 * return (
 *   <ClientOnly fallback={<FakeChart />}>
 *     <Chart />
 *   </ClientOnly>
 * )
 * ```
 */
export function ClientOnly({ children, fallback = null }: ClientOnlyProps) {
  return <React.Fragment>{useHydrated() ? children : fallback}</React.Fragment>
}

/**
 * Return a boolean indicating if the JS has been hydrated already.
 * When doing Server-Side Rendering, the result will always be false.
 * When doing Client-Side Rendering, the result will always be false on the
 * first render and true from then on. Even if a new component renders it will
 * always start with true.
 *
 * @example
 * ```tsx
 * // Disable a button that needs JS to work.
 * let hydrated = useHydrated()
 * return (
 *   <button type="button" disabled={!hydrated} onClick={doSomethingCustom}>
 *     Click me
 *   </button>
 * )
 * ```
 * @returns True if the JS has been hydrated already, false otherwise.
 */
export function useHydrated(): boolean
/**
 * @internal
 * callers whose output does not depend on hydration can keep the
 * same snapshot on both sides, avoiding an unnecessary post-hydration render.
 */
export function useHydrated(enabled: boolean): boolean
/** @internal */
export function useHydrated(enabled = true): boolean {
  return React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    enabled ? getServerSnapshot : getSnapshot,
  )
}

function subscribe() {
  return () => {
    // noop
  }
}
