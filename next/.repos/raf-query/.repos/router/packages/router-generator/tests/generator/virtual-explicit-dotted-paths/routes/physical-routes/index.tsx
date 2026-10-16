import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/mounted.path/')({
  component: () => 'Mounted index',
})
