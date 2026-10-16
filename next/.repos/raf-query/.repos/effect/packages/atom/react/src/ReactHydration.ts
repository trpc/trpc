/**
 * React helpers for applying dehydrated Effect Atom state to a React subtree.
 * The `HydrationBoundary` component reads the nearest `RegistryContext`,
 * hydrates new Atom values before children render, and delays updates for
 * existing Atom values until after commit so React transitions do not update
 * the current UI too early.
 *
 * @since 4.0.0
 */
"use client"
import * as Hydration from "effect/reactivity/Hydration"
import * as React from "react"
import { RegistryContext } from "./RegistryContext.ts"

/**
 * Props for a boundary that applies dehydrated Atom values to the nearest
 * {@link RegistryContext} while rendering its children.
 *
 * @category components
 * @since 4.0.0
 */
export interface HydrationBoundaryProps {
  state?: Iterable<Hydration.DehydratedAtom>
  children?: React.ReactNode
}

/**
 * Provides a React hydration boundary that loads dehydrated Atom values into
 * the current Atom registry.
 *
 * **When to use**
 *
 * Use to apply dehydrated Atom state to a React subtree that reads from the
 * nearest `RegistryContext`.
 *
 * **Details**
 *
 * New Atom values are hydrated during render so descendants can read them
 * immediately, while values for existing Atoms are deferred until after commit
 * so transition data does not update the current UI before React accepts it.
 *
 * @see {@link Hydration.dehydrate} for producing dehydrated Atom state
 * @see {@link Hydration.hydrate} for lower-level non-React hydration
 *
 * @category components
 * @since 4.0.0
 */
export const HydrationBoundary: React.FC<HydrationBoundaryProps> = ({
  children,
  state
}) => {
  const registry = React.useContext(RegistryContext)

  // This useMemo is for performance reasons only, everything inside it must
  // be safe to run in every render and code here should be read as "in render".
  //
  // This code needs to happen during the render phase, because after initial
  // SSR, hydration needs to happen _before_ children render. Also, if hydrating
  // during a transition, we want to hydrate as much as is safe in render so
  // we can prerender as much as possible.
  //
  // For any Atom values that already exist in the registry, we want to hold back on
  // hydrating until _after_ the render phase. The reason for this is that during
  // transitions, we don't want the existing Atom values and subscribers to update to
  // the new data on the current page, only _after_ the transition is committed.
  // If the transition is aborted, we will have hydrated any _new_ Atom values, but
  // we throw away the fresh data for any existing ones to avoid unexpectedly
  // updating the UI.
  const hydrationQueue: Array<Hydration.DehydratedAtomValue> | undefined = React.useMemo(() => {
    if (state) {
      const dehydratedAtoms = Array.from(state) as Array<Hydration.DehydratedAtomValue>
      const nodes = registry.getNodes()

      const newDehydratedAtoms: Array<Hydration.DehydratedAtomValue> = []
      const existingDehydratedAtoms: Array<Hydration.DehydratedAtomValue> = []

      for (const dehydratedAtom of dehydratedAtoms) {
        const existingNode = nodes.get(dehydratedAtom.key)

        if (!existingNode) {
          // This is a new Atom value, safe to hydrate immediately
          newDehydratedAtoms.push(dehydratedAtom)
        } else {
          // This Atom value already exists, queue it for later hydration
          existingDehydratedAtoms.push(dehydratedAtom)
        }
      }

      if (newDehydratedAtoms.length > 0) {
        // It's actually fine to call this with state that already exists
        // in the registry, or is older. hydrate() is idempotent.
        Hydration.hydrate(registry, newDehydratedAtoms)
      }

      if (existingDehydratedAtoms.length > 0) {
        return existingDehydratedAtoms
      }
    }
    return undefined
  }, [registry, state])

  React.useEffect(() => {
    if (hydrationQueue) {
      Hydration.hydrate(registry, hydrationQueue)
    }
  }, [registry, hydrationQueue])

  return React.createElement(React.Fragment, {}, children)
}
