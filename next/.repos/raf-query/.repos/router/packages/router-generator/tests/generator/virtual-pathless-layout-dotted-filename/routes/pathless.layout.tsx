import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_pathless.layout')({
  component: () => 'Pathless Layout',
})
