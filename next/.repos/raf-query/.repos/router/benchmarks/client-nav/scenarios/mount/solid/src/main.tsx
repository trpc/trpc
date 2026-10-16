import { render } from 'solid-js/web'
import { RouterProvider, createRouter } from '@tanstack/solid-router'
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

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof createTestRouter>
  }
}

export function mountTestApp(container: HTMLElement, history: RouterHistory) {
  const router = createTestRouter(history)

  const dispose = render(() => <RouterProvider router={router} />, container)

  return {
    router,
    unmount() {
      dispose()
    },
  }
}
