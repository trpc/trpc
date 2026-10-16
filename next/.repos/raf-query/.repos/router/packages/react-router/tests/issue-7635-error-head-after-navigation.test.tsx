import { createPortal } from 'react-dom'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  HeadContent,
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  document.head.innerHTML = ''
})

// https://github.com/TanStack/router/issues/7635
test('#7635: a parent beforeLoad error replaces the previous child title', async () => {
  const appError = new Error('App beforeLoad failed')
  const appErrorRendered = vi.fn()
  const childHead = vi.fn(() => ({
    meta: [{ title: 'Child success title' }],
  }))

  const rootRoute = createRootRoute({
    component: () => (
      <>
        {createPortal(<HeadContent />, document.head)}
        <Link to="/child" search={{ fail: true }}>
          Fail app load
        </Link>
        <Outlet />
      </>
    ),
  })
  const appRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_app',
    validateSearch: (search: Record<string, unknown>) => ({
      fail: search.fail === true || search.fail === 'true',
    }),
    beforeLoad: ({ search }) => {
      if (search.fail) {
        throw appError
      }
    },
    head: ({ match }) => ({
      meta: [
        {
          title: match.error ? 'App error title' : 'App success title',
        },
      ],
    }),
    component: Outlet,
    errorComponent: ({ error }) => {
      appErrorRendered(error)
      return (
        <div data-testid="app-error">
          {error instanceof Error ? error.message : String(error)}
        </div>
      )
    },
  })
  const childRoute = createRoute({
    getParentRoute: () => appRoute,
    path: '/child',
    head: childHead,
    component: () => <div data-testid="child-content">Child content</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([appRoute.addChildren([childRoute])]),
    history: createMemoryHistory({
      initialEntries: ['/child?fail=false'],
    }),
  })

  render(<RouterProvider router={router} />)

  expect(await screen.findByTestId('child-content')).toBeInTheDocument()
  await waitFor(() => expect(document.title).toBe('Child success title'))
  expect(childHead).toHaveBeenCalled()
  childHead.mockClear()

  fireEvent.click(screen.getByRole('link', { name: 'Fail app load' }))

  expect(await screen.findByTestId('app-error')).toHaveTextContent(
    appError.message,
  )
  expect(appErrorRendered).toHaveBeenCalledWith(appError)
  expect(screen.queryByTestId('child-content')).not.toBeInTheDocument()
  await waitFor(() => expect(document.title).toBe('App error title'))
  expect(childHead).not.toHaveBeenCalled()
  expect(router.state.location.href).toBe('/child?fail=true')
  expect(router.state.status).toBe('idle')
})
