'use client'

import * as React from 'react'
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core'
import { useLayoutEffect } from './utils'
import { useRouter } from './useRouter'
import type { AnyRouter } from '@tanstack/router-core'

export function settleOwner(
  owner: NonNullable<AnyRouter['_rendered']>,
  rendered: boolean,
) {
  const settle = owner[1 /* settle */]
  owner.length = 0
  settle?.(rendered)
}

export function Transitioner({
  t,
}: {
  t: React.Dispatch<React.SetStateAction<AnyRouter | undefined>>
}) {
  const router = useRouter()
  const acknowledgement = (router._rendered ??= [])
  const mounted =
    process.env.NODE_ENV !== 'production'
      ? // eslint-disable-next-line react-hooks/rules-of-hooks
        React.useRef(false)
      : undefined

  router.startTransition = (fn, expected) =>
    new Promise((resolve) => {
      settleOwner(acknowledgement, false)
      acknowledgement.push(expected, resolve)
      t(router)
      React.startTransition(fn)
    })

  // Subscribe before canonicalizing so the initial URL has exactly one load.
  useLayoutEffect(() => {
    const unsub = router.history.subscribe(router.load)

    if (mounted?.current) {
      return unsub
    }
    if (mounted) {
      mounted.current = true
    }

    router.updateLatestLocation()
    const location = router.latestLocation
    const nextLocation = router.buildLocation({
      to: location.pathname,
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
      trimPathRight(location.publicHref) !==
      trimPathRight(nextLocation.publicHref)
    ) {
      router.commitLocation({
        ...nextLocation,
        replace: true,
        ignoreBlocker: true,
      })
      return unsub
    }

    const resolvedLocation = router.stores.resolvedLocation.get()
    if (
      resolvedLocation?.href === location.href &&
      resolvedLocation.state.__TSR_key === location.state.__TSR_key
    ) {
      acknowledgement.push(router.stores.matches.get(), (rendered) => {
        if (rendered) {
          router.emit({
            type: 'onRendered',
            ...getLocationChangeInfo(resolvedLocation, resolvedLocation),
          })
        }
      })
    } else if (!router._tx) {
      router.load({ sync: true }).catch(console.error)
    }

    return unsub
    // `mounted` exists only in development and is a stable ref when present.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, router.history])

  return null
}
