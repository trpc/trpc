import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  Outlet,
  RouterProvider,
  createLazyRoute,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  getRouteApi,
} from '../src'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

test('route-scoped hooks render undefined for an inactive route when shouldThrow is false', async () => {
  const rootRoute = createRootRoute({
    component: Outlet,
  })
  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/posts/$postId',
    validateSearch: () => ({ page: 0 }),
  })
  const postsRouteApi = getRouteApi('/posts/$postId')
  const lazyPostsRoute = createLazyRoute('/posts/$postId')({})

  function IndexComponent() {
    const routeMatch = postsRoute.useMatch({ shouldThrow: false })
    const routeSearch = postsRoute.useSearch({ shouldThrow: false })
    const routeParams = postsRoute.useParams({ shouldThrow: false })
    const routeApiMatch = postsRouteApi.useMatch({ shouldThrow: false })
    const routeApiSearch = postsRouteApi.useSearch({ shouldThrow: false })
    const routeApiParams = postsRouteApi.useParams({ shouldThrow: false })
    const lazyRouteMatch = lazyPostsRoute.useMatch({ shouldThrow: false })
    const lazyRouteSearch = lazyPostsRoute.useSearch({ shouldThrow: false })
    const lazyRouteParams = lazyPostsRoute.useParams({ shouldThrow: false })

    return (
      <>
        <div data-testid="route-use-match">{String(routeMatch)}</div>
        <div data-testid="route-use-search">{String(routeSearch)}</div>
        <div data-testid="route-use-params">{String(routeParams)}</div>
        <div data-testid="route-api-use-match">{String(routeApiMatch)}</div>
        <div data-testid="route-api-use-search">{String(routeApiSearch)}</div>
        <div data-testid="route-api-use-params">{String(routeApiParams)}</div>
        <div data-testid="lazy-route-use-match">{String(lazyRouteMatch)}</div>
        <div data-testid="lazy-route-use-search">{String(lazyRouteSearch)}</div>
        <div data-testid="lazy-route-use-params">{String(lazyRouteParams)}</div>
      </>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: IndexComponent,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)

  for (const scope of ['route', 'route-api', 'lazy-route']) {
    for (const hook of ['use-match', 'use-search', 'use-params']) {
      expect(await screen.findByTestId(`${scope}-${hook}`)).toHaveTextContent(
        'undefined',
      )
    }
  }
})
