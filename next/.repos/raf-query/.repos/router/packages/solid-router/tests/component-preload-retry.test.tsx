import { ErrorBoundary, Suspense } from 'solid-js'
import { afterEach, expect, onTestFinished, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
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
  vi.stubGlobal('window', undefined)
  const importer = vi.fn().mockResolvedValue({ default: () => null })
  const Page = lazyRouteComponent(importer)

  const preload = Page.preload?.()
  await preload

  expect(Page.preload?.()).toBe(preload)
  expect(importer).toHaveBeenCalledTimes(1)
})

test('a component loads when rendered before preload', async () => {
  const importer = vi.fn().mockResolvedValue({
    default: () => <div>Page content</div>,
  })
  const Page = lazyRouteComponent(importer)

  render(() => <Page />)

  expect(await screen.findByText('Page content')).toBeInTheDocument()
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

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('Home content')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('link', { name: 'Page link' }))
  expect(await screen.findByTestId('pending-component')).toHaveTextContent(
    'Loading page',
  )
  componentImport.resolve({ default: PageContent })
  expect(await screen.findByText('Page content')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('link', { name: 'Home link' }))
  expect(await screen.findByText('Home content')).toBeInTheDocument()
  PendingComponent.mockClear()
  fireEvent.click(screen.getByRole('link', { name: 'Page link' }))
  await new Promise((resolve) => setTimeout(resolve, 10))

  expect(screen.queryByText('Page content')).toBeInTheDocument()
  expect(screen.queryByTestId('pending-component')).not.toBeInTheDocument()
  expect(PendingComponent).not.toHaveBeenCalled()
  expect(importer).toHaveBeenCalledOnce()
})

test('a missing export fails through the route error UI instead of recursing', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})

  const importer = vi.fn().mockResolvedValue({ Other: () => null })
  const Page = lazyRouteComponent(importer, 'Missing' as never)
  const rootRoute = createRootRoute()
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    component: Page,
    errorComponent: (props: ErrorComponentProps) => (
      <div>{props.error.message}</div>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
  })

  render(() => <RouterProvider router={router} />)

  expect(
    await screen.findByText('lazyRouteComponent: export "Missing" not found'),
  ).toBeInTheDocument()
})

test('a failed component download is retried from the route error UI', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})

  const PageContent = () => <div>Page content</div>
  const retryImport = createControlledPromise<{ default: typeof PageContent }>()
  onTestFinished(() => retryImport.resolve({ default: PageContent }))
  const importer = vi
    .fn<() => Promise<{ default: typeof PageContent }>>()
    .mockRejectedValueOnce(new Error('component download failed'))
    .mockImplementation(() => retryImport)
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

  render(() => <RouterProvider router={router} />)

  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))

  await vi.waitFor(() => expect(importer).toHaveBeenCalledTimes(2))
  expect(screen.queryByText('Page content')).not.toBeInTheDocument()
  retryImport.resolve({ default: PageContent })

  expect(await screen.findByText('Page content')).toBeInTheDocument()
  expect(importer).toHaveBeenCalledTimes(2)
  expect(Page.preload).toBeUndefined()
})

test('a component first loaded during render recovers after an awaited preload retry', async () => {
  const PageContent = () => <div>Recovered component</div>
  const retryImport = createControlledPromise<{ default: typeof PageContent }>()
  onTestFinished(() => retryImport.resolve({ default: PageContent }))
  const importer = vi
    .fn<() => Promise<{ default: typeof PageContent }>>()
    .mockRejectedValueOnce(new Error('component download failed'))
    .mockImplementation(() => retryImport)
  const Page = lazyRouteComponent(importer)
  let retry: Promise<void> | undefined

  render(() => (
    <ErrorBoundary
      fallback={(error, reset) => (
        <button
          type="button"
          onClick={() => {
            retry = Page.preload?.()
            void retry?.then(reset)
          }}
        >
          Retry {error.message}
        </button>
      )}
    >
      <Suspense fallback={<span>Loading component</span>}>
        <Page />
      </Suspense>
    </ErrorBoundary>
  ))

  const button = await screen.findByRole('button', {
    name: 'Retry component download failed',
  })
  expect(importer).toHaveBeenCalledOnce()
  fireEvent.click(button)

  expect(importer).toHaveBeenCalledTimes(2)
  expect(retry).toBeDefined()
  expect(Page.preload?.()).toBe(retry)
  expect(button).toBeInTheDocument()
  expect(screen.queryByText('Recovered component')).not.toBeInTheDocument()

  retryImport.resolve({ default: PageContent })
  await retry

  expect(await screen.findByText('Recovered component')).toBeInTheDocument()
  expect(importer).toHaveBeenCalledTimes(2)
  expect(Page.preload).toBeUndefined()
})
