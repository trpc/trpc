import * as Vue from 'vue'
import { cleanup, render, waitFor } from '@testing-library/vue'
import { afterEach, expect, test } from 'vitest'
import {
  Link,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

test('external links use the current location when becoming internal again', async () => {
  const to = Vue.ref('https://other.example/')
  const root = createRootRoute({
    component: Vue.defineComponent({
      setup: () => () => (
        <Link
          to={to.value}
          search={true}
          params={true}
          hash={true}
          activeOptions={{ exact: true, includeHash: true }}
        >
          Target
        </Link>
      ),
    }),
  })
  const item = createRoute({
    getParentRoute: () => root,
    path: '/items/$id',
    validateSearch: (search: Record<string, unknown>) => ({
      keep: String(search.keep),
    }),
  })
  const router = createRouter({
    routeTree: root.addChildren([item]),
    history: createMemoryHistory({
      initialEntries: ['/items/one?keep=first#first'],
    }),
  })
  await router.load()
  const view = render(<RouterProvider router={router} />)
  const anchor = await view.findByText('Target')
  for (const [id, keep] of [
    ['two', 'second'],
    ['three', 'third'],
  ] as const) {
    to.value = 'https://other.example/'
    await Vue.nextTick()
    await router.navigate({
      to: '/items/$id',
      params: { id },
      search: { keep },
      hash: keep,
    })
    expect(anchor).toHaveAttribute('href', 'https://other.example/')
    to.value = '.'
    await waitFor(() => {
      expect(anchor).toHaveAttribute(
        'href',
        `/items/${id}?keep=${keep}#${keep}`,
      )
      expect(anchor).toHaveAttribute('aria-current', 'page')
    })
  }
  await router.navigate({
    to: '/items/$id',
    params: { id: 'four' },
    search: { keep: 'fourth' },
    hash: 'fourth',
  })
  await waitFor(() =>
    expect(anchor).toHaveAttribute('href', '/items/four?keep=fourth#fourth'),
  )
  to.value = 'https://other.example/'
  await Vue.nextTick()
  await router.navigate({ to: '.', search: true, hash: 'latest' })
  to.value = '/items/three'
  await waitFor(() => {
    expect(anchor).toHaveAttribute('href', '/items/three?keep=fourth#latest')
    expect(anchor).not.toHaveAttribute('aria-current')
  })
})
