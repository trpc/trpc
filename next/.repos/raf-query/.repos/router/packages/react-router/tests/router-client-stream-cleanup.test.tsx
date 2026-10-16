import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { Component } from 'react'
import { createMemoryHistory } from '@tanstack/history'
import { RouterClient } from '../src/ssr/RouterClient'
import { createRootRoute, createRouter } from '../src'
import type { ReactNode } from 'react'

const hydrate = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/router-core/ssr/client', () => ({ hydrate }))

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error?: Error }
> {
  state: { error?: Error } = {}

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    return this.state.error ? this.state.error.message : this.props.children
  }
}

afterEach(() => {
  cleanup()
  delete window.$_TSR
  hydrate.mockReset()
})

test('RouterClient signals streaming cleanup without hiding a hydration failure', async () => {
  const error = new Error('hydration failed')
  hydrate.mockRejectedValue(error)
  const rootRoute = createRootRoute({ component: () => <div>Ready</div> })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const hydrated = vi.fn()
  window.$_TSR = { h: hydrated } as any

  await act(async () => {
    render(
      <ErrorBoundary>
        <RouterClient router={router} />
      </ErrorBoundary>,
    )
  })

  await waitFor(() => expect(hydrated).toHaveBeenCalledTimes(1))
  expect(await screen.findByText(error.message)).toBeInTheDocument()
})
