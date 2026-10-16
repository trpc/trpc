import * as React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createControlledPromise } from '@tanstack/router-core'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  useRouter,
} from '../src'
import type { ErrorComponentProps } from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

test('a successful server component download is reused', async () => {
  vi.stubGlobal('window', undefined)
  const importer = vi.fn().mockResolvedValue({ default: () => null })
  const Page = lazyRouteComponent(importer)

  await Page.preload?.()
  await Page.preload?.()
  expect(importer).toHaveBeenCalledTimes(1)
})

test('concurrent component preloads share the import', async () => {
  const componentImport = createControlledPromise<{
    default: () => null
  }>()
  const importer = vi.fn(() => componentImport)
  const Page = lazyRouteComponent(importer)

  const first = Page.preload?.()
  const second = Page.preload?.()
  expect(importer).toHaveBeenCalledOnce()

  componentImport.resolve({ default: () => null })
  await Promise.all([first, second])
})

test('a resolved client component preload is reused', async () => {
  const importer = vi.fn().mockResolvedValue({ default: () => null })
  const Page = lazyRouteComponent(importer)

  await Page.preload?.()
  expect(Page.preload).toBeUndefined()
  expect(importer).toHaveBeenCalledTimes(1)
})

test('revisiting a resolved lazy component skips pending UI', async () => {
  const componentImport = createControlledPromise<{
    default: () => React.JSX.Element
  }>()
  const repeatedImport = createControlledPromise<{
    default: () => React.JSX.Element
  }>()
  const importer = vi
    .fn()
    .mockImplementationOnce(() => componentImport)
    .mockImplementationOnce(() => repeatedImport)
  const Page = lazyRouteComponent(importer)
  const PendingComponent = vi.fn(() => (
    <div data-testid="pending-component">Loading page</div>
  ))
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Link to="/">Home link</Link>
        <Link to="/page">Page link</Link>
        <Outlet />
      </>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Home content</div>,
  })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    component: Page,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    defaultPendingComponent: PendingComponent,
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Home content')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('link', { name: 'Page link' }))
  expect(await screen.findByTestId('pending-component')).toHaveTextContent(
    'Loading page',
  )
  await act(() => {
    componentImport.resolve({ default: () => <div>Page content</div> })
  })
  expect(await screen.findByText('Page content')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('link', { name: 'Home link' }))
  expect(await screen.findByText('Home content')).toBeInTheDocument()
  PendingComponent.mockClear()
  fireEvent.click(screen.getByRole('link', { name: 'Page link' }))
  await act(() => new Promise((resolve) => setTimeout(resolve, 10)))

  const revisitedContent = screen.queryByText('Page content')
  const revisitedPending = screen.queryByTestId('pending-component')

  expect(revisitedContent).toBeInTheDocument()
  expect(revisitedPending).not.toBeInTheDocument()
  expect(PendingComponent).not.toHaveBeenCalled()
  expect(importer).toHaveBeenCalledOnce()
})

test('a failed component download is retried from the route error UI', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})

  const PageContent = () => <div>Page content</div>
  const importer = vi
    .fn<() => Promise<{ default: typeof PageContent }>>()
    .mockRejectedValueOnce(new Error('component download failed'))
    .mockResolvedValue({ default: PageContent })
  const Page = lazyRouteComponent(importer)

  function RouteError({ reset }: ErrorComponentProps) {
    const router = useRouter()
    return (
      <button
        type="button"
        onClick={() => {
          reset()
          void router.invalidate()
        }}
      >
        Retry
      </button>
    )
  }

  const rootRoute = createRootRoute()
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    component: Page,
    errorComponent: RouteError,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
  })

  render(<RouterProvider router={router} />)

  const retryButton = await screen.findByRole('button', { name: 'Retry' })
  expect(importer).toHaveBeenCalledTimes(1)

  fireEvent.click(retryButton)

  expect(await screen.findByText('Page content')).toBeInTheDocument()
  expect(importer).toHaveBeenCalledTimes(2)
  expect(
    screen.queryByRole('button', { name: 'Retry' }),
  ).not.toBeInTheDocument()
})

test('renders after retrying a module download that failed during preload', async () => {
  const PageContent = () => <div>Page content</div>
  const importer = vi
    .fn<() => Promise<{ default: typeof PageContent }>>()
    .mockRejectedValueOnce(
      new TypeError(
        'Failed to fetch dynamically imported module: /assets/page.js',
      ),
    )
    .mockResolvedValue({ default: PageContent })
  const Page = lazyRouteComponent(importer)

  await Page.preload?.()

  const rootRoute = createRootRoute()
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    component: Page,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
  })

  render(<RouterProvider router={router} />)

  expect(await screen.findByText('Page content')).toBeInTheDocument()
  expect(importer).toHaveBeenCalledTimes(2)
})
