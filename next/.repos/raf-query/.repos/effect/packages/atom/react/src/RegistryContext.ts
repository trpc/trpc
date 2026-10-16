/**
 * React context and provider for the Atom registry used by Effect Atom hooks.
 * The registry stores atom values, schedules update work, and cleans up unused
 * atoms. Sharing one registry through React context lets components in the same
 * subtree read and write the same atom state.
 *
 * @since 4.0.0
 */
"use client"

import type * as Atom from "effect/reactivity/Atom"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as React from "react"
import * as Scheduler from "scheduler"

/**
 * Schedules Atom registry work with React's scheduler at low priority and
 * returns a cancellation function for the scheduled task.
 *
 * @stability unstable
 * @category context
 * @since 4.0.0
 */
export function scheduleTask(f: () => void): () => void {
  const node = Scheduler.unstable_scheduleCallback(Scheduler.unstable_LowPriority, f)
  return () => Scheduler.unstable_cancelCallback(node)
}

/**
 * Provides a React context that supplies the `AtomRegistry` used by Atom hooks and
 * hydration helpers, defaulting to a standalone registry when no provider is
 * present.
 *
 * **When to use**
 *
 * Use to supply an existing `AtomRegistry` through React context when hooks or
 * hydration helpers need to share registry state that is managed outside
 * `RegistryProvider`.
 *
 * @see {@link RegistryProvider} for creating and providing a registry for a React subtree
 *
 * @category context
 * @since 4.0.0
 */
export const RegistryContext = React.createContext<AtomRegistry.AtomRegistry>(AtomRegistry.make({
  scheduleTask,
  defaultIdleTTL: 400
}))

/**
 * Provides a stable `AtomRegistry` to a React subtree, optionally seeding
 * initial atom values and overriding registry scheduling or idle settings.
 *
 * **When to use**
 *
 * Use to scope atom state, scheduling, and idle cleanup to a React subtree.
 *
 * **Details**
 *
 * The provider creates one `AtomRegistry` with `AtomRegistry.make`, passes it
 * through `RegistryContext.Provider`, and forwards `initialValues`,
 * `scheduleTask`, `timeoutResolution`, and `defaultIdleTTL` only when that
 * registry is created.
 *
 * **Gotchas**
 *
 * Option changes after the first render do not rebuild the registry. When the
 * provider unmounts, registry disposal is delayed briefly and canceled if the
 * provider remounts before the timeout fires.
 *
 * @see {@link RegistryContext} for the React context supplied by this provider
 *
 * @category context
 * @since 4.0.0
 */
export const RegistryProvider = (options: {
  readonly children?: React.ReactNode | undefined
  readonly initialValues?: Iterable<readonly [Atom.Atom<any>, any]> | undefined
  readonly scheduleTask?: ((f: () => void) => () => void) | undefined
  readonly timeoutResolution?: number | undefined
  readonly defaultIdleTTL?: number | undefined
}) => {
  const ref = React.useRef<{
    readonly registry: AtomRegistry.AtomRegistry
    timeout?: number | undefined
  }>(null)
  if (ref.current === null) {
    ref.current = {
      registry: AtomRegistry.make({
        scheduleTask: options.scheduleTask ?? scheduleTask,
        initialValues: options.initialValues,
        timeoutResolution: options.timeoutResolution,
        defaultIdleTTL: options.defaultIdleTTL
      })
    }
  }
  React.useEffect(() => {
    if (ref.current?.timeout !== undefined) {
      clearTimeout(ref.current.timeout)
    }
    return () => {
      ref.current!.timeout = setTimeout(() => {
        ref.current?.registry.dispose()
        ref.current = null
      }, 500) as any
    }
  }, [ref])
  return React.createElement(RegistryContext.Provider, { value: ref.current.registry }, options?.children)
}
