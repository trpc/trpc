import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    ],
  }),
  component: Outlet,
  shellComponent: Document,
  notFoundComponent: () => (
    <main>
      <h1>Article not found</h1>
      <Link to="/" search={{ q: '' }}>
        All articles
      </Link>
    </main>
  ),
})
function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <nav>
          <Link to="/" search={{ q: '' }}>
            Field notes
          </Link>
          {' | '}
          <Link to="/saved">Saved articles</Link>
        </nav>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
