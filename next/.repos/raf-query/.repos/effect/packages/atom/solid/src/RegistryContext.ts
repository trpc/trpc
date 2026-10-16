/**
 * Solid context and provider for the Atom registry used by Effect Atom hooks.
 * The registry stores atom values, schedules update work, and cleans up unused
 * atoms. Sharing one registry through Solid context lets components and
 * computations in the same owner tree read and write the same atom state.
 *
 * @since 4.0.0
 */
import type * as Atom from "effect/reactivity/Atom"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import type { JSX } from "solid-js"
import { createComponent, createContext, onCleanup } from "solid-js"

/**
 * Provides a Solid context that carries the `AtomRegistry` used by atom hooks in the
 * current owner tree.
 *
 * **When to use**
 *
 * Use when you need to integrate lower-level Solid context APIs, such as custom
 * providers or hooks, instead of using the default atom hook setup.
 *
 * **Details**
 *
 * When no provider is present, the context uses a standalone default registry.
 *
 * @see {@link RegistryProvider} for creating and providing a registry for a Solid subtree
 *
 * @category context
 * @since 4.0.0
 */
export const RegistryContext = createContext<AtomRegistry.AtomRegistry>(AtomRegistry.make())

/**
 * Creates an `AtomRegistry` for a Solid subtree, optionally seeding initial atom
 * values and scheduler settings, and disposes the registry when the owner is
 * cleaned up.
 *
 * **When to use**
 *
 * Use to scope atom state, scheduling, and cleanup to a Solid subtree.
 *
 * **Details**
 *
 * The provider creates an `AtomRegistry` with `AtomRegistry.make`, forwards
 * `initialValues`, `scheduleTask`, `timeoutResolution`, and
 * `defaultIdleTTL`, and supplies the registry through `RegistryContext`.
 *
 * **Gotchas**
 *
 * Provider options are consumed when the registry is created; they are not
 * reactive updates. A custom `scheduleTask` should return a cancellation
 * function that is safe to call during Solid cleanup.
 *
 * @see {@link RegistryContext} for the context supplied by this provider
 *
 * @category context
 * @since 4.0.0
 */
export const RegistryProvider = (options: {
  readonly children?: JSX.Element | undefined
  readonly initialValues?: Iterable<readonly [Atom.Atom<any>, any]> | undefined
  readonly scheduleTask?: ((f: () => void) => () => void) | undefined
  readonly timeoutResolution?: number | undefined
  readonly defaultIdleTTL?: number | undefined
}) => {
  const registry = AtomRegistry.make({
    scheduleTask: options.scheduleTask,
    initialValues: options.initialValues,
    timeoutResolution: options.timeoutResolution,
    defaultIdleTTL: options.defaultIdleTTL
  })
  onCleanup(() => registry.dispose())
  return createComponent(RegistryContext.Provider, {
    value: registry,
    get children() {
      return options.children
    }
  })
}
