import { renderToString } from 'solid-js/web'
import { expect, test } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../../src'
import { linkPathCases } from '../link-path-cases'

for (const basepath of ['', '/app']) {
  test.each(linkPathCases)(
    `SSR pathname matching with basepath "${basepath}": $current -> $to, exact=$exact`,
    ({ current, to, exact, active }) => {
      const router = createRouter({
        routeTree: createRootRoute(),
        history: createMemoryHistory({ initialEntries: [basepath + current] }),
        basepath,
        trailingSlash: 'preserve',
        isServer: true,
      })
      const html = renderToString(() => (
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
      expect(html.replace(/<[^>]*>/g, '')).toBe(String(active))
      expect(html.match(/class="([^"]*)"/)?.[1]?.trim()).toBe(
        active ? 'active' : 'inactive',
      )
      if (active) {
        expect(html).toContain('aria-current="page"')
      } else {
        expect(html).not.toContain('aria-current')
      }
    },
  )
}
