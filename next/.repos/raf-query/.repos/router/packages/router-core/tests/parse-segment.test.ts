import { expect, test } from 'vitest'
import {
  SEGMENT_TYPE_OPTIONAL_PARAM,
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_WILDCARD,
  parseSegment,
} from '../src/new-process-route-tree'

test('keeps offsets beyond the former 16-bit scratch buffer range', () => {
  const path = `/${'x'.repeat(70_000)}/$id`
  const literal = parseSegment(path, 1, 70_001)
  expect(typeof literal).toBe('string')
  expect(literal.length).toBe(70_000)
  expect(parseSegment(path, 70_002, path.length)).toEqual([
    SEGMENT_TYPE_PARAM,
    'id',
    '',
    '',
  ])
})

test.each([
  [SEGMENT_TYPE_PATHNAME, 'pre{bad}{$id}', '', 'pre{bad}{$id}', ''],
  [SEGMENT_TYPE_PATHNAME, '{-$}', '', '{-$}', ''],
  [SEGMENT_TYPE_PATHNAME, '{--$id}', '', '{--$id}', ''],
  [SEGMENT_TYPE_PARAM, '}pre{$a{b}.txt', '}pre', 'a{b', '.txt'],
  [SEGMENT_TYPE_PARAM, '$id{suffix}', '', 'id{suffix}', ''],
  [SEGMENT_TYPE_PARAM, '{$$}', '', '$', ''],
  [SEGMENT_TYPE_OPTIONAL_PARAM, 'pre{-$a$b}suffix', 'pre', 'a$b', 'suffix'],
  [SEGMENT_TYPE_WILDCARD, 'pre{$}suffix/tail', 'pre', '_splat', 'suffix/tail'],
  [SEGMENT_TYPE_WILDCARD, '$/tail', '', '_splat', ''],
] as const)(
  'preserves the first segment grammar for %s: %s',
  (kind, source, prefix, value, suffix) => {
    const path = `/base/${source}`
    const next = path.indexOf('/', 6)
    const parsed = parseSegment(path, 6, next === -1 ? path.length : next)
    expect(
      typeof parsed === 'string' ? SEGMENT_TYPE_PATHNAME : parsed[0 /* kind */],
    ).toBe(kind)
    expect(typeof parsed === 'string' ? '' : parsed[2 /* prefix */]).toBe(
      prefix,
    )
    expect(typeof parsed === 'string' ? parsed : parsed[1 /* key */]).toBe(
      value,
    )
    expect(
      typeof parsed === 'string' ? '' : (parsed[3 /* suffix */] ?? ''),
    ).toBe(suffix)
  },
)
