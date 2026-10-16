import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import { ErrorBoundary } from 'solid-js'
import { RouterClient } from '../src/ssr/RouterClient'
import { createMemoryHistory, createRootRoute, createRouter } from '../src'

const hydrate = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/router-core/ssr/client', () => ({ hydrate }))

afterEach(() => {
  cleanup()
  delete window.$_TSR
  hydrate.mockReset()
})

test.runIf(typeof window !== 'undefined')(
  'RouterClient signals streaming cleanup without hiding a hydration failure',
  async () => {
    const error = new Error('hydration failed')
    hydrate.mockRejectedValue(error)
    const rootRoute = createRootRoute({ component: () => <div>Ready</div> })
    const router = createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    const hydrated = vi.fn()
    window.$_TSR = { h: hydrated } as any

    render(() => (
      <ErrorBoundary fallback={(caught) => caught.message}>
        <RouterClient router={router} />
      </ErrorBoundary>
    ))

    await waitFor(() => expect(hydrated).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(error.message)).toBeInTheDocument()
  },
)
