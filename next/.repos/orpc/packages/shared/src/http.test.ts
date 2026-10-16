import {
  isAcceptableEncoding,
  isCompressibleContentType,
  isNoTransformCacheControl,
  matchesHttpPath,
  matchesHttpPathPrefix,
  mergeHttpPath,
  normalizeHttpPath,
  parseAcceptEncodingQualities,
  pathToHttpPath,
  varyByAcceptEncoding,
} from './http'

describe('pathToHttpPath', () => {
  it('produces a leading slash', () => {
    expect(pathToHttpPath([])).toBe('/')
  })

  it('joins plain segments', () => {
    expect(pathToHttpPath(['a', 'b', 'c'])).toBe('/a/b/c')
  })

  it('encodes special characters', () => {
    expect(pathToHttpPath(['hello world', 'foo&bar', '100%'])).toBe(
      '/hello%20world/foo%26bar/100%25',
    )
  })

  it('encodes slashes inside segments', () => {
    expect(pathToHttpPath(['a/b'])).toBe('/a%2Fb')
  })
})

describe('normalizeHttpPath', () => {
  it('normalizes a plain path unchanged', () => {
    expect(normalizeHttpPath('/a/b/c')).toBe('/a/b/c')
  })

  it('decodes and re-encodes an already-encoded path (idempotent)', () => {
    const path = '/hello%20world/foo%26bar'
    expect(normalizeHttpPath(path)).toBe(path)
  })

  it('re-encodes a manually percent-encoded slash in a segment', () => {
    expect(normalizeHttpPath('/a%2Fb')).toBe('/a%2Fb')
  })

  it('handles malformed percent sequences gracefully', () => {
    // safeDecodeURIComponent falls back to the raw string on failure
    expect(normalizeHttpPath('/bad%GGvalue')).toBe('/bad%25GGvalue')
  })

  it('handles paths with no leading slash', () => {
    expect(normalizeHttpPath('a/b')).toBe('/a/b')
  })

  it('canonicalizes redundant percent-encoding', () => {
    // '%54' → 'T', '%41' → 'A'
    // Safe characters are emitted in their decoded form
    expect(normalizeHttpPath('/%54est/%41BC')).toBe('/Test/ABC')
  })

  it('can handle single slash', () => {
    expect(normalizeHttpPath('/')).toEqual('/')
  })

  it('does not remove redundant trailing slash', () => {
    expect(normalizeHttpPath('/a/')).toEqual('/a/')
  })
})

describe('mergeHttpPath', () => {
  it('joins two simple paths', () => {
    expect(mergeHttpPath('/api', '/users')).toBe('/api/users')
  })

  it('joins root with a path', () => {
    expect(mergeHttpPath('/', '/users')).toBe('/users')
  })

  it('joins a path with root', () => {
    expect(mergeHttpPath('/api', '/')).toBe('/api/')
  })

  it('strips trailing slash from `a` before joining', () => {
    expect(mergeHttpPath('/api/', '/users')).toBe('/api/users')
  })

  it('does not double-strip — only removes one trailing slash', () => {
    expect(mergeHttpPath('/api//', '/users')).toBe('/api//users')
  })

  it('handles nested segments in `a`', () => {
    expect(mergeHttpPath('/api/v1', '/users')).toBe('/api/v1/users')
  })

  it('handles nested segments in `b`', () => {
    expect(mergeHttpPath('/api', '/users/123')).toBe('/api/users/123')
  })

  it('handles nested segments in both', () => {
    expect(mergeHttpPath('/api/v2', '/users/profile')).toBe('/api/v2/users/profile')
  })
})

describe('matchesHttpPathPrefix', () => {
  it.each([
    ['/api/users', '/api', true, 'matches nested path segments'],
    ['/api?foo=bar', '/api', true, 'matches query strings'],
    ['/api#section', '/api', true, 'matches hash fragments'],
    ['/api', '/api', true, 'matches exact path'],
    ['/api', '/', true, 'matches prefix is signal slash'],
    ['/api/users', '/api/', true, 'allows prefixes with trailing slash'],
    ['/apiary', '/api', false, 'rejects partial segment matches'],
    ['/other/api', '/api', false, 'rejects non-prefix paths'],
  ] as const)('returns %s for url=%s prefix=%s (%s)', (url, prefix, expected, _description) => {
    expect(matchesHttpPathPrefix(url, prefix)).toBe(expected)
  })
})

describe('matchesHttpPath', () => {
  it.each([
    ['/api', '/api', true, 'matches exact path'],
    ['/api', '/api/', true, 'matches path with end slash'],
    ['/', '/', true, 'matches empty'],
    ['/api?foo=bar', '/api', true, 'matches query strings'],
    ['/api#section', '/api', true, 'matches hash fragments'],
    ['/api/', '/api', true, 'matches trailing slash path variants'],
    ['/api/users', '/api', false, 'rejects longer paths 1'],
    ['/api/users', '/', false, 'rejects longer paths 2'],
    ['/apiary', '/api', false, 'rejects partial segment matches'],
    ['/other/api', '/api', false, 'rejects non-prefix paths'],
  ] as const)('returns %s for url=%s path=%s (%s)', (url, path, expected, _description) => {
    expect(matchesHttpPath(url, path)).toBe(expected)
  })
})

describe('isCompressibleContentType', () => {
  it('returns false for null/undefined/empty/whitespace', () => {
    expect(isCompressibleContentType(null)).toBe(false)
    expect(isCompressibleContentType(undefined)).toBe(false)
    expect(isCompressibleContentType('')).toBe(false)
    expect(isCompressibleContentType('   ')).toBe(false)
  })

  it.each([
    'text/plain',
    'text/html; charset=utf-8',
    'application/json',
    'application/javascript',
    'application/xml-dtd',
    'application/x-www-form-urlencoded',
    'font/otf',
    'image/bmp',
    'image/x-icon',
    'message/rfc822',
    'model/gltf-binary',
    'x-shader/x-fragment',
    'application/vnd.api+json', // generic +suffix rule
    'image/svg+xml',
    '  text/plain', // leading whitespace
    'APPLICATION/JSON', // case-insensitive
  ])('returns true for %s', (contentType) => {
    expect(isCompressibleContentType(contentType)).toBe(true)
  })

  it.each([
    'text/event-stream', // explicitly excluded
    'font/woff', // not in allow-list
    'image/png',
    'application/octet-stream',
    'application/pdf',
    'application/zip',
    'application/vnd.api+zip', // +suffix not json/text/xml/yaml
    'application/jsonline', // prefix match should not count
    'video/mp4',
  ])('returns false for %s', (contentType) => {
    expect(isCompressibleContentType(contentType)).toBe(false)
  })

  it('treats "event-stream" exclusion as exact subtype only', () => {
    expect(isCompressibleContentType('text/event-streaming')).toBe(true)
  })

  it('returns false for excessively long content-type values without running the regex', () => {
    expect(isCompressibleContentType(`text/plain; ${'a'.repeat(1024)}`)).toBe(false)
  })
})

describe('parseAcceptEncodingQualities', () => {
  it('defaults an unqualified coding to 1', () => {
    expect(parseAcceptEncodingQualities('gzip, br')).toEqual(new Map([['gzip', 1], ['br', 1]]))
  })

  it('parses q-values, where 0 means the coding is unacceptable', () => {
    expect(parseAcceptEncodingQualities('gzip;q=0, br;q=0.8, zstd;q=1.0')).toEqual(
      new Map([['gzip', 0], ['br', 0.8], ['zstd', 1]]),
    )
  })

  it('normalizes case and whitespace, and keeps the wildcard under its own key', () => {
    expect(parseAcceptEncodingQualities(' GZIP ; Q=0 , * ')).toEqual(new Map([['gzip', 0], ['*', 1]]))
  })

  it('ignores parameters that are not q-values', () => {
    expect(parseAcceptEncodingQualities('gzip;a=1;q=0.5, br;a=1')).toEqual(new Map([['gzip', 0.5], ['br', 1]]))
  })

  it('skips empty list elements', () => {
    expect(parseAcceptEncodingQualities('gzip,, , br')).toEqual(new Map([['gzip', 1], ['br', 1]]))
  })

  it('returns an empty map for a missing or empty header', () => {
    expect(parseAcceptEncodingQualities(undefined)).toEqual(new Map())
    expect(parseAcceptEncodingQualities('')).toEqual(new Map())
  })
})

describe('isAcceptableEncoding', () => {
  it.each([
    ['gzip', 'gzip', true],
    ['gzip;q=0', 'gzip', false],
    ['br', 'gzip', false],
    ['*', 'gzip', true],
    ['*;q=0', 'gzip', false],
    ['gzip;q=0, *', 'gzip', false],
    ['gzip;q=0, *', 'deflate', true],
    ['gzip, *;q=0', 'gzip', true],
    [undefined, 'gzip', false],
  ] as const)('given %s, %s is acceptable: %s', (header, coding, expected) => {
    expect(isAcceptableEncoding(parseAcceptEncodingQualities(header), coding)).toBe(expected)
  })
})

describe('varyByAcceptEncoding', () => {
  it('adds the field when the header is missing', () => {
    expect(varyByAcceptEncoding(undefined)).toBe('accept-encoding')
  })

  it('appends to an existing header', () => {
    expect(varyByAcceptEncoding('origin')).toBe('origin, accept-encoding')
  })

  it('does not repeat a field that is already listed, whatever its case', () => {
    expect(varyByAcceptEncoding('Origin, Accept-Encoding')).toBe('Origin, Accept-Encoding')
  })

  it('leaves a wildcard alone, because narrowing it would be a downgrade', () => {
    expect(varyByAcceptEncoding('*')).toBe('*')
  })
})

describe('isNoTransformCacheControl', () => {
  it('detects the directive among others', () => {
    expect(isNoTransformCacheControl('public, no-transform, max-age=60')).toBe(true)
    expect(isNoTransformCacheControl('NO-TRANSFORM')).toBe(true)
  })

  it('returns false for a missing header or an unrelated directive', () => {
    expect(isNoTransformCacheControl(undefined)).toBe(false)
    expect(isNoTransformCacheControl('public, max-age=60')).toBe(false)
  })

  it('does not match a directive that merely contains the token', () => {
    expect(isNoTransformCacheControl('no-transform-extension')).toBe(false)
  })
})
