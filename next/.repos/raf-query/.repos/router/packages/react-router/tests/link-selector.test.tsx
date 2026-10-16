import React from 'react'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  RouterContextProvider,
  RouterProvider,
  createHashHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function setup(trailingSlash: 'never' | 'preserve' = 'never') {
  const root = createRootRoute()
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/posts/$id' }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/posts/1'] }),
    trailingSlash,
  })
  await router.load()
  return router
}

test('a fixed href follows active, inactive and active-again locations', async () => {
  const router = await setup()
  const view = render(
    <RouterContextProvider router={router}>
      <Link to="/posts/$id" params={{ id: '1' }} search={{ page: 1 }}>
        Post
      </Link>
    </RouterContextProvider>,
  )
  const link = view.getByText('Post')
  for (const [id, page, active] of [
    ['1', 1, true],
    ['2', 1, false],
    ['1', 2, false],
    ['1', 1, true],
  ] as const) {
    await act(() =>
      router.navigate({ to: '/posts/$id', params: { id }, search: { page } }),
    )
    expect(link).toHaveAttribute('href', '/posts/1?page=1')
    expect(link.getAttribute('aria-current')).toBe(active ? 'page' : null)
  }
})

test('changed destination, active options and disabled props replace prepared state', async () => {
  const router = await setup()
  function tree(id: string, disabled = false, includeSearch = true) {
    return (
      <RouterContextProvider router={router}>
        <Link
          to="/posts/$id"
          params={{ id }}
          search={{ page: 1 }}
          disabled={disabled}
          activeOptions={{ includeSearch }}
        >
          Post
        </Link>
      </RouterContextProvider>
    )
  }
  const view = render(tree('1'))
  const link = view.getByText('Post')
  expect(link).not.toHaveAttribute('aria-current')
  view.rerender(tree('1', false, false))
  expect(link).toHaveAttribute('aria-current', 'page')
  view.rerender(tree('1', true, false))
  expect(link).not.toHaveAttribute('href')
  expect(link).toHaveAttribute('aria-current', 'page')
  view.rerender(tree('2', false, false))
  expect(link).toHaveAttribute('href', '/posts/2?page=1')
  expect(link).not.toHaveAttribute('aria-current')
  await act(() => router.navigate({ to: '/posts/$id', params: { id: '2' } }))
  expect(link).toHaveAttribute('aria-current', 'page')
})

test('hash history refreshes a cached destination after the outer URL changes', async () => {
  const original = window.location.href
  window.history.replaceState(null, '', '/shell?outer=one#/posts/1')
  const history = createHashHistory()
  const root = createRootRoute({
    component: () => (
      <Link to="/posts/$id" params={{ id: '1' }} search={{}}>
        Post
      </Link>
    ),
  })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/posts/$id' }),
    ]),
    history,
    trailingSlash: 'never',
  })
  try {
    const view = render(<RouterProvider router={router} />)
    const link = await view.findByText('Post')
    expect(link).toHaveAttribute('href', '/shell?outer=one#/posts/1')
    expect(link).toHaveAttribute('aria-current', 'page')
    act(() => {
      window.history.replaceState(null, '', '/other?outer=two#/posts/2')
    })
    await waitFor(() => {
      expect(link).toHaveAttribute('href', '/other?outer=two#/posts/1')
      expect(link).not.toHaveAttribute('aria-current')
    })
  } finally {
    cleanup()
    history.destroy()
    window.history.replaceState(null, '', original)
  }
})

test.each([false, true])(
  'cached paths retain segment boundaries and basepaths (exact=%s)',
  async (exact) => {
    const router = await setup()
    router.update({ basepath: '/app', trailingSlash: 'preserve' })
    const view = render(
      <RouterContextProvider router={router}>
        <Link to="/posts/$id/" params={{ id: '1' }} activeOptions={{ exact }}>
          Post
        </Link>
      </RouterContextProvider>,
    )
    const link = view.getByText('Post')
    for (const [to, active] of [
      ['/posts/1', true],
      ['/posts/1/details', !exact],
      ['/posts/10', false],
      ['/posts/1/', true],
    ] as const) {
      await act(() => router.navigate({ to }))
      expect(link).toHaveAttribute('href', '/app/posts/1/')
      expect(link.getAttribute('aria-current')).toBe(active ? 'page' : null)
    }
    router.update({ basepath: '/new' })
    await act(() => router.navigate({ to: '/posts/1/' }))
    expect(link).toHaveAttribute('href', '/new/posts/1/')
    expect(link).toHaveAttribute('aria-current', 'page')
  },
)

test('external classification follows changed destinations and router instances', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const router = await setup()
  router.update({ protocolAllowlist: ['https:', 'custom:'] })
  function tree(to: string, currentRouter = router) {
    return (
      <RouterContextProvider router={currentRouter}>
        <Link to={to}>Destination</Link>
      </RouterContextProvider>
    )
  }
  const view = render(tree('/posts/1'))
  const link = view.getByText('Destination')
  expect(link).toHaveAttribute('aria-current', 'page')
  for (const to of ['https://other.example/', 'custom:post']) {
    view.rerender(tree(to))
    await act(() => router.navigate({ to: '/posts/$id', params: { id: '2' } }))
    expect(link).toHaveAttribute('href', to)
    expect(link).not.toHaveAttribute('aria-current')
  }
  view.rerender(tree('javascript:blocked()'))
  await act(() => router.navigate({ to: '/posts/$id', params: { id: '1' } }))
  expect(link).not.toHaveAttribute('href')
  expect(link).not.toHaveAttribute('aria-current')
  view.rerender(tree('/posts/2'))
  await act(() => router.navigate({ to: '/posts/$id', params: { id: '2' } }))
  expect(link).toHaveAttribute('href', '/posts/2')
  expect(link).toHaveAttribute('aria-current', 'page')

  // Each mounted router keeps its allowlist; switching routers resets the selector.
  view.rerender(tree('custom:post'))
  expect(link).toHaveAttribute('href', 'custom:post')
  const otherRouter = await setup()
  view.rerender(tree('custom:post', otherRouter))
  expect(link).not.toHaveAttribute('href')
  expect(link).not.toHaveAttribute('aria-current')
})
