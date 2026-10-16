import { createSignal } from 'solid-js'
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/solid-router'
import { HydrationScript } from 'solid-js/web'
import type { QueryClient } from '@tanstack/solid-query'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Streaming SSR Tests' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <html>
      <head>
        <HydrationScript />
        <HeadContent />
      </head>
      <body>
        <HydrationCheck />
        <nav style={{ padding: '10px', 'border-bottom': '1px solid #ccc' }}>
          <Link to="/" style={{ 'margin-right': '10px' }}>
            Home
          </Link>
          <Link to="/sync-only" style={{ 'margin-right': '10px' }}>
            Sync Only
          </Link>
          <Link to="/deferred" style={{ 'margin-right': '10px' }}>
            Deferred
          </Link>
          <Link to="/deferred-rejection" style={{ 'margin-right': '10px' }}>
            Deferred Rejection
          </Link>
          <Link to="/stream" style={{ 'margin-right': '10px' }}>
            Stream
          </Link>
          <Link to="/fast-serial" style={{ 'margin-right': '10px' }}>
            Fast Serial
          </Link>
          <Link to="/slow-render" style={{ 'margin-right': '10px' }}>
            Slow Render
          </Link>
          <Link to="/nested-deferred" style={{ 'margin-right': '10px' }}>
            Nested Deferred
          </Link>
          <Link to="/many-promises" style={{ 'margin-right': '10px' }}>
            Many Promises
          </Link>
          <Link to="/query-heavy" style={{ 'margin-right': '10px' }}>
            Query Heavy
          </Link>
          <Link to="/concurrent" style={{ 'margin-right': '10px' }}>
            Concurrent
          </Link>
        </nav>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}

function HydrationCheck() {
  const [status, setStatus] = createSignal<'pending' | 'hydrated'>('pending')

  return (
    <div
      data-testid="hydration-check"
      style={{
        padding: '8px',
        'background-color': status() === 'hydrated' ? '#d4edda' : '#f8f9fa',
        'border-bottom': '1px solid #ccc',
      }}
    >
      <button
        data-testid="hydration-check-btn"
        onClick={() => setStatus('hydrated')}
      >
        {status() === 'pending' ? 'Check Hydration' : 'Hydrated!'}
      </button>
      <span data-testid="hydration-status" style={{ 'margin-left': '10px' }}>
        {status()}
      </span>
    </div>
  )
}
