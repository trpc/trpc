import { createFileRoute, redirect } from '@tanstack/react-router'
import { getPrivateDataFn } from '../utils/auth-docs'

export const Route = createFileRoute('/auth-docs/private')({
  beforeLoad: ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/auth-docs' })
    }
  },
  loader: () => getPrivateDataFn(),
  component: PrivatePage,
})

function PrivatePage() {
  const message = Route.useLoaderData()
  return <p data-testid="auth-docs-private-page">{message}</p>
}
