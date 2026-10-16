import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component,
  pendingComponent,
  errorComponent,
})

function component() {
  return <div>lowercase function declaration</div>
}

function pendingComponent() {
  return <div>lowercase pending function declaration</div>
}

function errorComponent() {
  return <div>lowercase error function declaration</div>
}
