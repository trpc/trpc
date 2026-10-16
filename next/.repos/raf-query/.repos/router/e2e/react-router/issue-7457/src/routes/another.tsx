import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/another')({
  component: () => <div>Hello "/another"!</div>,
})
