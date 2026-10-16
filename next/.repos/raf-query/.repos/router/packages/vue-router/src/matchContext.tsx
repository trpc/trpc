import * as Vue from 'vue'
import { _isRouteDeparting } from '@tanstack/router-core'
import type { InjectionKey, Ref } from 'vue'
import type { AnyRouter, ParsedLocation } from '@tanstack/router-core'

// Stable routeId context — a plain string (not reactive) that identifies
// which route this component belongs to. Provided by Match, consumed by
// MatchInner, Outlet, and useMatch for routeId-based store lookups.
export const routeIdContext = Symbol(
  'TanStackRouterRouteId',
) as InjectionKey<string>

// The location the links of the nearest match, or of the router outside every
// match, build from. Provided on the client only.
export const linkLocationContext = Symbol(
  'TanStackRouterLinkLocation',
) as InjectionKey<Readonly<Ref<ParsedLocation>>>

/**
 * Provides the location the links below build from. A location publication
 * whose navigation leaves `routeId` keeps the location the route still
 * presents, so its links do no work: the route unmounts when that navigation
 * commits, and any other outcome publishes a newer location. The store calls
 * this subscription synchronously inside the publication, the only time the
 * predicate is valid. Without a route the location is the live one. Links
 * hand it to the router, so it stays raw rather than a readonly proxy.
 */
export function provideLinkLocation(router: AnyRouter, routeId?: string) {
  const store = router.stores.location
  const linkLocation = Vue.shallowRef(store.get())
  Vue.onScopeDispose(
    store.subscribe((location) => {
      if (!_isRouteDeparting(router, routeId, location)) {
        linkLocation.value = location
      }
    }).unsubscribe,
  )
  Vue.provide(linkLocationContext, linkLocation)
}
