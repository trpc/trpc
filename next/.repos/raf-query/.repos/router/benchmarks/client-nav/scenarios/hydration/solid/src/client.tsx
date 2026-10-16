import { sharedConfig } from 'solid-js'
import { hydrate as hydrateDOM, isServer as solidIsServer } from 'solid-js/web'
import { RouterProvider } from '@tanstack/solid-router'
import { hydrate } from '@tanstack/router-core/ssr/client'
import { isServer } from '@tanstack/router-core/isServer'
import { createDiagnostics, hashLinkCount } from '../fixture'
import { createFixtureRouter } from './app'

export const serverEnvironment = isServer
export const solidServerEnvironment = solidIsServer
let router: ReturnType<typeof createFixtureRouter> | undefined
let disposeRoot: (() => void) | undefined
let unsubscribe: (() => void) | undefined
let diagnostics = createDiagnostics()

type HydrationWindow = Window & {
  _$HY?: { done?: boolean; events?: Array<unknown>; r: object }
}

export async function start(countUpdates = false) {
  if (router) {
    throw new Error('A hydration sample must use a fresh client realm')
  }
  if (!window.$_TSR?.router) {
    throw new Error('Missing SSR hydration payload')
  }
  const bootstrap = (window as HydrationWindow)._$HY
  if (!bootstrap || bootstrap.done || sharedConfig.context) {
    throw new Error('Missing or already consumed Solid hydration bootstrap')
  }
  diagnostics = createDiagnostics(countUpdates)
  router = createFixtureRouter(false, diagnostics)
  unsubscribe = router.subscribe('onRendered', () => {
    diagnostics.rendered++
  })
  // Solid's RouterClient uses this core restoration API. Await it directly so
  // the shell has the same component/key hierarchy as the server provider.
  await hydrate(router)
  window.$_TSR.h()
  disposeRoot = hydrateDOM(() => <RouterProvider router={router!} />, document)
}

export function ready() {
  if (
    !diagnostics.mounted ||
    !diagnostics.rendered ||
    sharedConfig.context ||
    router?.stores.status.get() === 'pending'
  ) {
    return false
  }
  // Each Link's onMount updates its hydration signal. Solid updates attributes
  // through fine-grained effects, without rerendering the route components.
  for (let index = 0; index < hashLinkCount; index++) {
    const anchor = document.getElementById(`hash-${index}`)
    if (
      !anchor ||
      anchor.getAttribute('data-status') !== (index % 2 === 0 ? 'active' : null)
    ) {
      return false
    }
  }
  return true
}

export function snapshot() {
  return {
    diagnostics: {
      ...diagnostics,
      initialHashStates: [...diagnostics.initialHashStates],
      hashStates: [...diagnostics.hashStates],
    },
    hydrating: !!sharedConfig.context,
    location: router?.stores.location.get().href,
    resolvedLocation: router?.stores.resolvedLocation.get()?.href,
    matches: router?.stores.matches.get().map((match) => ({
      status: match.status,
      context: match.context,
      loaderData: match.loaderData,
    })),
  }
}

export function dispose() {
  try {
    disposeRoot?.()
  } finally {
    unsubscribe?.()
    router?.history.destroy()
  }
}
