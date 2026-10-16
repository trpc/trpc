import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createRootRoute({
  pendingComponent: () => null,
  component: RootComponent,
})

function RootComponent() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true'
  }, [])

  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <div data-testid="ssr-node" />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__ssrNode ??= document.currentScript.previousElementSibling`,
          }}
        />
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
