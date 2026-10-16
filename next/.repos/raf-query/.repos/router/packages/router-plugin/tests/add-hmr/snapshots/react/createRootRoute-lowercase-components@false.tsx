import * as React from 'react'
import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  shellComponent: shellComponent,
  pendingComponent: pendingComponent,
  errorComponent: errorComponent,
  component: component,
})

function shellComponent({ children }: { children: React.ReactNode }) {
  return <html>{children}</html>
}

function pendingComponent() {
  return <div>Pending</div>
}

function errorComponent() {
  return <div>Error</div>
}

function component() {
  return <div>Hello</div>
}
