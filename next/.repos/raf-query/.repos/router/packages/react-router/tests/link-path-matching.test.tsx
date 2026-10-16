import React from 'react'
import { renderToString } from 'react-dom/server'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

const cases = [
  { current: '/posts', to: '/posts/', exact: true, active: true },
  { current: '/posts/', to: '/posts', exact: true, active: true },
  { current: '/posts/item', to: '/posts', exact: true, active: false },
  { current: '/posts/item', to: '/posts', exact: false, active: true },
  { current: '/posts/item', to: '/posts/', exact: false, active: true },
  { current: '/posts-other', to: '/posts', exact: false, active: false },
]

for (const basepath of ['', '/app']) {
  test.each(cases)(
    `pathname matching agrees on server and client with basepath "${basepath}": $current -> $to, exact=$exact`,
    ({ current, to, exact, active }) => {
      const router = createRouter({
        routeTree: createRootRoute(),
        history: createMemoryHistory({ initialEntries: [basepath + current] }),
        basepath,
        trailingSlash: 'preserve',
      })
      const tree = (
        <RouterContextProvider router={router}>
          <Link
            to={to}
            activeOptions={{ exact }}
            inactiveProps={{ className: 'inactive' }}
          >
            {({ isActive }) => String(isActive)}
          </Link>
        </RouterContextProvider>
      )
      router.isServer = true
      const server = document.createElement('div')
      server.innerHTML = renderToString(tree)
      router.isServer = false
      const client = render(tree).container
      for (const container of [server, client]) {
        const anchor = container.querySelector('a')!
        expect(anchor.textContent).toBe(String(active))
        expect(anchor.getAttribute('aria-current')).toBe(active ? 'page' : null)
        expect(anchor.className).toBe(active ? 'active' : 'inactive')
      }
    },
  )
}
