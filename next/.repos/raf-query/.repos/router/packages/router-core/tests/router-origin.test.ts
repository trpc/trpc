// @vitest-environment jsdom

import { createMemoryHistory } from '@tanstack/history'
import { expect, test, vi } from 'vitest'
import { BaseRootRoute, redirect } from '../src'
import { createTestRouter } from './routerTestUtils'

test.each(
  [false, true].flatMap((isServer) =>
    ['https://app.example', 'http://app.example:8080'].map((origin) => ({
      isServer,
      origin,
    })),
  ),
)(
  'preserves configured $origin through option updates (server=$isServer)',
  ({ isServer, origin }) => {
    const router = createTestRouter({
      routeTree: new BaseRootRoute(),
      history: createMemoryHistory(),
      isServer,
    })
    const defaultOrigin = isServer ? 'http://localhost' : window.origin
    expect(router.origin).toBe(defaultOrigin)

    router.update({ origin })
    expect(router.origin).toBe(origin)
    router.update({ context: { updated: true } })
    expect(router.origin).toBe(origin)
    expect(
      router.resolveRedirect(redirect({ href: `${origin}/target` })).options
        .href,
    ).toBe('/target')

    router.update({ origin: undefined })
    expect(router.origin).toBe(defaultOrigin)
    expect(
      router.resolveRedirect(redirect({ href: `${origin}/target` })).options
        .href,
    ).toBe(`${origin}/target`)
    router.update({ context: { updated: false } })
    expect(router.origin).toBe(defaultOrigin)
  },
)

test('opaque browser origins use the fallback after clearing an explicit origin', () => {
  vi.stubGlobal('origin', 'null')
  try {
    const router = createTestRouter({
      routeTree: new BaseRootRoute(),
      history: createMemoryHistory(),
      isServer: false,
    })
    expect(router.origin).toBe('http://localhost')
    router.update({ origin: 'https://app.example' })
    router.update({ origin: undefined })
    expect(router.origin).toBe('http://localhost')
  } finally {
    vi.unstubAllGlobals()
  }
})
