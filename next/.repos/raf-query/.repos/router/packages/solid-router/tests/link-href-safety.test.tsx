import { cleanup, fireEvent, render } from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../src'
import { linkHrefCases } from './link-href-cases'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test.each(linkHrefCases)(
  'validates %s href %j and its active state',
  (kind, href, blocked, active) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const history = createMemoryHistory({ initialEntries: ['/safe'] })
    // Keep custom history output raw so Link must validate it itself.
    history.createHref = vi.fn((path) => (kind === 'history' ? href : path))
    const router = createRouter({
      routeTree: createRootRoute(),
      history,
      isServer: false,
      protocolAllowlist: ['http:', 'https:', 'myapp:'],
      rewrite:
        kind === 'rewrite'
          ? {
              output: ({ url }) => new URL(href, url),
            }
          : undefined,
    })
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue()
    const preload = vi
      .spyOn(router, 'preloadRoute')
      .mockResolvedValue(undefined)
    // Runtime state props can contain href even though the typings exclude it.
    const activeProps = { class: 'active', href: 'javascript:active()' }
    const inactiveProps = { class: 'inactive', href: 'javascript:inactive()' }
    const { container } = render(() => (
      <RouterContextProvider router={router}>
        {() => (
          <Link
            to={kind === 'to' ? href : '/safe'}
            preload="intent"
            preloadDelay={0}
            activeProps={activeProps}
            inactiveProps={inactiveProps}
          >
            {({ isActive }) => String(isActive)}
          </Link>
        )}
      </RouterContextProvider>
    ))
    const anchor = container.querySelector('a')!
    if (kind === 'history') {
      expect(history.createHref).toHaveBeenCalledWith('/safe')
    }
    expect(anchor.getAttribute('href')).toBe(blocked ? null : href)
    expect(anchor.textContent).toBe(String(active))
    expect(anchor.getAttribute('aria-current')).toBe(active ? 'page' : null)
    expect(anchor.getAttribute('aria-disabled')).toBe(blocked ? 'true' : null)
    expect(anchor.className.trim()).toBe(active ? 'active' : 'inactive')
    if (blocked) {
      expect(fireEvent.click(anchor)).toBe(true)
      fireEvent.focus(anchor)
      fireEvent.mouseEnter(anchor)
      fireEvent.touchStart(anchor)
      expect(navigate).not.toHaveBeenCalled()
      expect(preload).not.toHaveBeenCalled()
    }
  },
)
