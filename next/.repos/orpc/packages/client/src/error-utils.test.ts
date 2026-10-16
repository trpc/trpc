import type { Writable } from '@orpc/shared'
import { ORPCError } from './error'
import {
  cloneORPCError,
  createORPCErrorFromJson,
  isDefinedError,
  isORPCErrorJson,
  toORPCError,
} from './error-utils'

it('isDefinedError', () => {
  const definedError = new ORPCError('BAD_REQUEST')
  ;(definedError.defined as Writable<typeof definedError.defined>) = true as any
  expect(isDefinedError(definedError)).toBe(true)

  expect(isDefinedError(new ORPCError('BAD_REQUEST'))).toBe(false)
  expect(isDefinedError(new Error('Regular error'))).toBe(false)
  expect(isDefinedError({ code: 'ERROR', defined: true })).toBe(false)
  expect(isDefinedError(null)).toBe(false)
  expect(isDefinedError(undefined)).toBe(false)
})

describe('toORPCError', () => {
  it('returns same error if already ORPCError', () => {
    const error = new ORPCError('BAD_REQUEST', { message: 'Bad request' })
    const result = toORPCError(error)
    expect(result).toBe(error)
  })

  it('converts regular Error to ORPCError', () => {
    const originalError = new Error('Something went wrong')

    const result = toORPCError(originalError)

    expect(result).toBeInstanceOf(ORPCError)
    expect(result.code).toBe('INTERNAL_SERVER_ERROR')
    expect(result.message).toBe('Internal Server Error')
    expect(result.cause).toBe(originalError)
  })

  it('converts string to ORPCError', () => {
    const result = toORPCError('Error string')

    expect(result).toBeInstanceOf(ORPCError)
    expect(result.code).toBe('INTERNAL_SERVER_ERROR')
    expect(result.message).toBe('Internal Server Error')
    expect(result.cause).toBe('Error string')
  })
})

describe('isORPCErrorJson', () => {
  const error = new ORPCError('BAD_REQUEST', { message: 'Bad request', cause: 'cause', data: 'data' })
  ;(error as any).defined = true as any

  it('returns true for valid ORPC error JSON', () => {
    expect(isORPCErrorJson(error.toJSON())).toBe(true)
  })

  it('returns true for valid ORPC error JSON without data', () => {
    const json = error.toJSON()

    // @ts-expect-error this is expected
    delete json.data

    expect(isORPCErrorJson(json)).toBe(true)
  })

  it('returns false for object missing defined field', () => {
    const json = error.toJSON()
    // @ts-expect-error this is expected
    delete json.defined

    expect(isORPCErrorJson(json)).toBe(false)
  })

  it('returns false for object missing code field', () => {
    const json = error.toJSON()
    // @ts-expect-error this is expected
    delete json.code

    expect(isORPCErrorJson(json)).toBe(false)
  })

  it('returns false for object missing message field', () => {
    const json = error.toJSON()
    // @ts-expect-error this is expected
    delete json.message

    expect(isORPCErrorJson(json)).toBe(false)
  })

  it('returns false for object with invalid defined type', () => {
    const json = error.toJSON()
    // @ts-expect-error this is expected
    json.defined = 'true'

    expect(isORPCErrorJson(json)).toBe(false)
  })

  it('returns false for object with invalid message type', () => {
    const json = error.toJSON()
    // @ts-expect-error this is expected
    json.message = 400

    expect(isORPCErrorJson(json)).toBe(false)
  })

  it('returns false for object with extra keys', () => {
    const json = error.toJSON()
    // @ts-expect-error this is expected
    json.extraKey = 'extra'

    expect(isORPCErrorJson(json)).toBe(false)
  })

  it('returns false for non-object values', () => {
    expect(isORPCErrorJson(null)).toBe(false)
    expect(isORPCErrorJson(undefined)).toBe(false)
    expect(isORPCErrorJson('string')).toBe(false)
    expect(isORPCErrorJson(123)).toBe(false)
    expect(isORPCErrorJson(true)).toBe(false)
    expect(isORPCErrorJson([])).toBe(false)
  })
})

describe('createORPCErrorFromJson', () => {
  const error = new ORPCError('BAD_REQUEST', { message: 'Bad request', cause: 'cause', data: 'data' })
  ;(error as any).defined = true as any

  it('creates ORPCError from valid JSON', () => {
    const json = error.toJSON()

    const createdError = createORPCErrorFromJson(json)

    expect(createdError).toBeInstanceOf(ORPCError)
    expect(createdError.code).toBe(error.code)
    expect(createdError.message).toBe(error.message)
    expect(createdError.data).toEqual(error.data)
    expect(createdError.defined).toBe(error.defined)
  })

  it('creates ORPCError from JSON without data', () => {
    const json = error.toJSON()
    // @ts-expect-error this is expected
    delete json.data

    const createdError = createORPCErrorFromJson(json)

    expect(createdError).toBeInstanceOf(ORPCError)
    expect(createdError.data).toBeUndefined()
  })

  it('accepts additional error options', () => {
    const cause = new Error('Original cause')
    const createdError = createORPCErrorFromJson(error.toJSON(), { cause })

    expect(createdError).toBeInstanceOf(ORPCError)
    expect(createdError.cause).toBe(cause)
  })
})

describe('cloneORPCError', () => {
  it('creates a clone of ORPCError', () => {
    const original = new ORPCError('BAD_REQUEST', {
      message: 'Bad request',
      data: { field: 'value' },
    })

    const cloned = cloneORPCError(original)

    expect(cloned).toBeInstanceOf(ORPCError)
    expect(cloned).not.toBe(original)
    expect(cloned.code).toBe(original.code)
    expect(cloned.message).toBe(original.message)
    expect(cloned.data).toEqual(original.data)
    expect(cloned.defined).toBe(false)
  })

  it('preserves cause and stack trace', () => {
    const cause = new Error('Original cause')
    const original = new ORPCError('INTERNAL_SERVER_ERROR', { cause })

    const cloned = cloneORPCError(original)

    expect(cloned).toBeInstanceOf(ORPCError)
    expect(cloned.cause).toBe(cause)
    expect(cloned.stack).toBe(original.stack)
  })

  it('preserves defined flag', () => {
    const original = new ORPCError('CUSTOM_ERROR')
    ;(original.defined as any) = true

    const cloned = cloneORPCError(original)

    expect(cloned).toBeInstanceOf(ORPCError)
    expect(cloned.defined).toBe(true)
  })

  it('creates independent copy', () => {
    const original = new ORPCError('BAD_REQUEST', {
      data: 1,
    })

    const cloned = cloneORPCError(original)

    // Modifying cloned data doesn't affect original
    cloned.data = 2

    expect(original.data).toBe(1)
    expect(cloned.data).toBe(2)
  })

  it('preserves custom subclass prototype chain', () => {
    class CustomSubclassError extends ORPCError<'BAD_REQUEST', { customField: string }> {
      customProp = 'test'
    }

    const original = new CustomSubclassError('BAD_REQUEST', {
      message: 'Custom error message',
      data: { customField: 'value' },
      cause: new Error('why'),
    })

    const cloned = cloneORPCError(original)

    expect(cloned).toBeInstanceOf(CustomSubclassError)
    expect(cloned).toBeInstanceOf(ORPCError)
    expect(cloned.customProp).toBe('test')
    expect(cloned.message).toBe('Custom error message')
    expect(cloned.stack).toBe(original.stack)
    expect(cloned.cause).toBe(original.cause)
  })

  it('clone keeps native error semantics and property shape', () => {
    const original = new ORPCError('BAD_REQUEST', { message: 'msg', data: 1, cause: 'why' })
    const cloned = cloneORPCError(original)

    expect(Object.prototype.toString.call(cloned)).toBe('[object Error]')
    expect(Object.keys(cloned)).toEqual(Object.keys(original))
    expect({ ...cloned }).toEqual({ ...original })
  })
})
