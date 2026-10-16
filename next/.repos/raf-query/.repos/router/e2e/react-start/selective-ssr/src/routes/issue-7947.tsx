import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/issue-7947')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Issue 7947 origin' }] }),
  beforeLoad: () => {
    throw redirect({ to: '/issue-7947-target' })
  },
  component: () => <div data-testid="issue-7947-origin">Origin</div>,
})
