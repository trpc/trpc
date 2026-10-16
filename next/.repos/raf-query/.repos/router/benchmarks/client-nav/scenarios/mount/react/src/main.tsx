import { RouterProvider, createRouter } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { routeTree } from './routeTree.gen'
import type { RouterHistory } from '@tanstack/history'

/**
 * Unlike the other scenarios, this app is mounted and unmounted in a loop, so
 * it must not register page-lifetime globals that have no dispose path:
 * - the harness injects and destroys a fresh memory history per mount;
 * - `scrollRestoration` stays off — enabling it registers per-router
 *   document/window listeners that retain every router ever created.
 */
export function createTestRouter(history: RouterHistory) {
  return createRouter({
    routeTree,
    history,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createTestRouter>
  }
}

export function mountTestApp(container: HTMLElement, history: RouterHistory) {
  const router = createTestRouter(history)

  const reactRoot = createRoot(container)
  reactRoot.render(<RouterProvider router={router} />)

  return {
    router,
    unmount() {
      reactRoot.unmount()
    },
  }
}
