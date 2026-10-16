import {
  Body,
  HeadContent,
  Html,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/vue-router'
import { defineComponent, ref } from 'vue'
import type { QueryClient } from '@tanstack/vue-query'

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
    <Html>
      <head>
        <HeadContent />
      </head>
      <Body>
        <HydrationCheck />
        <nav style={{ padding: '10px', borderBottom: '1px solid #ccc' }}>
          <Link to="/" style={{ marginRight: '10px' }}>
            Home
          </Link>
          <Link to="/sync-only" style={{ marginRight: '10px' }}>
            Sync Only
          </Link>
          <Link to="/deferred" style={{ marginRight: '10px' }}>
            Deferred
          </Link>
          <Link to="/deferred-rejection" style={{ marginRight: '10px' }}>
            Deferred Rejection
          </Link>
          <Link to="/stream" style={{ marginRight: '10px' }}>
            Stream
          </Link>
          <Link to="/fast-serial" style={{ marginRight: '10px' }}>
            Fast Serial
          </Link>
          <Link to="/slow-render" style={{ marginRight: '10px' }}>
            Slow Render
          </Link>
          <Link to="/nested-deferred" style={{ marginRight: '10px' }}>
            Nested Deferred
          </Link>
          <Link to="/many-promises" style={{ marginRight: '10px' }}>
            Many Promises
          </Link>
          <Link to="/query-heavy" style={{ marginRight: '10px' }}>
            Query Heavy
          </Link>
          <Link to="/concurrent" style={{ marginRight: '10px' }}>
            Concurrent
          </Link>
        </nav>
        <Outlet />
        <Scripts />
      </Body>
    </Html>
  )
}

const HydrationCheck = defineComponent({
  setup() {
    const status = ref<'pending' | 'hydrated'>('pending')

    return () => (
      <div
        data-testid="hydration-check"
        style={{
          padding: '8px',
          backgroundColor: status.value === 'hydrated' ? '#d4edda' : '#f8f9fa',
          borderBottom: '1px solid #ccc',
        }}
      >
        <button
          data-testid="hydration-check-btn"
          onClick={() => {
            status.value = 'hydrated'
          }}
        >
          {status.value === 'pending' ? 'Check Hydration' : 'Hydrated!'}
        </button>
        <span data-testid="hydration-status" style={{ marginLeft: '10px' }}>
          {status.value}
        </span>
      </div>
    )
  },
})
