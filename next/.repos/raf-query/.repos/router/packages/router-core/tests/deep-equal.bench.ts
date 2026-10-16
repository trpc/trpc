import { bench, describe, expect } from 'vitest'
import { deepEqual } from '../src/utils'

// Workloads modeled on the router's callers: Link inline-option stabilization
// (`explicitUndefined`), active-state search comparison (`partial`),
// matchRoute params (`partial`), and search-middleware value comparisons.
// Inputs rotate over a pool so a single hidden-class or cached shape does not
// dominate; the "fresh" cases build their incoming value inside the timed op.
//
// Always compare implementations with the whole file in one process: the
// cases share `deepEqual`'s type feedback and inlining decisions, and a `-t`
// subset can rank variants very differently from the mixed-mode reality.

const search = { page: 1, sort: 'asc', filter: 'open', tags: ['a', 'b'] }
const searchEqual = Array.from({ length: 32 }, () => ({
  page: 1,
  sort: 'asc',
  filter: 'open',
  tags: ['a', 'b'],
}))
const searchChangedLate = Array.from({ length: 32 }, () => ({
  page: 1,
  sort: 'asc',
  filter: 'open',
  tags: ['a', 'c'],
}))
const searchChangedEarly = Array.from({ length: 32 }, () => ({
  page: 2,
  sort: 'asc',
  filter: 'open',
  tags: ['a', 'b'],
}))
const nested = {
  user: { id: 7, roles: ['admin', 'editor'], prefs: { theme: 'dark' } },
  items: [{ id: 1 }, { id: 2 }, { id: 3 }],
}
const nestedEqual = Array.from({ length: 32 }, () => ({
  user: { id: 7, roles: ['admin', 'editor'], prefs: { theme: 'dark' } },
  items: [{ id: 1 }, { id: 2 }, { id: 3 }],
}))
const numbers = Array.from({ length: 32 }, (_, index) => index)
const numbersEqual = Array.from({ length: 32 }, () =>
  Array.from({ length: 32 }, (_, index) => index),
)
// Link.tsx stabilizes `[search, params, activeOptions]`-like inline values.
const linkOptions = Array.from({ length: 100 }, (_, index) => [
  { page: index, sort: 'asc' },
  { id: String(index) },
  { exact: false, includeSearch: true, includeHash: undefined },
])
const linkOptionsEqual = linkOptions.map((entry) =>
  entry.map((value) => ({ ...value })),
)
const shared = { ...search, tags: search.tags }

let sink = 0
let cursor = 0
const next = <T>(pool: Array<T>) => pool[cursor++ & 31]!

expect(deepEqual(search, searchEqual[0])).toBe(true)
expect(deepEqual(search, searchChangedLate[0])).toBe(false)
expect(deepEqual(search, searchChangedEarly[0])).toBe(false)
expect(deepEqual(nested, nestedEqual[0])).toBe(true)
expect(deepEqual(numbers, numbersEqual[0])).toBe(true)
expect(deepEqual(search, shared)).toBe(true)
for (let index = 0; index < linkOptions.length; index++) {
  for (let slot = 0; slot < 3; slot++) {
    expect(
      deepEqual(
        linkOptions[index]![slot],
        linkOptionsEqual[index]![slot],
        false,
        true,
      ),
    ).toBe(true)
  }
}

describe('deepEqual', () => {
  const options = { time: 1000, warmupTime: 200 }

  bench(
    'equal flat search record (default)',
    () => {
      sink += +deepEqual(search, next(searchEqual))
    },
    options,
  )

  bench(
    'equal flat record with a shared child (default)',
    () => {
      sink += +deepEqual(search, shared)
    },
    options,
  )

  bench(
    'equal flat record (explicitUndefined)',
    () => {
      sink += +deepEqual(search, next(searchEqual), false, true)
    },
    options,
  )

  bench(
    'equal flat record (partial)',
    () => {
      sink += +deepEqual(search, next(searchEqual), true)
    },
    options,
  )

  bench(
    'late mismatch in a nested array (default)',
    () => {
      sink += +deepEqual(search, next(searchChangedLate))
    },
    options,
  )

  bench(
    'early mismatch (default)',
    () => {
      sink += +deepEqual(search, next(searchChangedEarly))
    },
    options,
  )

  bench(
    'equal nested record (default)',
    () => {
      sink += +deepEqual(nested, next(nestedEqual))
    },
    options,
  )

  bench(
    'equal array of 32 numbers',
    () => {
      sink += +deepEqual(numbers, next(numbersEqual))
    },
    options,
  )

  bench(
    'fresh equal flat record (explicitUndefined)',
    () => {
      sink += +deepEqual(
        search,
        { page: 1, sort: 'asc', filter: 'open', tags: search.tags },
        false,
        true,
      )
    },
    options,
  )

  bench(
    'fresh partial mismatch',
    () => {
      sink += +deepEqual(search, { page: 1, sort: 'desc' }, true)
    },
    options,
  )

  bench(
    'link option stabilization: 100 entries x 3 equal values',
    () => {
      for (let index = 0; index < linkOptions.length; index++) {
        const previous = linkOptions[index]!
        const incoming = linkOptionsEqual[index]!
        for (let slot = 0; slot < 3; slot++) {
          sink += +deepEqual(previous[slot], incoming[slot], false, true)
        }
      }
    },
    options,
  )
})

// Keep the results observable so the comparisons cannot be optimized away.
expect(sink).toBeGreaterThanOrEqual(0)
