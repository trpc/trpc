import * as Vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import { cleanup, fireEvent, render } from '@testing-library/vue'
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

// kind, final href, blocked, active
const cases: Array<
  readonly [
    kind: 'history' | 'rewrite' | 'to',
    href: string,
    blocked: boolean,
    active: boolean,
  ]
> = [
  ['history', '//evil.example/path', true, false],
  ['history', '/\\evil.example/path', true, false],
  ['history', '\\/evil.example/path', true, false],
  ['history', '\x01 \t//evil.example/path', true, false],
  ['history', 'javascript:blocked()', true, false],
  ['history', '/formatted', false, true],
  ['rewrite', 'javascript:blocked()', true, false],
  ['rewrite', 'https://other.example/', false, false],
  ['rewrite', '/safe', false, true],
  ['to', 'myapp:open', false, false],
  ['to', 'mailto:person@example.com', true, false],
]

for (const isServer of [true, false]) {
  test.each(cases)(
    `validates %s href %j on ${isServer ? 'server' : 'client'}`,
    async (kind, href, blocked, active) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const history = createMemoryHistory({ initialEntries: ['/safe'] })
      // Keep custom history output raw so Link must validate it itself.
      history.createHref = vi.fn((path) => (kind === 'history' ? href : path))
      const router = createRouter({
        routeTree: createRootRoute(),
        history,
        isServer,
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
      const tree = Vue.h(RouterContextProvider, { router }, () =>
        Vue.h(
          Link,
          {
            to: kind === 'to' ? href : '/safe',
            preload: 'intent',
            preloadDelay: 0,
            activeProps: { class: 'active', href: 'javascript:active()' },
            inactiveProps: { class: 'inactive', href: 'javascript:inactive()' },
          },
          {
            default: ({ isActive }: { isActive: boolean }) => String(isActive),
          },
        ),
      )
      let container: Element
      if (isServer) {
        container = document.createElement('div')
        container.innerHTML = await renderToString(tree)
      } else {
        container = render(tree).container
      }
      const anchor = container.querySelector('a')!
      if (kind === 'history') {
        expect(history.createHref).toHaveBeenCalledWith('/safe')
      }
      expect(anchor.getAttribute('href')).toBe(blocked ? null : href)
      expect(anchor.textContent).toBe(String(active))
      expect(anchor.getAttribute('aria-current')).toBe(active ? 'page' : null)
      expect(anchor.getAttribute('aria-disabled')).toBe(blocked ? 'true' : null)
      if (kind !== 'to') {
        expect(anchor.className).toBe(active ? 'active' : 'inactive')
      }
      if (!isServer && blocked) {
        expect(
          anchor.dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: true }),
          ),
        ).toBe(true)
        await fireEvent.focus(anchor)
        await fireEvent.mouseEnter(anchor)
        await fireEvent.touchStart(anchor)
        expect(navigate).not.toHaveBeenCalled()
        expect(preload).not.toHaveBeenCalled()
      }
    },
  )
}
