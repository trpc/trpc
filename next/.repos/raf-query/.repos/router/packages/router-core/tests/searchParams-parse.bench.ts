import { bench, describe, expect } from 'vitest'
import { defaultParseSearch, parseSearchWith } from '../src'

const iterations = 1_000

const ordinaryStrings = {
  tab: 'specs',
  filter: 'available',
  category: 'hardware',
  sort: 'newest',
}
const nonLiteralInitialStrings = {
  tab: 'specs',
  filter: 'available',
  category: 'hardware',
  sort: 'descending',
}
const jsonInitialStrings = {
  filter: 'foo',
  notification: 'new',
  tab: 'tabular',
  empty: '',
}
const emptyStrings = {
  first: '',
  second: '',
  third: '',
  fourth: '',
}
const punctuationStrings = {
  file: '.env',
  path: '/products',
  positive: '+1',
  priority: '!important',
}
const nonLiteralPrefixStrings = {
  first: 'future',
  second: 'framework',
  third: 'name',
  fourth: 'table',
}
const jsonLiteralPrefixStrings = {
  first: 'favorite',
  second: 'number',
  third: 'travel',
  fourth: 'nullish',
}
const jsonLiteralWordStrings = {
  truthy: 'true_value',
  falsy: 'false_value',
  nullable: 'null_value',
}
const jsonLiteralBoundaryStrings = {
  truthy: 'true-value',
  falsy: 'false/value',
  nullable: 'null.value',
}
const jsonStrings = {
  number: '123',
  boolean: 'true',
  object: '{"nested":true}',
  array: '[1,2,3]',
}
const mixedValues = {
  tab: 'specs',
  page: '2',
  filters: 'available',
  exactPage: '2',
}

function toSearchString(search: Record<string, string>): string {
  return new URLSearchParams(search).toString()
}

let benchmarkSink = 0

// Correctness expectations for the parse side.
expect(defaultParseSearch(toSearchString(ordinaryStrings))).toEqual(
  ordinaryStrings,
)
expect(defaultParseSearch(toSearchString(nonLiteralInitialStrings))).toEqual(
  nonLiteralInitialStrings,
)
expect(defaultParseSearch(toSearchString(jsonInitialStrings))).toEqual(
  jsonInitialStrings,
)
expect(defaultParseSearch(toSearchString(emptyStrings))).toEqual(emptyStrings)
expect(defaultParseSearch(toSearchString(punctuationStrings))).toEqual({
  ...punctuationStrings,
  positive: '+1',
})
expect(defaultParseSearch(toSearchString(nonLiteralPrefixStrings))).toEqual(
  nonLiteralPrefixStrings,
)
expect(defaultParseSearch(toSearchString(jsonLiteralPrefixStrings))).toEqual(
  jsonLiteralPrefixStrings,
)
expect(defaultParseSearch(toSearchString(jsonLiteralWordStrings))).toEqual(
  jsonLiteralWordStrings,
)
expect(defaultParseSearch(toSearchString(jsonLiteralBoundaryStrings))).toEqual(
  jsonLiteralBoundaryStrings,
)
expect(defaultParseSearch(toSearchString(jsonStrings))).toEqual({
  number: 123,
  boolean: true,
  object: { nested: true },
  array: [1, 2, 3],
})

function parseBatch(searchStr: string, parse = defaultParseSearch) {
  let size = 0
  for (let index = 0; index < iterations; index++) {
    size += Object.keys(parse(searchStr)).length
  }
  benchmarkSink = size
}

const decodedPrimitives = {
  number: '123',
  negative: '-1',
  yes: 'true',
  no: 'false',
}
const parsedJson = {
  nil: 'null',
  quoted: '"hello"',
  exponent: '1e2',
  negativeZero: '-0',
}
const whitespaceJson = {
  yes: ' true ',
  nil: '\tnull',
  array: '\n[1]',
  object: '\r{}',
}
const malformedJson = { object: '{', array: '[', quoted: '"', number: '1e' }

expect(defaultParseSearch(toSearchString(decodedPrimitives))).toEqual({
  number: 123,
  negative: -1,
  yes: true,
  no: false,
})
expect(defaultParseSearch(toSearchString(parsedJson))).toEqual({
  nil: null,
  quoted: 'hello',
  exponent: 100,
  negativeZero: -0,
})
expect(defaultParseSearch(toSearchString(whitespaceJson))).toEqual({
  yes: true,
  nil: null,
  array: [1],
  object: {},
})
expect(defaultParseSearch(toSearchString(malformedJson))).toEqual(malformedJson)
expect(defaultParseSearch(toSearchString(mixedValues))).toEqual({
  tab: 'specs',
  page: 2,
  filters: 'available',
  exactPage: 2,
})

// Encode fixtures before timing so the benchmark measures parsing alone.
const searches = Object.fromEntries(
  Object.entries({
    ordinaryStrings,
    nonLiteralInitialStrings,
    jsonInitialStrings,
    emptyStrings,
    punctuationStrings,
    nonLiteralPrefixStrings,
    jsonLiteralPrefixStrings,
    jsonLiteralWordStrings,
    jsonLiteralBoundaryStrings,
    jsonStrings,
    mixedValues,
    decodedPrimitives,
    parsedJson,
    whitespaceJson,
    malformedJson,
  }).map(([name, values]) => [name, toSearchString(values)]),
)

describe('default search parsing', () => {
  bench('ordinary string values', () => {
    parseBatch(searches.ordinaryStrings!)
  })

  bench('ordinary strings outside JSON-literal initials', () => {
    parseBatch(searches.nonLiteralInitialStrings!)
  })

  bench('ordinary strings with JSON-literal initials', () => {
    parseBatch(searches.jsonInitialStrings!)
  })

  bench('empty string values', () => {
    parseBatch(searches.emptyStrings!)
  })

  bench('ordinary strings with non-JSON punctuation starts', () => {
    parseBatch(searches.punctuationStrings!)
  })

  bench('ordinary f/n/t words outside JSON-literal prefixes', () => {
    parseBatch(searches.nonLiteralPrefixStrings!)
  })

  bench('application words with JSON-literal prefixes', () => {
    parseBatch(searches.jsonLiteralPrefixStrings!)
  })

  bench('application words with complete JSON-literal prefixes', () => {
    parseBatch(searches.jsonLiteralWordStrings!)
  })

  bench('JSON-literal prefixes followed by punctuation', () => {
    parseBatch(searches.jsonLiteralBoundaryStrings!)
  })

  bench('JSON-compatible string values', () => {
    parseBatch(searches.jsonStrings!)
  })

  bench('mixed application values', () => {
    parseBatch(searches.mixedValues!)
  })
  bench('primitives already converted by decode', () => {
    parseBatch(searches.decodedPrimitives!)
  })
  bench('strings requiring JSON.parse', () => {
    parseBatch(searches.parsedJson!)
  })
  bench('JSON with leading whitespace', () => {
    parseBatch(searches.whitespaceJson!)
  })
  bench('malformed JSON retains original strings', () => {
    parseBatch(searches.malformedJson!)
  })
})

const customParse = parseSearchWith((value) => value.toUpperCase())
expect(customParse(searches.ordinaryStrings!)).toEqual({
  tab: 'SPECS',
  filter: 'AVAILABLE',
  category: 'HARDWARE',
  sort: 'NEWEST',
})
bench('custom search parser ordinary strings', () => {
  parseBatch(searches.ordinaryStrings!, customParse)
})

const throwingParse = parseSearchWith(() => {
  throw new Error('not parseable')
})
expect(throwingParse(searches.ordinaryStrings!)).toEqual(ordinaryStrings)
bench('custom search parser rejected strings', () => {
  parseBatch(searches.ordinaryStrings!, throwingParse)
})

const encodedMixed = new URLSearchParams([
  ['tab', 'specs'],
  ['page', '2'],
  ['quoted', '"2"'],
  ['filters', '{"available":true}'],
  ['q', 'hello world'],
  ['category', 'favorite'],
  ['tag', 'one'],
  ['tag', 'two'],
]).toString()
expect(defaultParseSearch(encodedMixed)).toEqual({
  tab: 'specs',
  page: 2,
  quoted: '2',
  filters: { available: true },
  q: 'hello world',
  category: 'favorite',
  tag: ['one', 'two'],
})
bench('encoded mixed search with repeated keys', () => {
  parseBatch(encodedMixed)
})

void benchmarkSink
