import { bench, describe, expect } from 'vitest'
import {
  createNull,
  deepEqual,
  isPlainObject,
  nullReplaceEqualDeep,
  replaceEqualDeep,
} from '../src/utils'

// Shapes the router feeds these helpers on every Link build / navigation.
const empty = {}
const emptyNull = createNull()
const search = { tab: 'specs', page: 2, sort: 'newest', filter: 'available' }
const searchCopy = { ...search }
const searchChanged = { ...search, page: 3 }
// parseSearch and path extraction produce null-prototype records. Exercise
// these separately from ordinary selector objects: their property storage differs.
const nullSearch = Object.assign(createNull(), search)
const nullSearchCopy = Object.assign(createNull(), searchCopy)
const nullSearchChanged = Object.assign(createNull(), searchChanged)
const decimalRecord = { x: 0.5, y: 1.5, width: 640.5, height: 480.5 }
const decimalRecordCopy = { ...decimalRecord }
const decimalRecordChanged = { ...decimalRecord, x: 1.5 }
// `?constructor=foo` decodes to an own `constructor` key on a null-proto record.
const searchWithConstructorKey = Object.assign(createNull(), {
  constructor: 'foo',
  page: 2,
})
const searchWithConstructorKeyCopy = Object.assign(createNull(), {
  constructor: 'foo',
  page: 2,
})
class Instance {
  a = 1
}
const instance = new Instance()
const nested = {
  tab: 'specs',
  filters: { category: 'hardware', available: true },
  ids: [1, 2, 3, 4],
}
const nestedCopy = {
  tab: 'specs',
  filters: { category: 'hardware', available: true },
  ids: [1, 2, 3, 4],
}
const nestedLeafChanged = {
  tab: 'specs',
  filters: { category: 'software', available: true },
  ids: [1, 2, 3, 4],
}
const list = Array.from({ length: 16 }, (_, index) => ({ id: index }))
const listCopy = list.map((item) => ({ ...item }))
const listChanged = list.map((item, index) =>
  index === 10 ? { id: -1 } : { ...item },
)
const listShared = list.map((item, index) => (index === 10 ? { id: -1 } : item))
const wide = Object.fromEntries(
  Array.from({ length: 12 }, (_, index) => [`key${index}`, `value${index}`]),
)
const wideChanged = { ...wide, key7: 'changed' }
const searchAllChanged = {
  tab: 'other',
  page: 3,
  sort: 'oldest',
  filter: 'sold',
}
const searchReordered = {
  filter: 'available',
  sort: 'newest',
  page: 2,
  tab: 'specs',
}
const searchSubset = { tab: 'specs', page: 2, sort: 'newest' }
const wider = Object.fromEntries(
  Array.from({ length: 64 }, (_, index) => [`key${index}`, `value${index}`]),
)
const widerChangedLast = { ...wider, key63: 'changed' }
const widerChangedFirst = { ...wider, key0: 'changed' }
const widerAllChanged = Object.fromEntries(
  Object.keys(wider).map((key) => [key, 'changed']),
)
const widerSubset = Object.fromEntries(Object.entries(wider).slice(0, 8))
const numbers = Array.from({ length: 1024 }, (_, index) => index)
const numbersCopy = [...numbers]
const numbersChangedLast = numbers.map((n, index) => (index === 1023 ? -1 : n))
const numbersChangedFirst = numbers.map((n, index) => (index === 0 ? -1 : n))
const numbersChangedMiddle = numbers.map((n, index) => (index === 512 ? -1 : n))
const numbersAllChanged = numbers.map((n) => -n - 1)
const numbersShorter = numbers.slice(0, 512)
const numbersLonger = [...numbers, undefined, undefined]
const smallNumbers = [1, 2, 3, 4]
const smallNumbersChanged = [9, 2, 3, 4]
const consumedNumbers = replaceEqualDeep(numbers, numbersChangedLast)
const longList = Array.from({ length: 1024 }, (_, id) => ({ id }))
const longListCopy = [...longList]
const longListClonedLast = [...longList]
longListClonedLast[1023] = { id: 1023 }
const longListChangedLast = [...longList]
longListChangedLast[1023] = { id: -1 }
const longListClonedThenChanged = [...longListChangedLast]
longListClonedThenChanged[1022] = { id: 1022 }
const numericCases = [
  ['fractional', Array.from({ length: 1024 }, (_, index) => index + 0.5)],
  [
    'large integer',
    Array.from({ length: 1024 }, (_, index) => 2 ** 40 + index),
  ],
] as const
const numericResults = numericCases.map(([name, prev]) => {
  const next = [...prev]
  next[1023] = -1.5
  const result = replaceEqualDeep(prev, next)
  expect(result).toStrictEqual(next)
  return { name, prev, next, result }
})
const mixedPairs: Array<[unknown, unknown]> = [
  [search, search],
  [search, searchCopy],
  [search, searchChanged],
  [search, searchSubset],
  [searchSubset, search],
  [nested, nestedCopy],
  [list, listChanged],
  [list, listShared],
  [smallNumbers, smallNumbersChanged],
  [emptyNull, createNull()],
  [searchWithConstructorKey, searchWithConstructorKeyCopy],
]

expect(replaceEqualDeep(empty, {})).toBe(empty)
expect(replaceEqualDeep(search, searchCopy)).toBe(search)
expect(replaceEqualDeep(search, searchChanged)).toStrictEqual(searchChanged)
expect(nullReplaceEqualDeep(nullSearch, nullSearchCopy)).toBe(nullSearch)
expect(nullReplaceEqualDeep(nullSearch, searchCopy)).toBe(nullSearch)
expect(replaceEqualDeep(decimalRecord, decimalRecordCopy)).toBe(decimalRecord)
expect(replaceEqualDeep(decimalRecord, decimalRecordChanged)).toStrictEqual(
  decimalRecordChanged,
)
expect(nullReplaceEqualDeep(nullSearch, nullSearchChanged)).toStrictEqual(
  nullSearchChanged,
)
expect(replaceEqualDeep(nested, nestedCopy)).toBe(nested)
expect(replaceEqualDeep(nested, nestedLeafChanged).ids).toBe(nested.ids)
const nullNestedResult = nullReplaceEqualDeep(nested, nestedLeafChanged)
expect(nullNestedResult).toEqual(nestedLeafChanged)
expect(nullNestedResult.ids).toBe(nested.ids)
expect(Object.getPrototypeOf(nullNestedResult)).toBeNull()
expect(replaceEqualDeep(list, listCopy)).toBe(list)
expect(replaceEqualDeep(list, listChanged)[3]).toBe(list[3])
expect(replaceEqualDeep(wide, wideChanged)).toStrictEqual(wideChanged)
expect(replaceEqualDeep(list, listShared)[3]).toBe(list[3])
expect(replaceEqualDeep(search, searchAllChanged)).toStrictEqual(
  searchAllChanged,
)
expect(replaceEqualDeep(search, searchReordered)).toBe(search)
expect(replaceEqualDeep(search, searchSubset)).toStrictEqual(searchSubset)
expect(replaceEqualDeep(wider, widerChangedLast)).toStrictEqual(
  widerChangedLast,
)
expect(replaceEqualDeep(numbers, numbersCopy)).toBe(numbers)
expect(replaceEqualDeep(longList, longListCopy)).toBe(longList)
expect(replaceEqualDeep(longList, longListClonedLast)).toBe(longList)
expect(replaceEqualDeep(longList, longListChangedLast)).toStrictEqual(
  longListChangedLast,
)
const sharedLongList = replaceEqualDeep(longList, longListClonedThenChanged)
expect(sharedLongList).toStrictEqual(longListClonedThenChanged)
expect(sharedLongList[1022]).toBe(longList[1022])
expect(replaceEqualDeep(widerSubset, wider)).toStrictEqual(wider)
expect(replaceEqualDeep(wider, widerChangedFirst)).toStrictEqual(
  widerChangedFirst,
)
expect(replaceEqualDeep(wider, widerAllChanged)).toStrictEqual(widerAllChanged)
expect(replaceEqualDeep(numbers, numbersChangedLast)[1023]).toBe(-1)
for (const [prev, next] of mixedPairs) {
  expect(replaceEqualDeep(prev, next)).toStrictEqual(next)
}
for (const next of [
  numbersChangedFirst,
  numbersChangedMiddle,
  numbersAllChanged,
  numbersShorter,
  numbersLonger,
]) {
  expect(replaceEqualDeep(numbers, next)).toStrictEqual(next)
}
expect(nullReplaceEqualDeep(emptyNull, {})).toBe(emptyNull)
expect(
  nullReplaceEqualDeep(searchWithConstructorKey, searchWithConstructorKeyCopy),
).toBe(searchWithConstructorKey)
expect(deepEqual(search, searchCopy, true)).toBe(true)
expect(isPlainObject(search)).toBe(true)
expect(isPlainObject(emptyNull)).toBe(true)
expect(isPlainObject(searchWithConstructorKey)).toBe(true)
expect(isPlainObject(instance)).toBe(false)

const iterations = 1_000
let sink: unknown

describe('isPlainObject', () => {
  bench('literal', () => {
    for (let i = 0; i < iterations; i++) {
      sink = isPlainObject(search)
    }
  })

  bench('null-proto record', () => {
    for (let i = 0; i < iterations; i++) {
      sink = isPlainObject(emptyNull)
    }
  })

  bench('null-proto record with a constructor key', () => {
    for (let i = 0; i < iterations; i++) {
      sink = isPlainObject(searchWithConstructorKey)
    }
  })

  bench('class instance', () => {
    for (let i = 0; i < iterations; i++) {
      sink = isPlainObject(instance)
    }
  })
})

describe('replaceEqualDeep', () => {
  bench('equal empty objects', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(empty, {})
    }
  })

  bench('equal empty null-proto objects', () => {
    for (let i = 0; i < iterations; i++) {
      sink = nullReplaceEqualDeep(emptyNull, createNull())
    }
  })

  bench('equal null-proto search with a constructor key', () => {
    for (let i = 0; i < iterations; i++) {
      sink = nullReplaceEqualDeep(
        searchWithConstructorKey,
        searchWithConstructorKeyCopy,
      )
    }
  })

  bench('equal flat search', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(search, searchCopy)
    }
  })

  bench('flat search with one changed leaf', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(search, searchChanged)
    }
  })

  bench('equal parsed null-proto search', () => {
    for (let i = 0; i < iterations; i++) {
      sink = nullReplaceEqualDeep(nullSearch, nullSearchCopy)
    }
  })

  bench('equal ordinary search against a null-proto previous value', () => {
    for (let i = 0; i < iterations; i++) {
      sink = nullReplaceEqualDeep(nullSearch, searchCopy)
    }
  })

  bench('parsed null-proto search with one changed leaf', () => {
    for (let i = 0; i < iterations; i++) {
      sink = nullReplaceEqualDeep(nullSearch, nullSearchChanged)
    }
  })

  bench('ordinary search update in null-proto mode', () => {
    for (let i = 0; i < iterations; i++) {
      sink = nullReplaceEqualDeep(nullSearch, searchChanged)
    }
  })

  bench('equal ordinary search in null-proto mode', () => {
    for (let i = 0; i < iterations; i++) {
      sink = nullReplaceEqualDeep(search, searchCopy)
    }
  })

  bench('successive ordinary search update in null-proto mode', () => {
    for (let i = 0; i < iterations; i++) {
      sink = nullReplaceEqualDeep(search, searchChanged)
    }
  })

  bench('changed selector followed by the same incoming reference', () => {
    for (let i = 0; i < iterations; i++) {
      const current = replaceEqualDeep(search, searchChanged)
      sink = replaceEqualDeep(current, searchChanged)
    }
  })

  bench('equal record with decimal values', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(decimalRecord, decimalRecordCopy)
    }
  })

  bench('changed record with decimal values', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(decimalRecord, decimalRecordChanged)
    }
  })

  bench('equal nested search', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(nested, nestedCopy)
    }
  })

  bench('nested search sharing unchanged subtrees', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(nested, nestedLeafChanged)
    }
  })

  bench('nested search sharing unchanged subtrees in null-proto mode', () => {
    for (let i = 0; i < iterations; i++) {
      sink = nullReplaceEqualDeep(nested, nestedLeafChanged)
    }
  })

  bench('equal array of objects', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(list, listCopy)
    }
  })

  bench('array of objects with one changed item', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(list, listChanged)
    }
  })

  bench('wide flat object with one changed leaf', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(wide, wideChanged)
    }
  })

  bench('wide flat object with one changed leaf (null-proto)', () => {
    for (let i = 0; i < iterations; i++) {
      sink = nullReplaceEqualDeep(wide, wideChanged)
    }
  })

  bench('flat search with all leaves changed', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(search, searchAllChanged)
    }
  })

  bench('equal flat search with reordered keys', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(search, searchReordered)
    }
  })

  bench('flat search with a key removed', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(search, searchSubset)
    }
  })

  bench('array of shared objects with one changed item', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(list, listShared)
    }
  })

  bench('wider flat object (64 keys) with the last leaf changed', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(wider, widerChangedLast)
    }
  })

  bench('flat object growing from 8 to 64 keys', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(widerSubset, wider)
    }
  })

  for (const [name, next] of [
    ['first leaf changed', widerChangedFirst],
    ['all leaves changed', widerAllChanged],
  ] as const) {
    bench(`wider flat object (64 keys) with ${name}`, () => {
      for (let i = 0; i < iterations; i++) {
        sink = replaceEqualDeep(wider, next)
      }
    })
  }

  bench('equal long array of shared objects', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(longList, longListCopy)
    }
  })

  for (const [name, next] of [
    ['cloned but equal', longListClonedLast],
    ['changed', longListChangedLast],
    ['changed after a cloned but equal item', longListClonedThenChanged],
  ] as const) {
    bench(`long array of shared objects with the last item ${name}`, () => {
      for (let i = 0; i < iterations; i++) {
        sink = replaceEqualDeep(longList, next)
      }
    })
  }

  for (const length of [0, 1, 4]) {
    const prev = Array.from({ length }, (_, index) => index)
    const next = [...prev]
    expect(replaceEqualDeep(prev, next)).toBe(prev)
    bench(`equal primitive array of length ${length}`, () => {
      for (let i = 0; i < iterations; i++) {
        sink = replaceEqualDeep(prev, next)
      }
    })
  }

  bench('equal long primitive array', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(numbers, numbersCopy)
    }
  })

  bench('long primitive array with the last item changed', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(numbers, numbersChangedLast)
    }
  })

  for (const [name, next] of [
    ['first item changed', numbersChangedFirst],
    ['middle item changed', numbersChangedMiddle],
    ['all items changed', numbersAllChanged],
    ['shortened', numbersShorter],
    ['appended undefined values', numbersLonger],
  ] as const) {
    bench(`long primitive array with ${name}`, () => {
      for (let i = 0; i < iterations; i++) {
        sink = replaceEqualDeep(numbers, next)
      }
    })
  }

  bench('small primitive array with the first item changed', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(smallNumbers, smallNumbersChanged)
    }
  })

  bench('mixed search and array updates', () => {
    for (let i = 0; i < iterations; i++) {
      const [prev, next] = mixedPairs[i % mixedPairs.length]!
      sink = replaceEqualDeep(prev, next)
    }
  })

  for (const { name, prev, next } of numericResults) {
    bench(`long ${name} array with the last item changed`, () => {
      for (let i = 0; i < iterations; i++) {
        sink = replaceEqualDeep(prev, next)
      }
    })
  }
})

describe('consume structurally shared arrays', () => {
  bench('sum changed primitive array by index', () => {
    for (let i = 0; i < iterations; i++) {
      let sum = 0
      for (let j = 0; j < consumedNumbers.length; j++) {
        sum += consumedNumbers[j]!
      }
      sink = sum
    }
  })

  bench('reduce changed primitive array', () => {
    for (let i = 0; i < iterations; i++) {
      sink = consumedNumbers.reduce((sum, value) => sum + value, 0)
    }
  })

  for (const { name, result } of numericResults) {
    bench(`sum changed ${name} array by index`, () => {
      for (let i = 0; i < iterations; i++) {
        let sum = 0
        for (let j = 0; j < result.length; j++) {
          sum += result[j]!
        }
        sink = sum
      }
    })

    bench(`reduce changed ${name} array`, () => {
      for (let i = 0; i < iterations; i++) {
        sink = result.reduce((sum, value) => sum + value, 0)
      }
    })
  }
})

describe('deepEqual', () => {
  bench('equal empty objects', () => {
    for (let i = 0; i < iterations; i++) {
      sink = deepEqual(empty, {})
    }
  })

  bench('equal flat search (partial)', () => {
    for (let i = 0; i < iterations; i++) {
      sink = deepEqual(search, searchCopy, true)
    }
  })

  bench('nested search with one changed leaf', () => {
    for (let i = 0; i < iterations; i++) {
      sink = deepEqual(nested, nestedLeafChanged)
    }
  })
})

export { sink }
