import { URL as NodeURL } from 'node:url'
import { createBrowserHistory, createMemoryHistory } from '@tanstack/history'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PROTOCOL_ALLOWLIST,
  getUrlScheme,
  isDangerousProtocol,
} from '../src/utils'
import { redirect } from '../src/redirect'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

const defaultAllowlistSet = new Set(DEFAULT_PROTOCOL_ALLOWLIST)

afterEach(() => {
  vi.unstubAllGlobals()
})

const unsafeRelativeUrls = [
  '//evil.example',
  '///evil.example',
  '/\\evil.example',
  '/\\\\evil.example',
  '/\\/evil.example',
  '\\/evil.example',
  '\\\\evil.example',
  ' //evil.example',
  ' /\\evil.example',
  '\x01//evil.example',
  ...['\t', '\n', '\r'].flatMap((control) =>
    ['/', '\\'].flatMap((first) =>
      ['/', '\\'].map((second) => first + control + second + 'evil.example'),
    ),
  ),
]

describe('isDangerousProtocol', () => {
  describe('blocked protocols (not in default allowlist)', () => {
    it('should detect javascript: protocol', () => {
      expect(
        isDangerousProtocol('javascript:alert(1)', defaultAllowlistSet),
      ).toBe(true)
    })

    it('should detect javascript: with mixed case and whitespace', () => {
      expect(
        isDangerousProtocol('JavaScript:alert(1)', defaultAllowlistSet),
      ).toBe(true)
      expect(
        isDangerousProtocol('  \t\n  javascript:alert(1)', defaultAllowlistSet),
      ).toBe(true)
      expect(
        isDangerousProtocol('java\nscript:alert(1)', defaultAllowlistSet),
      ).toBe(true)
    })

    it('should detect known unsafe schemes', () => {
      expect(
        isDangerousProtocol(
          'data:text/html,<script>alert(1)</script>',
          defaultAllowlistSet,
        ),
      ).toBe(true)
      expect(
        isDangerousProtocol(
          'blob:https://example.com/some-uuid',
          defaultAllowlistSet,
        ),
      ).toBe(true)
      expect(
        isDangerousProtocol('vbscript:msgbox(1)', defaultAllowlistSet),
      ).toBe(true)
      expect(
        isDangerousProtocol('file:///etc/passwd', defaultAllowlistSet),
      ).toBe(true)
      expect(isDangerousProtocol('about:blank', defaultAllowlistSet)).toBe(true)
    })

    it('should block custom protocols by default', () => {
      expect(isDangerousProtocol('custom:something', defaultAllowlistSet)).toBe(
        true,
      )
      expect(isDangerousProtocol('foo:bar', defaultAllowlistSet)).toBe(true)
    })
  })

  describe('allowed protocols (in default allowlist)', () => {
    it('should allow http and https', () => {
      expect(
        isDangerousProtocol('http://example.com', defaultAllowlistSet),
      ).toBe(false)
      expect(
        isDangerousProtocol('https://example.com', defaultAllowlistSet),
      ).toBe(false)
    })

    it('should allow mailto and tel', () => {
      expect(
        isDangerousProtocol('mailto:user@example.com', defaultAllowlistSet),
      ).toBe(false)
      expect(isDangerousProtocol('tel:+1234567890', defaultAllowlistSet)).toBe(
        false,
      )
    })
  })

  describe('relative URLs (no protocol)', () => {
    it('should allow relative paths, query strings and hash fragments', () => {
      expect(isDangerousProtocol('/path/to/page', defaultAllowlistSet)).toBe(
        false,
      )
      expect(isDangerousProtocol('./relative', defaultAllowlistSet)).toBe(false)
      expect(isDangerousProtocol('../parent', defaultAllowlistSet)).toBe(false)
      expect(isDangerousProtocol('?foo=bar', defaultAllowlistSet)).toBe(false)
      expect(isDangerousProtocol('#section', defaultAllowlistSet)).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('should handle empty and null-ish inputs', () => {
      expect(isDangerousProtocol('', defaultAllowlistSet)).toBe(false)
      expect(
        isDangerousProtocol(null as unknown as string, defaultAllowlistSet),
      ).toBe(false)
      expect(
        isDangerousProtocol(
          undefined as unknown as string,
          defaultAllowlistSet,
        ),
      ).toBe(false)
    })

    it('should not be fooled by javascript in pathname or query', () => {
      expect(
        isDangerousProtocol(
          'https://example.com/javascript:foo',
          defaultAllowlistSet,
        ),
      ).toBe(false)
      expect(isDangerousProtocol('/javascript:foo', defaultAllowlistSet)).toBe(
        false,
      )
      expect(isDangerousProtocol('/path?time=12:00', defaultAllowlistSet)).toBe(
        false,
      )
    })

    it('should return false for malformed/encoded scheme strings that URL rejects', () => {
      expect(
        isDangerousProtocol(
          '%6a%61%76%61%73%63%72%69%70%74:alert(1)',
          defaultAllowlistSet,
        ),
      ).toBe(false)
      expect(isDangerousProtocol(':::', defaultAllowlistSet)).toBe(false)
      expect(isDangerousProtocol('123:456', defaultAllowlistSet)).toBe(false)
      expect(isDangerousProtocol('//example.com', defaultAllowlistSet)).toBe(
        true,
      )
    })

    it('should detect dangerous protocol with leading control characters', () => {
      expect(
        isDangerousProtocol('\x00javascript:alert(1)', defaultAllowlistSet),
      ).toBe(true)
      expect(
        isDangerousProtocol(
          '\x01\x02\x03javascript:alert(1)',
          defaultAllowlistSet,
        ),
      ).toBe(true)
    })
  })

  describe('custom allowlist', () => {
    it('should use custom allowlist when provided', () => {
      const customAllowlist = new Set(['ftp:', 'ssh:'])

      expect(isDangerousProtocol('ftp://example.com', customAllowlist)).toBe(
        false,
      )
      expect(isDangerousProtocol('ssh://example.com', customAllowlist)).toBe(
        false,
      )
      expect(isDangerousProtocol('javascript:alert(1)', customAllowlist)).toBe(
        true,
      )
      expect(isDangerousProtocol('https://example.com', customAllowlist)).toBe(
        true,
      )
    })

    it('should block absolute URLs with an empty allowlist', () => {
      const emptyAllowlist = new Set<string>()
      expect(isDangerousProtocol('javascript:alert(1)', emptyAllowlist)).toBe(
        true,
      )
      expect(isDangerousProtocol('data:text/html,test', emptyAllowlist)).toBe(
        true,
      )
      expect(isDangerousProtocol('https://example.com', emptyAllowlist)).toBe(
        true,
      )
    })

    it('should allow extending the default allowlist', () => {
      const extendedAllowlist = new Set([
        ...DEFAULT_PROTOCOL_ALLOWLIST,
        'ftp:',
        'gopher:',
      ])

      expect(
        isDangerousProtocol('javascript:alert(1)', extendedAllowlist),
      ).toBe(true)
      expect(isDangerousProtocol('ftp://example.com', extendedAllowlist)).toBe(
        false,
      )
      expect(
        isDangerousProtocol('gopher://example.com', extendedAllowlist),
      ).toBe(false)
      expect(
        isDangerousProtocol('https://example.com', extendedAllowlist),
      ).toBe(false)
    })
  })

  describe.each([
    { name: 'default', allowlist: defaultAllowlistSet },
    { name: 'empty', allowlist: new Set<string>() },
    {
      name: 'custom',
      allowlist: new Set(['https:', 'custom+1.-:', 'javascript:']),
    },
  ])('native URL parsing with the $name allowlist', ({ allowlist }) => {
    it.each(['http:', 'https:'])(
      'matches native host resolution around separators with a %s base',
      (protocol) => {
        const base = new NodeURL(`${protocol}//app.example/current`)
        const characters = [
          ...Array.from({ length: 0x80 }, (_, code) =>
            String.fromCharCode(code),
          ),
          '\u0085',
          '\u00a0',
          '\u200b',
          '\u2028',
          '\u2029',
          '\ufeff',
          '\uff0f',
          '\uff3c',
          '\ud800',
          '\udfff',
        ]

        // These inputs have no explicit scheme. If they supply a host, it is
        // different from the base, so native origin changes identify them.
        for (const character of characters) {
          for (const first of ['/', '\\']) {
            for (const second of ['/', '\\']) {
              for (const href of [
                character + first + '\t\n\r' + second + 'evil.example/path',
                first + character + second + 'evil.example/path',
              ]) {
                const resolved = new NodeURL(href, base)
                expect(
                  isDangerousProtocol(href, allowlist),
                  JSON.stringify(href),
                ).toBe(resolved.origin !== base.origin)
              }
            }
          }
        }
      },
    )

    it('allows encoded separators and URL-like text that stays within the current origin', () => {
      const base = new NodeURL('https://app.example/current')
      for (const href of [
        '%2f%2fevil.example',
        '%5c%5cevil.example',
        '/%2f/evil.example',
        '/%5c/evil.example',
        '/%09/evil.example',
        '/.//evil.example',
        '/a/..//evil.example',
        '?next=//evil.example',
        '#javascript:payload',
      ]) {
        expect(new NodeURL(href, base).origin, JSON.stringify(href)).toBe(
          base.origin,
        )
        expect(isDangerousProtocol(href, allowlist), JSON.stringify(href)).toBe(
          false,
        )
      }
    })

    it('blocks protocol-relative URLs even when they resolve to the current host', () => {
      const base = new NodeURL('https://app.example/current')
      for (const href of ['//app.example/target', '/\\app.example/target']) {
        expect(new NodeURL(href, base).origin).toBe(base.origin)
        expect(isDangerousProtocol(href, allowlist), JSON.stringify(href)).toBe(
          true,
        )
      }
    })

    it('checks the normalized explicit scheme against the allowlist', () => {
      for (const href of [
        ' \x00H\tT\nT\rPS://other.example/path',
        '\x01 \nHTtP://other.example/path',
        ' \x1fjava\tsc\nri\rpt:payload',
        '\rCuS\tToM+1.-:payload',
        'MaIl\tTo:user@example.com',
        'Te\nL:+1234567890',
      ]) {
        const scheme = new NodeURL(href).protocol
        expect(isDangerousProtocol(href, allowlist), JSON.stringify(href)).toBe(
          !allowlist.has(scheme),
        )
      }
    })

    it.each([
      ['https://[', 'https:'],
      ['javascript://[', 'javascript:'],
      ['custom+1.-://[', 'custom+1.-:'],
      ['//[', undefined],
    ] as const)(
      'applies the protocol policy despite a malformed URL body in %j',
      (href, scheme) => {
        expect(() => new NodeURL(href, 'https://app.example')).toThrow()
        expect(isDangerousProtocol(href, allowlist)).toBe(
          scheme === undefined || !allowlist.has(scheme),
        )
      },
    )
  })

  describe('DEFAULT_PROTOCOL_ALLOWLIST', () => {
    it('should contain the expected default protocols', () => {
      expect(DEFAULT_PROTOCOL_ALLOWLIST).toEqual([
        'http:',
        'https:',
        'mailto:',
        'tel:',
      ])
    })
  })
})

describe('redirect creation (no protocol validation)', () => {
  it('should allow creating redirect with javascript: protocol', () => {
    expect(() => redirect({ href: 'javascript:alert(1)' })).not.toThrow()
  })

  it('should allow creating redirect with data: protocol', () => {
    expect(() =>
      redirect({ href: 'data:text/html,<script>alert(1)</script>' }),
    ).not.toThrow()
  })

  it('should allow creating redirect with any protocol', () => {
    expect(() => redirect({ href: 'custom:something' })).not.toThrow()
    expect(() =>
      redirect({ href: 'blob:https://example.com/uuid' }),
    ).not.toThrow()
  })

  it('should allow safe protocols', () => {
    expect(() => redirect({ href: 'https://example.com' })).not.toThrow()
    expect(() => redirect({ href: 'http://example.com' })).not.toThrow()
    expect(() => redirect({ href: 'mailto:user@example.com' })).not.toThrow()
  })

  it('should allow redirects without href', () => {
    expect(() => redirect({ to: '/home' })).not.toThrow()
  })
})

describe('public navigation and redirect sinks', () => {
  const customProtocols = [
    'x-safari-https://example.com',
    'googlechromes://example.com',
    'intent://example.com#Intent;scheme=https;end',
    'foo:bar',
  ]

  it.each(customProtocols)(
    'document-navigates to allowlisted protocol %j',
    async (href) => {
      const windowLocation = { href: '', replace: vi.fn() }
      vi.stubGlobal('window', { location: windowLocation })
      const router = createTestRouter({
        routeTree: new BaseRootRoute(),
        history: createMemoryHistory({ initialEntries: ['/'] }),
        origin: 'https://victim.example',
        protocolAllowlist: [
          'x-safari-https:',
          'googlechromes:',
          'intent:',
          'foo:',
        ],
        isServer: false,
      })

      await router.navigate({ href, reloadDocument: true })

      expect(windowLocation.href).toBe(href)
    },
  )

  it.each([...customProtocols, ...unsafeRelativeUrls])(
    'blocks unsafe document destination %j',
    async (href) => {
      const windowLocation = { href: '', replace: vi.fn() }
      vi.stubGlobal('window', { location: windowLocation })
      const router = createTestRouter({
        routeTree: new BaseRootRoute(),
        history: createMemoryHistory({ initialEntries: ['/'] }),
        origin: 'https://victim.example',
        isServer: false,
      })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      if (unsafeRelativeUrls.includes(href)) {
        expect(new URL(href, router.origin).origin).toBe('https://evil.example')
      }

      try {
        for (const replace of [false, true]) {
          await router.navigate({ href, reloadDocument: true, replace })

          expect(windowLocation.href).toBe('')
          expect(windowLocation.replace).not.toHaveBeenCalled()
          expect(router.history.location.href).toBe('/')
          expect(warn).toHaveBeenCalledWith(
            `Blocked navigation to dangerous protocol: ${href}`,
          )
        }
      } finally {
        warn.mockRestore()
      }
    },
  )

  it('validates the Location header emitted by a server redirect', async () => {
    const rootRoute = new BaseRootRoute()
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      loader: () =>
        redirect({
          href: '/safe',
          headers: { Location: '/\\evil.example' },
        }),
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute]),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/source')

    expect(response.status).toBe(500)
    expect(response.headers.get('Location')).toBeNull()
  })

  it('uses a safe explicit Location instead of a stale external href', async () => {
    const rootRoute = new BaseRootRoute()
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      loader: () =>
        redirect({
          href: 'https://other.example/ignored',
          headers: { Location: '/safe' },
        }),
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute]),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/source')

    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe('/safe')
  })

  it('does not emit a protocol-relative canonical Location', async () => {
    const origin = 'https://victim.example'
    const rootRoute = new BaseRootRoute()
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      loader: () => redirect({ href: `${origin}/..//evil.example/path` }),
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([sourceRoute]),
      origin,
      isServer: true,
    })

    const response = await loadServerResponse(router, '/source')

    expect(response.headers.get('Location')).toBe(
      `${origin}//evil.example/path`,
    )
  })

  it.each([false, true])(
    'blocks a dangerous output rewrite with mask=%j',
    async (masked) => {
      const history = createMemoryHistory({ initialEntries: ['/'] })
      const windowLocation = { href: '', replace: vi.fn() }
      vi.stubGlobal('window', { location: windowLocation })
      const publicPath = masked ? '/pretty' : '/target'
      const router = createTestRouter({
        routeTree: new BaseRootRoute(),
        history,
        origin: 'https://victim.example',
        isServer: false,
        rewrite: {
          input: ({ url }) => url,
          output: ({ url }) =>
            url.pathname === publicPath ? new URL('javascript:alert(1)') : url,
        },
      })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await router.navigate({
        to: '/target',
        mask: masked ? { to: '/pretty' } : undefined,
      })

      expect(history.location.href).toBe('/')
      expect(windowLocation.href).toBe('')
      expect(warn).toHaveBeenCalledWith(
        'Blocked navigation to dangerous protocol: javascript:alert(1)',
      )
    },
  )

  it('document-navigates to a safe external masked rewrite', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const windowLocation = { href: '', replace: vi.fn() }
    vi.stubGlobal('window', { location: windowLocation })
    const router = createTestRouter({
      routeTree: new BaseRootRoute(),
      history,
      origin: 'https://victim.example',
      isServer: false,
      rewrite: {
        input: ({ url }) => url,
        output: ({ url }) =>
          url.pathname === '/pretty'
            ? new URL('https://other.example/rewritten')
            : url,
      },
    })

    await router.navigate({ to: '/safe', mask: { to: '/pretty' } })

    expect(history.location.href).toBe('/')
    expect(windowLocation.href).toBe('https://other.example/rewritten')
  })

  it('uses a safe mask for explicit full-document navigation', async () => {
    const windowLocation = { href: '', replace: vi.fn() }
    vi.stubGlobal('window', { location: windowLocation })
    const router = createTestRouter({
      routeTree: new BaseRootRoute(),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      origin: 'https://victim.example',
      isServer: false,
      rewrite: {
        input: ({ url }) => url,
        output: ({ url }) =>
          url.pathname === '/target'
            ? new URL('https://other.example/rewritten')
            : url,
      },
    })

    await router.navigate({
      to: '/target',
      mask: { to: '/pretty' },
      reloadDocument: true,
    })

    expect(windowLocation.href).toBe('/pretty')
  })

  it('provides the raw current location and replace action to document blockers', async () => {
    const history = createMemoryHistory({ initialEntries: ['/current?q=0'] })
    const blockerFn = vi.fn(() => true)
    history.block({ blockerFn })
    const windowLocation = { href: '', replace: vi.fn() }
    vi.stubGlobal('window', { location: windowLocation })
    const router = createTestRouter({
      routeTree: new BaseRootRoute(),
      history,
      origin: 'https://victim.example',
      isServer: false,
    })

    await router.navigate({
      href: 'https://other.example/target',
      replace: true,
    })

    expect(blockerFn).toHaveBeenCalledWith(
      expect.objectContaining({
        currentLocation: expect.objectContaining({
          href: '/current?q=0',
          pathname: '/current',
          search: '?q=0',
        }),
        action: 'REPLACE',
      }),
    )
    expect(windowLocation.replace).not.toHaveBeenCalled()
  })

  it.each([
    { blocked: false, ignoreBlocker: false, unsafe: false },
    { blocked: true, ignoreBlocker: false, unsafe: false },
    { blocked: true, ignoreBlocker: true, unsafe: false },
    { blocked: false, ignoreBlocker: false, unsafe: true },
  ])(
    'only exempts an accepted document navigation from beforeunload: %j',
    async ({ blocked, ignoreBlocker, unsafe }) => {
      const browserWindow = window
      const history = createBrowserHistory({ window: browserWindow })
      const firstBlocker = vi.fn(async () => false)
      const lastBlocker = vi.fn(async () => blocked)
      history.block({ blockerFn: firstBlocker, enableBeforeUnload: true })
      history.block({ blockerFn: lastBlocker, enableBeforeUnload: true })
      const windowLocation = { href: '', replace: vi.fn() }
      vi.stubGlobal('window', { location: windowLocation })
      const router = createTestRouter({
        routeTree: new BaseRootRoute(),
        history,
        origin: 'https://victim.example',
        isServer: false,
      })
      const href = unsafe
        ? 'javascript:alert(1)'
        : 'https://other.example/target'

      try {
        await router.navigate({ href, ignoreBlocker })

        const accepted = !unsafe && (ignoreBlocker || !blocked)
        expect(windowLocation.href).toBe(accepted ? href : '')
        expect(firstBlocker).toHaveBeenCalledTimes(
          ignoreBlocker || unsafe ? 0 : 1,
        )
        expect(lastBlocker).toHaveBeenCalledTimes(
          ignoreBlocker || unsafe ? 0 : 1,
        )

        const beforeUnload = new Event('beforeunload', { cancelable: true })
        browserWindow.dispatchEvent(beforeUnload)
        expect(beforeUnload.defaultPrevented).toBe(!accepted)

        // The exemption must not carry over to a later navigation.
        const nextBeforeUnload = new Event('beforeunload', {
          cancelable: true,
        })
        browserWindow.dispatchEvent(nextBeforeUnload)
        expect(nextBeforeUnload.defaultPrevented).toBe(true)
      } finally {
        history.destroy()
      }
    },
  )
})

describe('getUrlScheme', () => {
  // Generated inputs use valid URL bodies, so a native parse failure must mean
  // the prefix has no explicit scheme. Compare both accepted and rejected inputs.
  function expectNativeScheme(href: string) {
    const expected = NodeURL.canParse(href)
      ? new NodeURL(href).protocol
      : undefined
    expect(getUrlScheme(href), JSON.stringify(href)).toBe(expected)
  }

  it.each([
    ['', undefined],
    ['https', undefined],
    ['javascript:', 'javascript:'],
    ['a:b:payload', 'a:'],
    [' \x00H\tT\nT\rPS://example.com', 'https:'],
    ['CuStOm+1.-\t:value', 'custom+1.-:'],
    ['https\x01://example.com', undefined],
    ['https ://example.com', undefined],
    ['123:payload', undefined],
    ['%6aavascript:payload', undefined],
    ['/path?next=https://example.com', undefined],
    ['?next=javascript:payload', undefined],
    ['#javascript:payload', undefined],
    ['//example.com:443', undefined],
    ['\t\n/\\example.com', undefined],
  ] as const)('extracts only a scheme at the start of %j', (href, scheme) => {
    expect(getUrlScheme(href)).toBe(scheme)
  })

  it.each([
    ['https:', 'https:'],
    ['https://[', 'https:'],
    ['https://example.com:99999', 'https:'],
    ['https::payload', 'https:'],
    ['custom://[', 'custom:'],
  ])(
    'extracts the scheme despite an invalid URL body in %j',
    (href, scheme) => {
      expect(() => new NodeURL(href)).toThrow()
      expect(getUrlScheme(href)).toBe(scheme)
    },
  )

  it.each(unsafeRelativeUrls)(
    'requires a separate safety check for protocol-relative input %j',
    (href) => {
      expect(getUrlScheme(href)).toBeUndefined()
      expect(isDangerousProtocol(href, defaultAllowlistSet)).toBe(true)
    },
  )

  it.each([
    'javascript',
    'HTTPS',
    'http',
    'file',
    'mailto',
    'tel',
    'CuStOm+1.-',
  ])('matches native URL parsing across ASCII boundaries in %s', (scheme) => {
    for (let code = 0; code <= 0x7f; code++) {
      // A second ':' can invalidate the body (e.g. "https::payload").
      // Those cases have explicit expectations above.
      if (code === 0x3a) {
        continue
      }
      const character = String.fromCharCode(code)
      for (let position = 0; position <= scheme.length; position++) {
        expectNativeScheme(
          scheme.slice(0, position) +
            character +
            scheme.slice(position) +
            ':payload',
        )
      }
    }
  })

  it('matches native URL parsing for pairs of leading controls and spaces', () => {
    for (let first = 0; first <= 0x20; first++) {
      for (let second = 0; second <= 0x20; second++) {
        expectNativeScheme(
          String.fromCharCode(first, second) + 'Ja\tVa\nSc\rRiPt:payload',
        )
      }
    }
  })

  it('matches native URL parsing for bounded prefix combinations', () => {
    const alphabet = [
      '\0',
      '\t',
      '\n',
      '\r',
      ' ',
      '\x7f',
      'a',
      'Z',
      '0',
      '+',
      '-',
      '.',
      '_',
      '/',
      '\\',
      '%',
    ]
    function checkPrefixes(prefix: string, remaining: number) {
      expectNativeScheme(prefix + 'x:payload')
      if (!remaining) {
        return
      }
      for (const character of alphabet) {
        checkPrefixes(prefix + character, remaining - 1)
      }
    }
    checkPrefixes('', 3)
  })

  it.each([
    '\u0085',
    '\u00a0',
    '\u1680',
    '\u2000',
    '\u200b',
    '\u2028',
    '\u2029',
    '\u202f',
    '\u205f',
    '\u3000',
    '\ufeff',
    '\u017f',
    '\u212a',
    '\uff28',
    '\uff1a',
    '\ud800',
    '\udfff',
    '\u{1f600}',
  ])('matches native URL parsing with non-ASCII character %j', (character) => {
    expectNativeScheme(character + 'javascript:payload')
    expectNativeScheme('java' + character + 'script:payload')
    expectNativeScheme('javascript' + character + ':payload')
  })
})

describe('integration test on Router', () => {
  const inputs = [
    'x-safari-https://example.com',
    'googlechromes://example.com',
    'intent://example.com#Intent;scheme=https;end',
    'foo:bar',
  ]
  it('should accept weird protocols from the allowlist', () => {
    const router = createTestRouter({
      routeTree: new BaseRootRoute(),
      protocolAllowlist: [
        'x-safari-https:',
        'googlechromes:',
        'intent:',
        'foo:',
      ],
    })
    // Each protocol in the inputs should be accepted by resolveRedirect
    for (const href of inputs) {
      const redir = redirect({ href })
      expect(() => router.resolveRedirect(redir)).not.toThrow()
    }
  })
  it('should block weird protocols not in the allowlist', () => {
    const router = createTestRouter({
      routeTree: new BaseRootRoute(),
      protocolAllowlist: [],
    })
    // Each protocol in the inputs should be blocked by resolveRedirect
    for (const href of inputs) {
      const redir = redirect({ href })
      expect(() => router.resolveRedirect(redir)).toThrow(
        /Redirect blocked: unsafe protocol/,
      )
    }
  })
})
