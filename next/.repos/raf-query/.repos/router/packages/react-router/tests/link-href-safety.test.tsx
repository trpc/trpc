import React from 'react'
import { renderToString } from 'react-dom/server'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

for (const isServer of [true, false]) {
  test.each<[string, string | null, boolean]>([
    ['//evil.example/path', null, false],
    ['/\\evil.example/path', null, false],
    ['\\/evil.example/path', null, false],
    ['\x01 \t//evil.example/path', null, false],
    ['javascript:blocked()', null, false],
    ['/formatted', '/formatted', true],
    ['https://other.example/', 'https://other.example/', false],
  ] as const)(
    `validates final history href %j on ${isServer ? 'server' : 'client'}`,
    (href, expectedHref, active) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const history = createMemoryHistory({ initialEntries: ['/safe'] })
      // Browser history normalizes formatter output itself. Use raw history
      // output to exercise the final Link validation boundary.
      history.createHref = vi.fn(() => href)
      const router = createRouter({
        routeTree: createRootRoute(),
        history,
        isServer,
      })
      const navigate = vi.spyOn(router, 'navigate').mockResolvedValue()
      const preload = vi
        .spyOn(router, 'preloadRoute')
        .mockResolvedValue(undefined)
      const activeProps = { className: 'active', href: 'javascript:active()' }
      const inactiveProps = {
        className: 'inactive',
        href: 'javascript:inactive()',
      }
      const tree = (
        <RouterContextProvider router={router}>
          <Link
            to="/safe"
            preload="intent"
            preloadDelay={0}
            activeProps={activeProps}
            inactiveProps={inactiveProps}
          >
            {({ isActive }) => String(isActive)}
          </Link>
        </RouterContextProvider>
      )
      let container: HTMLElement
      if (isServer) {
        container = document.createElement('div')
        container.innerHTML = renderToString(tree)
      } else {
        container = render(tree).container
      }
      const anchor = container.querySelector('a')!
      expect(history.createHref).toHaveBeenCalledWith('/safe')
      expect(anchor.getAttribute('href')).toBe(expectedHref)
      expect(anchor.textContent).toBe(String(active))
      expect(anchor.getAttribute('aria-current')).toBe(active ? 'page' : null)
      expect(anchor.getAttribute('aria-disabled')).toBe(
        expectedHref === null ? 'true' : null,
      )
      if (expectedHref === null) {
        expect(anchor).toHaveClass('inactive')
        if (!isServer) {
          expect(fireEvent.click(anchor)).toBe(true)
          fireEvent.focus(anchor)
          fireEvent.mouseEnter(anchor)
          fireEvent.touchStart(anchor)
          expect(navigate).not.toHaveBeenCalled()
          expect(preload).not.toHaveBeenCalled()
        }
      }
    },
  )
}
