import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/direct.path')({
  component: () => 'Direct',
})
