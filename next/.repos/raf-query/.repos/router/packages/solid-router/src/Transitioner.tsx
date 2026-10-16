import * as Solid from 'solid-js'
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'

function getResolvedLocation(router: ReturnType<typeof useRouter>) {
  const resolvedLocation = router.stores.resolvedLocation.get()
  if (
    resolvedLocation?.href === router.latestLocation.href &&
    resolvedLocation.state.__TSR_key === router.latestLocation.state.__TSR_key
  ) {
    return resolvedLocation
  }
  return
}

export function Transitioner() {
  const router = useRouter()

  if (isServer ?? router.isServer) {
    return null
  }

  let settleCurrent: ((rendered: boolean) => void) | undefined
  router.startTransition = (fn) => {
    settleCurrent?.(false)

    return new Promise((resolve, reject) => {
      const settle = (rendered: boolean) => {
        if (settleCurrent !== settle) {
          return
        }
        settleCurrent = undefined
        resolve(rendered)
      }
      const fail = (cause: unknown) => {
        if (settleCurrent !== settle) {
          return
        }
        settleCurrent = undefined
        reject(cause)
      }
      settleCurrent = settle

      void Solid.startTransition(() => {
        // A newer publication may supersede this deferred callback.
        if (settleCurrent === settle) {
          try {
            fn()
          } catch (cause) {
            fail(cause)
          }
        }
      }).then(() => settle(true), fail)
    })
  }

  Solid.onCleanup(() => {
    settleCurrent?.(false)
  })

  // Subscribe to location changes
  // and try to load the new location
  Solid.onMount(() => {
    Solid.onCleanup(router.history.subscribe(router.load))

    const nextLocation = router.buildLocation({
      to: router.latestLocation.pathname,
      search: true,
      params: true,
      hash: true,
      state: true,
      _includeValidateSearch: true,
    })

    // Check if the current URL matches the canonical form.
    // Compare publicHref (browser-facing URL) consistently with server
    // canonicalization.
    if (
      trimPathRight(router.latestLocation.publicHref) !==
      trimPathRight(nextLocation.publicHref)
    ) {
      router.commitLocation({
        ...nextLocation,
        replace: true,
        ignoreBlocker: true,
      })
      return
    }

    if (!getResolvedLocation(router) && !router._tx) {
      router.load().catch(console.error)
    }
  })

  return null
}

export function Rendered() {
  const router = useRouter()
  Solid.onMount(() => {
    const resolvedLocation = getResolvedLocation(router)
    if (resolvedLocation) {
      router.emit({
        type: 'onRendered',
        ...getLocationChangeInfo(resolvedLocation, resolvedLocation),
      })
    }
  })
  return null
}
