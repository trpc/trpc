import type { RPCJsonSerializerHandler } from '@orpc/client'
import { ORPCError, RPCSerializer } from '@orpc/client'
import { getEventMeta, withEventMeta } from '@standard-server/core'
import { encodePeerMessage } from '@standard-server/peer'
import { encodeHibernationRPCEvent } from './encode-event'

class Planet {
  constructor(public readonly name: string, public readonly diameter: number) {}
}

const planetHandler: RPCJsonSerializerHandler = {
  condition: value => value instanceof Planet,
  serialize: (value: Planet) => [value.name, value.diameter],
  deserialize: ([name, diameter]: [string, number]) => new Planet(name, diameter),
}

const serializer = new RPCSerializer({ handlers: { planet: planetHandler } })

function serializeData(value: unknown) {
  return serializer.serialize(value, { useFormDataForBlobFields: false })
}

describe('encodeHibernationRPCEvent', () => {
  it('message without meta', async () => {
    const id = '39483'
    const encoded = await encodeHibernationRPCEvent(id, 'hello world', { serializer })

    expect(encoded).toEqual(
      await encodePeerMessage({
        kind: 'event-stream',
        id,
        json: { event: undefined, data: serializeData('hello world') },
      }),
    )
  })

  it('message with meta', async () => {
    const id = '39483'
    const planet = withEventMeta(new Planet('Earth', 12345), { retry: 400 })
    const encoded = await encodeHibernationRPCEvent(id, planet, { serializer })

    expect(encoded).toEqual(
      await encodePeerMessage({
        kind: 'event-stream',
        id,
        json: { retry: 400, event: undefined, data: serializeData(planet) },
      }),
    )
  })

  it('close', async () => {
    const id = '39483'
    const planet = withEventMeta(new Planet('Earth', 12345), { retry: 400 })
    const encoded = await encodeHibernationRPCEvent(id, planet, { serializer, event: 'close' })

    expect(encoded).toEqual(
      await encodePeerMessage({
        kind: 'event-stream',
        id,
        json: { retry: 400, event: 'close', data: serializeData(planet) },
      }),
    )
  })

  it('error', async () => {
    const id = '39483'
    const error = withEventMeta(new ORPCError('BAD_GATEWAY', { data: '__TEST__' }), { retry: 400 })
    const encoded = await encodeHibernationRPCEvent(id, error, { serializer, event: 'error' })

    expect(encoded).toEqual(
      await encodePeerMessage({
        kind: 'event-stream',
        id,
        json: { retry: 400, event: 'error', data: serializeData(error.toJSON()) },
      }),
    )
  })

  it('undefined payload', async () => {
    const id = '39483'
    const encoded = await encodeHibernationRPCEvent(id, undefined, { event: 'close' })

    expect(encoded).toEqual(
      await encodePeerMessage({
        kind: 'event-stream',
        id,
        json: { event: 'close', data: undefined },
      }),
    )
  })

  it('with prefix', async () => {
    const id = '39483'
    const encoded = await encodeHibernationRPCEvent(id, 'hello world', { encodePeerMessage: { prefix: 'orpc:' } })

    expect(encoded).toEqual(
      await encodePeerMessage({
        kind: 'event-stream',
        id,
        json: { event: undefined, data: serializeData('hello world') },
      }, { prefix: 'orpc:' }),
    )
    expect(encoded).toSatisfy((encoded: string) => encoded.startsWith('orpc:'))
  })

  it('preserves event meta on error payloads', async () => {
    const error = withEventMeta(new ORPCError('BAD_GATEWAY'), { id: 'meta-id', comments: ['hi'] })
    const encoded = await encodeHibernationRPCEvent('1', error, { event: 'error' })

    expect(JSON.parse(encoded as string).json).toEqual({
      ...getEventMeta(error),
      event: 'error',
      data: serializeData(error.toJSON()),
    })
  })
})
