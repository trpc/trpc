import type { AnyORPCError } from '@orpc/client'
import { ORPCError } from '@orpc/client'
import { getEventMeta, withEventMeta } from '@standard-server/core'
import * as z from 'zod'
import { ValidationError } from './error'
import { asyncIteratorObject, getAsyncIteratorObjectSchemaDetails } from './schema-built-in'

const ORDER_SCHEMA = z.object({ order: z.number() })

function assertValidationSuccess<T extends { issues?: unknown }>(result: T): asserts result is T & { issues: undefined } {
  if (result.issues) {
    throw new Error('Validation failed')
  }
}

describe('asyncIteratorObject', () => {
  it('expect a AsyncIteratorObject', async () => {
    const schema = asyncIteratorObject(ORDER_SCHEMA)
    const result = await schema['~standard'].validate(123)
    expect(result.issues).toHaveLength(1)
  })

  it('can validate yields and preserve meta', async () => {
    const schema = asyncIteratorObject(ORDER_SCHEMA)

    const result = await schema['~standard'].validate((async function* () {
      yield { order: 1 }
      yield withEventMeta({ order: 2 }, { id: 'id-2' })
      yield { order: '3' }
    })())

    assertValidationSuccess(result)

    const first = await result.value.next()
    expect(first.done).toBe(false)
    expect(first.value).toEqual({ order: 1 })
    expect(getEventMeta(first.value)).toEqual(undefined)

    const second = await result.value.next()
    expect(second.done).toBe(false)
    expect(second.value).toEqual({ order: 2 })
    expect(getEventMeta(second.value)).toEqual({ id: 'id-2' })

    try {
      await result.value.next()
      throw new Error('Expected AsyncIteratorObject validation to fail')
    }
    catch (error) {
      expect(error).toBeInstanceOf(ORPCError)
      expect((error as AnyORPCError).code).toEqual('ASYNC_ITERATOR_OBJECT_VALIDATION_FAILED')
      expect((error as AnyORPCError).cause).toBeInstanceOf(ValidationError)
      expect(((error as AnyORPCError).cause as ValidationError).issues).toHaveLength(1)
      expect(((error as AnyORPCError).cause as ValidationError).invalidData).toEqual({ order: '3' })
    }
  })

  it('can validate returns and preserve meta', async () => {
    const schema = asyncIteratorObject(ORDER_SCHEMA, ORDER_SCHEMA)

    const result = await schema['~standard'].validate((async function* () {
      return { order: 1 }
    })())

    assertValidationSuccess(result)

    const returned = await result.value.next()
    expect(returned.done).toBe(true)
    expect(returned.value).toEqual({ order: 1 })
    expect(getEventMeta(returned.value)).toEqual(undefined)
  })

  it('not required returns schema', async () => {
    const schema = asyncIteratorObject(ORDER_SCHEMA)

    const result = await schema['~standard'].validate((async function* () {
      return 'anything'
    })())

    assertValidationSuccess(result)

    await expect(result.value.next()).resolves.toEqual({ done: true, value: 'anything' })
  })

  it('cleanup origin when validation fails', async () => {
    let cleanupCalled = false
    const schema = asyncIteratorObject(ORDER_SCHEMA)

    const result = await schema['~standard'].validate((async function* () {
      try {
        yield { order: 1 }
        yield { order: '2' }
        yield { order: 3 }
      }
      finally {
        cleanupCalled = true
      }
    })())

    assertValidationSuccess(result)

    await expect(result.value.next()).resolves.toEqual({ done: false, value: { order: 1 } })
    await expect(result.value.next()).rejects.toThrow('AsyncIteratorObject validation failed')
    expect(cleanupCalled).toBe(true)
  })
})

it('getAsyncIteratorObjectSchemaDetails', async () => {
  const yieldSchema = ORDER_SCHEMA
  const returnSchema = ORDER_SCHEMA
  const schema = asyncIteratorObject(yieldSchema, returnSchema)

  expect(getAsyncIteratorObjectSchemaDetails(schema)).toEqual({ yieldSchema, returnSchema })
  expect(getAsyncIteratorObjectSchemaDetails(undefined)).toBeUndefined()
  expect(getAsyncIteratorObjectSchemaDetails(z.object({}))).toBeUndefined()
})
