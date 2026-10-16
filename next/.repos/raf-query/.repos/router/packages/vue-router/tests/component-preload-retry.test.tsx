import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/vue'
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
})

test('a successful server component download is reused', async () => {
  vi.stubGlobal('document', undefined)
  const importer = vi.fn().mockResolvedValue({ default: () => null })
  const Page = lazyRouteComponent(importer)

  const preload = Page.preload?.()
  await preload

  expect(Page.preload?.()).toBe(preload)
  expect(importer).toHaveBeenCalledTimes(1)
})

test('a resolved client component preload is reused', async () => {
  const importer = vi.fn().mockResolvedValue({ default: () => null })
  const Page = lazyRouteComponent(importer)

  await Page.preload?.()
  expect(Page.preload).toBeUndefined()
  expect(importer).toHaveBeenCalledTimes(1)
})

test('revisiting a resolved lazy component skips pending UI', async () => {
  const PageContent = () => <div>Page content</div>
  const componentImport = createControlledPromise<{
    default: typeof PageContent
  }>()
  const repeatedImport = createControlledPromise<{
    default: typeof PageContent
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

  await fireEvent.click(screen.getByRole('link', { name: 'Page link' }))
  expect(await screen.findByTestId('pending-component')).toHaveTextContent(
    'Loading page',
  )
  componentImport.resolve({ default: PageContent })
  expect(await screen.findByText('Page content')).toBeInTheDocument()

  await fireEvent.click(screen.getByRole('link', { name: 'Home link' }))
  expect(await screen.findByText('Home content')).toBeInTheDocument()
  PendingComponent.mockClear()
  await fireEvent.click(screen.getByRole('link', { name: 'Page link' }))
  await new Promise((resolve) => setTimeout(resolve, 10))

  expect(screen.queryByText('Page content')).toBeInTheDocument()
  expect(screen.queryByTestId('pending-component')).not.toBeInTheDocument()
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

  function RouteError(props: ErrorComponentProps) {
    const router = useRouter()
    return (
      <button
        type="button"
        onClick={() => {
          props.reset()
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

  await fireEvent.click(retryButton)

  expect(await screen.findByText('Page content')).toBeInTheDocument()
  expect(importer).toHaveBeenCalledTimes(2)
})
