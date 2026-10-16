'use client'

import * as React from 'react'
import { _isRouteDeparting } from '@tanstack/router-core'
import type { AnyRoute, AnyRouter, ParsedLocation } from '@tanstack/router-core'

declare module '@tanstack/router-core' {
  // Declaration merging requires the original type parameters.
  // eslint-disable-next-line unused-imports/no-unused-vars
  interface RouterStores<in out TRouteTree extends AnyRoute> {
    /**
     * The link scope of each route id that rendered links, keyed `undefined`
     * for links outside every match (route ids start with `/` or are the
     * root id). A scope without links holds no location.
     */
    _linkScopes?: Record<string, LinkScope>
  }
}

/**
 * The location source shared by the links of one route. It holds one location
 * subscription for all of them while any is subscribed, and skips a
 * publication whose navigation removes the route: those links keep the
 * location their route still presents until it unmounts or a newer
 * publication keeps it. Without subscribers it holds nothing and reads the
 * live location.
 */
export type LinkScope = [
  getSource: () => ParsedLocation,
  subscribe: (listener: () => void) => () => void,
]

export function createLinkScope(
  router: AnyRouter,
  routeId?: string,
): LinkScope {
  // Stores are created once per router.
  const store = router.stores.location
  const listeners = new Set<() => void>()
  let source: ParsedLocation | undefined
  let unsubscribe: () => void
  // Defined outside `subscribe` so the store's subscription does not share a
  // closure with, and retain, the first listener after it unsubscribes.
  const update = (location: ParsedLocation) => {
    if (!_isRouteDeparting(router, routeId, location)) {
      source = location
      listeners.forEach((listener) => listener())
    }
  }
  return [
    () => source ?? store.get(),
    (listener) => {
      if (!listeners.size) {
        source = store.get()
        unsubscribe = store.subscribe(update).unsubscribe
      }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (!listeners.size) {
          unsubscribe()
          source = undefined
        }
      }
    },
  ]
}

export const matchContext = React.createContext<string | undefined>(undefined)

// N.B. this only exists so we can conditionally call useContext on it when we are not interested in the nearest match
export const dummyMatchContext = React.createContext<string | undefined>(
  undefined,
)
