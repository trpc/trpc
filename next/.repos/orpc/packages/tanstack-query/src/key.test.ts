import type { QueryKey } from '@tanstack/query-core'
import { RPCJsonSerializer } from '@orpc/client'
import { hashKey, partialMatchKey, skipToken } from '@tanstack/query-core'
import { generateOperationKey } from './key'

it('generateOperationKey', () => {
  expect(generateOperationKey(['path'])).toEqual([['path'], {}])
  expect(generateOperationKey(['planet', 'create'], { type: 'mutation' }))
    .toEqual([['planet', 'create'], { type: 'mutation' }])
  expect(generateOperationKey(['planet', 'find'], { type: 'query', input: { id: 1 } }))
    .toEqual([['planet', 'find'], { type: 'query', input: { id: 1 } }])
  expect(generateOperationKey(['planet', 'stream'], { type: 'streamed', input: { cursor: 0 }, fnOptions: { refetchMode: 'append' } }))
    .toEqual([['planet', 'stream'], { type: 'streamed', input: { cursor: 0 }, fnOptions: { refetchMode: 'append' } }])

  expect(generateOperationKey(['path'], { prefix: '__prefix__' })).toEqual(['__prefix__', ['path'], {}])
  expect(generateOperationKey(['path'], { prefix: undefined })).toEqual([['path'], {}])
  expect(generateOperationKey(['path'], { prefix: '__prefix__', type: 'query', input: { a: 1 } })).toEqual(['__prefix__', ['path'], { type: 'query', input: { a: 1 } }])

  expect(generateOperationKey(['planet', 'list'], { type: 'query', input: skipToken as any }))
    .toEqual([['planet', 'list'], { type: 'query', skipToken: true }])
})

describe('generateOperationKey with skipToken', () => {
  const serializer = new RPCJsonSerializer()

  const hashers: [name: string, hash: (queryKey: QueryKey) => string][] = [
    ['hashKey', hashKey],
    ['RPCJsonSerializer', (queryKey) => {
      const { json, meta } = serializer.serialize(queryKey)

      return hashKey([
        json,
        meta?.map(entry => JSON.stringify(entry)).sort(),
      ])
    }],
  ]

  it.each(hashers)('does not collide with the no-input key when hashed with %s', (_, hash) => {
    expect(hash(generateOperationKey(['planet', 'list'], { type: 'query', input: skipToken as any })))
      .not
      .toEqual(hash(generateOperationKey(['planet', 'list'], { type: 'query' })))
  })

  it('still partially matches keys without input', () => {
    const skipped = generateOperationKey(['planet', 'list'], { type: 'query', input: skipToken as any })

    expect(partialMatchKey(skipped, generateOperationKey(['planet', 'list']))).toBe(true)
    expect(partialMatchKey(skipped, generateOperationKey(['planet', 'list'], { type: 'query' }))).toBe(true)
    expect(partialMatchKey(skipped, generateOperationKey(['planet', 'list'], { input: {} }))).toBe(false)
  })
})
