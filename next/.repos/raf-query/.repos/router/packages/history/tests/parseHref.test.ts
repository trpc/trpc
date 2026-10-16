import { describe, expect, test } from 'vitest'
import { parseHref } from '../src'

const baseUrl = new URL('https://victim.example/base')

describe('parseHref', () => {
  test.each(['\x00', '\x01', '\x1f', '\x7f', '\t', '\n', '\r'])(
    'preserves browser path, query, and fragment interpretation for %j',
    (character) => {
      const href = `/a${character}b?q=a${character}b#a${character}b`
      expect(new URL(parseHref(href, undefined).href, baseUrl).href).toBe(
        new URL(href, baseUrl).href,
      )
    },
  )

  test('works', () => {
    const parsed = parseHref('/foo?bar=baz#qux', {} as any)
    expect(parsed.pathname).toEqual('/foo')
    expect(parsed.search).toEqual('?bar=baz')
    expect(parsed.hash).toEqual('#qux')
  })

  test.each([
    ['?x=1', { pathname: '', search: '?x=1', hash: '' }],
    ['#top', { pathname: '', search: '', hash: '#top' }],
    ['?x=1#top', { pathname: '', search: '?x=1', hash: '#top' }],
    ['#top?x=1', { pathname: '', search: '', hash: '#top?x=1' }],
  ])(
    'keeps a leading query or fragment out of the pathname: %j',
    (href, expected) => {
      expect(parseHref(href, undefined)).toMatchObject({ href, ...expected })
    },
  )

  test.each([
    { __TSR_index: 2 },
    { __TSR_index: 2, key: 'legacy-key', __TSR_key: 'current-key' },
  ])('preserves supplied state %j', (state) => {
    Object.freeze(state)
    expect(parseHref('/foo', state).state).toBe(state)
  })

  test('creates independent initial states with matching history keys', () => {
    const first = parseHref('/foo', undefined)
    const second = parseHref('/bar', undefined)

    for (const location of [first, second]) {
      expect(location.state).toEqual({
        __TSR_index: 0,
        key: expect.any(String),
        __TSR_key: location.state.key,
      })
    }

    first.state.__TSR_index = 1
    expect(second.state.__TSR_index).toBe(0)
  })

  describe('open redirect prevention', () => {
    test('strips CR characters to prevent open redirect', () => {
      // If \r (CR) is in the href, it should be stripped
      const parsed = parseHref('/\r/google.com/', undefined)
      expect(parsed.href).toBe('/google.com/')
      expect(parsed.pathname).toBe('/google.com/')
      expect(parsed.href).not.toMatch(/^\/\//)
    })

    test('strips LF characters to prevent open redirect', () => {
      const parsed = parseHref('/\n/evil.com/', undefined)
      expect(parsed.href).toBe('/evil.com/')
      expect(parsed.pathname).toBe('/evil.com/')
      expect(parsed.href).not.toMatch(/^\/\//)
    })

    test('strips CRLF characters to prevent open redirect', () => {
      const parsed = parseHref('/\r\n/evil.com/', undefined)
      expect(parsed.href).toBe('/evil.com/')
      expect(parsed.pathname).toBe('/evil.com/')
      expect(parsed.href).not.toMatch(/^\/\//)
    })

    test('collapses leading double slashes to prevent protocol-relative URLs', () => {
      const parsed = parseHref('//evil.com/path', undefined)
      expect(parsed.href).toBe('/evil.com/path')
      expect(parsed.pathname).toBe('/evil.com/path')
    })

    test('sanitized href resolves safely to same origin', () => {
      const parsed = parseHref('/\r/evil.com/', undefined)
      const url = new URL(parsed.href, 'http://localhost:3000')
      expect(url.origin).toBe('http://localhost:3000')
      expect(url.pathname).toBe('/evil.com/')
    })

    test.each([
      '//evil.com/path',
      '///evil.com/path',
      '/\\evil.com/path',
      '/\\\\evil.com/path',
      '/\\/evil.com/path',
      '\\/evil.com/path',
      '\\\\evil.com/path',
      ' /\\evil.com/path',
      '\x01//evil.com/path',
      '/\t/evil.com/path',
    ])('keeps protocol-relative input %j on the current origin', (href) => {
      const parsed = parseHref(href, undefined)
      const url = new URL(parsed.href, 'https://victim.example')

      expect(url.origin).toBe('https://victim.example')
    })

    test.each([
      'h\x00ttps://evil.example',
      'java\x00script:alert(1)',
      '/\x00/evil.example',
      '\x7f//evil.example',
      '/%5c/evil.example',
      '/%2f/evil.example',
      '?next=//evil.example',
      '#//evil.example',
      '／／evil.example',
      '',
      ' ',
      '\x00',
      '\x00\t\n',
    ])('does not make same-origin input %j cross-origin', (href) => {
      expect(new URL(href, baseUrl).origin).toBe(baseUrl.origin)

      const parsed = parseHref(href, undefined)

      expect(new URL(parsed.href, baseUrl).origin).toBe(baseUrl.origin)
    })

    test('matches WHATWG parsing of protocol-relative prefixes', () => {
      const alphabet = [
        '/',
        '\\',
        '\t',
        '\n',
        '\r',
        '\x00',
        '\x0b',
        ' ',
        '\x7f',
      ]

      for (let length = 0; length <= 4; length++) {
        const count = alphabet.length ** length
        for (let value = 0; value < count; value++) {
          let input = ''
          let cursor = value
          for (let index = 0; index < length; index++) {
            input += alphabet[cursor % alphabet.length]
            cursor = Math.floor(cursor / alphabet.length)
          }
          input += 'evil.example/path'

          try {
            new URL(input, baseUrl)
          } catch {
            continue
          }

          const parsed = parseHref(input, undefined)

          expect(
            new URL(parsed.href, baseUrl).origin,
            JSON.stringify(input),
          ).toBe(baseUrl.origin)
        }
      }
    })

    test('normal paths remain unchanged', () => {
      const parsed = parseHref('/users/profile?id=1#section', undefined)
      expect(parsed.href).toBe('/users/profile?id=1#section')
      expect(parsed.pathname).toBe('/users/profile')
      expect(parsed.search).toBe('?id=1')
      expect(parsed.hash).toBe('#section')
    })
  })
})
