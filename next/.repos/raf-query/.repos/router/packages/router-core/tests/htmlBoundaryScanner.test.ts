import { describe, expect, test } from 'vitest'
import {
  HYDRATION_SCRIPT_BOUNDARY_ANCHOR_INDEX,
  HYDRATION_SCRIPT_BOUNDARY_BYTES,
  createHydrationScripts,
} from '../src/ssr/hydrationScripts'
import {
  DOCUMENT_CLOSE_ANCHOR_INDEX,
  DOCUMENT_CLOSE_BYTES,
  SCRIPT_CLOSE,
  SCRIPT_CLOSE_ANCHOR_INDEX,
  SCRIPT_CLOSE_BYTES,
  advanceByteMatcher,
  findExactBytes,
  getExactBytesPrefixAtEnd,
} from '../src/ssr/htmlBoundaryScanner'
import type { ByteMatcherState } from '../src/ssr/htmlBoundaryScanner'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const DOCUMENT_CLOSE = decoder.decode(DOCUMENT_CLOSE_BYTES)
const HYDRATION_SCRIPT_BOUNDARY_SUFFIX = decoder.decode(
  HYDRATION_SCRIPT_BOUNDARY_BYTES,
)
const HYDRATION_SCRIPT_BOUNDARY_SOURCE = createHydrationScripts(
  undefined,
  [],
).takeInitialHydrationScriptTags()!.boundary.children!

function chunksAtEverySplit(value: Uint8Array) {
  return Array.from({ length: value.length + 1 }, (_, split) => [
    value.subarray(0, split),
    value.subarray(split),
  ])
}

function matcherFor(pattern: Uint8Array, anchorIndex = 0): ByteMatcherState {
  return { pattern, anchorIndex, matched: 0 }
}

describe('SSR exact byte matcher', () => {
  test.each([
    [
      'router boundary',
      HYDRATION_SCRIPT_BOUNDARY_BYTES,
      HYDRATION_SCRIPT_BOUNDARY_ANCHOR_INDEX,
    ],
    ['script close', SCRIPT_CLOSE_BYTES, SCRIPT_CLOSE_ANCHOR_INDEX],
  ])('matches %s at every two-chunk split', (_, pattern, anchorIndex) => {
    for (const chunks of chunksAtEverySplit(pattern)) {
      const matcher = matcherFor(pattern, anchorIndex)
      let matches = 0
      for (const chunk of chunks) {
        if (advanceByteMatcher(matcher, chunk) !== undefined) {
          matches++
        }
      }
      expect(matches).toBe(1)
    }
  })

  test.each([
    [
      'router boundary',
      HYDRATION_SCRIPT_BOUNDARY_BYTES,
      HYDRATION_SCRIPT_BOUNDARY_ANCHOR_INDEX,
    ],
    ['script close', SCRIPT_CLOSE_BYTES, SCRIPT_CLOSE_ANCHOR_INDEX],
  ])('matches byte-at-a-time %s input', (_, pattern, anchorIndex) => {
    const matcher = matcherFor(pattern, anchorIndex)
    let matches = 0
    for (const byte of pattern) {
      if (advanceByteMatcher(matcher, Uint8Array.of(byte)) !== undefined) {
        matches++
      }
    }
    expect(matches).toBe(1)
  })

  test('returns the local end offset and keeps the unconsumed suffix', () => {
    const matcher = matcherFor(SCRIPT_CLOSE_BYTES)
    const prefix = encoder.encode('prefix')
    const suffix = encoder.encode('<next>')
    const value = new Uint8Array(
      prefix.length + SCRIPT_CLOSE_BYTES.length + suffix.length,
    )
    value.set(prefix)
    value.set(SCRIPT_CLOSE_BYTES, prefix.length)
    value.set(suffix, prefix.length + SCRIPT_CLOSE_BYTES.length)

    const end = advanceByteMatcher(matcher, value)
    expect(end).toBe(prefix.length + SCRIPT_CLOSE_BYTES.length)
    expect(new TextDecoder().decode(value.subarray(end))).toBe('<next>')
  })

  test('can find the last complete match without stopping at the first', () => {
    const matcher = matcherFor(SCRIPT_CLOSE_BYTES, SCRIPT_CLOSE_ANCHOR_INDEX)
    const value = encoder.encode('</script><div></div></script><next>')

    const end = advanceByteMatcher(matcher, value, 0, true)
    expect(new TextDecoder().decode(value.subarray(0, end))).toBe(
      '</script><div></div></script>',
    )
  })

  test.each([
    [
      'router boundary',
      HYDRATION_SCRIPT_BOUNDARY_BYTES,
      HYDRATION_SCRIPT_BOUNDARY_ANCHOR_INDEX,
    ],
    ['script close', SCRIPT_CLOSE_BYTES, SCRIPT_CLOSE_ANCHOR_INDEX],
  ])('%s satisfies the matcher invariants', (_, pattern, anchorIndex) => {
    expect(pattern.length).toBeGreaterThan(0)
    expect(pattern.indexOf(pattern[0]!, 1)).toBe(-1)
    expect(anchorIndex).toBeGreaterThanOrEqual(0)
    expect(anchorIndex).toBeLessThan(pattern.length)
  })

  test.each(['one chunk', 'split after the old overlapping prefix'])(
    'ignores marker text without the fixed semicolon in %s',
    (shape) => {
      const markerAndClose = HYDRATION_SCRIPT_BOUNDARY_BYTES.subarray(1)
      const value = new Uint8Array(24 + markerAndClose.length - 1)
      value.set(markerAndClose.subarray(0, 24))
      value.set(markerAndClose.subarray(1), 24)
      const chunks =
        shape === 'one chunk'
          ? [value]
          : [value.subarray(0, 24), value.subarray(24)]
      const matcher = matcherFor(
        HYDRATION_SCRIPT_BOUNDARY_BYTES,
        HYDRATION_SCRIPT_BOUNDARY_ANCHOR_INDEX,
      )

      let consumed = 0
      let matchEnd: number | undefined
      for (const chunk of chunks) {
        const localEnd = advanceByteMatcher(matcher, chunk)
        if (localEnd !== undefined) {
          matchEnd = consumed + localEnd
        }
        consumed += chunk.length
      }

      expect(matchEnd).toBeUndefined()
    },
  )

  test.each(['one chunk', 'split before the valid boundary'])(
    'restarts at a valid boundary after a near match in %s',
    (shape) => {
      const nearMatch = HYDRATION_SCRIPT_BOUNDARY_BYTES.subarray(0, 12)
      const value = new Uint8Array(
        nearMatch.length + HYDRATION_SCRIPT_BOUNDARY_BYTES.length,
      )
      value.set(nearMatch)
      value.set(HYDRATION_SCRIPT_BOUNDARY_BYTES, nearMatch.length)
      const chunks =
        shape === 'one chunk'
          ? [value]
          : [
              value.subarray(0, nearMatch.length),
              value.subarray(nearMatch.length),
            ]
      const matcher = matcherFor(
        HYDRATION_SCRIPT_BOUNDARY_BYTES,
        HYDRATION_SCRIPT_BOUNDARY_ANCHOR_INDEX,
      )

      let consumed = 0
      let matchEnd: number | undefined
      for (const chunk of chunks) {
        const localEnd = advanceByteMatcher(matcher, chunk)
        if (localEnd !== undefined) {
          matchEnd = consumed + localEnd
        }
        consumed += chunk.length
      }

      expect(matchEnd).toBe(value.length)
    },
  )

  test('reset drops an incomplete match', () => {
    const matcher = matcherFor(SCRIPT_CLOSE_BYTES)
    expect(
      advanceByteMatcher(matcher, SCRIPT_CLOSE_BYTES.subarray(0, 5)),
    ).toBeUndefined()
    matcher.matched = 0
    expect(
      advanceByteMatcher(matcher, SCRIPT_CLOSE_BYTES.subarray(5)),
    ).toBeUndefined()
  })
})

describe('SSR exact byte helpers', () => {
  test('scanner boundary is the exact end of the emitted script', () => {
    expect(HYDRATION_SCRIPT_BOUNDARY_SUFFIX.endsWith(SCRIPT_CLOSE)).toBe(true)
    expect(
      HYDRATION_SCRIPT_BOUNDARY_SOURCE.endsWith(
        HYDRATION_SCRIPT_BOUNDARY_SUFFIX.slice(0, -SCRIPT_CLOSE.length),
      ),
    ).toBe(true)
    expect(HYDRATION_SCRIPT_BOUNDARY_BYTES).toEqual(
      encoder.encode(HYDRATION_SCRIPT_BOUNDARY_SUFFIX),
    )
  })

  test('anchors document-close scans on the uncommon y byte', () => {
    expect(DOCUMENT_CLOSE_ANCHOR_INDEX).toBe(DOCUMENT_CLOSE.indexOf('y'))
  })

  test('finds a complete sequence without decoding or copying', () => {
    const prefix = encoder.encode('abc')
    const value = new Uint8Array(
      prefix.length + DOCUMENT_CLOSE_BYTES.length + 1,
    )
    value.set(prefix)
    value.set(DOCUMENT_CLOSE_BYTES, prefix.length)
    value[value.length - 1] = 120

    expect(findExactBytes(value, DOCUMENT_CLOSE_BYTES)).toBe(prefix.length)
    expect(findExactBytes(value, DOCUMENT_CLOSE_BYTES, prefix.length + 1)).toBe(
      -1,
    )
  })

  test('reports every incomplete document-close suffix', () => {
    for (let length = 1; length < DOCUMENT_CLOSE_BYTES.length; length++) {
      const prefix = encoder.encode('application')
      const value = new Uint8Array(prefix.length + length)
      value.set(prefix)
      value.set(DOCUMENT_CLOSE_BYTES.subarray(0, length), prefix.length)

      expect(getExactBytesPrefixAtEnd(value, DOCUMENT_CLOSE_BYTES)).toBe(
        prefix.length,
      )
    }
  })

  test('uses the longest suffix when the pattern prefix overlaps', () => {
    const pattern = encoder.encode('abab')
    const value = encoder.encode('xxaba')
    expect(getExactBytesPrefixAtEnd(value, pattern)).toBe(2)
  })

  test('returns no suffix for a final mismatch', () => {
    expect(
      getExactBytesPrefixAtEnd(
        encoder.encode('application'),
        SCRIPT_CLOSE_BYTES,
      ),
    ).toBeUndefined()
  })
})
