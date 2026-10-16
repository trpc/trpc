import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/test')({
  component: () => <main data-state="test">Test Page</main>,
})
