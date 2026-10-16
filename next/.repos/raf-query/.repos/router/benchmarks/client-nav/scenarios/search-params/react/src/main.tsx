import type { RouterHistory } from '@tanstack/history'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { routeTree } from './routeTree.gen'

export function createTestRouter(history: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    scrollRestoration: true,
    // Key the scroll-restoration cache by pathname instead of the default
    // random per-entry location key: with push navigations the default mints
    // a fresh key per navigation and the module-level cache grows one entry
    // per push for the whole run, which is non-stationary.
    getScrollRestorationKey: (location) => location.pathname,
    defaultStructuralSharing: true,
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
