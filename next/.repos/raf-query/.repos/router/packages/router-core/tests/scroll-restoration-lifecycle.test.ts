import { createMemoryHistory } from '@tanstack/history'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  BaseRootRoute,
  getElementScrollRestorationEntry,
  setupScrollRestoration,
} from '../src'
import { createTestRouter } from './routerTestUtils'

let listeners: Array<
  [
    Window | Document,
    string,
    EventListenerOrEventListenerObject,
    boolean | AddEventListenerOptions | undefined,
  ]
>

beforeEach(() => {
  listeners = []
  for (const target of [window, document]) {
    const add = target.addEventListener.bind(target)
    vi.spyOn(target, 'addEventListener').mockImplementation(
      (type, listener, options) => {
        listeners.push([target, type, listener, options])
        add(type, listener, options)
      },
    )
  }
})

afterEach(() => {
  for (const [target, type, listener, options] of listeners) {
    target.removeEventListener(type, listener, options)
  }
  document.body.replaceChildren()
  history.scrollRestoration = 'auto'
  vi.restoreAllMocks()
})

function createRouter(
  options: Parameters<typeof createTestRouter>[0] = {
    routeTree: new BaseRootRoute({}),
  },
) {
  return createTestRouter({
    history: createMemoryHistory(),
    scrollRestoration: true,
    ...options,
  })
}

test.each([false, true])(
  'hands off native restoration before taking a pagehide snapshot (persisted=%s)',
  (persisted) => {
    const modes: Array<ScrollRestoration> = []
    createRouter({
      routeTree: new BaseRootRoute({}),
      getScrollRestorationKey: () => {
        modes.push(history.scrollRestoration)
        return `lifecycle-${persisted}`
      },
    })
    dispatchEvent(new PageTransitionEvent('pagehide', { persisted }))
    expect(modes).toEqual(['auto'])
    expect(history.scrollRestoration).toBe('auto')
  },
)

test.each([false, true])(
  'reclaims native restoration only for a persisted pageshow (persisted=%s)',
  (persisted) => {
    createRouter()
    history.scrollRestoration = 'auto'
    dispatchEvent(new PageTransitionEvent('pageshow', { persisted }))
    expect(history.scrollRestoration).toBe(persisted ? 'manual' : 'auto')
  },
)

test('still hands off native restoration when a custom key throws', () => {
  const failure = new Error('custom scroll key failed')
  const errors: Array<unknown> = []
  addEventListener('error', (event) => {
    errors.push(event.error)
    event.preventDefault()
  })
  createRouter({
    routeTree: new BaseRootRoute({}),
    getScrollRestorationKey: () => {
      throw failure
    },
  })
  dispatchEvent(new PageTransitionEvent('pagehide'))
  expect(errors).toEqual([failure])
  expect(history.scrollRestoration).toBe('auto')
})

test('hands off native restoration when storage persistence throws', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('storage unavailable')
  })
  createRouter()
  dispatchEvent(new PageTransitionEvent('pagehide'))
  expect(history.scrollRestoration).toBe('auto')
  expect(warn).toHaveBeenCalledOnce()
})

test('preserves live nested scroll snapshots across repeated hide/show cycles without repeated setup', () => {
  const element = document.createElement('div')
  element.dataset.scrollRestorationId = 'lifecycle-nested'
  document.body.append(element)
  const router = createRouter({
    routeTree: new BaseRootRoute({}),
    getScrollRestorationKey: () => 'lifecycle-nested',
  })
  setupScrollRestoration(router)
  expect(listeners.filter(([, type]) => type === 'pageshow')).toHaveLength(1)
  for (const scrollTop of [80, 120]) {
    element.scrollTop = scrollTop
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
    dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    expect(history.scrollRestoration).toBe('auto')
    expect(
      getElementScrollRestorationEntry(router, {
        id: 'lifecycle-nested',
        getKey: router.options.getScrollRestorationKey,
      }),
    ).toEqual({ scrollX: 0, scrollY: scrollTop })
    dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    expect(history.scrollRestoration).toBe('manual')
  }
})

test('leaves native restoration alone when router restoration is disabled', () => {
  history.scrollRestoration = 'auto'
  createRouter({ routeTree: new BaseRootRoute({}), scrollRestoration: false })
  dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
  dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
  expect(history.scrollRestoration).toBe('auto')
})

test('can enable restoration after disabled setup without duplicate lifecycle listeners', () => {
  history.scrollRestoration = 'auto'
  const router = createRouter({
    routeTree: new BaseRootRoute({}),
    scrollRestoration: false,
    getScrollRestorationKey: () => 'lifecycle-forced',
  })
  expect(history.scrollRestoration).toBe('auto')
  setupScrollRestoration(router, true)
  setupScrollRestoration(router, true)
  expect(history.scrollRestoration).toBe('manual')
  for (const event of ['pagehide', 'pageshow']) {
    expect(listeners.filter(([, type]) => type === event)).toHaveLength(1)
  }
  const element = document.createElement('div')
  element.dataset.scrollRestorationId = 'lifecycle-forced'
  document.body.append(element)
  element.scrollTop = 40
  element.dispatchEvent(new Event('scroll', { bubbles: true }))
  dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
  expect(history.scrollRestoration).toBe('auto')
  expect(
    getElementScrollRestorationEntry(router, {
      id: 'lifecycle-forced',
      getKey: router.options.getScrollRestorationKey,
    }),
  ).toEqual({ scrollX: 0, scrollY: 40 })
  dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
  expect(history.scrollRestoration).toBe('manual')
})

test('does not take over browser restoration or register listeners on the server', () => {
  history.scrollRestoration = 'auto'
  const router = createRouter({
    routeTree: new BaseRootRoute({}),
    isServer: true,
  })
  setupScrollRestoration(router, true)
  expect(history.scrollRestoration).toBe('auto')
  expect(
    listeners.filter(([, type]) =>
      ['pagehide', 'pageshow', 'scroll'].includes(type),
    ),
  ).toEqual([])
})
