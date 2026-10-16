import { createSignal } from 'solid-js'
import { cleanup, render } from '@solidjs/testing-library'
import { afterEach, expect, test } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../src'
import { linkPathCases } from './link-path-cases'

afterEach(cleanup)

for (const basepath of ['', '/app']) {
  test.each(linkPathCases)(
    `pathname matching with basepath "${basepath}": $current -> $to, exact=$exact`,
    ({ current, to, exact, active }) => {
      const router = createRouter({
        routeTree: createRootRoute(),
        history: createMemoryHistory({ initialEntries: [basepath + current] }),
        basepath,
        trailingSlash: 'preserve',
        isServer: false,
      })
      const { container } = render(() => (
        <RouterContextProvider router={router}>
          {() => (
            <Link
              to={to}
              activeOptions={{ exact }}
              inactiveProps={{ class: 'inactive' }}
            >
              {({ isActive }) => String(isActive)}
            </Link>
          )}
        </RouterContextProvider>
      ))
      const anchor = container.querySelector('a')!
      expect(anchor.textContent).toBe(String(active))
      expect(anchor.getAttribute('aria-current')).toBe(active ? 'page' : null)
      expect(anchor.className).toBe(active ? 'active' : 'inactive')
    },
  )
}

test('pathname matching reacts when exact mode changes', () => {
  const [exact, setExact] = createSignal(true)
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/posts/item'] }),
    isServer: false,
  })
  const { container } = render(() => (
    <RouterContextProvider router={router}>
      {() => (
        <Link
          to="/posts"
          activeOptions={{ exact: exact() }}
          inactiveProps={{ class: 'inactive' }}
        >
          {({ isActive }) => String(isActive)}
        </Link>
      )}
    </RouterContextProvider>
  ))
  const anchor = container.querySelector('a')!
  for (const mode of [true, false, true]) {
    setExact(mode)
    expect(anchor.textContent).toBe(String(!mode))
    expect(anchor.getAttribute('aria-current')).toBe(mode ? null : 'page')
    expect(anchor.className).toBe(mode ? 'inactive' : 'active')
  }
})
