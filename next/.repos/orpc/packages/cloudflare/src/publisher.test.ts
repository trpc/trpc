import type { DurablePublisherOptions } from './publisher'
import { RPCJsonSerializer } from '@orpc/client'
import { sleep } from '@orpc/shared'
import { getEventMeta, withEventMeta } from '@standard-server/core'
import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import { DurablePublisher } from './publisher'

type MockSocket = WebSocket & EventTarget & {
  accepted: boolean
  closeCalls: Array<{ code: number | undefined, reason: string | undefined }>
  sendMessage: (data: string) => void
  sendClose: (code: number, reason?: string) => void
  sendError: () => void
}

function makeSocket(): MockSocket {
  const socket = new EventTarget() as MockSocket

  socket.accepted = false
  socket.closeCalls = []
  socket.accept = () => {
    socket.accepted = true
  }
  socket.close = (code?: number, reason?: string) => {
    socket.closeCalls.push({ code, reason })
  }
  socket.sendMessage = (data: string) => {
    socket.dispatchEvent(new MessageEvent('message', { data }))
  }
  socket.sendClose = (code: number, reason = '') => {
    socket.dispatchEvent(new CloseEvent('close', { code, reason }))
  }
  socket.sendError = () => {
    socket.dispatchEvent(new Event('error'))
  }

  return socket
}

function makeNamespace(socket: MockSocket, headers: HeadersInit = {}): DurableObjectNamespace {
  const stub = {
    fetch: vi.fn(async () => ({
      webSocket: socket as unknown as WebSocket,
      headers: new Headers(headers),
    } as Response)),
  } as unknown as DurableObjectStub

  return {
    getByName: vi.fn(() => stub),
  } as unknown as DurableObjectNamespace
}

function setup(headers: HeadersInit = {}) {
  const socket = makeSocket()
  return { socket, publisher: new DurablePublisher<any>(makeNamespace(socket, headers)) }
}

async function waitForAccept(socket: MockSocket) {
  await vi.waitFor(() => {
    expect(socket.accepted).toBe(true)
  }, { interval: 1 })
}

const serializer = new RPCJsonSerializer()

function sendEvent(socket: MockSocket, text: string) {
  socket.sendMessage(JSON.stringify({ data: serializer.serialize({ text }) }))
}

describe('durable publisher', () => {
  function createTestingPublisher(namespace: DurableObjectNamespace<any>, options: DurablePublisherOptions = {}) {
    const prefix = `${crypto.randomUUID()}:`

    return { prefix, publisher: new DurablePublisher(namespace, { ...options, prefix }) }
  }

  it('sends live messages without resume', async () => {
    const { publisher } = createTestingPublisher(env.PUBLISHER_DON)

    const live = vi.fn()
    const stopLive = await publisher.subscribe('message', live)

    await publisher.publish('notice', { text: 'ignore me' })
    await publisher.publish('message', { text: 'first' })
    await publisher.publish('message', withEventMeta({ text: 'second' }, {
      id: 'client-id',
      comments: ['keep me'],
    }))

    await vi.waitFor(() => {
      expect(live).toHaveBeenCalledTimes(2)
    })

    const first = live.mock.calls[0]![0]
    const second = live.mock.calls[1]![0]

    expect(first).toEqual({ text: 'first' })
    expect(getEventMeta(first)?.id).toBeUndefined()

    expect(second).toEqual({ text: 'second' })
    expect(getEventMeta(second)?.id).toBe('client-id')
    expect(getEventMeta(second)?.comments).toEqual(['keep me'])

    await stopLive()

    const resume = vi.fn()
    const stopResume = await publisher.subscribe('message', resume, {
      lastEventId: '0',
    })

    await publisher.publish('message', { text: 'live only' })

    await vi.waitFor(() => {
      expect(resume).toHaveBeenCalledTimes(1)
    })

    await stopResume()

    /**
     * Asserted after unsubscribing so a replay that lost the race to the live message
     * still fails the test: this publisher must not resend the two earlier messages.
     */
    expect(resume).toHaveBeenCalledExactlyOnceWith({ text: 'live only' })
  })

  it('sends live messages and resumes missed ones', async () => {
    const { publisher } = createTestingPublisher(env.PUBLISHER_RESUME3S_DON)

    const live = vi.fn()
    const stopLive = await publisher.subscribe('message', live)

    await publisher.publish('notice', { text: 'ignore me' })
    await publisher.publish('message', { text: 'first' })
    await publisher.publish('message', withEventMeta({ text: 'second' }, {
      id: 'client-id',
      comments: ['keep me'],
    }))

    await vi.waitFor(() => {
      expect(live).toHaveBeenCalledTimes(2)
    })

    const first = live.mock.calls[0]![0]
    const second = live.mock.calls[1]![0]

    expect(first).toEqual({ text: 'first' })
    expect(getEventMeta(first)?.id).toMatch(/^\d+$/)

    expect(second).toEqual({ text: 'second' })
    expect(getEventMeta(second)?.id).toBe(String(BigInt(getEventMeta(first)!.id!) + 1n))
    expect(getEventMeta(second)?.comments).toEqual(['keep me'])

    await stopLive()

    const resume = vi.fn()
    const stopResume = await publisher.subscribe('message', resume, {
      lastEventId: getEventMeta(first)?.id,
    })

    // missed events reach the listener before subscribe resolves
    expect(resume).toHaveBeenCalledExactlyOnceWith(second)
    expect(getEventMeta(resume.mock.calls[0]![0])).toEqual(getEventMeta(second))

    await stopResume()
  })

  it('resumes old messages before new ones', { repeats: 5 }, async () => {
    const { publisher } = createTestingPublisher(env.PUBLISHER_RESUME3S_DON)

    await publisher.publish('timeline', { order: 1 })
    await publisher.publish('timeline', { order: 2 })

    const listener = vi.fn()
    const [unsubscribe] = await Promise.all([
      publisher.subscribe('timeline', listener, { lastEventId: '0' }),
      Promise.resolve()
        .then(() => publisher.publish('timeline', { order: 3 }))
        .then(() => publisher.publish('timeline', { order: 4 })),
    ])

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(4)
    })

    expect(listener.mock.calls.map(call => call[0].order)).toEqual([1, 2, 3, 4])

    await unsubscribe()
  })

  it('caps resumed events at maxBufferedEvents for a slow iterator consumer', async () => {
    const { publisher } = createTestingPublisher(env.PUBLISHER_RESUME3S_DON, { maxBufferedEvents: 2 })
    const subscribeListener = vi.spyOn(publisher as any, 'subscribeListener')

    for (let i = 0; i < 5; i++) {
      await publisher.publish('timeline', { order: i })
    }

    const iterator = publisher.subscribe('timeline', { lastEventId: '0' })

    // the consumer does not pull until every missed event has been replayed
    await subscribeListener.mock.results[0]!.value

    const orders: number[] = []
    for await (const payload of iterator) {
      const { order } = payload as { order: number }
      orders.push(order)

      if (order === 4) {
        break
      }
    }

    expect(orders).toEqual([3, 4])
  })

  it('throws when an event is too large to store for resume', async () => {
    const { publisher } = createTestingPublisher(env.PUBLISHER_RESUME3S_DON)

    await expect(publisher.publish('message', { text: 'a'.repeat(3_000_000) })).rejects.toThrow(
      /^Failed to publish event: 400 .*SQLITE_TOOBIG/,
    )
  })

  it('uses the custom serializer and prefix', async () => {
    class Person {
      constructor(
        public name: string,
        public age: number,
      ) {}
    }

    const serializer = new RPCJsonSerializer({
      handlers: {
        person: {
          condition: p => p instanceof Person,
          serialize: (p: Person) => ({ name: p.name, age: p.age }),
          deserialize: (data: any) => new Person(data.name, data.age),
        },
      },
    })

    const getStubByName = vi.fn((namespace, event) => namespace.getByName(event))
    const { prefix, publisher } = createTestingPublisher(env.PUBLISHER_DON, {
      serializer,
      getStubByName,
    })

    const listener = vi.fn()
    const unsubscribe = await publisher.subscribe('message', listener)

    const person = new Person('dinwwwh', 99)
    await publisher.publish('message', person)

    expect(getStubByName).toHaveBeenCalledTimes(2)
    expect(getStubByName).toHaveBeenNthCalledWith(1, env.PUBLISHER_DON, `${prefix}message`)
    expect(getStubByName).toHaveBeenNthCalledWith(2, env.PUBLISHER_DON, `${prefix}message`)

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(1)
    })
    expect(listener).toHaveBeenCalledWith(person)

    await unsubscribe()
  })

  it('throws when publish fails', async () => {
    const stub = {
      fetch: vi.fn(async () => new Response(null, {
        status: 503,
        statusText: 'Service Unavailable',
      })),
    } as unknown as DurableObjectStub

    const namespace = {
      getByName: vi.fn(() => stub),
    } as unknown as DurableObjectNamespace

    const publisher = new DurablePublisher<any>(namespace)

    await expect(publisher.publish('message', { text: 'hello' })).rejects.toThrow(
      'Failed to publish event: 503 Service Unavailable',
    )
  })

  it('throws when subscribe does not upgrade', async () => {
    const stub = {
      fetch: vi.fn(async () => new Response(null, { status: 200 })),
    } as unknown as DurableObjectStub

    const namespace = {
      getByName: vi.fn(() => stub),
    } as unknown as DurableObjectNamespace

    const publisher = new DurablePublisher<any>(namespace)

    await expect(publisher.subscribe('message', vi.fn())).rejects.toThrow(
      'Failed to open subscription websocket to publisher durable object',
    )
  })

  it('reports bad messages and socket errors but keeps good ones', async () => {
    const { socket, publisher } = setup()
    const listener = vi.fn()
    const onError = vi.fn()

    const unsubscribe = await publisher.subscribe('message', listener, { onError })

    socket.sendMessage('not-json')
    sendEvent(socket, 'good')

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledTimes(1)
    })

    expect(listener).toHaveBeenCalledWith({ text: 'good' })

    socket.sendClose(1000, 'done')
    socket.sendClose(1001, 'going away')
    socket.sendClose(1011, 'crashed')
    socket.sendError()

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(3)
    })

    expect(onError.mock.calls[0]![0].message).toBe('Failed to deserialize message from publisher durable object')
    expect(onError.mock.calls[1]![0].message).toBe('WebSocket closed unexpectedly: 1011 crashed')
    expect(onError.mock.calls[2]![0].message).toBe('Subscription websocket error')

    await unsubscribe()

    expect(socket.closeCalls).toHaveLength(1)
  })

  describe('while replaying missed events', () => {
    it('resolves only once every event the durable object announced has arrived', async () => {
      const { socket, publisher } = setup({ 'orpc-replayed-events': '3' })
      const listener = vi.fn()
      const onError = vi.fn()

      let resolved = false
      const subscription = publisher.subscribe('message', listener, { lastEventId: '0', onError }).then((unsubscribe) => {
        resolved = true
        return unsubscribe
      })

      await waitForAccept(socket)

      sendEvent(socket, 'missed 1')
      socket.sendMessage('not-json') // still one of the replayed messages
      await sleep(0)
      expect(resolved).toBe(false)

      sendEvent(socket, 'missed 2')
      const unsubscribe = await subscription

      expect(listener.mock.calls.map(call => call[0].text)).toEqual(['missed 1', 'missed 2'])
      expect(onError).toHaveBeenCalledTimes(1)

      await unsubscribe()
    })

    it.each([
      ['closes normally', (socket: MockSocket) => socket.sendClose(1000, 'done'), 'WebSocket closed unexpectedly: 1000 done'],
      ['errors', (socket: MockSocket) => socket.sendError(), 'Subscription websocket error'],
    ])('rejects when the socket %s before the replay finishes', async (_, fail, message) => {
      const { socket, publisher } = setup({ 'orpc-replayed-events': '2' })
      const listener = vi.fn()
      const onError = vi.fn()

      const subscription = publisher.subscribe('message', listener, { lastEventId: '0', onError })

      await waitForAccept(socket)

      sendEvent(socket, 'missed 1')
      fail(socket)
      socket.sendClose(1006, 'gone')

      await expect(subscription).rejects.toThrow(message)
      expect(listener).toHaveBeenCalledTimes(1)
      expect(onError).not.toHaveBeenCalled()
      expect(socket.closeCalls).toHaveLength(1)
    })

    it('ends an iterator subscriber with the error', async () => {
      const { socket, publisher } = setup({ 'orpc-replayed-events': '2' })
      const iterator = publisher.subscribe('message', { lastEventId: '0' })

      await waitForAccept(socket)

      sendEvent(socket, 'missed 1')
      socket.sendClose(1000, 'done')

      expect((await iterator.next()).value).toEqual({ text: 'missed 1' })
      await expect(iterator.next()).rejects.toThrow('WebSocket closed unexpectedly: 1000 done')
    })

    it.each([
      ['no', {}],
      ['a zero', { 'orpc-replayed-events': '0' }],
      ['a fractional', { 'orpc-replayed-events': '1.5' }],
    ])('resolves right away when the durable object announces %s count', async (_, headers) => {
      const { socket, publisher } = setup(headers)
      const unsubscribe = await publisher.subscribe('message', vi.fn(), { lastEventId: '0' })

      expect(socket.accepted).toBe(true)
      await unsubscribe()
    })
  })
})
