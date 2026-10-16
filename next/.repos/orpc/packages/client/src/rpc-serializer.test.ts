import { isAsyncIteratorObject, parseEmptyableJSON } from '@orpc/shared'
import { ErrorEvent, getEventMeta, withEventMeta } from '@standard-server/core'
import { builtInRPCSupportDataTypes } from '../../../tests/rpc/__shared__/built-in-support-data-types'
import { ORPCError } from './error'
import { RPCSerializer } from './rpc-serializer'

describe('rpcSerializer', () => {
  describe.each(builtInRPCSupportDataTypes)('$name', ({ value, expected }) => {
    const serializer = new RPCSerializer()

    function serializeAndDeserialize(value: unknown): unknown {
      const serialized = serializer.serialize(value)

      if (serialized instanceof FormData || serialized instanceof Blob) {
        return serializer.deserialize(serialized)
      }

      return serializer.deserialize(parseEmptyableJSON(JSON.stringify(serialized) ?? '')) // like in the real world
    }

    it('should work on flat', async () => {
      expect(
        serializeAndDeserialize(value),
      ).toEqual(
        expected,
      )
    })

    it('should work on nested object', async () => {
      expect(
        serializeAndDeserialize({
          data: value,
        }),
      ).toEqual(
        {
          data: expected,
        },
      )
    })

    it('should work on complex object', async () => {
      expect(
        serializeAndDeserialize({
          '!@#$%^^&()[]>?<~_<:"~+!_': value,
          'list': [value],
          'map': new Map([[value, value]]),
          'set': new Set([value]),
          'nested': {
            nested: value,
          },
        }),
      ).toEqual({
        '!@#$%^^&()[]>?<~_<:"~+!_': expected,
        'list': [expected],
        'map': new Map([[expected, expected]]),
        'set': new Set([expected]),
        'nested': {
          nested: expected,
        },
      })
    })
  })

  describe('form data bodies', () => {
    const serializer = new RPCSerializer()

    it('uses FormData when the payload contains nested files, and restores them', () => {
      const file = new File(['content'], 'doc.txt', { type: 'text/plain' })
      const payload = {
        title: 'upload',
        createdAt: new Date('2023-01-01'),
        attachments: [file],
      }

      const serialized = serializer.serialize(payload)
      expect(serialized).toBeInstanceOf(FormData)

      const deserialized = serializer.deserialize(serialized) as any
      expect(deserialized.title).toBe('upload')
      expect(deserialized.createdAt).toEqual(new Date('2023-01-01'))
      expect(deserialized.attachments[0]).toBeInstanceOf(File)
      expect(deserialized.attachments[0].name).toBe('doc.txt')
    })

    it('restores multiple blobs to their own positions', () => {
      const a = new File(['a'], 'a.txt', { type: 'text/plain' })
      const b = new File(['bb'], 'b.txt', { type: 'text/plain' })

      const deserialized = serializer.deserialize(
        serializer.serialize({ nested: { a }, list: [b] }),
      ) as any

      expect(deserialized.nested.a.name).toBe('a.txt')
      expect(deserialized.nested.a.size).toBe(1)
      expect(deserialized.list[0].name).toBe('b.txt')
      expect(deserialized.list[0].size).toBe(2)
    })

    it('keeps a plain body when useFormDataForBlobFields is disabled in the constructor', () => {
      const serializer = new RPCSerializer({
        serialize: { useFormDataForBlobFields: false },
      })

      const serialized = serializer.serialize({ blob: new Blob(['test'], { type: 'text/plain' }) })
      expect(serialized).not.toBeInstanceOf(FormData)
    })

    it('keeps a plain body when useFormDataForBlobFields is disabled per call', () => {
      const serialized = serializer.serialize(
        { blob: new Blob(['test'], { type: 'text/plain' }) },
        { useFormDataForBlobFields: false },
      )
      expect(serialized).not.toBeInstanceOf(FormData)
    })

    it('prefers the per-call option over the constructor option', () => {
      const serializer = new RPCSerializer({ serialize: { useFormDataForBlobFields: false } })

      const serialized = serializer.serialize(
        { blob: new Blob(['test'], { type: 'text/plain' }) },
        { useFormDataForBlobFields: true },
      )
      expect(serialized).toBeInstanceOf(FormData)
    })
  })

  describe('asyncIteratorObject', async () => {
    const serializer = new RPCSerializer()

    function serializeAndDeserialize(value: unknown): unknown {
      const serialized = serializer.serialize(value)
      return serializer.deserialize(serialized)
    }

    const date = new Date()

    it('on success', async () => {
      const iterator = (async function* () {
        yield 1
        yield withEventMeta({ order: 2, date }, { retry: 1000 })
        return withEventMeta({ order: 3 }, { id: '123456' })
      })()

      const deserialized = serializeAndDeserialize(iterator) as any

      expect(deserialized).toSatisfy(isAsyncIteratorObject)
      await expect(deserialized.next()).resolves.toSatisfy(({ value, done }) => {
        expect(done).toBe(false)
        expect(value).toEqual(1)
        expect(getEventMeta(value)).toEqual(undefined)

        return true
      })

      await expect(deserialized.next()).resolves.toSatisfy(({ value, done }) => {
        expect(done).toBe(false)
        expect(value).toEqual({ order: 2, date })
        expect(getEventMeta(value)).toEqual({ retry: 1000 })

        return true
      })

      await expect(deserialized.next()).resolves.toSatisfy(({ value, done }) => {
        expect(done).toBe(true)
        expect(value).toEqual({ order: 3 })
        expect(getEventMeta(value)).toEqual({ id: '123456' })

        return true
      })
    })

    it('passes through undefined yielded values as is', async () => {
      const iterator = (async function* () {
        yield undefined
        return 'done'
      })()

      const deserialized = serializeAndDeserialize(iterator) as any

      expect(deserialized).toSatisfy(isAsyncIteratorObject)
      await expect(deserialized.next()).resolves.toEqual({ value: undefined, done: false })
      await expect(deserialized.next()).resolves.toEqual({ value: 'done', done: true })
    })

    it('on error with ORPCError', async () => {
      const error = withEventMeta(new ORPCError('BAD_GATEWAY', { data: { order: 3 } }), { id: '123456' })

      const iterator = (async function* () {
        yield 1
        yield withEventMeta({ order: 2, date }, { retry: 1000 })
        throw error
      })()

      const deserialized = serializeAndDeserialize(iterator) as any

      expect(deserialized).toSatisfy(isAsyncIteratorObject)
      await expect(deserialized.next()).resolves.toSatisfy(({ value, done }) => {
        expect(done).toBe(false)
        expect(value).toEqual(1)
        expect(getEventMeta(value)).toEqual(undefined)

        return true
      })

      await expect(deserialized.next()).resolves.toSatisfy(({ value, done }) => {
        expect(done).toBe(false)
        expect(value).toEqual({ order: 2, date })
        expect(getEventMeta(value)).toEqual({ retry: 1000 })

        return true
      })

      await expect(deserialized.next()).rejects.toSatisfy((e: any) => {
        expect(e).toEqual(error)
        expect(e).toBeInstanceOf(ORPCError)
        expect(e.cause).toBeInstanceOf(ErrorEvent)

        return true
      })
    })

    it('on error with unknown error when deserialize', async () => {
      const error = withEventMeta(new Error('UNKNOWN'), { id: '123456' })

      const iterator = (async function* () {
        yield serializer.serialize(1)
        yield withEventMeta(serializer.serialize({ order: 2, date }) as any, { retry: 1000 })
        throw error
      })()

      const deserialized = serializer.deserialize(iterator as any) as any

      expect(deserialized).toSatisfy(isAsyncIteratorObject)
      await expect(deserialized.next()).resolves.toSatisfy(({ value, done }) => {
        expect(done).toBe(false)
        expect(value).toEqual(1)
        expect(getEventMeta(value)).toEqual(undefined)

        return true
      })

      await expect(deserialized.next()).resolves.toSatisfy(({ value, done }) => {
        expect(done).toBe(false)
        expect(value).toEqual({ order: 2, date })
        expect(getEventMeta(value)).toEqual({ retry: 1000 })

        return true
      })

      await expect(deserialized.next()).rejects.toBe(error)
    })

    it('deserialize an invalid ORPCError json', async () => {
      const iterator = serializer.deserialize((async function* () {
        throw new ErrorEvent({ json: { value: 1234 } })
      })()) as any

      await expect(iterator.next()).rejects.toSatisfy((e: any) => {
        expect(e).toBeInstanceOf(ErrorEvent)
        expect(e.data).toEqual({ value: 1234 })

        return true
      })
    })
  })

  describe('readable stream & blob', () => {
    it('should serialize and deserialize ReadableStream as is', () => {
      const serializer = new RPCSerializer()

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue('test')
          controller.close()
        },
      })

      const serialized = serializer.serialize(stream)
      expect(serialized).toBe(stream)

      const deserialized = serializer.deserialize(serialized)
      expect(deserialized).toBe(stream)
    })

    it('should serialize and deserialize Blob as is', () => {
      const serializer = new RPCSerializer()

      const blob = new Blob(['test'], { type: 'text/plain' })

      const serialized = serializer.serialize(blob)
      expect(serialized).toBe(blob)

      const deserialized = serializer.deserialize(serialized)
      expect(deserialized).toBe(blob)
    })

    it('should serialize and deserialize undefined as is', () => {
      const serializer = new RPCSerializer()

      const serialized = serializer.serialize(undefined)
      expect(serialized).toBe(undefined)

      const deserialized = serializer.deserialize(serialized)
      expect(deserialized).toBe(undefined)
    })
  })

  describe('constructor', () => {
    it('should passing options to RPCJsonSerializer', () => {
      const serializer = new RPCSerializer({
        handlers: {
          date: {
            condition: (data: unknown): boolean => data instanceof Date,
            serialize: (date: Date) => `__TEST_DATE__${date.toISOString()}`,
            deserialize: (isoString: string) => new Date(isoString.replace('__TEST_DATE__', '')),
          },
        },
      })

      const date = new Date('2023-01-01')
      const serialized = serializer.serialize(date)
      expect((serialized as any).json).toBe(`__TEST_DATE__${date.toISOString()}`)
    })
  })

  describe('malicious payloads', () => {
    const serializer = new RPCSerializer()

    afterEach(() => {
      expect(({} as any).polluted).toBeUndefined()
      expect((Object.prototype as any).polluted).toBeUndefined()
    })

    it('rejects meta paths escaping the payload in plain bodies', () => {
      const body = JSON.parse(JSON.stringify({
        json: { o: {} },
        meta: [['date', '__proto__', 'polluted']],
      }))

      expect(() => serializer.deserialize(body)).toThrow('Invalid RPC serialized data')
    })

    it('rejects meta paths escaping the payload in form data bodies', () => {
      const form = new FormData()
      form.set('data', JSON.stringify({
        json: { o: {} },
        meta: [['date', '__proto__', 'polluted']],
        maps: [],
      }))

      expect(() => serializer.deserialize(form)).toThrow('Invalid RPC serialized data')
    })

    it('rejects blob maps escaping the payload in form data bodies', () => {
      const form = new FormData()
      form.set('data', JSON.stringify({
        json: { o: {} },
        maps: [['__proto__', 'polluted']],
      }))
      form.set('0', new Blob(['x']))

      expect(() => serializer.deserialize(form)).toThrow('Invalid RPC serialized data')
    })

    it('rejects blobs smuggled in plain bodies', () => {
      // would otherwise resize the array to 2 ** 32 - 1 empty slots for `set` to iterate
      const body = JSON.parse('{"json":[1],"meta":[["set"]],"maps":[["length"]],"blobs":[4294967295]}')

      expect(() => serializer.deserialize(body)).toThrow('Invalid RPC serialized data: blob 0 is not a Blob.')
    })

    it('cannot resize an array through blob maps in form data bodies', () => {
      const form = new FormData()
      form.set('data', JSON.stringify({
        json: [1],
        meta: [['set']],
        maps: [['length']],
      }))
      form.set('0', new Blob(['x']))

      // only a Blob can land there, and the spec rejects it as an array length
      expect(() => serializer.deserialize(form)).toThrow(RangeError)
    })

    it('rejects unknown meta types instead of resolving them on the prototype chain', () => {
      expect(() => serializer.deserialize({ json: 1, meta: [['constructor']] })).toThrow()
      expect(() => serializer.deserialize({ json: 1, meta: [['__proto__']] })).toThrow()
    })
  })
})
