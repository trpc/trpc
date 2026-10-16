import { Outlet, createRootRoute, redirect } from '@tanstack/react-router'
import { waitForRedirectGate } from '../redirectGate'

let shouldRedirect = true

export const Route = createRootRoute({
  pendingMs: 0,
  pendingMinMs: 500,
  pendingComponent: RootPendingComponent,
  beforeLoad: async ({ location }) => {
    if (location.pathname !== '/' || !shouldRedirect) {
      return
    }

    await waitForRedirectGate()

    if (!shouldRedirect) {
      return
    }

    shouldRedirect = false
    throw redirect({ to: '/posts', replace: true })
  },
  component: () => <Outlet />,
})

function RootPendingComponent() {
  return (
    <div role="status" data-testid="root-pending">
      Loading route
    </div>
  )
}
