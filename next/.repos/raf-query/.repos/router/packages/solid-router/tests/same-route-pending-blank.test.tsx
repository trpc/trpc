import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import { createControlledPromise } from '@tanstack/router-core'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

/**
 * Solid same-route pending replacement should not blank stale content
 * before pending UI is ready. Core can expose a replacement pending match while
 * the route has no pending fallback and a long pendingMs delay.
 *
 * This test renders a real Solid RouterProvider, navigates from page 1 to page
 * 2 on the same route, and leaves the page 2 loader unresolved. Until pendingMs
 * elapses, the previously committed page 1 content should remain visible.
 */

let resolvePendingPage2: (() => void) | undefined
let pendingNavigation: Promise<unknown> | undefined

afterEach(async () => {
  resolvePendingPage2?.()
  if (pendingNavigation) {
    await Promise.allSettled([pendingNavigation])
  }
  resolvePendingPage2 = undefined
  pendingNavigation = undefined
  cleanup()
  vi.useRealTimers()
})

test('same-route pending replacement without fallback keeps stale content until pendingMs', async () => {
  const pendingMs = 100
  const page2Gate = createControlledPromise<void>()
  const page2Started = createControlledPromise<void>()
  resolvePendingPage2 = page2Gate.resolve
  const history = createMemoryHistory({ initialEntries: ['/posts?page=1'] })
  const root = createRootRoute({
    component: () => <Outlet />,
  })

  function Posts() {
    const data = postsRoute.useLoaderData()
    return <div data-testid="post-content">{data()}</div>
  }

  const postsRoute = createRoute({
    getParentRoute: () => root,
    path: '/posts',
    validateSearch: (search) => ({
      page: Number(search.page ?? 1),
    }),
    loaderDeps: ({ search }) => ({ page: search.page }),
    pendingMs,
    loader: async ({ deps }) => {
      if (deps.page === 2) {
        page2Started.resolve()
        await page2Gate
      }

      return `Page ${deps.page}`
    },
    component: Posts,
  })
  const router = createRouter({
    routeTree: root.addChildren([postsRoute]),
    history,
    defaultPendingMs: pendingMs,
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('Page 1')).toBeInTheDocument()

  vi.useFakeTimers()
  const navigation = router.navigate({
    to: '/posts',
    search: { page: 2 },
  })
  pendingNavigation = navigation

  await page2Started
  await vi.advanceTimersByTimeAsync(pendingMs - 1)

  expect(screen.getByTestId('post-content')).toHaveTextContent('Page 1')
  expect(screen.queryByText('Page 2')).not.toBeInTheDocument()
  expect(router.state.status).toBe('pending')

  page2Gate.resolve()
  await navigation
  pendingNavigation = undefined

  expect(screen.getByText('Page 2')).toBeInTheDocument()
  expect(screen.queryByText('Page 1')).not.toBeInTheDocument()
  expect(router.state.status).toBe('idle')
})
