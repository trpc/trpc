import { bench, describe, expect } from 'vitest'
import { defaultStringifySearch } from '../src'

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
  page: 2,
  filters: ['available', 'featured'],
  exactPage: '2',
}
let benchmarkSink = 0

expect(defaultStringifySearch(ordinaryStrings)).toBe(
  '?tab=specs&filter=available&category=hardware&sort=newest',
)
expect(defaultStringifySearch(nonLiteralInitialStrings)).toBe(
  '?tab=specs&filter=available&category=hardware&sort=descending',
)
expect(defaultStringifySearch(jsonInitialStrings)).toBe(
  '?filter=foo&notification=new&tab=tabular&empty=',
)
expect(defaultStringifySearch(emptyStrings)).toBe(
  '?first=&second=&third=&fourth=',
)
expect(defaultStringifySearch(punctuationStrings)).toBe(
  '?file=.env&path=%2Fproducts&positive=%2B1&priority=%21important',
)
expect(defaultStringifySearch(nonLiteralPrefixStrings)).toBe(
  '?first=future&second=framework&third=name&fourth=table',
)
expect(defaultStringifySearch(jsonLiteralPrefixStrings)).toBe(
  '?first=favorite&second=number&third=travel&fourth=nullish',
)
expect(defaultStringifySearch(jsonLiteralWordStrings)).toBe(
  '?truthy=true_value&falsy=false_value&nullable=null_value',
)
expect(defaultStringifySearch(jsonLiteralBoundaryStrings)).toBe(
  '?truthy=true-value&falsy=false%2Fvalue&nullable=null.value',
)
expect(defaultStringifySearch(jsonStrings)).toBe(
  '?number=%22123%22&boolean=%22true%22&object=%22%7B%5C%22nested%5C%22%3Atrue%7D%22&array=%22%5B1%2C2%2C3%5D%22',
)
expect(defaultStringifySearch(mixedValues)).toBe(
  '?tab=specs&page=2&filters=%5B%22available%22%2C%22featured%22%5D&exactPage=%222%22',
)

function stringifyBatch(search: Record<string, unknown>) {
  let size = 0
  for (let index = 0; index < iterations; index++) {
    size += defaultStringifySearch(search).length
  }
  benchmarkSink = size
}

describe('default search serialization', () => {
  bench('empty object', () => {
    stringifyBatch({})
  })

  bench('only undefined values', () => {
    stringifyBatch({ first: undefined, second: undefined })
  })

  bench('ordinary string values', () => {
    stringifyBatch(ordinaryStrings)
  })

  bench('ordinary strings outside JSON-literal initials', () => {
    stringifyBatch(nonLiteralInitialStrings)
  })

  bench('ordinary strings with JSON-literal initials', () => {
    stringifyBatch(jsonInitialStrings)
  })

  bench('empty string values', () => {
    stringifyBatch(emptyStrings)
  })

  bench('ordinary strings with non-JSON punctuation starts', () => {
    stringifyBatch(punctuationStrings)
  })

  bench('ordinary f/n/t words outside JSON-literal prefixes', () => {
    stringifyBatch(nonLiteralPrefixStrings)
  })

  bench('application words with JSON-literal prefixes', () => {
    stringifyBatch(jsonLiteralPrefixStrings)
  })

  bench('application words with complete JSON-literal prefixes', () => {
    stringifyBatch(jsonLiteralWordStrings)
  })

  bench('JSON-literal prefixes followed by punctuation', () => {
    stringifyBatch(jsonLiteralBoundaryStrings)
  })

  bench('JSON-compatible string values', () => {
    stringifyBatch(jsonStrings)
  })

  bench('mixed application values', () => {
    stringifyBatch(mixedValues)
  })
})

void benchmarkSink
