import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/lowercase-components')({
  pendingComponent: pendingComponent,
  errorComponent: errorComponent,
  component: component,
})

function pendingComponent() {
  return <div>Pending</div>
}

function errorComponent() {
  return <div>Error</div>
}

function component() {
  return <div>Hello</div>
}
