import * as Solid from 'solid-js'
import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

function setup(remountOnParams: boolean | 'falsy' = false) {
  const mounted = vi.fn()
  const unmounted = vi.fn()
  const rootRoute = createRootRoute({ component: () => <Outlet /> })

  function ItemComponent() {
    const params = itemRoute.useParams()

    Solid.onMount(mounted)
    Solid.onCleanup(unmounted)

    return <div>Item {params().itemId}</div>
  }

  const itemRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/items/$itemId',
    component: ItemComponent,
    remountDeps:
      remountOnParams === 'falsy'
        ? ({ params }) => (params.itemId === 'one' ? false : 0)
        : remountOnParams
          ? ({ params }) => params
          : undefined,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([itemRoute]),
    history: createMemoryHistory({ initialEntries: ['/items/one'] }),
  })

  render(() => <RouterProvider router={router} />)

  return { mounted, router, unmounted }
}

async function navigateToSecondItem(
  router: ReturnType<typeof setup>['router'],
) {
  await router.navigate({
    to: '/items/$itemId',
    params: { itemId: 'two' },
  })
}

test('keeps an active route component mounted when params change by default', async () => {
  const { mounted, router, unmounted } = setup()

  expect(await screen.findByText('Item one')).toBeInTheDocument()
  expect(mounted).toHaveBeenCalledTimes(1)
  expect(unmounted).not.toHaveBeenCalled()

  await navigateToSecondItem(router)

  expect(await screen.findByText('Item two')).toBeInTheDocument()
  expect(mounted).toHaveBeenCalledTimes(1)
  expect(unmounted).not.toHaveBeenCalled()
})

test('remounts an active route component when params are remount deps', async () => {
  const { mounted, router, unmounted } = setup(true)

  expect(await screen.findByText('Item one')).toBeInTheDocument()
  expect(mounted).toHaveBeenCalledTimes(1)

  await navigateToSecondItem(router)

  expect(await screen.findByText('Item two')).toBeInTheDocument()
  expect(mounted).toHaveBeenCalledTimes(2)
  expect(unmounted).toHaveBeenCalledTimes(1)
})

test('remounts when remount deps change between falsy values', async () => {
  const { mounted, router, unmounted } = setup('falsy')

  expect(await screen.findByText('Item one')).toBeInTheDocument()
  expect(mounted).toHaveBeenCalledTimes(1)

  await navigateToSecondItem(router)

  expect(await screen.findByText('Item two')).toBeInTheDocument()
  expect(mounted).toHaveBeenCalledTimes(2)
  expect(unmounted).toHaveBeenCalledTimes(1)
})
