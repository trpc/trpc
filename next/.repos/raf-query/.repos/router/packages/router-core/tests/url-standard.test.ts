import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROTOCOL_ALLOWLIST,
  getUrlScheme,
  isDangerousProtocol,
} from '../src/utils'

type UrlFixture = {
  input: string
  protocol?: string
}

const sources = [
  {
    file: 'urltestdata.json',
    sha256: 'b8767904d25029a46e0d297e1320ded3a733322f489caa5a482c886fb11e9238',
  },
  {
    file: 'urltestdata-javascript-only.json',
    sha256: '74eaf2f3b8246b1fe44c388e3ecf8eb8442e01f229418b634acecb9595caddfa',
  },
]
const allowlists = [
  { name: 'default', protocols: new Set(DEFAULT_PROTOCOL_ALLOWLIST) },
  { name: 'empty', protocols: new Set<string>() },
  {
    name: 'custom',
    protocols: new Set([
      'https:',
      'javascript:',
      'non-special:',
      'intent:',
      'a1234567890-+.:',
    ]),
  },
]

// These WPT inputs have a protocol-relative prefix but no valid HTTP(S) host.
const malformedProtocolRelative = new Set(['//', '///', '////', '//C|/foo/bar'])

function getNativeScheme(input: string): string | undefined {
  const colon = input.indexOf(':')
  if (colon === -1) {
    return undefined
  }

  // A valid replacement body lets URL recognize the scheme even when the
  // original host or port is invalid. No base is supplied, so relative prefixes fail.
  try {
    return new NodeURL(`${input.slice(0, colon + 1)}//example.com`).protocol
  } catch {
    return undefined
  }
}

describe.each(sources)('WPT $file', ({ file, sha256 }) => {
  const contents = readFileSync(
    new NodeURL(`./fixtures/wpt-url/${file}`, import.meta.url),
    'utf8',
  )
  // JSON.parse preserves the unpaired surrogates in the JavaScript-only file.
  const entries = JSON.parse(contents) as Array<string | UrlFixture>
  const cases = entries.flatMap((fixture, index) =>
    typeof fixture === 'string' ? [] : [{ ...fixture, index }],
  )

  it('preserves the complete pinned upstream file', () => {
    expect(createHash('sha256').update(contents).digest('hex')).toBe(sha256)
  })

  it.each(cases)('case $index: $input', ({ input, protocol }) => {
    const scheme = getNativeScheme(input)
    if (scheme !== undefined && protocol !== undefined) {
      expect(scheme).toBe(protocol)
    }
    expect(getUrlScheme(input)).toBe(scheme)

    // Ordinary relative paths inherit the two different base hosts; a
    // protocol-relative input supplies its own host, producing the same hostname.
    const protocolRelative =
      scheme === undefined &&
      (malformedProtocolRelative.has(input) ||
        new NodeURL(input, 'https://one.example/').hostname ===
          new NodeURL(input, 'https://two.example/').hostname)

    for (const { name, protocols } of allowlists) {
      // The allowlist and blanket protocol-relative rejection are Router policy.
      const blocked =
        protocolRelative || (scheme !== undefined && !protocols.has(scheme))
      expect(isDangerousProtocol(input, protocols), name).toBe(blocked)
    }
  })
})
