import { startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { hydrate } from '@tanstack/react-router/ssr/client'
import { isServer } from '@tanstack/router-core/isServer'
import { createDiagnostics, hashLinkCount } from '../fixture'
import { createFixtureRouter } from './app'

export const serverEnvironment = isServer
let router: ReturnType<typeof createFixtureRouter> | undefined
let root: ReturnType<typeof hydrateRoot> | undefined
let diagnostics = createDiagnostics()
const errors: Array<string> = []

export async function start(countRenders = false) {
  if (router) {
    throw new Error('A hydration sample must use a fresh client realm')
  }
  if (!window.$_TSR?.router) {
    throw new Error('Missing SSR hydration payload')
  }
  diagnostics = createDiagnostics(countRenders)
  let resolveHydrated!: () => void
  let rejectHydrated!: (error: unknown) => void
  const hydrated = new Promise<void>((resolve, reject) => {
    resolveHydrated = resolve
    rejectHydrated = reject
  })
  router = createFixtureRouter(false, diagnostics, resolveHydrated)
  // This is the same restoration path used by Start, without a module-cached
  // RouterClient/StartClient promise or a live server in the worker.
  await hydrate(router)
  window.$_TSR.h()
  startTransition(() => {
    root = hydrateRoot(document, <RouterProvider router={router!} />, {
      onRecoverableError: (error) => {
        errors.push(String(error))
        rejectHydrated(error)
      },
      onUncaughtError: (error) => {
        errors.push(String(error))
        rejectHydrated(error)
      },
    })
  })
  await hydrated
}

export function ready() {
  if (!diagnostics.mounted) {
    return false
  }
  // Matching hash Links only become active in the follow-up hydration commit.
  // Ending at the first mount effect would miss the work this scenario targets.
  for (let index = 0; index < hashLinkCount; index += 2) {
    if (
      document.getElementById(`hash-${index}`)?.getAttribute('data-status') !==
      'active'
    ) {
      return false
    }
  }
  return true
}

export function snapshot() {
  const matches = router?.stores.matches.get()
  return {
    diagnostics: { ...diagnostics },
    errors: [...errors],
    location: router?.stores.location.get().href,
    matches: matches?.map((match) => ({
      status: match.status,
      context: match.context,
      loaderData: match.loaderData,
    })),
  }
}

export function dispose() {
  root?.unmount()
  router?.history.destroy()
}
