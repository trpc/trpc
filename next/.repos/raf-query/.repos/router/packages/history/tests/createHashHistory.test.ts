import { describe, expect, test, vi } from 'vitest'

import { createHashHistory } from '../src'

describe('createHashHistory', () => {
  test.each(['\x00/route', '/route\x01', '/route?q=a\x1fb#c\x7fd'])(
    'keeps logical control data stable after reading the browser URL again: %j',
    (href) => {
      const originalHref = window.location.href
      window.history.replaceState(null, '', '/shell')
      const history = createHashHistory()
      let reloaded: ReturnType<typeof createHashHistory> | undefined
      try {
        history.push(href)
        history.flush()
        const location = history.location
        history.destroy()
        reloaded = createHashHistory()
        expect(reloaded.location).toEqual(location)
      } finally {
        history.destroy()
        reloaded?.destroy()
        window.history.replaceState(null, '', originalHref)
      }
    },
  )

  test('reads a hash route that starts with a query without leaking it into the pathname', () => {
    const window = {
      location: { pathname: '/', search: '', hash: '#?x=1' },
      history: {
        state: { __TSR_index: 0, __TSR_key: 'initial' },
        length: 1,
        pushState: vi.fn(),
        replaceState: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        go: vi.fn(),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const history = createHashHistory({ window })

    expect(history.location).toMatchObject({
      href: '?x=1',
      pathname: '',
      search: '?x=1',
      hash: '',
    })
    history.destroy()
  })

  test('normalizes the final browser href without changing the logical hash location', async () => {
    const pushState = vi.fn()
    const window = {
      location: {
        pathname: '//nested/path',
        search: '',
        hash: '',
      },
      history: {
        state: { __TSR_index: 0, __TSR_key: 'initial' },
        length: 1,
        pushState,
        replaceState: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        go: vi.fn(),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const history = createHashHistory({ window })

    history.push('/logical')
    await Promise.resolve()

    expect(pushState).toHaveBeenCalledWith(
      expect.anything(),
      '',
      '/nested/path#/logical',
    )
    expect(history.location.href).toBe('/logical')
    history.destroy()
  })

  test.each([
    [
      '/?shell=1#/hello#section#tail',
      {
        href: '/hello?shell=1#section#tail',
        pathname: '/hello',
        search: '?shell=1',
        hash: '#section#tail',
      },
    ],
    [
      '/?shell=1#/hello?route=2#section',
      {
        href: '/hello?route=2?shell=1#section',
        pathname: '/hello',
        search: '?route=2?shell=1',
        hash: '#section',
      },
    ],
    [
      '/#/hello##tail#',
      {
        href: '/hello##tail#',
        pathname: '/hello',
        search: '',
        hash: '##tail#',
      },
    ],
    [
      '/#/hello%23nested?value=%23#anchor%23tail',
      {
        href: '/hello%23nested?value=%23#anchor%23tail',
        pathname: '/hello%23nested',
        search: '?value=%23',
        hash: '#anchor%23tail',
      },
    ],
    [
      '/?shell=1#//evil.example/path#fragment',
      {
        href: '/evil.example/path?shell=1#fragment',
        pathname: '/evil.example/path',
        search: '?shell=1',
        hash: '#fragment',
      },
    ],
    [
      '/?shell=1#',
      {
        href: '/?shell=1',
        pathname: '/',
        search: '?shell=1',
        hash: '',
      },
    ],
  ])('preserves the logical URL when reading %s', (href, expected) => {
    const originalHref = window.location.href
    const originalState = window.history.state
    window.history.replaceState(null, '', href)
    const history = createHashHistory()

    try {
      expect(history.location).toMatchObject(expected)
      window.history.replaceState(window.history.state, '', '/shell')
      window.history.pushState(window.history.state, '', href)
      expect(history.location).toMatchObject(expected)
    } finally {
      history.destroy()
      window.history.replaceState(originalState, '', originalHref)
    }
  })

  describe('parseLocation', () => {
    describe.each([
      ['/', { pathname: '/', search: '' }, 'neither search params nor hash'],
      [
        '/#/hello',
        { pathname: '/hello', search: '' },
        'hash present, no search params',
      ],
      [
        '/?search=params',
        { pathname: '/', search: '?search=params' },
        'search params present, no hash',
      ],
      [
        '/#/hello?search=params',
        { pathname: '/hello', search: '?search=params' },
        'both hash and search params present, in that order',
      ],
      [
        '/?search=params#/hello',
        { pathname: '/hello', search: '?search=params' },
        'both search params and hash present, in that order',
      ],
    ])('check for %s', (...[path, exp, desc]) => {
      test(`onLoad with ${path} (${desc})`, () => {
        window.history.replaceState({}, '', path)
        const history = createHashHistory()
        expect(history.location.pathname).toBe(exp.pathname)
        expect(history.location.search).toBe(exp.search)
      })
      test(`onNavigate with ${path} (${desc})`, () => {
        const history = createHashHistory()
        window.history.pushState({}, '', path)
        expect(history.location.pathname).toBe(exp.pathname)
        expect(history.location.search).toBe(exp.search)
      })
    })
  })
})
