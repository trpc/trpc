import { afterEach, describe, expect, it } from 'vitest'
import {
  decodePath,
  deepEqual,
  encodePathLikeUrl,
  escapeHtml,
  hasOwn,
  isPlainArray,
  isPlainObject,
  nullReplaceEqualDeep,
  replaceEqualDeep,
} from '../src/utils'
import { decode } from '../src/qss'

describe('replaceEqualDeep', () => {
  it('reuses the next object when its children need no replacements', () => {
    const shared = Object.freeze({ id: 1 })
    const prev = Object.freeze({ shared, page: 1 })
    const next = Object.freeze({ shared, page: 2 })

    expect(replaceEqualDeep(prev, next)).toBe(next)
  })

  it('reuses a changed null-prototype search record', () => {
    const prev = decode('page=1&sort=newest')
    const next = decode('page=2&sort=newest')

    expect(nullReplaceEqualDeep(prev, next)).toBe(next)
  })

  it('reuses a changed ordinary object in null-prototype mode', () => {
    const prev = decode('page=1&sort=newest')
    const next = { page: '2', sort: 'newest' }
    const result = nullReplaceEqualDeep(prev, next)

    expect(result).toBe(next)
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
  })

  it('returns the previous signed zero when strict equality matches', () => {
    expect(replaceEqualDeep(-0, 0)).toBe(-0)
    expect(replaceEqualDeep(0, -0)).toBe(0)
  })

  it.each([false, true])(
    'uses the same signed-zero sharing rule for every child (nullProto=%s)',
    (nullProto) => {
      const prev = { first: -0, changed: 1, last: -0 }
      const next = { first: 0, changed: 2, last: 0 }
      const result = replaceEqualDeep(prev, next, nullProto)
      expect(result).not.toBe(next)
      expect(Object.getPrototypeOf(result)).toBe(
        nullProto ? null : Object.prototype,
      )
      expect(result.first).toBe(-0)
      expect(result.changed).toBe(2)
      expect(result.last).toBe(-0)
      expect(replaceEqualDeep([-0, 1, -0], [0, 2, 0], nullProto)).toStrictEqual(
        [-0, 2, -0],
      )
    },
  )

  // Known unsupported edge case for ordinary object copies.
  it.skip('copies an own __proto__ property as data in the incoming key order', () => {
    const prev = JSON.parse('{"first":1,"__proto__":{"shared":1},"last":1}')
    const next = JSON.parse('{"first":2,"__proto__":{"shared":1},"last":1}')
    const result = replaceEqualDeep(prev, next)
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect(hasOwn.call(result, '__proto__')).toBe(true)
    expect(result.__proto__).toBe(prev.__proto__)
    expect(Object.keys(result)).toEqual(Object.keys(next))
    expect(result).toStrictEqual(next)
  })

  it.skip.each([undefined, { shared: 1 }])(
    'preserves a newly added own __proto__ property with value %j',
    (value) => {
      const prev = { first: 1, last: 1 }
      const next = { first: 1, ['__proto__']: value, last: 1 }
      const result = replaceEqualDeep(prev, next)
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
      expect(hasOwn.call(result, '__proto__')).toBe(true)
      expect(result.__proto__).toBe(value)
      expect(Object.keys(result)).toEqual(Object.keys(next))
      expect(result).toStrictEqual(next)
    },
  )

  it('shares children without changing recursively frozen inputs', () => {
    const prev = Object.freeze({
      items: Object.freeze([
        Object.freeze({ id: 1 }),
        Object.freeze({ id: 2 }),
      ]),
      page: 1,
    })
    const next = Object.freeze({
      items: Object.freeze([
        Object.freeze({ id: 1 }),
        Object.freeze({ id: 3 }),
      ]),
      page: 2,
    })
    const result = replaceEqualDeep(prev, next)
    expect(result).toStrictEqual(next)
    expect(result.items[0]).toBe(prev.items[0])
    expect(next.items[0]).not.toBe(prev.items[0])
    expect(prev.items[1]?.id).toBe(2)
    expect(next.items[1]?.id).toBe(3)
  })

  it('preserves special numbers and explicit undefined in changed frozen arrays', () => {
    const prev = Object.freeze([-0, NaN, Infinity, 2 ** 40, 1.5, undefined, 1])
    const next = Object.freeze([0, NaN, Infinity, 2 ** 40, 1.5, undefined, 2])
    const result = replaceEqualDeep(prev, next)
    expect(result).toStrictEqual([
      -0,
      NaN,
      Infinity,
      2 ** 40,
      1.5,
      undefined,
      2,
    ])
    expect(hasOwn.call(result, 5)).toBe(true)
    expect(next[0]).toBe(0)
    expect(prev[6]).toBe(1)
  })

  it('ignores auxiliary array metadata without using its constructor or iterator', () => {
    const fail = () => {
      throw new Error('array metadata must not be invoked')
    }
    const decorate = (values: Array<unknown>) =>
      Object.freeze(
        Object.defineProperties(values, {
          metadata: { value: 'ignored' },
          constructor: { value: { [Symbol.species]: fail } },
          [Symbol.iterator]: { value: fail },
        }),
      )
    const child = Object.freeze({ id: 1 })
    const prev = decorate([child, 1])
    const equal = decorate([{ id: 1 }, 1])
    const next = decorate([{ id: 1 }, 2])

    expect(replaceEqualDeep(prev, equal)).toBe(prev)
    const result = replaceEqualDeep(prev, next)
    expect(result).toStrictEqual([child, 2])
    expect(result[0]).toBe(child)
    expect(Object.keys(result)).toEqual(['0', '1'])
    expect(Object.getOwnPropertySymbols(result)).toEqual([])
    expect(prev[1]).toBe(1)
    expect(next[0]).not.toBe(child)
  })

  it.each(['prev', 'next'])(
    'preserves incoming values with a non-enumerable array index on %s',
    (side) => {
      const prev = [{ id: 1 }, 1]
      const next = [{ id: 1 }, 2]
      Object.defineProperty(side === 'prev' ? prev : next, '1', {
        enumerable: false,
      })
      const result = replaceEqualDeep(prev, next)
      expect(result).toStrictEqual(next)
      expect(Object.getOwnPropertyDescriptor(result, '1')?.enumerable).toBe(
        Object.getOwnPropertyDescriptor(next, '1')?.enumerable,
      )
    },
  )

  it('does not consider separate NaN children strictly equal', () => {
    const prev = { value: NaN }
    const next = { value: NaN }
    const result = replaceEqualDeep(prev, next)
    expect(result).not.toBe(prev)
    expect(result).toStrictEqual(next)
  })

  it.each([0, 1, 8, 16])(
    'resolves deeply equal children after %i identical array entries',
    (length) => {
      const prefix = Array.from({ length }, (_, index) => index)
      const shared = { child: { value: 1 } }
      const prev = [...prefix, shared, { version: 1 }]
      const equal = [...prefix, { child: { value: 1 } }, { version: 1 }]
      expect(replaceEqualDeep(prev, equal)).toBe(prev)

      const next = [...prefix, { child: { value: 1 } }, { version: 2 }]
      const result = replaceEqualDeep(prev, next)
      expect(result).toStrictEqual(next)
      expect(result).not.toBe(prev)
      expect(result).not.toBe(next)
      expect(result[length]).toBe(shared)
    },
  )

  it('bounds recursion for cyclic records', () => {
    const prev: any = { value: 1 }
    const next: any = { value: 2 }
    prev.self = prev
    next.self = next
    const result = replaceEqualDeep(prev, next)
    expect(result.value).toBe(2)
    expect(result.self).toBe(next)
  })

  it.each([0, 1])(
    'bounds recursion for cyclic arrays with %s preceding values',
    (index) => {
      const prev: Array<any> = index ? [1] : []
      const next: Array<any> = index ? [2] : []
      prev.push(prev)
      next.push(next)
      const result = replaceEqualDeep(prev, next)
      let tail = result
      for (let i = 0; i < 1000 && tail !== next; i++) {
        tail = tail[index]
      }
      expect(tail).toBe(next)
      if (index) {
        expect(result[0]).toBe(2)
      }
      expect(prev[index]).toBe(prev)
      expect(next[index]).toBe(next)
    },
  )

  it('preserves identity even when the recursion budget is exhausted', () => {
    const value = [{ id: 1 }]
    expect(replaceEqualDeep(value, value, false, 10_000)).toBe(value)
  })

  it('should return the same object if the input objects are equal', () => {
    const obj = { a: 1, b: 2 }
    const result = replaceEqualDeep(obj, obj)
    expect(result).toBe(obj)
  })

  it('should return a new object with replaced values if the input objects are not equal', () => {
    const obj1 = { a: 1, b: 2 }
    const obj2 = { a: 1, b: 3 }
    const result = replaceEqualDeep(obj1, obj2)
    expect(result).toStrictEqual(obj2)
  })

  it('should handle arrays correctly', () => {
    const arr1 = [1, 2, 3]
    const arr2 = [1, 2, 4]
    const result = replaceEqualDeep(arr1, arr2)
    expect(result).toStrictEqual(arr2)
  })

  it('should handle nested objects correctly', () => {
    const obj1 = { a: 1, b: { c: 2 } }
    const obj2 = { a: 1, b: { c: 3 } }
    const result = replaceEqualDeep(obj1, obj2)
    expect(result).toStrictEqual(obj2)
  })

  describe('symbol properties', () => {
    it('passes objects with differing symbol values through untouched', () => {
      const propertyKey = Symbol('property')
      const obj1 = { a: 1, [propertyKey]: 2 }
      const obj2 = { a: 1, [propertyKey]: 3 }
      const result = replaceEqualDeep(obj1, obj2)
      expect(result).toBe(obj2)
    })

    it('never copies an object with symbol properties partially', () => {
      const propertyKey = Symbol('property')
      const obj1 = { a: 1, [propertyKey]: 2 }
      const obj2 = { a: 3, [propertyKey]: 2 }
      const result = replaceEqualDeep(obj1, obj2)
      expect(result).toBe(obj2)
    })
  })

  describe('non-enumerable properties', () => {
    it('should treat objects with non-enumerable properties as non-plain (no need for property comparisons)', () => {
      const obj1: { a: number; b?: number } = { a: 1 }
      Object.defineProperty(obj1, 'b', { enumerable: false, value: 2 })
      const obj2: { a: number; b?: number } = { a: 1 }
      Object.defineProperty(obj2, 'b', { enumerable: false, value: 3 })
      const result = replaceEqualDeep(obj1, obj2)
      expect(result).toBe(obj2)
    })

    it("should treat objects with non-enumerable properties as non-plain (copying doesn't happen)", () => {
      const obj1: { a: number; b?: number } = { a: 1 }
      Object.defineProperty(obj1, 'b', { enumerable: false, value: 2 })
      const obj2: { a: number; b?: number } = { a: 3 }
      Object.defineProperty(obj2, 'b', { enumerable: false, value: 2 })
      const result = replaceEqualDeep(obj1, obj2)
      expect(result).toBe(obj2)
    })
  })

  it('should properly handle non-existent keys', () => {
    const obj1 = { a: 2, c: 123 }
    const obj2 = { a: 2, c: 123, b: undefined }
    const result = replaceEqualDeep(obj1, obj2)
    expect(result).toStrictEqual(obj2)
  })

  it('should correctly handle non-existent keys with the same number of fields', () => {
    const obj1 = { a: 2, c: 123 }
    const obj2 = { a: 2, b: undefined }
    const result = replaceEqualDeep(obj1, obj2)
    expect(result).toStrictEqual(obj2)
  })

  it('should return the previous value when the next value is an equal primitive', () => {
    expect(replaceEqualDeep(1, 1)).toBe(1)
    expect(replaceEqualDeep('1', '1')).toBe('1')
    expect(replaceEqualDeep(true, true)).toBe(true)
    expect(replaceEqualDeep(false, false)).toBe(false)
    expect(replaceEqualDeep(null, null)).toBe(null)
    expect(replaceEqualDeep(undefined, undefined)).toBe(undefined)
  })
  it('should return the next value when the previous value is a different value', () => {
    const date1 = new Date()
    const date2 = new Date()
    expect(replaceEqualDeep(1, 0)).toBe(0)
    expect(replaceEqualDeep(1, 2)).toBe(2)
    expect(replaceEqualDeep('1', '2')).toBe('2')
    expect(replaceEqualDeep(true, false)).toBe(false)
    expect(replaceEqualDeep(false, true)).toBe(true)
    expect(replaceEqualDeep(date1, date2)).toBe(date2)
  })

  it('should return the next value when the previous value is a different type', () => {
    const array = [1]
    const object = { a: 'a' }
    expect(replaceEqualDeep(0, undefined)).toBe(undefined)
    expect(replaceEqualDeep(undefined, 0)).toBe(0)
    expect(replaceEqualDeep(2, undefined)).toBe(undefined)
    expect(replaceEqualDeep(undefined, 2)).toBe(2)
    expect(replaceEqualDeep(undefined, null)).toBe(null)
    expect(replaceEqualDeep(null, undefined)).toBe(undefined)
    expect(replaceEqualDeep({}, undefined)).toBe(undefined)
    expect(replaceEqualDeep([], undefined)).toBe(undefined)
    expect(replaceEqualDeep(array, object)).toBe(object)
    expect(replaceEqualDeep(object, array)).toBe(array)
  })

  it('should return the previous value when the next value is an equal array', () => {
    const prev = [1, 2]
    const next = [1, 2]
    expect(replaceEqualDeep(prev, next)).toBe(prev)
  })

  it('should return a copy when the previous value is a different array subset', () => {
    const prev = [1, 2]
    const next = [1, 2, 3]
    const result = replaceEqualDeep(prev, next)
    expect(result).toEqual(next)
    expect(result).not.toBe(prev)
  })

  it('should return a copy when the previous value is a different array superset', () => {
    const prev = [1, 2, 3]
    const next = [1, 2]
    const result = replaceEqualDeep(prev, next)
    expect(result).toEqual(next)
    expect(result).not.toBe(prev)
  })

  it('should return the previous value when the next value is an equal empty array', () => {
    const prev: Array<any> = []
    const next: Array<any> = []
    expect(replaceEqualDeep(prev, next)).toBe(prev)
  })

  it('should return the previous value when the next value is an equal empty object', () => {
    const prev = {}
    const next = {}
    expect(replaceEqualDeep(prev, next)).toBe(prev)
  })

  it('should return the previous value when the next value is an equal object', () => {
    const prev = { a: 'a' }
    const next = { a: 'a' }
    expect(replaceEqualDeep(prev, next)).toBe(prev)
  })

  it('should replace different values in objects', () => {
    const prev = { a: { b: 'b' }, c: 'c' }
    const next = { a: { b: 'b' }, c: 'd' }
    const result = replaceEqualDeep(prev, next)
    expect(result).toEqual(next)
    expect(result).not.toBe(prev)
    expect(result).not.toBe(next)
    expect(result.a).toBe(prev.a)
    expect(result.c).toBe(next.c)
  })

  it('should replace different values in arrays', () => {
    const prev = [1, { a: 'a' }, { b: { b: 'b' } }, [1]] as const
    const next = [1, { a: 'a' }, { b: { b: 'c' } }, [1]] as const
    const result = replaceEqualDeep(prev, next)
    expect(result).toEqual(next)
    expect(result).not.toBe(prev)
    expect(result).not.toBe(next)
    expect(result[0]).toBe(prev[0])
    expect(result[1]).toBe(prev[1])
    expect(result[2].b.b).toBe(next[2].b.b)
    expect(result[3]).toBe(prev[3])
  })

  it('should replace different values in arrays when the next value is a subset', () => {
    const prev = [{ a: 'a' }, { b: 'b' }, { c: 'c' }]
    const next = [{ a: 'a' }, { b: 'b' }]
    const result = replaceEqualDeep(prev, next)
    expect(result).toEqual(next)
    expect(result).not.toBe(prev)
    expect(result).not.toBe(next)
    expect(result[0]).toBe(prev[0])
    expect(result[1]).toBe(prev[1])
    expect(result[2]).toBeUndefined()
  })

  it('should replace different values in arrays when the next value is a superset', () => {
    const prev = [{ a: 'a' }, { b: 'b' }]
    const next = [{ a: 'a' }, { b: 'b' }, { c: 'c' }]
    const result = replaceEqualDeep(prev, next)
    expect(result).toEqual(next)
    expect(result).not.toBe(prev)
    expect(result).not.toBe(next)
    expect(result[0]).toBe(prev[0])
    expect(result[1]).toBe(prev[1])
    expect(result[2]).toBe(next[2])
  })

  it('should copy objects which are not arrays or objects', () => {
    const prev = [{ a: 'a' }, { b: 'b' }, { c: 'c' }, 1]
    const next = [{ a: 'a' }, new Map(), { c: 'c' }, 2]
    const result = replaceEqualDeep(prev, next)
    expect(result).not.toBe(prev)
    expect(result).not.toBe(next)
    expect(result[0]).toBe(prev[0])
    expect(result[1]).toBe(next[1])
    expect(result[2]).toBe(prev[2])
    expect(result[3]).toBe(next[3])
  })

  it('should support equal objects which are not arrays or objects', () => {
    const map = new Map()
    const prev = [map, [1]]
    const next = [map, [1]]
    const result = replaceEqualDeep(prev, next)
    expect(result).toBe(prev)
  })

  it('should support non equal objects which are not arrays or objects', () => {
    const map1 = new Map()
    const map2 = new Map()
    const prev = [map1, [1]]
    const next = [map2, [1]]
    const result = replaceEqualDeep(prev, next)
    expect(result).not.toBe(prev)
    expect(result).not.toBe(next)
    expect(result[0]).toBe(next[0])
    expect(result[1]).toBe(prev[1])
  })

  it('should support objects which are not plain arrays', () => {
    const prev = Object.assign([1, 2], { a: { b: 'b' }, c: 'c' })
    const next = Object.assign([1, 2], { a: { b: 'b' }, c: 'c' })
    const result = replaceEqualDeep(prev, next)
    expect(result).toBe(next)
  })

  // A hole and an extra key cancel out in `Object.keys(array).length`, so the
  // key count alone would admit such an array and the copy would drop the key
  // and fill the hole.
  describe('non-dense arrays', () => {
    it('passes a sparse array with an extra key through untouched', () => {
      const next = Object.assign([1, ,], { extra: 'x' }) as Array<unknown>
      expect(Object.keys(next)).toHaveLength(next.length)
      expect(replaceEqualDeep([1, 3], next)).toBe(next)
      expect(replaceEqualDeep([1, undefined], next)).toBe(next)
    })

    it('does not reuse a sparse previous array with a compensating extra key', () => {
      const prev = Object.assign([1, ,], { extra: 'old' })
      const next = [1, undefined]
      expect(Object.keys(prev)).toHaveLength(prev.length)
      expect(replaceEqualDeep(prev, next)).toBe(next)
    })

    it('still shares dense arrays', () => {
      const prev = [1, 2, undefined]
      expect(replaceEqualDeep(prev, [1, 2, undefined])).toBe(prev)
      expect(replaceEqualDeep(prev, [1, 3, undefined])).toStrictEqual([
        1,
        3,
        undefined,
      ])
    })
  })

  it('should replace all parent objects if some nested value changes', () => {
    const prev = {
      todo: { id: '1', meta: { createdAt: 0 }, state: { done: false } },
      otherTodo: { id: '2', meta: { createdAt: 0 }, state: { done: true } },
    }
    const next = {
      todo: { id: '1', meta: { createdAt: 0 }, state: { done: true } },
      otherTodo: { id: '2', meta: { createdAt: 0 }, state: { done: true } },
    }
    const result = replaceEqualDeep(prev, next)
    expect(result).toEqual(next)
    expect(result).not.toBe(prev)
    expect(result).not.toBe(next)
    expect(result.todo).not.toBe(prev.todo)
    expect(result.todo).not.toBe(next.todo)
    expect(result.todo.id).toBe(next.todo.id)
    expect(result.todo.meta).toBe(prev.todo.meta)
    expect(result.todo.state.done).toBe(next.todo.state.done)
    expect(result.otherTodo).toBe(prev.otherTodo)
  })

  it('should replace all parent arrays if some nested value changes', () => {
    const prev = {
      todos: [
        { id: '1', meta: { createdAt: 0 }, state: { done: false } },
        { id: '2', meta: { createdAt: 0 }, state: { done: true } },
      ],
    }
    const next = {
      todos: [
        { id: '1', meta: { createdAt: 0 }, state: { done: true } },
        { id: '2', meta: { createdAt: 0 }, state: { done: true } },
      ],
    }
    const result = replaceEqualDeep(prev, next)
    expect(result).toEqual(next)
    expect(result).not.toBe(prev)
    expect(result).not.toBe(next)
    expect(result.todos).not.toBe(prev.todos)
    expect(result.todos).not.toBe(next.todos)
    expect(result.todos[0]).not.toBe(prev.todos[0])
    expect(result.todos[0]).not.toBe(next.todos[0])
    expect(result.todos[0]?.id).toBe(next.todos[0]?.id)
    expect(result.todos[0]?.meta).toBe(prev.todos[0]?.meta)
    expect(result.todos[0]?.state.done).toBe(next.todos[0]?.state.done)
    expect(result.todos[1]).toBe(prev.todos[1])
  })

  it('should be able to share values that contain undefined', () => {
    const current = [
      {
        data: undefined,
        foo: true,
      },
    ]

    const next = replaceEqualDeep(current, [
      {
        data: undefined,
        foo: true,
      },
    ])

    expect(current).toBe(next)
  })

  it('should return the previous value when both values are an array of undefined', () => {
    const current = [undefined]
    const next = replaceEqualDeep(current, [undefined])

    expect(next).toBe(current)
  })

  it('should return the previous value when both values are an array that contains undefined', () => {
    const current = [{ foo: 1 }, undefined]
    const next = replaceEqualDeep(current, [{ foo: 1 }, undefined])

    expect(next).toBe(current)
  })

  it('works w/ null prototype objects', () => {
    const current = Object.create(null)
    const next = Object.create(null)

    current.foo = 'bar'
    next.foo = 'bar'
    expect(replaceEqualDeep(current, next)).toBe(current)

    next.foo = 'baz'
    expect(replaceEqualDeep(current, next)).toEqual(next)
  })

  describe('sharing children in changed containers', () => {
    it('keeps earlier equal entries, including explicit undefined, when a later key differs', () => {
      const prev = { a: { x: 1 }, b: undefined, c: 1 }
      const next = { a: { x: 1 }, b: undefined, c: 2 }
      const result = replaceEqualDeep(prev, next)
      expect(result).toStrictEqual(next)
      expect(result).not.toBe(prev)
      expect(result).not.toBe(next)
      expect(result.a).toBe(prev.a)
      expect('b' in result).toBe(true)
    })

    it('includes keys that only exist in next before the first difference', () => {
      const prev: Record<string, unknown> = { a: 1 }
      const next = { b: undefined, a: 2 }
      const result = replaceEqualDeep(prev, next)
      expect(result).toStrictEqual(next)
      expect('b' in result).toBe(true)
    })

    it('keeps the key order of next', () => {
      const prev = { a: 1, b: 2, c: 3 }
      expect(Object.keys(replaceEqualDeep(prev, { c: 3, b: 2, a: 9 }))).toEqual(
        ['c', 'b', 'a'],
      )
      expect(Object.keys(replaceEqualDeep(prev, { b: 9, a: 1, c: 3 }))).toEqual(
        ['b', 'a', 'c'],
      )
    })

    it('copies when only the key sets differ', () => {
      const prev = { a: 1, b: 2 }
      const next = { a: 1 }
      const result = replaceEqualDeep(prev, next)
      expect(result).toStrictEqual(next)
      expect(result).not.toBe(prev)
    })

    it('returns a longer array when next appends an explicit undefined', () => {
      const prev = [1]
      const next = [1, undefined]
      const result = replaceEqualDeep(prev, next)
      expect(result).toStrictEqual(next)
      expect(result).toHaveLength(2)
      expect(result).not.toBe(prev)
    })

    it('shares equal array entries before and after the first difference', () => {
      const prev = [{ a: 1 }, { b: 1 }, { c: 1 }]
      const next = [{ a: 1 }, { b: 2 }, { c: 1 }]
      const result = replaceEqualDeep(prev, next)
      expect(result).toStrictEqual(next)
      expect(result[0]).toBe(prev[0])
      expect(result[1]).not.toBe(prev[1])
      expect(result[2]).toBe(prev[2])
    })
  })

  describe('changed keys and recursive sharing', () => {
    it('copies an empty array after a nonempty array', () => {
      const prev = [1]
      const result = replaceEqualDeep(prev, [])
      expect(result).toStrictEqual([])
      expect(result).not.toBe(prev)
    })

    it('appends multiple explicit undefined array entries', () => {
      const result = replaceEqualDeep([1], [1, undefined, undefined])
      expect(result).toStrictEqual([1, undefined, undefined])
      expect(hasOwn.call(result, 1)).toBe(true)
      expect(hasOwn.call(result, 2)).toBe(true)
    })
    it('returns prev for equal objects whose keys are ordered differently', () => {
      const prev = { a: 1, b: { x: 1 }, c: 3 }
      const next = { c: 3, a: 1, b: { x: 1 } }
      expect(replaceEqualDeep(prev, next)).toBe(prev)
    })

    it('copies when a reordered next has a key that prev lacks', () => {
      const prev: Record<string, unknown> = { a: 1, b: 2 }
      const next = { b: 2, c: undefined }
      const result = replaceEqualDeep(prev, next)
      expect(result).toStrictEqual(next)
      expect(result).not.toBe(prev)
      expect('c' in result).toBe(true)
      expect('a' in result).toBe(false)
    })

    it('includes keys that only exist in next after the first difference', () => {
      const prev: Record<string, unknown> = { a: 1, b: 2, d: 4 }
      const next = { a: 9, b: 2, c: undefined }
      const result = replaceEqualDeep(prev, next)
      expect(result).toStrictEqual(next)
      expect('c' in result).toBe(true)
      expect('d' in result).toBe(false)
    })

    it('shares equal children that come after the first difference', () => {
      const prev = { a: 1, b: { x: 1 }, c: [1, 2], d: 'same' }
      const next = { a: 2, b: { x: 1 }, c: [1, 2], d: 'same' }
      const result = replaceEqualDeep(prev, next)
      expect(result).toStrictEqual(next)
      expect(result.b).toBe(prev.b)
      expect(result.c).toBe(prev.c)
    })

    it('recurses into changed children that come after the first difference', () => {
      const prev = { a: 1, b: { x: 1, y: { z: 1 } } }
      const next = { a: 2, b: { x: 2, y: { z: 1 } } }
      const result = replaceEqualDeep(prev, next)
      expect(result).toStrictEqual(next)
      expect(result.b).not.toBe(prev.b)
      expect(result.b).not.toBe(next.b)
      expect(result.b.y).toBe(prev.b.y)
    })

    it('takes the next value when an entry changes between object and primitive', () => {
      const prev = { a: { x: 1 }, b: null, c: 's', d: [1], e: 0 }
      const next = { a: null, b: { x: 1 }, c: {}, d: 's', e: [1] }
      const result = replaceEqualDeep(prev, next)
      expect(result).toStrictEqual(next)
      expect(result.b).toBe(next.b)
      expect(result.c).toBe(next.c)
      expect(result.e).toBe(next.e)
    })

    it('takes the next value when a later entry changes between object and primitive', () => {
      const prev = { k: 0, a: { x: 1 }, b: undefined, c: [1] }
      const next = { k: 1, a: undefined, b: { x: 1 }, c: 's' }
      const result = replaceEqualDeep(prev, next)
      expect(result).toStrictEqual(next)
      expect(result.b).toBe(next.b)
    })

    it('copies a shorter next array, sharing its equal prefix', () => {
      const prev = [{ a: 1 }, { b: 1 }, { c: 1 }]
      const next = [{ a: 1 }, { b: 1 }]
      const result = replaceEqualDeep(prev, next)
      expect(result).toStrictEqual(next)
      expect(result).not.toBe(prev)
      expect(result).not.toBe(next)
      expect(result[0]).toBe(prev[0])
      expect(result[1]).toBe(prev[1])
    })

    it('copies a longer next array, sharing the equal prefix', () => {
      const prev = [{ a: 1 }]
      const next = [{ a: 1 }, { b: 1 }]
      const result = replaceEqualDeep(prev, next)
      expect(result).toStrictEqual(next)
      expect(result[0]).toBe(prev[0])
      expect(result[1]).toBe(next[1])
    })

    it('copies a next object whose entries all match a larger prev', () => {
      const prev = { a: { x: 1 }, b: 2 }
      const next = { a: { x: 1 } }
      const result = replaceEqualDeep(prev, next)
      expect(result).toStrictEqual(next)
      expect(result).not.toBe(prev)
      expect(result).not.toBe(next)
      expect(result.a).toBe(prev.a)
    })

    it('handles a change in the last entry of a long array', () => {
      const prev = Array.from({ length: 1024 }, (_, index) => ({ index }))
      const next = prev.map((item, index) =>
        index === 1023 ? { index: -1 } : item,
      )
      const result = replaceEqualDeep(prev, next)
      expect(result).toStrictEqual(next)
      expect(result).not.toBe(prev)
      expect(result[0]).toBe(prev[0])
      expect(result[1022]).toBe(prev[1022])
      expect(result[1023]).not.toBe(prev[1023])
      expect(result[1023]).toStrictEqual(next[1023])
    })

    it('stops sharing beyond the depth limit', () => {
      const nest = (depth: number) => {
        let value: any = { leaf: true }
        for (let i = 0; i < depth; i++) {
          value = { child: value }
        }
        return value
      }
      const prev = nest(510)
      const next = nest(510)
      const result = replaceEqualDeep(prev, next)
      expect(result).not.toBe(prev)
      expect(result).toStrictEqual(next)
    })
  })
})

describe('nullReplaceEqualDeep', () => {
  it('keeps a shared array prefix and reuses unchanged child results', () => {
    const shared = { id: 1 }
    const prev = [shared, { id: 2 }]
    const next = [shared, { id: 3 }]
    const result = nullReplaceEqualDeep(prev, next)
    expect(Array.isArray(result)).toBe(true)
    expect(result[0]).toBe(shared)
    expect(Object.getPrototypeOf(result[0])).toBe(Object.prototype)
    expect(result[1]).toBe(next[1])
    expect(Object.getPrototypeOf(result[1])).toBe(Object.prototype)
  })

  it('creates null-prototype copies on the first difference', () => {
    const prev = { a: { x: 1 }, b: 2 }
    const result = nullReplaceEqualDeep(prev, { a: { x: 1 }, b: 3 })
    expect(Object.getPrototypeOf(result)).toBeNull()
    expect(result.a).toBe(prev.a)
    expect(result.b).toBe(3)
  })

  it('creates null-prototype copies when only the key sets differ', () => {
    const prev = { a: { x: 1 } }
    const result = nullReplaceEqualDeep(prev, { a: { x: 1 }, b: undefined })
    expect(Object.getPrototypeOf(result)).toBeNull()
    expect(result.a).toBe(prev.a)
    expect('b' in result).toBe(true)
  })

  it('reuses a changed child when only the root needs a null-prototype copy', () => {
    const prev = { shared: { x: 1 }, changed: { y: 1 } }
    const next = { shared: { x: 1 }, changed: { y: 2 } }
    const result = nullReplaceEqualDeep(prev, next)
    expect(Object.getPrototypeOf(result)).toBeNull()
    expect(result.changed).toBe(next.changed)
    expect(result.shared).toBe(prev.shared)
  })

  it('creates null-prototype copies at every level that needs replacements', () => {
    const prev = { outer: { shared: { id: 1 }, page: 1 } }
    const next = { outer: { shared: { id: 1 }, page: 2 } }
    const result = nullReplaceEqualDeep(prev, next)
    expect(Object.getPrototypeOf(result)).toBeNull()
    expect(Object.getPrototypeOf(result.outer)).toBeNull()
    expect(result.outer.shared).toBe(prev.outer.shared)
    expect(result.outer.page).toBe(2)
    expect(prev).toStrictEqual({ outer: { shared: { id: 1 }, page: 1 } })
    expect(next).toStrictEqual({ outer: { shared: { id: 1 }, page: 2 } })
  })

  it('stores an own __proto__ key instead of changing the prototype', () => {
    const prev = { name: 'Bob', shared: { id: 1 } }
    const next = JSON.parse(
      '{"__proto__":{"isAdmin":true},"name":"Alice","shared":{"id":1}}',
    )
    const result = nullReplaceEqualDeep(prev, next)
    expect(result.shared).toBe(prev.shared)
    expect(Object.getPrototypeOf(result)).toBeNull()
    expect(hasOwn.call(result, '__proto__')).toBe(true)
    expect(result['__proto__']).toEqual({ isAdmin: true })
    expect(result.name).toBe('Alice')
    expect(({} as any).isAdmin).toBeUndefined()
  })

  it('returns prev when a plain next equals a null-prototype prev', () => {
    const prev = Object.assign(Object.create(null), { a: 1, b: { c: 2 } })
    expect(nullReplaceEqualDeep(prev, { a: 1, b: { c: 2 } })).toBe(prev)
  })
})

describe('isPlainObject', () => {
  it.each([
    [
      'null-prototype record',
      Object.assign(Object.create(null), { inherited: 1 }),
    ],
    ['null constructor', { constructor: null }],
    ['undefined constructor', { constructor: undefined }],
  ])('shares records inheriting from a %s', (_name, proto) => {
    const prev = Object.assign(Object.create(proto), {
      child: { id: 1 },
      page: 1,
    })
    const equal = Object.assign(Object.create(proto), {
      child: { id: 1 },
      page: 1,
    })
    const next = Object.assign(Object.create(proto), {
      child: { id: 1 },
      page: 2,
    })

    expect(isPlainObject(prev)).toBe(true)
    expect(deepEqual(prev, equal)).toBe(true)
    expect(replaceEqualDeep(prev, equal)).toBe(prev)
    const result = replaceEqualDeep(prev, next)
    expect(result.child).toBe(prev.child)
    expect(result.page).toBe(2)
    expect(Object.keys(result)).toEqual(['child', 'page'])
  })

  it.each([
    ['object literal', {}],
    ['object literal with keys', { a: 1 }],
    ['Object.create(null)', Object.create(null)],
    ['object inheriting from a literal', Object.create({ inherited: 1 })],
    ['JSON.parse result', JSON.parse('{"a":1}')],
    ['frozen literal', Object.freeze({ a: 1 })],
    ['new Object()', new Object()],
    ['literal with an own constructor key', { constructor: 'foo' }],
    [
      'null-prototype object with an own constructor key',
      Object.assign(Object.create(null), { constructor: 'foo' }),
    ],
    ['decoded search with a constructor key', decode('constructor=foo&page=1')],
  ])('returns true for %s', (_name, value) => {
    expect(isPlainObject(value)).toBe(true)
  })

  class Foo {
    a = 1
  }

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['number', 1],
    ['string', 'a'],
    ['boolean', true],
    ['symbol', Symbol('s')],
    ['function', () => {}],
    ['empty array', []],
    ['array', [1]],
    ['Map', new Map()],
    ['Set', new Set()],
    ['Date', new Date()],
    ['RegExp', /x/],
    ['Promise', Promise.resolve()],
    ['class instance', new Foo()],
    ['Object.create(class prototype)', Object.create(Foo.prototype)],
    [
      'class instance with an own constructor key',
      Object.assign(new Foo(), { constructor: 'foo' }),
    ],
  ])('returns false for %s', (_name, value) => {
    expect(isPlainObject(value)).toBe(false)
  })

  it.each([
    ['string', 'foo'],
    ['number', 1],
    ['boolean', false],
    ['null', null],
    ['undefined', undefined],
    ['array', ['a', 'b']],
    ['object', { nested: 1 }],
  ])('stays plain with a %s-valued constructor key', (_name, value) => {
    expect(isPlainObject({ constructor: value })).toBe(true)
    expect(
      isPlainObject(Object.assign(Object.create(null), { constructor: value })),
    ).toBe(true)
  })

  it.each([
    ['literal', Object.prototype],
    ['null-prototype', null],
  ])(
    'treats a constructor key as data in %s search records',
    (_name, proto) => {
      const makeSearch = (constructor: string) =>
        Object.assign(Object.create(proto), {
          constructor,
          filters: { status: 'open' },
        })
      const share = proto === null ? nullReplaceEqualDeep : replaceEqualDeep

      const prev = makeSearch('foo')
      const equal = makeSearch('foo')
      const changed = makeSearch('bar')

      expect(isPlainObject(prev)).toBe(true)
      expect(deepEqual(prev, equal)).toBe(true)
      expect(share(prev, equal)).toBe(prev)

      expect(deepEqual(prev, changed)).toBe(false)
      const result = share(prev, changed)
      expect(result).not.toBe(prev)
      expect(result.constructor).toBe('bar')
      expect(result.filters).toBe(prev.filters)
      expect(Object.getPrototypeOf(result)).toBe(proto)
    },
  )

  it('shares decoded search records that carry a constructor key', () => {
    const prev = decode('constructor=foo&page=1')
    expect(prev.constructor).toBe('foo')

    expect(nullReplaceEqualDeep(prev, decode('constructor=foo&page=1'))).toBe(
      prev,
    )
    expect(deepEqual(prev, decode('page=1&constructor=foo'))).toBe(true)

    const changed = nullReplaceEqualDeep(prev, decode('constructor=bar&page=1'))
    expect(changed).not.toBe(prev)
    expect(changed.constructor).toBe('bar')
    expect(changed.page).toBe(1)

    const repeated = decode('constructor=a&constructor=b')
    expect(repeated.constructor).toStrictEqual(['a', 'b'])
    expect(deepEqual(repeated, decode('constructor=a&constructor=b'))).toBe(
      true,
    )
  })

  it('keeps class instances opaque for structural sharing and equality', () => {
    const prev = new Foo()
    const next = new Foo()
    expect(replaceEqualDeep(prev, next)).toBe(next)
    expect(deepEqual(prev, next)).toBe(false)
    expect(deepEqual({ foo: prev }, { foo: prev })).toBe(true)
  })

  it.each([null, undefined])(
    'keeps built-ins opaque with an own constructor valued %s',
    (constructor) => {
      for (const [prev, next] of [
        [new Date(0), new Date(1)],
        [new Map([['value', 0]]), new Map([['value', 1]])],
        [/before/, /after/],
      ]) {
        Object.assign(prev!, { constructor })
        Object.assign(next!, { constructor })
        expect(isPlainObject(prev)).toBe(false)
        expect(deepEqual(prev, next)).toBe(false)
        expect(replaceEqualDeep(prev, next)).toBe(next)
      }
    },
  )

  it('treats null-prototype and literal objects alike', () => {
    const nullProto = Object.assign(Object.create(null), { a: 1 })
    expect(deepEqual(nullProto, { a: 1 })).toBe(true)
    expect(deepEqual({ a: 1 }, nullProto)).toBe(true)
    expect(replaceEqualDeep(nullProto, { a: 1 })).toBe(nullProto)
  })
})

describe('isPlainArray', () => {
  it('should return `true` for plain arrays', () => {
    expect(isPlainArray([1, 2])).toEqual(true)
  })

  it('should return `false` for non plain arrays', () => {
    expect(isPlainArray(Object.assign([1, 2], { a: 'b' }))).toEqual(false)
  })
})

describe('deepEqual', () => {
  describe.each([false, true])('partial = %s', (partial) => {
    it('should return `true` for equal objects', () => {
      const a = { a: { b: 'b' }, c: 'c', d: [{ d: 'd ' }] }
      const b = { a: { b: 'b' }, c: 'c', d: [{ d: 'd ' }] }
      expect(deepEqual(a, b, partial)).toEqual(true)
      expect(deepEqual(b, a, partial)).toEqual(true)
    })

    it('should return `false` for non equal objects', () => {
      const a = { a: { b: 'b' }, c: 'c' }
      const b = { a: { b: 'c' }, c: 'c' }
      expect(deepEqual(a, b, partial)).toEqual(false)
      expect(deepEqual(b, a, partial)).toEqual(false)
    })

    it('should return `true` for equal objects and ignore `undefined` properties', () => {
      const a = { a: 'a', b: undefined, c: 'c' }
      const b = { a: 'a', c: 'c' }
      expect(deepEqual(a, b, partial)).toEqual(true)
      expect(deepEqual(b, a, partial)).toEqual(true)
    })

    it('should return `true` for equal objects and ignore `undefined` nested properties', () => {
      const a = { a: { b: 'b', x: undefined }, c: 'c' }
      const b = { a: { b: 'b' }, c: 'c', d: undefined }
      expect(deepEqual(a, b, partial)).toEqual(true)
      expect(deepEqual(b, a, partial)).toEqual(true)
    })

    it('should return `true` for equal arrays and ignore `undefined` object properties', () => {
      const a = { a: { b: 'b' }, c: undefined }
      const b = { a: { b: 'b' } }
      expect(deepEqual([a], [b], partial)).toEqual(true)
      expect(deepEqual([b], [a], partial)).toEqual(true)
    })

    it('should return `true` for equal arrays and ignore nested `undefined` object properties', () => {
      const a = { a: { b: 'b', x: undefined }, c: 'c' }
      const b = { a: { b: 'b' }, c: 'c' }
      expect(deepEqual([a], [b], partial)).toEqual(true)
      expect(deepEqual([b], [a], partial)).toEqual(true)
    })
  })

  describe('ignoreUndefined = false', () => {
    const ignoreUndefined = false
    describe('partial = false', () => {
      const partial = false
      it('should return `false` for objects', () => {
        const a = { a: { b: 'b', x: undefined }, c: 'c' }
        const b = { a: { b: 'b' }, c: 'c', d: undefined }
        expect(deepEqual(a, b, partial, !ignoreUndefined)).toEqual(false)
        expect(deepEqual(b, a, partial, !ignoreUndefined)).toEqual(false)
      })

      it('should return `false` for arrays', () => {
        const a = { a: { b: 'b', x: undefined }, c: 'c' }
        const b = { a: { b: 'b' }, c: 'c' }
        expect(deepEqual([a], [b], partial, !ignoreUndefined)).toEqual(false)
        expect(deepEqual([b], [a], partial, !ignoreUndefined)).toEqual(false)
      })
    })
    describe('partial = true', () => {
      const partial = true
      it('should return `true` for objects', () => {
        const a = { a: { b: 'b' }, c: 'c' }
        const b = { a: { b: 'b' }, c: 'c', d: undefined }
        expect(deepEqual(a, b, partial, !ignoreUndefined)).toEqual(true)
        expect(deepEqual(b, a, partial, !ignoreUndefined)).toEqual(true)
      })

      it('should return `true` for arrays', () => {
        const a = { a: { b: 'b', x: undefined }, c: 'c' }
        const b = { a: { b: 'b' }, c: 'c' }
        expect(deepEqual([a], [b], partial, !ignoreUndefined)).toEqual(true)
        expect(deepEqual([b], [a], partial, !ignoreUndefined)).toEqual(true)
      })
    })
  })

  describe('partial comparison', () => {
    it('correctly compares partially equal objects', () => {
      const a = { a: { b: 'b' }, c: 'c', d: [{ d: 'd ' }] }
      const b = { a: { b: 'b' }, c: 'c' }
      expect(deepEqual(a, b, true)).toEqual(true)
      expect(deepEqual(b, a, true)).toEqual(false)
    })

    it('correctly compares partially equal objects and ignores `undefined` object properties', () => {
      const a = { a: { b: 'b' }, c: 'c', d: [{ d: 'd ' }], e: undefined }
      const b = { a: { b: 'b' }, c: 'c', d: undefined }
      expect(deepEqual(a, b, true)).toEqual(true)
      expect(deepEqual(b, a, true)).toEqual(false)
    })
  })

  // This might not be what we want, but this test documents how things are now
  describe('symbol and non-enumerable properties are not handled', () => {
    it.fails(
      'should return `false` for unequal objects with symbol properties',
      () => {
        const key = Symbol('foo')
        const a = { [key]: 1 }
        const b = { [key]: 2 }
        expect(deepEqual(a, b)).toEqual(false)
      },
    )

    it.fails(
      'should return `false` for unequal objects with non-enumerable properties',
      () => {
        const a = {}
        Object.defineProperty(a, 'prop', { value: 1, enumerable: false })
        const b = {}
        Object.defineProperty(b, 'prop', { value: 2, enumerable: false })
        expect(deepEqual(a, b)).toEqual(false)
      },
    )
  })

  // We voluntarily fail in this case, because users should not do it, and ignoring it enables some performance improvements
  describe('augmented object prototype fail case (no one should do this anyway)', () => {
    it.fails(
      'should not compare objects with augmented prototype properties',
      () => {
        // @ts-expect-error -- typescript is right to complain here, don't do this!
        Object.prototype.x = 'x'
        const a = { a: 1 }
        const b = { a: 1 }
        expect(deepEqual(a, b, false, true)).toEqual(true)
      },
    )

    afterEach(() => {
      // it's probably not necessary to clean this up because vitest isolates tests
      // but just in case isolation ever gets disabled, we clean the prototype to avoid disturbing other tests
      // @ts-expect-error
      delete Object.prototype.x
    })
  })
})

describe('decodePath', () => {
  it('should decode a path segment, ignoring `%` and `\\` by default, with multiple ignored items existing', () => {
    const stringToCheck =
      'https://mozilla.org/?x=%25%D1%88%D0%B5%5C%D0%BB%D0%BB%D1%8B%2F'
    const expectedResult = 'https://mozilla.org/?x=%25ше%5Cллы%2F'

    const result = decodePath(stringToCheck)

    expect(result).toBe(expectedResult)
  })

  it('should handle malformed percent-encodings gracefully', () => {
    const stringToCheck = 'path%ZZ%D1%88test%5C%C3%A9'
    // Malformed sequences should remain as-is, valid ones decoded
    const result = decodePath(stringToCheck)
    expect(result).toBe(`path%ZZ%D1%88test%5Cé`)
  })

  it('should return empty string unchanged', () => {
    expect(decodePath('')).toBe('')
  })

  it('should return strings without encoding unchanged', () => {
    const stringToCheck = 'plain-text-path'
    expect(decodePath(stringToCheck)).toBe(stringToCheck)
  })

  it('should handle consecutive ignored characters', () => {
    const stringToCheck = 'test%25%25end'
    const expectedResult = 'test%25%25end'
    expect(decodePath(stringToCheck)).toBe(expectedResult)
  })

  it('should handle multiple ignored items of the same type with varying case', () => {
    const stringToCheck = '/params-ps/named/foo%2Fabc/c%2Fh'
    const expectedResult = '/params-ps/named/foo%2Fabc/c%2Fh'
    expect(decodePath(stringToCheck)).toBe(expectedResult)

    const stringToCheckWithLowerCase = '/params-ps/named/foo%2Fabc/c%5C%2f%5cAh'
    const expectedResultWithLowerCase =
      '/params-ps/named/foo%2Fabc/c%5C%2f%5cAh'
    expect(decodePath(stringToCheckWithLowerCase)).toBe(
      expectedResultWithLowerCase,
    )
  })

  describe('open redirect prevention', () => {
    it('should keep CR (%0d) encoded to prevent open redirect', () => {
      // %0d stays encoded — no decoding, no stripping, no path mismatch
      // Output is uppercase hex per RFC 3986
      const result = decodePath('/%0d/google.com/')
      expect(result).toBe('/%0D/google.com/')
      expect(result).not.toMatch(/^\/\//)
    })

    it('should keep LF (%0a) encoded to prevent open redirect', () => {
      const result = decodePath('/%0a/evil.com/')
      expect(result).toBe('/%0A/evil.com/')
      expect(result).not.toMatch(/^\/\//)
    })

    it('should keep CRLF (%0d%0a) encoded to prevent open redirect', () => {
      const result = decodePath('/%0d%0a/evil.com/')
      expect(result).toBe('/%0D%0A/evil.com/')
      expect(result).not.toMatch(/^\/\//)
    })

    it('should keep multiple control characters encoded', () => {
      const result = decodePath('/%0d%0d%0d/evil.com/')
      expect(result).toBe('/%0D%0D%0D/evil.com/')
      expect(result).not.toMatch(/^\/\//)
    })

    it('should keep null bytes encoded', () => {
      const result = decodePath('/%00/test/')
      expect(result).toBe('/%00/test/')
    })

    it('should handle normal paths unchanged', () => {
      expect(decodePath('/users/profile/')).toBe('/users/profile/')
      expect(decodePath('/api/v1/data')).toBe('/api/v1/data')
    })
  })

  describe('WHATWG path percent-encode set preserved', () => {
    it('should keep curly braces encoded', () => {
      const result = decodePath('/%7B%7Bapp_name%7D%7D/Makefile')
      expect(result).toBe('/%7B%7Bapp_name%7D%7D/Makefile')
    })

    it('should keep angle brackets encoded', () => {
      expect(decodePath('/%3Ctest%3E')).toBe('/%3Ctest%3E')
    })

    it('should keep double quotes encoded', () => {
      expect(decodePath('/foo%22bar')).toBe('/foo%22bar')
    })

    it('should keep backticks encoded', () => {
      expect(decodePath('/back%60tick')).toBe('/back%60tick')
    })

    it('should decode space (handled by encodePathLikeUrl for outgoing URLs)', () => {
      expect(decodePath('/file%20name')).toBe('/file name')
    })

    it('should still decode safe characters', () => {
      // Regular letters/unicode should still be decoded
      expect(decodePath('/%D1%88%D0%B5%D0%BB%D0%BB%D1%8B')).toBe('/шеллы')
    })
  })
})

/**
 * Tests for the key handling of replaceEqualDeep.
 *
 * Plain objects are compared and copied by their enumerable own string keys.
 * Objects with symbol keys (checked on `next`) or non-enumerable keys are opaque:
 * `next` passes through untouched, so no data is dropped and no stale object is
 * reused (Apollo's preloadQuery refs carry symbol keys, see #4237).
 */
describe('key handling (via replaceEqualDeep)', () => {
  describe('plain objects with string keys only', () => {
    it('should handle empty objects', () => {
      const prev = {}
      const next = {}
      expect(replaceEqualDeep(prev, next)).toBe(prev)
    })

    it('should handle objects with single key', () => {
      const prev = { a: 1 }
      const next = { a: 1 }
      expect(replaceEqualDeep(prev, next)).toBe(prev)
    })

    it('should handle objects with many keys', () => {
      const prev = {
        a: 1,
        b: 2,
        c: 3,
        d: 4,
        e: 5,
        f: 6,
        g: 7,
        h: 8,
        i: 9,
        j: 10,
      }
      const next = {
        a: 1,
        b: 2,
        c: 3,
        d: 4,
        e: 5,
        f: 6,
        g: 7,
        h: 8,
        i: 9,
        j: 10,
      }
      expect(replaceEqualDeep(prev, next)).toBe(prev)
    })

    it('should handle objects with numeric string keys', () => {
      const prev = { '0': 'a', '1': 'b', '2': 'c' }
      const next = { '0': 'a', '1': 'b', '2': 'c' }
      expect(replaceEqualDeep(prev, next)).toBe(prev)
    })

    it('should handle objects with special string keys', () => {
      const prev = {
        'key-with-dash': 1,
        'key.with.dot': 2,
        'key with space': 3,
      }
      const next = {
        'key-with-dash': 1,
        'key.with.dot': 2,
        'key with space': 3,
      }
      expect(replaceEqualDeep(prev, next)).toBe(prev)
    })

    it('should detect differences in objects with string keys', () => {
      const prev = { a: 1, b: 2, c: 3 }
      const next = { a: 1, b: 99, c: 3 }
      const result = replaceEqualDeep(prev, next)
      expect(result).not.toBe(prev)
      expect(result).toEqual(next)
    })
  })

  describe('objects with symbol keys pass through untouched', () => {
    it('returns next for a single symbol key', () => {
      const sym = Symbol('test')
      const prev = { [sym]: 1 }
      const next = { [sym]: 1 }
      expect(replaceEqualDeep(prev, next)).toBe(next)
    })

    it('returns next for multiple symbol keys', () => {
      const sym1 = Symbol('a')
      const sym2 = Symbol('b')
      const sym3 = Symbol('c')
      const prev = { [sym1]: 1, [sym2]: 2, [sym3]: 3 }
      const next = { [sym1]: 1, [sym2]: 2, [sym3]: 3 }
      expect(replaceEqualDeep(prev, next)).toBe(next)
    })

    it('keeps differing symbol values', () => {
      const sym = Symbol('test')
      const prev = { [sym]: 1 }
      const next = { [sym]: 2 }
      const result = replaceEqualDeep(prev, next)
      expect(result).not.toBe(prev)
      expect(result[sym]).toBe(2)
    })

    it('returns next for global symbols', () => {
      const sym = Symbol.for('global.test.key')
      const prev = { [sym]: 'value' }
      const next = { [sym]: 'value' }
      expect(replaceEqualDeep(prev, next)).toBe(next)
    })

    it('does not share a symbol-keyed prev when next has no symbols', () => {
      const sym = Symbol('test')
      const prev = { a: 1, [sym]: 1 }
      const next = { a: 1 }
      expect(replaceEqualDeep(prev, next)).toBe(next)
    })

    it('removes a previous non-enumerable symbol', () => {
      const sym = Symbol('hidden')
      const prev = Object.defineProperty({ a: 1 }, sym, { value: 'old' })
      const next = { a: 1 }
      expect(replaceEqualDeep(prev, next)).toBe(next)
    })

    it.each(['first', 'last'])(
      'removes nested symbols in the %s entry',
      (position) => {
        const sym = Symbol('metadata')
        const removed = { a: 1, [sym]: 'old' }
        const shared = { b: 2 }
        const prev =
          position === 'first'
            ? { removed, shared, changed: 0 }
            : { changed: 0, shared, removed }
        const next =
          position === 'first'
            ? { removed: { a: 1 }, shared: { b: 2 }, changed: 1 }
            : { changed: 1, shared: { b: 2 }, removed: { a: 1 } }
        const result = replaceEqualDeep(prev, next)
        expect(result).toStrictEqual(next)
        expect(result.removed).toBe(next.removed)
        expect(result.shared).toBe(shared)
      },
    )

    it('removes symbols by reusing a null-prototype next object', () => {
      const sym = Symbol('metadata')
      const prev = Object.assign(Object.create(null), { a: 1, [sym]: 'old' })
      const next = Object.assign(Object.create(null), { a: 1 })
      expect(nullReplaceEqualDeep(prev, next)).toBe(next)
    })

    it('preserves incoming values when previous symbols exist in null-prototype mode', () => {
      const sym = Symbol('metadata')
      const prev = { child: { a: 1 }, page: 1, [sym]: 'old' }
      const next = { child: { a: 1 }, page: 2 }
      const result = nullReplaceEqualDeep(prev, next)
      expect({ ...result }).toStrictEqual(next)
      expect(Object.getOwnPropertySymbols(result)).toEqual([])
      expect(result.page).toBe(2)
    })

    it('keeps an opaque next object unchanged in null-prototype mode', () => {
      const next = { child: { a: 1 }, [Symbol('metadata')]: 'kept' }
      const result = nullReplaceEqualDeep({ child: { a: 1 } }, next)
      expect(result).toBe(next)
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    })

    it('preserves incoming values when previous symbols accompany changed string keys', () => {
      const sym = Symbol('metadata')
      const prev = { changed: 0, child: { a: 1 }, [sym]: 'old' }
      const next = { changed: 1, child: { a: 1 } }
      const result = replaceEqualDeep(prev, next)
      expect(result).toStrictEqual(next)
      expect(prev[sym]).toBe('old')
    })

    it('preserves incoming values when previous symbols accompany removed string keys', () => {
      const sym = Symbol('metadata')
      const prev = { removed: 0, child: { a: 1 }, [sym]: 'old' }
      const next = { child: { a: 1 } }
      const result = replaceEqualDeep(prev, next)
      expect(result).toStrictEqual(next)
      expect(prev[sym]).toBe('old')
    })
  })

  describe('objects with mixed string and symbol keys', () => {
    it('returns next when both string and symbol keys are present', () => {
      const sym = Symbol('test')
      const prev = { a: 1, b: 2, [sym]: 3 }
      const next = { a: 1, b: 2, [sym]: 3 }
      expect(replaceEqualDeep(prev, next)).toBe(next)
    })

    it('keeps string differences when symbols present', () => {
      const sym = Symbol('test')
      const prev = { a: 1, b: 2, [sym]: 3 }
      const next = { a: 1, b: 99, [sym]: 3 }
      const result = replaceEqualDeep(prev, next)
      expect(result).not.toBe(prev)
      expect(result.b).toBe(99)
      expect(result[sym]).toBe(3)
    })

    it('keeps symbol differences when strings present', () => {
      const sym = Symbol('test')
      const prev = { a: 1, b: 2, [sym]: 3 }
      const next = { a: 1, b: 2, [sym]: 99 }
      const result = replaceEqualDeep(prev, next)
      expect(result).not.toBe(prev)
      expect(result.a).toBe(1)
      expect(result[sym]).toBe(99)
    })

    it('shares plain siblings around a nested symbol-keyed object', () => {
      const sym = Symbol('nested')
      const prev = {
        outer: { inner: 1, [sym]: { deep: 'value' } },
        plain: { x: 1 },
      }
      const next = {
        outer: { inner: 1, [sym]: { deep: 'value' } },
        plain: { x: 1 },
      }
      const result = replaceEqualDeep(prev, next)
      expect(result).not.toBe(prev)
      expect(result.outer).toBe(next.outer)
      expect(result.plain).toBe(prev.plain)
    })
  })

  describe('non-enumerable properties', () => {
    it('should treat objects with non-enumerable string property as non-plain', () => {
      const prev: Record<string, number> = { a: 1 }
      Object.defineProperty(prev, 'hidden', { value: 2, enumerable: false })
      const next: Record<string, number> = { a: 1 }
      Object.defineProperty(next, 'hidden', { value: 2, enumerable: false })

      // Non-plain objects should return next, not prev (no structural sharing)
      const result = replaceEqualDeep(prev, next)
      expect(result).toBe(next)
    })

    it('should treat objects with non-enumerable symbol property as non-plain', () => {
      const sym = Symbol('hidden')
      const prev: Record<string | symbol, number> = { a: 1 }
      Object.defineProperty(prev, sym, { value: 2, enumerable: false })
      const next: Record<string | symbol, number> = { a: 1 }
      Object.defineProperty(next, sym, { value: 2, enumerable: false })

      // Non-plain objects should return next, not prev
      const result = replaceEqualDeep(prev, next)
      expect(result).toBe(next)
    })

    it('should handle mix of enumerable and non-enumerable properties', () => {
      const prev: Record<string, number> = { visible: 1 }
      Object.defineProperty(prev, 'hidden', { value: 2, enumerable: false })
      const next = { visible: 1 }

      // prev is non-plain (has non-enumerable), next is plain
      const result = replaceEqualDeep(prev, next)
      expect(result).toBe(next)
    })

    it('should handle non-enumerable property that shadows a string key', () => {
      const prev = Object.create(null)
      prev.a = 1
      Object.defineProperty(prev, 'b', { value: 2, enumerable: false })

      const next = Object.create(null)
      next.a = 1
      next.b = 2 // enumerable version

      const result = replaceEqualDeep(prev, next)
      expect(result).toBe(next)
    })
  })

  describe('edge cases for key enumeration', () => {
    it('should handle frozen objects as non-plain (configurable is false)', () => {
      const prev = Object.freeze({ a: 1, b: 2 })
      const next = Object.freeze({ a: 1, b: 2 })

      // Frozen objects have all properties as non-configurable but still enumerable
      // They should still work with replaceEqualDeep
      const result = replaceEqualDeep(prev, next)
      expect(result).toBe(prev)
    })

    it('should handle sealed objects', () => {
      const prev = Object.seal({ a: 1, b: 2 })
      const next = Object.seal({ a: 1, b: 2 })

      const result = replaceEqualDeep(prev, next)
      expect(result).toBe(prev)
    })

    it('should handle objects created with Object.create(null)', () => {
      const prev = Object.create(null)
      prev.a = 1
      prev.b = 2

      const next = Object.create(null)
      next.a = 1
      next.b = 2

      const result = replaceEqualDeep(prev, next)
      expect(result).toBe(prev)
    })

    it('should handle objects with inherited properties (only own props checked)', () => {
      const proto = { inherited: 'value' }
      const prev = Object.create(proto)
      prev.own = 1

      const next = Object.create(proto)
      next.own = 1

      const result = replaceEqualDeep(prev, next)
      expect(result).toBe(prev)
    })

    it('should not be confused by Object.prototype properties', () => {
      // Ensure hasOwnProperty, toString, etc. don't interfere
      const prev = { hasOwnProperty: 1, toString: 2, valueOf: 3 }
      const next = { hasOwnProperty: 1, toString: 2, valueOf: 3 }
      const result = replaceEqualDeep(prev, next)
      expect(result).toBe(prev)
    })
  })

  describe('performance-critical scenarios (typical router state)', () => {
    it('should efficiently handle typical router location object', () => {
      const prev = {
        pathname: '/users/123',
        search: '?tab=settings',
        hash: '#section',
        state: { key: 'abc123' },
      }
      const next = {
        pathname: '/users/123',
        search: '?tab=settings',
        hash: '#section',
        state: { key: 'abc123' },
      }
      expect(replaceEqualDeep(prev, next)).toBe(prev)
    })

    it('should efficiently handle typical router match object', () => {
      const prev = {
        id: 'route-1',
        routeId: '/users/$userId',
        pathname: '/users/123',
        params: { userId: '123' },
        search: {},
        fullPath: '/users/$userId',
        loaderData: { user: { name: 'John' } },
      }
      const next = {
        id: 'route-1',
        routeId: '/users/$userId',
        pathname: '/users/123',
        params: { userId: '123' },
        search: {},
        fullPath: '/users/$userId',
        loaderData: { user: { name: 'John' } },
      }
      expect(replaceEqualDeep(prev, next)).toBe(prev)
    })

    it('should efficiently handle array of matches', () => {
      const prev = [
        { id: '1', routeId: '__root__', pathname: '/', params: {} },
        { id: '2', routeId: '/users', pathname: '/users', params: {} },
        {
          id: '3',
          routeId: '/users/$userId',
          pathname: '/users/123',
          params: { userId: '123' },
        },
      ]
      const next = [
        { id: '1', routeId: '__root__', pathname: '/', params: {} },
        { id: '2', routeId: '/users', pathname: '/users', params: {} },
        {
          id: '3',
          routeId: '/users/$userId',
          pathname: '/users/123',
          params: { userId: '123' },
        },
      ]
      expect(replaceEqualDeep(prev, next)).toBe(prev)
    })

    it('preserves identity of unchanged nested subtrees when one leaf changes', () => {
      const prev = {
        search: { q: 'hello', f: 'live' },
        params: { username: 'elonmusk', tweetId: '123' },
        loaderData: {
          user: { id: '44196397', name: 'Elon' },
          tabs: ['a', 'b'],
        },
      }
      const next = {
        search: { q: 'hello', f: 'live' },
        params: { username: 'elonmusk', tweetId: '123' },
        loaderData: {
          user: { id: '44196397', name: 'Musk' },
          tabs: ['a', 'b'],
        },
      }
      const result = replaceEqualDeep(prev, next)
      // user.name changed -> top object is new, but every unchanged subtree
      // (including the array) keeps its previous reference for cheap memo checks.
      expect(result).not.toBe(prev)
      expect(result.search).toBe(prev.search)
      expect(result.params).toBe(prev.params)
      expect(result.loaderData.tabs).toBe(prev.loaderData.tabs)
      expect(result.loaderData.user).not.toBe(prev.loaderData.user)
      expect(result.loaderData.user.name).toBe('Musk')
    })

    it('bails to next for a nested object carrying a non-enumerable prop', () => {
      const prevInner: Record<string, number> = { a: 1 }
      Object.defineProperty(prevInner, 'hidden', {
        value: 2,
        enumerable: false,
      })
      const nextInner: Record<string, number> = { a: 1 }
      Object.defineProperty(nextInner, 'hidden', {
        value: 2,
        enumerable: false,
      })
      const prev = { shared: { x: 1 }, inner: prevInner }
      const next = { shared: { x: 1 }, inner: nextInner }
      const result = replaceEqualDeep(prev, next)
      // inner is not clone-friendly -> returns nextInner; sibling subtree shared.
      expect(result.inner).toBe(nextInner)
      expect(result.shared).toBe(prev.shared)
    })
  })
})

describe('escapeHtml', () => {
  it('should escape less-than sign', () => {
    expect(escapeHtml('<')).toBe('\\u003c')
  })

  it('should escape greater-than sign', () => {
    expect(escapeHtml('>')).toBe('\\u003e')
  })

  it('should escape ampersand', () => {
    expect(escapeHtml('&')).toBe('\\u0026')
  })

  it('should escape line separator (U+2028)', () => {
    expect(escapeHtml('\u2028')).toBe('\\u2028')
  })

  it('should escape paragraph separator (U+2029)', () => {
    expect(escapeHtml('\u2029')).toBe('\\u2029')
  })

  it('should escape multiple characters', () => {
    expect(escapeHtml('<script>alert("XSS")</script>')).toBe(
      '\\u003cscript\\u003ealert("XSS")\\u003c/script\\u003e',
    )
  })

  it('should handle script tag injection attempt in JSON', () => {
    const maliciousKey = '</script><script>alert("XSS")</script>'
    const json = JSON.stringify({ key: maliciousKey })
    const escaped = escapeHtml(json)

    // The escaped version should not contain literal < or > characters
    expect(escaped).not.toContain('<')
    expect(escaped).not.toContain('>')

    // The escaped version should still be valid JSON when evaluated
    // (the escape sequences are valid in JavaScript strings)
    expect(escaped).toContain('\\u003c')
    expect(escaped).toContain('\\u003e')
  })

  it('should return strings without special characters unchanged', () => {
    const safe = 'hello world 123'
    expect(escapeHtml(safe)).toBe(safe)
  })

  it('should handle empty string', () => {
    expect(escapeHtml('')).toBe('')
  })

  it('should handle mixed content', () => {
    expect(escapeHtml('a<b>c&d\u2028e\u2029f')).toBe(
      'a\\u003cb\\u003ec\\u0026d\\u2028e\\u2029f',
    )
  })
})

describe('encodePathLikeUrl', () => {
  it('should return path unchanged if no non-ASCII characters', () => {
    expect(encodePathLikeUrl('/foo/bar/baz')).toBe('/foo/bar/baz')
  })

  it('should encode non-ASCII characters', () => {
    expect(encodePathLikeUrl('/path/caf\u00e9')).toBe('/path/caf%C3%A9')
  })

  it('should encode unicode characters in path segments', () => {
    expect(encodePathLikeUrl('/users/\u4e2d\u6587/profile')).toBe(
      '/users/%E4%B8%AD%E6%96%87/profile',
    )
  })

  it('should encode spaces but preserve other ASCII special characters', () => {
    // encodePathLikeUrl encodes whitespace and non-ASCII, but not other ASCII special chars
    expect(encodePathLikeUrl('/path/file name.pdf')).toBe(
      '/path/file%20name.pdf',
    )
    expect(encodePathLikeUrl('/path/file[1].pdf')).toBe('/path/file[1].pdf')
    expect(encodePathLikeUrl('/path#section')).toBe('/path#section')
  })

  it('should handle mixed ASCII and non-ASCII characters', () => {
    expect(encodePathLikeUrl('/path/caf\u00e9 (copy).pdf')).toBe(
      '/path/caf%C3%A9%20(copy).pdf',
    )
  })

  it('should handle emoji characters', () => {
    expect(encodePathLikeUrl('/path/\u{1F600}/file')).toBe(
      '/path/%F0%9F%98%80/file',
    )
  })
})
