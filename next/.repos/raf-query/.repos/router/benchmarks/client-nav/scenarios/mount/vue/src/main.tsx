import * as Vue from 'vue'
import { RouterProvider, createRouter } from '@tanstack/vue-router'
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

declare module '@tanstack/vue-router' {
  interface Register {
    router: ReturnType<typeof createTestRouter>
  }
}

export function mountTestApp(container: HTMLElement, history: RouterHistory) {
  const router = createTestRouter(history)

  const component = <RouterProvider router={router} />
  const app = Vue.createApp({
    render: () => component,
  })

  app.mount(container)

  return {
    router,
    unmount() {
      app.unmount()
    },
  }
}
