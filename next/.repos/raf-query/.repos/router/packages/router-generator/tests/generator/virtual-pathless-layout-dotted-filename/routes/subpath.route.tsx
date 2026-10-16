import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_pathless.layout/subpath')({
  component: () => 'Subpath',
})
