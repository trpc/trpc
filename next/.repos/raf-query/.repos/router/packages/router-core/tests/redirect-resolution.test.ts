import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, test } from 'vitest'
import { BaseRootRoute, redirect } from '../src'
import { createTestRouter } from './routerTestUtils'

function createRouter(protocolAllowlist?: Array<string>) {
  return createTestRouter({
    routeTree: new BaseRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    origin: 'https://app.example',
    protocolAllowlist,
    isServer: true,
  })
}

describe('redirect destination classification', () => {
  const cases = [
    [
      '/target?next=https://other.example#section',
      '/target?next=https://other.example#section',
      false,
    ],
    ['https://other.example/target', 'https://other.example/target', true],
    ['http://app.example/target', 'http://app.example/target', true],
    ['https://app.example:444/target', 'https://app.example:444/target', true],
    ['mailto:person@example.com', 'mailto:person@example.com', true],
    ['tel:+123456789', 'tel:+123456789', true],
    [
      'https://user@app.example/target',
      'https://user@app.example/target',
      true,
    ],
    [
      'https://:password@app.example/target',
      'https://:password@app.example/target',
      true,
    ],
    [
      'HTTPS://APP.EXAMPLE:443//other.example/path',
      'https://app.example//other.example/path',
      true,
    ],
    ['HTTPS://OTHER.EXAMPLE:443//path', 'https://other.example//path', true],
  ] as const

  const sameOriginDocumentCases = [
    ['https://app.example/target?q=1#section', '/target?q=1#section', false],
    ['HTTPS://APP.EXAMPLE:443/a/../target', '/target', false],
    ['h\tttps://app.example/target', '/target', false],
    ['\x01H\tTtPs://app.example/a/../target', '/target', false],
    ['https://@app.example/target', '/target', false],
    ['https://app.example/%2Fpath', '/%2Fpath', false],
    ['https://app.example/%5Cpath', '/%5Cpath', false],
  ] as const

  for (const reloadDocument of [undefined, false, true]) {
    test.each([...cases, ...sameOriginDocumentCases])(
      `resolves %j with reloadDocument=${reloadDocument}`,
      (href, expectedHref, external) => {
        const router = createRouter()
        const result = router.resolveRedirect(
          redirect({ href, reloadDocument }),
        )
        expect(result.options.href).toBe(expectedHref)
        expect(result.headers.get('Location')).toBe(expectedHref)
        expect(result.options.reloadDocument).toBe(
          external ? true : reloadDocument,
        )
        expect(router.resolveRedirect(result)).toBe(result)
        expect(result.headers.get('Location')).toBe(expectedHref)
        expect(result.options.href).toBe(expectedHref)
        expect(result.options.reloadDocument).toBe(
          external ? true : reloadDocument,
        )
      },
    )
  }

  test.each([
    '//other.example/path',
    '//other.example:443/path',
    '/\\other.example/path',
    '\\\\other.example/path',
    '/\t/other.example/path',
    'javascript:alert(1)',
    'java\tscript:alert(1)',
    'custom:value',
    '\x01Ja\tvaScript:alert(1)',
    '\x01/\\other.example/path',
  ])('rejects the unsafe destination %j', (href) => {
    expect(() => createRouter().resolveRedirect(redirect({ href }))).toThrow(
      'Redirect blocked',
    )
  })

  test.each(['custom://[', 'blob:https://app.example/id'])(
    'keeps an explicitly allowed non-HTTP destination opaque: %s',
    (href) => {
      const router = createRouter(['custom:', 'blob:'])
      const result = router.resolveRedirect(redirect({ href }))
      expect(result.options.href).toBe(href)
      expect(result.options.reloadDocument).toBe(true)
    },
  )

  test('does not implicitly allow HTTP when the configured allowlist excludes it', () => {
    expect(() =>
      createRouter([]).resolveRedirect(
        redirect({ href: 'https://app.example/target' }),
      ),
    ).toThrow('Redirect blocked')
  })

  test('classifies the Location header that takes precedence over options.href', () => {
    const router = createRouter()
    const result = router.resolveRedirect(
      redirect({
        href: 'javascript:alert(1)',
        headers: { Location: 'https://app.example/target' },
      }),
    )
    expect(result.options.href).toBe('/target')
    expect(result.options.reloadDocument).toBeUndefined()
    expect(() =>
      router.resolveRedirect(
        redirect({
          href: '/safe',
          headers: { Location: '//other.example/path' },
        }),
      ),
    ).toThrow('Redirect blocked')
  })

  test('rejects an obfuscated scheme in the authoritative Location header', () => {
    expect(() =>
      createRouter().resolveRedirect(
        redirect({
          href: '/safe',
          headers: { Location: '\x01Ja\tvaScript:alert(1)' },
        }),
      ),
    ).toThrow('Redirect blocked')
  })
})
