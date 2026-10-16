import { URL as NodeURL } from 'node:url'
import { createBrowserHistory, createHashHistory } from '@tanstack/history'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { BaseRootRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

afterEach(() => {
  vi.unstubAllGlobals()
})

function setupDocumentNavigation({
  initialHref = '/current?query=1#same',
  baseHref,
  hashHistory = false,
}: {
  initialHref?: string
  baseHref?: string
  hashHistory?: boolean
} = {}) {
  const browserWindow = window
  const originalHref = browserWindow.location.href
  const originalState = browserWindow.history.state
  browserWindow.history.replaceState(null, '', initialHref)
  const base = baseHref ? document.createElement('base') : undefined
  if (base) {
    base.href = baseHref!
    document.head.prepend(base)
  }
  const history = (hashHistory ? createHashHistory : createBrowserHistory)({
    window: browserWindow,
  })
  onTestFinished(() => {
    history.destroy()
    base?.remove()
    browserWindow.history.replaceState(originalState, '', originalHref)
  })
  const blockerFn = vi.fn(() => false)
  history.block({ blockerFn, enableBeforeUnload: true })

  // Preserve native URL parse failures, but emit no navigation events. The
  // first beforeunload we dispatch then belongs to a later attempt to leave.
  const assign = vi.fn((href: string) => {
    new NodeURL(href, browserWindow.document.baseURI)
  })
  const replace = vi.fn((href: string) => assign(href))
  vi.stubGlobal('window', {
    location: {
      get href() {
        return browserWindow.location.href
      },
      set href(href: string) {
        assign(href)
      },
      replace,
    },
  })
  const router = createTestRouter({
    routeTree: new BaseRootRoute(),
    history,
    origin: browserWindow.location.origin,
    protocolAllowlist: [
      'http:',
      'https:',
      'mailto:',
      'tel:',
      'custom:',
      'httpx:',
    ],
    isServer: false,
  })
  const dispatchBeforeUnload = () => {
    const event = new browserWindow.Event('beforeunload', {
      cancelable: true,
    })
    browserWindow.dispatchEvent(event)
    return event.defaultPrevented
  }
  return {
    router,
    browserWindow,
    assign,
    replace,
    blockerFn,
    dispatchBeforeUnload,
  }
}

describe.each([false, true])(
  'document navigation with replace=%j',
  (replace) => {
    it.each(['https://[', 'https://example.com:99999/', ' \tHt\nTpS://['])(
      'preserves the next unload warning when %j throws',
      async (href) => {
        const { router, assign, dispatchBeforeUnload } =
          setupDocumentNavigation()

        await expect(router.navigate({ href, replace })).rejects.toThrow()

        expect(assign).toHaveBeenCalledWith(href)
        expect(dispatchBeforeUnload()).toBe(true)
      },
    )

    it.each([
      'mailto:user@example.com',
      'tel:+15555550100',
      'custom:target',
      'httpx://example.com/',
      ' \tMa\niLtO:user@example.com',
      '#same',
      '#changed',
      '#',
      '/current?query=1#same',
      '/folder/../current?query=1#same',
      '/current?query=1#mailto:user@example.com',
    ])('preserves the next unload warning after %j', async (href) => {
      const { router, assign, blockerFn, dispatchBeforeUnload } =
        setupDocumentNavigation()

      await router.navigate({ href, reloadDocument: true, replace })

      expect(assign).toHaveBeenCalledWith(href)
      expect(blockerFn).toHaveBeenCalledOnce()
      expect(dispatchBeforeUnload()).toBe(true)
    })

    it('preserves the next unload warning after an unchanged empty fragment', async () => {
      const { router, dispatchBeforeUnload } = setupDocumentNavigation({
        initialHref: '/current?query=1#',
      })

      await router.navigate({ href: '#', reloadDocument: true, replace })

      expect(dispatchBeforeUnload()).toBe(true)
    })

    it('compares absolute fragment destinations with the visible hash-history URL', async () => {
      const { router, browserWindow, dispatchBeforeUnload } =
        setupDocumentNavigation({
          initialHref: '/shell?query=1#/route',
          hashHistory: true,
        })

      await router.navigate({ href: browserWindow.location.href, replace })

      expect(dispatchBeforeUnload()).toBe(true)
    })

    it.each([
      'https://other.example/next#section',
      'http://other.example/next',
      ' \tHt\nTpS://other.example/next',
      '/next#same',
      '/current?query=2#same',
      '/current?query=1',
    ])('exempts only the first unload for %j', async (href) => {
      const {
        router,
        assign,
        replace: replaceLocation,
        dispatchBeforeUnload,
      } = setupDocumentNavigation()

      await router.navigate({ href, reloadDocument: true, replace })

      expect(assign).toHaveBeenCalledWith(href)
      expect(replaceLocation).toHaveBeenCalledTimes(replace ? 1 : 0)
      expect(dispatchBeforeUnload()).toBe(false)
      expect(dispatchBeforeUnload()).toBe(true)
    })

    it('resolves relative fragments against the document base', async () => {
      const { router, dispatchBeforeUnload } = setupDocumentNavigation({
        baseHref: '/different-document',
      })

      await router.navigate({ href: '#same', reloadDocument: true, replace })

      expect(dispatchBeforeUnload()).toBe(false)
      expect(dispatchBeforeUnload()).toBe(true)
    })

    it('preserves the next unload warning when an external handler skips blockers', async () => {
      const { router, blockerFn, dispatchBeforeUnload } =
        setupDocumentNavigation()

      await router.navigate({
        href: 'mailto:user@example.com',
        ignoreBlocker: true,
        replace,
      })

      expect(blockerFn).not.toHaveBeenCalled()
      expect(dispatchBeforeUnload()).toBe(true)
    })

    it.each(['https://[', 'mailto:user@example.com', '#same'])(
      'clears a previously prepared exemption before attempting %j',
      async (href) => {
        const { router, dispatchBeforeUnload } = setupDocumentNavigation()
        await router.navigate({ href: 'https://other.example/next' })

        const navigation = router.navigate({
          href,
          reloadDocument: true,
          replace,
        })
        if (href === 'https://[') {
          await expect(navigation).rejects.toThrow()
        } else {
          await navigation
        }

        expect(dispatchBeforeUnload()).toBe(true)
      },
    )
  },
)
