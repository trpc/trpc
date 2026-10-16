import type { Schema } from './schema'
import { ORPCError } from '@orpc/client'
import z from 'zod'
import { ValidationError } from './error'
import { createORPCErrorConstructorMap, error } from './error-factory'

describe('error factory', () => {
  const dataSchema = z.object({ value: z.number() })

  const TestError = error('TEST', {
    message: 'default message',
    data: dataSchema,
  })

  const SimpleError = error('SIMPLE')

  it('constructs an ORPCError with the defined code, message, and data', () => {
    const e = new TestError({ data: { value: 1 } })

    expect(e).toBeInstanceOf(ORPCError)
    expect(e.code).toBe('TEST')
    expect(e.message).toBe('default message')
    expect(e.data).toEqual({ value: 1 })
  })

  it('can override the default message and pass cause', () => {
    const e = new TestError({ message: 'custom message', data: { value: 1 }, cause: 'cause' })

    expect(e.message).toBe('custom message')
    expect(e.cause).toBe('cause')
  })

  it('falls back to the default message when message is explicitly undefined', () => {
    const e = new TestError({ message: undefined, data: { value: 1 } })

    expect(e.message).toBe('default message')
  })

  it('can be constructed without options when data schema is not defined', () => {
    const e = new SimpleError()

    expect(e).toBeInstanceOf(ORPCError)
    expect(e.code).toBe('SIMPLE')
    expect(e.message).toBe('Simple')
  })

  it('validates data in the constructor and stores the validated value', () => {
    // zod strips unknown keys, proving the stored data is the schema output
    const e = new TestError({ data: { value: 1, extra: 'stripped' } as any })

    expect(e.data).toEqual({ value: 1 })
  })

  it('throws a ValidationError when constructed with invalid data', () => {
    expect(() => new TestError({ data: { value: 'invalid' } as any })).toThrowError(
      expect.objectContaining({
        constructor: ValidationError,
        message: 'Error factory "TEST" data validation failed',
        issues: expect.any(Array),
        invalidData: { value: 'invalid' },
      }),
    )

    // @ts-expect-error - data is required
    expect(() => new TestError()).toThrow(ValidationError)
  })

  it('throws in the constructor when data schema is async', () => {
    const AsyncError = error('ASYNC', {
      data: {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: async value => ({ value }),
        },
      } satisfies Schema<unknown>,
    })

    expect(() => new AsyncError({ data: 'anything' })).toThrow(
      'Error factory "ASYNC" does not support async data schemas.',
    )
  })

  it('exposes static code, message, and data so it can be used as an error map item', () => {
    expect(TestError.code).toBe('TEST')
    expect(TestError.message).toBe('default message')
    expect(TestError.data).toBe(dataSchema)

    expect(SimpleError.code).toBe('SIMPLE')
    expect(SimpleError.message).toBeUndefined()
  })

  it('defaults static data to a passthrough schema', async () => {
    const result = await SimpleError.data['~standard'].validate('anything') as any

    expect(result.value).toBe('anything')
    expect(result.issues).toBeUndefined()
  })

  describe('instanceof', () => {
    it('matches instances created by the class', () => {
      expect(new TestError({ data: { value: 1 } })).toBeInstanceOf(TestError)
      expect(new SimpleError()).toBeInstanceOf(SimpleError)
    })

    it('matches plain ORPCError instances with the same code and valid data', () => {
      expect(new ORPCError('TEST', { data: { value: 1 } })).toBeInstanceOf(TestError)
    })

    it('matches instances of another factory class with the same code and valid data', () => {
      const OtherTestError = error('TEST', { data: dataSchema })

      expect(new OtherTestError({ data: { value: 1 } })).toBeInstanceOf(TestError)
      expect(new TestError({ data: { value: 1 } })).toBeInstanceOf(OtherTestError)
    })

    it('matches any data when data schema is not defined', () => {
      expect(new ORPCError('SIMPLE')).toBeInstanceOf(SimpleError)
      expect(new ORPCError('SIMPLE', { data: 'anything' })).toBeInstanceOf(SimpleError)
    })

    it('rejects non-ORPCError values', () => {
      expect(new Error('TEST')).not.toBeInstanceOf(TestError)
      expect('TEST').not.toBeInstanceOf(TestError)
      expect(null).not.toBeInstanceOf(TestError)
    })

    it('rejects ORPCError instances with a different code', () => {
      expect(new ORPCError('ANOTHER', { data: { value: 1 } })).not.toBeInstanceOf(TestError)
    })

    it('rejects ORPCError instances with invalid data', () => {
      expect(new ORPCError('TEST')).not.toBeInstanceOf(TestError)
      expect(new ORPCError('TEST', { data: { value: 'invalid' } })).not.toBeInstanceOf(TestError)
    })

    it('throws when data schema is async', () => {
      const AsyncError = error('ASYNC', {
        data: {
          '~standard': {
            version: 1,
            vendor: 'test',
            validate: async value => ({ value }),
          },
        } satisfies Schema<unknown>,
      })

      expect(() => new ORPCError('ASYNC') instanceof AsyncError).toThrow(
        'Error factory "ASYNC" does not support async data schemas.',
      )
    })
  })
})

describe('createORPCErrorConstructorMap', () => {
  const errorMap = {
    BAD_GATEWAY: {
      message: 'default message',
      data: z.object({ output: z.number() }),
    },

    WITH_ERROR_FACTORY: error('WITH_ERROR_FACTORY', {
      message: 'factory message',
      data: z.object({ output: z.number() }),
    }),
  }

  const constructors = createORPCErrorConstructorMap(errorMap)

  it('works', () => {
    const e = constructors.BAD_GATEWAY({ data: { output: 123 }, cause: 'cause' })

    expect(e).toBeInstanceOf(ORPCError)
    expect(e.code).toEqual('BAD_GATEWAY')
    expect(e.defined).toBe(true)
    expect(e.message).toBe('default message')
    expect(e.data).toEqual({ output: 123 })
    expect(e.cause).toBe('cause')
  })

  it('works with error factory item registered under its code', () => {
    const e = constructors.WITH_ERROR_FACTORY({ data: { output: 123 } })

    expect(e).toBeInstanceOf(ORPCError)
    expect(e).toBeInstanceOf(errorMap.WITH_ERROR_FACTORY)
    expect(e.code).toEqual('WITH_ERROR_FACTORY')
    expect(e.defined).toBe(true)
    expect(e.message).toBe('factory message')
    expect(e.data).toEqual({ output: 123 })
  })

  it('can override message', () => {
    expect(
      constructors.BAD_GATEWAY({ message: 'custom message', data: { output: 123 } }).message,
    ).toBe('custom message')
  })

  it('fallback normal error when access undefined code', () => {
    // @ts-expect-error - invalid access
    const e = constructors.ANY_THING({ data: 'DATA', message: 'MESSAGE', cause: 'cause' })

    expect(e).toBeInstanceOf(ORPCError)
    expect(e.code).toEqual('ANY_THING')
    expect(e.defined).toBe(false)
    expect(e.message).toBe('MESSAGE')
    expect(e.data).toEqual('DATA')
    expect(e.cause).toBe('cause')
  })

  it('works with no options', () => {
    // @ts-expect-error - missing data
    const e = constructors.BAD_GATEWAY()

    expect(e).toBeInstanceOf(ORPCError)
    expect(e.code).toEqual('BAD_GATEWAY')
    expect(e.message).toBe('default message')
    expect(e.data).toBeUndefined()
    expect(e.defined).toBe(true)
  })

  it('in operator works', () => {
    expect('BAD_GATEWAY' in constructors).toBe(true)
    expect('ANY_THING' in constructors).toBe(false)
  })

  it('not proxy on symbol and then keys', async () => {
    const map = constructors as any
    expect(map[Symbol('something')]).toBeUndefined()
    expect(map.then).toBeUndefined()
    expect(await map).toBe(map)
  })

  it('does not resolve error codes through Object.prototype', () => {
    const e = (constructors as any).toString()

    expect(e.code).toEqual('toString')
    expect(e.defined).toEqual(false)
  })
})
