import { RouterProvider } from '@tanstack/react-router'
import { isServer } from '@tanstack/router-core/isServer'
import { createRoot } from 'react-dom/client'
import { assertStateUpdates, createLinkRouter } from './workload'
import type { LinkRouter } from './workload'
import type { RouterHistory } from '@tanstack/history'
import type { LinkCaseId } from '../cases'

export const serverEnvironment: boolean | undefined = isServer

export function mountTestApp(
  container: HTMLElement,
  history: RouterHistory,
  caseId: LinkCaseId,
): {
  router: LinkRouter
  unmount: () => void
  assertStateUpdates: () => void
} {
  const router = createLinkRouter(caseId, history, false)
  const root = createRoot(container)
  root.render(<RouterProvider router={router} />)

  return {
    router,
    unmount: () => root.unmount(),
    assertStateUpdates: () => assertStateUpdates(router),
  }
}
