import { getEventMeta, withEventMeta } from '@standard-server/core'
import { wrapAsyncIteratorPreservingEventMeta } from './async-iterator-object'

describe('wrapAsyncIteratorPreservingEventMeta', () => {
  it('preserves metadata when mapping yielded and returned values', async () => {
    const event = withEventMeta({ order: 2 }, { id: 'id-2' })
    const returned = withEventMeta({ order: 3 }, { retry: 4000 })

    const iterator = (async function* () {
      yield 1
      yield event
      return returned
    })()

    const mapResult = vi.fn(async (result) => {
      return {
        ...result,
        value: { mapped: result.value },
      }
    })

    const mapped = wrapAsyncIteratorPreservingEventMeta(iterator, {
      mapResult,
    })

    const first = await mapped.next()
    expect(first).toEqual({ done: false, value: { mapped: 1 } })
    expect(getEventMeta(first.value)).toEqual(undefined)

    const second = await mapped.next()
    expect(second).toEqual({ done: false, value: { mapped: { order: 2 } } })
    expect(getEventMeta(second.value)).toEqual({ id: 'id-2' })

    const third = await mapped.next()
    expect(third).toEqual({ done: true, value: { mapped: { order: 3 } } })
    expect(getEventMeta(third.value)).toEqual({ retry: 4000 })

    expect(mapResult).toHaveBeenNthCalledWith(1, { done: false, value: 1 })
    expect(mapResult).toHaveBeenNthCalledWith(2, { done: false, value: event })
    expect(mapResult).toHaveBeenNthCalledWith(3, { done: true, value: returned })
  })

  it('returns original results unchanged when the mapper keeps the same value', async () => {
    const event = withEventMeta({ order: 1 }, { id: 'id-1' })
    const returned = withEventMeta({ order: 2 }, { retry: 2000 })

    const iterator = (async function* () {
      yield event
      return returned
    })()

    const mapResult = vi.fn(async result => result)

    const mapped = wrapAsyncIteratorPreservingEventMeta(iterator, {
      mapResult,
    })

    const first = await mapped.next()
    expect(first).toEqual({ done: false, value: event })
    expect(first.value).toBe(event)
    expect(getEventMeta(first.value)).toEqual({ id: 'id-1' })

    const second = await mapped.next()
    expect(second).toEqual({ done: true, value: returned })
    expect(second.value).toBe(returned)
    expect(getEventMeta(second.value)).toEqual({ retry: 2000 })
  })

  it('preserves metadata when mapping errors', async () => {
    const error = withEventMeta(new Error('TEST'), { id: 'error-1' })
    const onError = vi.fn()
    const mapError = vi.fn(async cause => ({ mapped: cause } as any))

    const iterator = (async function* () {
      throw error
    })()

    const mapped = wrapAsyncIteratorPreservingEventMeta(iterator, {
      onError,
      mapError,
    })

    await expect(mapped.next()).rejects.toSatisfy((cause) => {
      expect(cause).toEqual({ mapped: error })
      expect(getEventMeta(cause)).toEqual({ id: 'error-1' })

      return true
    })

    expect(mapError).toHaveBeenCalledTimes(1)
    expect(mapError).toHaveBeenCalledWith(error)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(error)
  })

  it('does not reattach metadata when mapped errors stay the same or become non-objects', async () => {
    const error = withEventMeta(new Error('TEST'), { id: 'error-1' })

    const sameError = wrapAsyncIteratorPreservingEventMeta((async function* () {
      throw error
    })(), {
      mapError: async cause => cause,
    })

    await expect(sameError.next()).rejects.toBe(error)

    const primitiveError = wrapAsyncIteratorPreservingEventMeta((async function* () {
      throw error
    })(), {
      mapError: async () => 'mapped error' as any,
    })

    await expect(primitiveError.next()).rejects.toBe('mapped error')
  })
})
