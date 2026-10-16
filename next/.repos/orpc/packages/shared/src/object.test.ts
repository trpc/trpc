import * as a from 'arktype'
import * as v from 'valibot'
import z from 'zod'
import { bindMethods, clone, copyOnWrite, findDeepMatches, get, getConstructor, getConstructors, getOwn, isPlainObject, isPropertyKey, mergeTwoLevels, NullProtoObj, omit, pick, set, setOwn } from './object'

it('findDeepMatches', () => {
  const { maps, values } = findDeepMatches(v => typeof v === 'string', {
    array: ['v1', 'v2'],
    nested: {
      nested: [
        {
          nested: {
            v: 'v3',
          },
        },
        'v4',
      ],
    },
    ignored: 42,
  })

  expect(maps).toEqual([
    ['array', 0],
    ['array', 1],
    ['nested', 'nested', 0, 'nested', 'v'],
    ['nested', 'nested', 1],
  ])

  expect(values).toEqual([
    'v1',
    'v2',
    'v3',
    'v4',
  ])
})

it('getConstructor', () => {
  expect(getConstructor(null)).toBeNull()
  expect(getConstructor(undefined)).toBeNull()
  expect(getConstructor(true)).toBeNull()

  expect(getConstructor({})).toBe(Object)
  expect(getConstructor(new Error('hi'))).toBe(Error)
  expect(getConstructor(() => { })).toBe(Function)
})

describe('getConstructors', () => {
  it('returns nothing for primitives', () => {
    expect([...getConstructors(null)]).toEqual([])
    expect([...getConstructors(undefined)]).toEqual([])
    expect([...getConstructors(123)]).toEqual([])
    expect([...getConstructors('string')]).toEqual([])
    expect([...getConstructors(true)]).toEqual([])
    expect([...getConstructors(Symbol('s'))]).toEqual([])
  })

  it('works with plain objects and built-ins', () => {
    expect([...getConstructors({})]).toEqual([Object])
    expect([...getConstructors([])]).toEqual([Array, Object])
    expect([...getConstructors(new Map())]).toEqual([Map, Object])
    expect([...getConstructors(new Error('hi'))]).toEqual([Error, Object])
  })

  it('returns the full chain for class inheritance', () => {
    class GrandParent {}
    class Parent extends GrandParent {}
    class Child extends Parent {}

    expect([...getConstructors(new Child())]).toEqual([Child, Parent, GrandParent, Object])
    expect([...getConstructors(new Parent())]).toEqual([Parent, GrandParent, Object])
    expect([...getConstructors(new GrandParent())]).toEqual([GrandParent, Object])
  })

  it('works with classes extending built-ins', () => {
    class MyError extends Error {}
    class SubError extends MyError {}

    expect([...getConstructors(new SubError())]).toEqual([SubError, MyError, Error, Object])
  })

  it('returns nothing for null-prototype objects', () => {
    expect([...getConstructors(Object.create(null))]).toEqual([])
  })

  it('skips levels without a constructor', () => {
    const proto = Object.create(null) // no constructor
    const instance = Object.create(proto)

    expect([...getConstructors(instance)]).toEqual([])
  })

  it('is lazy', () => {
    class Parent {}
    class Child extends Parent {}

    const generator = getConstructors(new Child())
    expect(generator.next().value).toBe(Child)
    expect(generator.next().value).toBe(Parent)
  })
})

it('isPlainObject', () => {
  expect(new Error('hi')).not.toSatisfy(isPlainObject)
  expect(new Map()).not.toSatisfy(isPlainObject)
  expect(new Set()).not.toSatisfy(isPlainObject)
  expect(new Date()).not.toSatisfy(isPlainObject)
  expect(false).not.toSatisfy(isPlainObject)
  expect([]).not.toSatisfy(isPlainObject)

  expect({}).toSatisfy(isPlainObject)
  expect(Object.create(null)).toSatisfy(isPlainObject)
  expect((() => {
    const obj = {}
    Object.setPrototypeOf(obj, null)
    return obj
  })()).toSatisfy(isPlainObject)
})

it('getOwn', () => {
  expect(getOwn({ a: 1 }, 'a')).toEqual(1)
  expect(getOwn({ a: 1 }, 'b')).toBeUndefined()
  expect(getOwn({ a: 1 }, 'toString')).toBeUndefined()
  expect(getOwn({ toString: 1 } as any, 'toString')).toEqual(1)
})

it('get', () => {
  expect(get({ a: { b: 1 } }, ['a', 'b'])).toEqual(1)
  expect(get({ a: { b: 1 } }, ['a', 'b', 'c'])).toEqual(undefined)
  expect(get({ a: { b: 1 } }, ['a', 'b', 'c', 'd'])).toEqual(undefined)
  expect(get({ a: { b: () => { } } }, ['a', 'b', 'name'])).toEqual('b')
  expect(get({ a: { b: () => { } } }, ['a', 'b', 'uuuu'])).toEqual(undefined)
  expect(get({ a: { b: () => { } } }, ['a', 'b', 'uuuu', 'zzzz'])).toEqual(undefined)
  expect(get({}, ['__proto__'])).toEqual(undefined)
  expect(get({}, ['constructor'])).toEqual(undefined)
  expect(get({}, ['toString'])).toEqual(undefined)
  expect(get({}, ['constructor', 'prototype'])).toEqual(undefined)
})

describe('set', () => {
  it('sets a value at a single-key path', () => {
    const root = {}
    set(root, ['a'], 1)
    expect(root).toEqual({ a: 1 })
  })

  it('sets a value at a nested path', () => {
    const root = {}
    set(root, ['a', 'b', 'c'], 'value')
    expect(root).toEqual({ a: { b: { c: 'value' } } })
  })

  it('overwrites an existing value', () => {
    const root = { a: 1 }
    set(root, ['a'], 2)
    expect(root).toEqual({ a: 2 })
  })

  it('overwrites a non-object intermediate with a plain object', () => {
    const root: Record<string, unknown> = { a: 42 }
    set(root, ['a', 'b'], 'value')
    expect(root).toEqual({ a: { b: 'value' } })
  })

  it('preserves existing sibling keys when setting nested values', () => {
    const root = { a: { x: 1 } }
    set(root, ['a', 'b'], 2)
    expect(root).toEqual({ a: { x: 1, b: 2 } })
  })

  it('supports symbol keys', () => {
    const root: Record<PropertyKey, unknown> = {}
    const sym = Symbol('key')
    set(root, [sym], 'sym-value')
    expect(root[sym]).toBe('sym-value')
  })

  it('supports number keys', () => {
    const root: Record<PropertyKey, unknown> = {}
    set(root, [0, 1], 'nested')
    expect((root[0] as Record<PropertyKey, unknown>)[1]).toBe('nested')
  })

  it('sets value to null', () => {
    const root: Record<string, unknown> = {}
    set(root, ['a'], null)
    expect(root).toEqual({ a: null })
  })

  it('sets value to undefined', () => {
    const root: Record<string, unknown> = {}
    set(root, ['a'], undefined)
    expect(root).toEqual({ a: undefined })
  })

  it('treats an array intermediate as an object (does not replace it)', () => {
    const root: Record<string, unknown> = { a: [1, 2, 3] }
    set(root, ['a', 'b'], 'value')
    const arr = root.a as Record<string, unknown>
    expect(Array.isArray(arr)).toBe(true)
    expect(arr.b).toBe('value')
  })

  it('treats a class instance intermediate as an object (does not replace it)', () => {
    const date = new Date()
    const root: Record<string, unknown> = { a: date }
    set(root, ['a', 'b'], 'value')
    expect(root.a).toBe(date)
    expect((root.a as Record<string, unknown>).b).toBe('value')
  })

  it('does not pollute the prototype via __proto__', () => {
    const root: Record<string, unknown> = {}
    set(root, ['__proto__', 'polluted'], 'yes')

    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.getPrototypeOf(root)).toBe(Object.prototype)
    expect(Object.hasOwn(root, '__proto__')).toBe(true)
    // eslint-disable-next-line no-proto, no-restricted-properties
    expect((root as any).__proto__).toEqual({ polluted: 'yes' })
  })

  it('does not pollute the prototype via constructor.prototype', () => {
    const root: Record<string, unknown> = {}
    set(root, ['constructor', 'prototype', 'polluted'], 'yes')

    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect((Object.prototype as any).polluted).toBeUndefined()
    expect(Object.hasOwn(root, 'constructor')).toBe(true)
    expect(root.constructor).toEqual({ prototype: { polluted: 'yes' } })
  })

  it('sets __proto__ as an own property instead of changing the prototype', () => {
    const root: Record<string, unknown> = {}
    set(root, ['__proto__'], 'value')

    expect(Object.getPrototypeOf(root)).toBe(Object.prototype)
    expect(Object.hasOwn(root, '__proto__')).toBe(true)
    // eslint-disable-next-line no-proto, no-restricted-properties
    expect((root as any).__proto__).toBe('value')
  })
})

describe('setOwn', () => {
  it('sets a value', () => {
    const root: Record<string, unknown> = {}
    setOwn(root, 'a', 1)
    expect(root).toEqual({ a: 1 })
  })

  it('overwrites an existing value', () => {
    const root: Record<string, unknown> = { a: 1 }
    setOwn(root, 'a', 2)
    expect(root).toEqual({ a: 2 })
  })

  it('supports symbol and number keys', () => {
    const root: Record<PropertyKey, unknown> = {}
    const sym = Symbol('key')

    setOwn(root, sym, 'sym-value')
    setOwn(root, 0, 'number-value')

    expect(root[sym]).toBe('sym-value')
    expect(root[0]).toBe('number-value')
  })

  it('writes through to an array index', () => {
    const root: unknown[] = []
    setOwn(root, 0, 'value')

    expect(root).toEqual(['value'])
    expect(root.length).toBe(1)
  })

  it('sets __proto__ as an own property instead of changing the prototype', () => {
    const root: Record<string, unknown> = {}
    setOwn(root, '__proto__', 'value')

    expect(Object.getPrototypeOf(root)).toBe(Object.prototype)
    expect(getOwn(root, '__proto__')).toBe('value')
    // eslint-disable-next-line no-proto, no-restricted-properties
    expect((root as any).__proto__).toBe('value')
  })

  it('does not pollute the prototype via __proto__', () => {
    const root: Record<string, unknown> = {}
    setOwn(root, '__proto__', { polluted: 'yes' })

    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect((Object.prototype as any).polluted).toBeUndefined()
    expect(Object.getPrototypeOf(root)).toBe(Object.prototype)
    expect(root.polluted).toBeUndefined()
  })

  it('sets __proto__ on a null prototype object', () => {
    const root = new NullProtoObj<Record<string, unknown>>()
    setOwn(root, '__proto__', 'value')

    expect(Object.getPrototypeOf(root)).toBe(Object.getPrototypeOf(new NullProtoObj()))
    expect(getOwn(root, '__proto__')).toBe('value')
  })

  it('defines __proto__ as a writable, enumerable and configurable property', () => {
    const root: Record<string, unknown> = {}
    setOwn(root, '__proto__', 'value')

    expect(Object.getOwnPropertyDescriptor(root, '__proto__')).toEqual({
      value: 'value',
      writable: true,
      enumerable: true,
      configurable: true,
    })

    expect(Object.keys(root)).toEqual(['__proto__'])

    setOwn(root, '__proto__', 'updated')
    expect(getOwn(root, '__proto__')).toBe('updated')
  })
})

describe('mergeTwoLevels', () => {
  it('merges the root level', () => {
    expect(mergeTwoLevels({ a: 1, shared: 'first' }, { b: 2, shared: 'second' })).toEqual({
      a: 1,
      b: 2,
      shared: 'second',
    })
  })

  it('merges one level deeper', () => {
    expect(mergeTwoLevels(
      { user: { name: 'NAME', shared: 'first' } },
      { user: { age: 1, shared: 'second' } },
    )).toEqual({
      user: { name: 'NAME', age: 1, shared: 'second' },
    })
  })

  it('replaces anything deeper than two levels', () => {
    expect(mergeTwoLevels(
      { user: { address: { city: 'CITY' } } },
      { user: { address: { zip: 'ZIP' } } },
    )).toEqual({
      user: { address: { zip: 'ZIP' } },
    })
  })

  it('replaces when the values are not both plain objects', () => {
    const date = new Date()

    expect(mergeTwoLevels({ a: 1 }, 'REPLACED')).toBe('REPLACED')
    expect(mergeTwoLevels('REPLACED', { a: 1 })).toEqual({ a: 1 })
    expect(mergeTwoLevels({ a: { b: 1 } }, { a: [1] })).toEqual({ a: [1] })
    expect(mergeTwoLevels({ a: { b: 1 } }, { a: date })).toEqual({ a: date })
    expect(mergeTwoLevels({ a: undefined }, { a: { b: 1 } })).toEqual({ a: { b: 1 } })
  })

  it('does not merge a key the second object only inherits', () => {
    // `isPlainObject` accepts a prototype without a `constructor`, such as a `NullProtoObj`
    const proto: any = new NullProtoObj()
    proto.user = { polluted: true }

    const second: any = Object.create(proto)
    second.other = 1

    expect(mergeTwoLevels({ user: { name: 'NAME' } }, second)).toEqual({
      user: { name: 'NAME' },
      other: 1,
    })
  })

  it('returns a new object', () => {
    const first = { a: { b: 1 } }
    const merged = mergeTwoLevels(first, { a: { c: 2 } }) as any

    expect(merged).not.toBe(first)
    expect(first).toEqual({ a: { b: 1 } })
  })

  it('reads own properties only and keeps special keys as own properties', () => {
    const merged = mergeTwoLevels({}, JSON.parse('{ "__proto__": { "polluted": true } }')) as any

    // `{}.__proto__` resolves to Object.prototype, which must not be merged in as if it were own
    expect(Object.getOwnPropertyDescriptor(merged, '__proto__')?.value).toEqual({ polluted: true })
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype)
    expect(({} as any).polluted).toBeUndefined()
  })

  it('ignores inherited values when merging one level deeper', () => {
    const first = Object.create({ inherited: { a: 1 } })
    first.own = { b: 2 }

    expect(mergeTwoLevels({ ...first }, { inherited: { c: 3 }, own: { d: 4 } })).toEqual({
      inherited: { c: 3 },
      own: { b: 2, d: 4 },
    })
  })
})

describe('omit', () => {
  it('omits specified keys', () => {
    expect(omit({ a: 1, b: 2, c: 3 }, ['b'])).toEqual({
      a: 1,
      c: 3,
    })
  })

  it('returns a new object', () => {
    const obj = { a: 1 }

    expect(omit(obj, [])).not.toBe(obj)
  })

  it('ignores missing keys', () => {
    expect(omit({ a: 1 }, ['b' as never])).toEqual({
      a: 1,
    })
  })

  it('omits multiple keys', () => {
    expect(omit({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({
      b: 2,
    })
  })
})

describe('pick', () => {
  it('picks specified keys', () => {
    expect(pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({
      a: 1,
      c: 3,
    })
  })

  it('keeps keys explicitly set to undefined', () => {
    const result = pick({ a: undefined, b: 2 } as { a?: number, b: number }, ['a'])

    expect(result).toEqual({ a: undefined })
    expect(Object.hasOwn(result, 'a')).toBe(true)
  })

  it('skips missing and inherited keys', () => {
    const obj = Object.create({ inherited: 1 }) as { inherited?: number, missing?: number }

    expect(Object.keys(pick(obj, ['inherited', 'missing']))).toEqual([])
  })
})

it('isPropertyKey', () => {
  expect(isPropertyKey('a')).toBe(true)
  expect(isPropertyKey(1)).toBe(true)
  expect(isPropertyKey(Symbol('a'))).toBe(true)

  expect(isPropertyKey({})).toBe(false)
  expect(isPropertyKey([])).toBe(false)
  expect(isPropertyKey(null)).toBe(false)
})

it('nullProtoObj', () => {
  const obj = new NullProtoObj()

  obj.a = 1
  // eslint-disable-next-line no-restricted-properties, no-proto
  obj.__proto__ = 2

  expect(obj).toSatisfy(isPlainObject)

  expect(obj.a).toBe(1)
  // eslint-disable-next-line no-restricted-properties, no-proto
  expect(obj.__proto__).toBe(2)

  // compatible with common validation libs
  expect(z.object({ a: z.number() }).parse(obj)).toEqual(expect.objectContaining({ a: 1 }))
  expect(v.parse(v.object({ a: v.number() }), obj)).toEqual(expect.objectContaining({ a: 1 }))
  expect(a.type({ a: 'number' })(obj)).toEqual(expect.objectContaining({ a: 1 }))

  const clone = { ...obj }
  expect(Object.getPrototypeOf(clone).constructor).toBe(Object)
  // eslint-disable-next-line no-restricted-properties, no-proto
  expect(clone.__proto__).toBe(2)
  expect(clone.a).toBe(1)
})

describe('copyOnWrite', () => {
  it('copies arrays and plain objects still held by the input, returns everything else as is', () => {
    const child = { a: 1 }
    const list = [1]
    const parent = { child, list, date: new Date(), none: null }

    const childCopy = copyOnWrite(parent, 'child', child)
    expect(childCopy).toEqual(child)
    expect(childCopy).not.toBe(child)
    expect(parent.child).toBe(childCopy)
    expect(copyOnWrite(parent, 'child', child)).toBe(childCopy)

    const listCopy = copyOnWrite(parent, 'list', list)
    expect(listCopy).toEqual(list)
    expect(listCopy).not.toBe(list)
    expect(parent.list).toBe(listCopy)

    expect(copyOnWrite(parent, 'date', parent.date)).toBe(parent.date)
    expect(copyOnWrite(parent, 'none', null)).toBeNull()
  })

  it('keeps __proto__ an own property on the parent and the copy', () => {
    const parent = JSON.parse('{"__proto__": {"a": 1}}')
    const original = getOwn(parent, '__proto__')

    const copy = copyOnWrite(parent, '__proto__', original) as any

    expect(Object.getPrototypeOf(parent)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(copy)).toBe(Object.prototype)
    expect(getOwn(parent, '__proto__')).toBe(copy)
    expect(copy).toEqual({ a: 1 })
    expect(({} as any).a).toBeUndefined()
  })
})

describe('clone', () => {
  it('clone', () => {
    expect(clone(null)).toBeNull()

    const obj = { a: 1, arr: [2, 3], nested: { arr: [{ b: 4 }] } }
    const cloned = clone(obj)

    expect(cloned).toEqual(obj)
    expect(cloned).not.toBe(obj)
    expect(cloned.arr).not.toBe(obj.arr)
    expect(cloned.nested.arr).not.toBe(obj.nested.arr)
  })

  it('clone with symbol properties', () => {
    const sym = Symbol('test')
    const nestedSym = Symbol('nested')
    const obj = { a: 1, [sym]: { b: 2, [nestedSym]: 3 } }
    const cloned = clone(obj)

    expect(cloned.a).toBe(1)
    expect(cloned[sym]).toEqual({ b: 2, [nestedSym]: 3 })
    expect(cloned[sym]).not.toBe(obj[sym])
    expect(cloned[sym][nestedSym]).toBe(3)
  })

  it('clone with __proto__ property', () => {
    const obj = JSON.parse('{ "a": 1, "__proto__": { "polluted": true } }')
    const cloned = clone(obj)

    expect(Object.getPrototypeOf(cloned)).toBe(Object.prototype)
    expect(({} as any).polluted).toBeUndefined()
    expect(cloned.a).toBe(1)
    // eslint-disable-next-line no-restricted-properties, no-proto
    expect(cloned.__proto__).toEqual({ polluted: true })
    // eslint-disable-next-line no-restricted-properties, no-proto
    expect(cloned.__proto__).not.toBe(obj.__proto__)

    const nullProto = new NullProtoObj<any>()
    // eslint-disable-next-line no-restricted-properties, no-proto
    nullProto.__proto__ = 2
    const clonedNullProto = clone(nullProto)

    expect(Object.getPrototypeOf(clonedNullProto)).toBe(Object.prototype)
    // eslint-disable-next-line no-restricted-properties, no-proto
    expect(clonedNullProto.__proto__).toBe(2)
  })

  it('clone with circular references', () => {
    const obj: Record<string, unknown> = { a: 1 }
    obj.self = obj
    obj.list = [obj]

    const cloned = clone(obj)

    expect(cloned).not.toBe(obj)
    expect(cloned.a).toBe(1)
    expect(cloned.self).toBe(cloned)
    expect((cloned.list as unknown[])[0]).toBe(cloned)
    expect(cloned.list).not.toBe(obj.list)

    const arr: unknown[] = [1]
    arr.push(arr)

    const clonedArr = clone(arr)

    expect(clonedArr).not.toBe(arr)
    expect(clonedArr[0]).toBe(1)
    expect(clonedArr[1]).toBe(clonedArr)
  })

  it('clone keeps shared references shared', () => {
    const shared = { x: 1 }
    const obj = { a: shared, b: shared, c: [shared] }

    const cloned = clone(obj)

    expect(cloned.a).toEqual(shared)
    expect(cloned.a).not.toBe(shared)
    expect(cloned.b).toBe(cloned.a)
    expect(cloned.c[0]).toBe(cloned.a)
  })
})

describe('bindMethods', () => {
  const syb1 = Symbol('1')
  const syb2 = Symbol('2')

  it('binds own methods to the original object', () => {
    const obj = {
      value: 123,
      [syb1]: 234,
      getValue() {
        return this.value
      },
      [syb2]() {
        return this[syb1]
      },
    }

    const methods = bindMethods(obj)

    expect(methods.getValue()).toBe(123)
    expect(methods[syb2]()).toBe(234)
  })

  it('collects methods from the prototype chain', () => {
    class Base {
      value = 123

      getValue() {
        return this.value
      }

      [syb1]() {
        return this.value + 1
      }
    }

    class Child extends Base {
      double() {
        return this.value * 2
      }

      [syb2]() {
        return this.value + 2
      }
    }

    const methods = bindMethods(new Child())

    expect(methods.getValue()).toBe(123)
    expect(methods.double()).toBe(246)
    expect(methods[syb1]()).toBe(124)
    expect(methods[syb2]()).toBe(125)
  })

  it('prefers methods closer to the instance in the prototype chain', () => {
    class Base {
      value = 'base'

      getValue() {
        return this.value
      }

      [syb1]() {
        return 'Base'
      }
    }

    class Child extends Base {
      override getValue() {
        return 'child'
      }

      override [syb1]() {
        return 'Child'
      }
    }

    const methods = bindMethods(new Child())

    expect(methods.getValue()).toBe('child')
    expect(methods[syb1]()).toBe('Child')
  })

  it('ignores non-function properties', () => {
    const obj = {
      value: 123,
      name: 'test',
      [syb1]: 'ignore',
      getValue() {
        return this.value
      },
    }

    const methods = bindMethods(obj)

    expect('value' in methods).toBe(false)
    expect('name' in methods).toBe(false)
    expect(methods.getValue()).toBe(123)
  })

  it('does not include constructor', () => {
    class Test {
      method() {
        return 'ok'
      }
    }

    const methods = bindMethods(new Test())

    expect('constructor' in methods).toBe(false)
    expect(methods.method()).toBe('ok')
  })

  it('supports special method names such as toString and __proto__', () => {
    const obj = Object.create(null)

    obj.toString = function () {
      return 'custom'
    }

    // eslint-disable-next-line no-proto, no-restricted-properties
    obj.__proto__ = function () {
      return 'proto'
    }

    const methods = bindMethods(obj)

    expect(methods.toString()).toBe('custom')
    // eslint-disable-next-line no-proto, no-restricted-properties
    expect(methods.__proto__()).toBe('proto')
  })

  it('returns an NullProtoObj', () => {
    const methods = bindMethods({
      fn() {},
    })

    expect(Object.getPrototypeOf(methods)).toBe(Object.getPrototypeOf((new NullProtoObj())))
  })

  it('returns an empty object when no methods exist', () => {
    const methods = bindMethods({
      value: 123,
    })

    expect(Reflect.ownKeys(methods)).toEqual([])
  })

  it('leaves methods listed in `unbound` unbound', () => {
    const obj = {
      value: 123,
      getValue() {
        return this.value
      },
      getDouble() {
        return this.value * 2
      },
      [syb1]() {
        return this.value + 1
      },
      [syb2]() {
        return this.value + 2
      },
    }

    const methods = bindMethods(obj, { unbound: ['getValue', syb1] })

    // listed methods are the raw functions
    expect(methods.getValue).toBe(obj.getValue)
    expect(methods[syb1]).toBe(obj[syb1])
    expect(methods.getValue.call({ value: 999 })).toBe(999)
    expect(methods[syb1].call({ value: 999 })).toBe(1000)

    // the rest stay bound to the original object
    expect(methods.getDouble).not.toBe(obj.getDouble)
    expect(methods.getDouble.call({ value: 999 })).toBe(246)
    expect(methods[syb2].call({ value: 999 })).toBe(125)
  })

  it('supports `unbound` for methods from the prototype chain', () => {
    class Base {
      value = 123
      getValue() {
        return this.value
      }
    }
    class Child extends Base {
      double() {
        return this.value * 2
      }
    }

    const methods = bindMethods(new Child(), { unbound: ['getValue'] })

    expect(methods.getValue).toBe(Base.prototype.getValue)
    expect(methods.getValue.call({ value: 5 })).toBe(5)
    expect(methods.double()).toBe(246)
  })
})
