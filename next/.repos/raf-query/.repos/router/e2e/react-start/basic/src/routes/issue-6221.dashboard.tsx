import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/issue-6221/dashboard')({
  head: () => ({ meta: [{ title: 'Dashboard' }] }),
  component: () => <div data-testid="issue-6221-dashboard">Dashboard</div>,
})
