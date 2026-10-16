import type { RedisClientType } from 'redis'
import type { RedisPublisherOptions } from './redis'
import { Buffer } from 'node:buffer'
import { RPCJsonSerializer } from '@orpc/client'
import { getOrBind, promiseWithResolvers, sleep } from '@orpc/shared'
import { getEventMeta, withEventMeta } from '@standard-server/core'
import { createClient } from 'redis'
import { RedisPublisher } from './redis'

const REDIS_URL = process.env.REDIS_URL

/**
 * These tests depend on a real Redis server — make sure to set the `REDIS_URL` env.
 * When writing new tests, always use unique keys to avoid conflicts with other test cases.
 */
describe.concurrent('redisPublisher', { skip: !REDIS_URL, timeout: 20_000 }, () => {
  const createdPublishers: RedisPublisher<Record<string, object>>[] = []

  const redis = createClient({ url: REDIS_URL })

  beforeAll(async () => {
    await redis.connect()
  })

  afterAll(async () => {
    redis.destroy()
  })

  function createTestingPublisher(
    options: RedisPublisherOptions = {},
    { useRedis = redis }: { useRedis?: RedisClientType<any, any, any, any, any> } = {},
  ) {
    const publisher = new RedisPublisher<Record<string, object>>(
      useRedis,
      {
        prefix: `redis:${crypto.randomUUID()}:`,
        ...options,
      },
    )

    ;(publisher as any).xTrimExactness = '=' // for easier testing

    createdPublishers.push(publisher)

    return publisher
  }

  it('delivers live events and meta (without resume and without prefix)', async () => {
    const publisher = createTestingPublisher({ prefix: undefined })
    const liveEvent = `${crypto.randomUUID()}live`
    const ignoredEvent = `${crypto.randomUUID()}ignored`
    const listener = vi.fn()

    const unsubscribe = await publisher.subscribe(liveEvent, listener)

    await publisher.publish(ignoredEvent, { order: 99 })
    await publisher.publish(liveEvent, { order: 1 })
    await publisher.publish(liveEvent, withEventMeta({ order: 2 }, { id: '__id__', comments: ['__comment__'] }))

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(2)
    })

    expect(listener).toHaveBeenNthCalledWith(1, expect.toSatisfy((payload) => {
      expect(payload).toEqual({ order: 1 })
      expect(getEventMeta(payload)).toEqual(undefined)

      return true
    }))

    expect(listener).toHaveBeenNthCalledWith(2, expect.toSatisfy((payload) => {
      expect(payload).toEqual({ order: 2 })
      expect(getEventMeta(payload)).toEqual({ id: '__id__', comments: ['__comment__'] })

      return true
    }))

    await unsubscribe()

    const resumeAttempt = vi.fn()
    const unsubscribeResumeAttempt = await publisher.subscribe(liveEvent, resumeAttempt, { lastEventId: '0' })

    await sleep(300)

    expect(resumeAttempt).not.toHaveBeenCalled()

    await unsubscribeResumeAttempt()
  })

  it('resumes missed events in order and preserves event metadata while rewriting ids', async () => {
    const publisher = createTestingPublisher({
      resume: { enabled: true, seconds: 10 },
    })
    const event = 'orders'
    const liveListener = vi.fn()

    const unsubscribeLive = await publisher.subscribe(event, liveListener)

    const firstPayload = { order: 1 }
    const secondPayload = withEventMeta({ order: 2 }, { id: 'client-id', comments: ['audit-log'] })
    const thirdPayload = { order: 3 }

    await publisher.publish(event, firstPayload)
    await publisher.publish(event, secondPayload)
    await publisher.publish(event, thirdPayload)

    await vi.waitFor(() => {
      expect(liveListener).toHaveBeenCalledTimes(3)
    })

    const firstDelivered = liveListener.mock.calls[0]![0]
    const secondDelivered = liveListener.mock.calls[1]![0]
    const thirdDelivered = liveListener.mock.calls[2]![0]

    expect(firstDelivered).toEqual(firstPayload)
    expect(getEventMeta(firstDelivered)?.id).toEqual(expect.any(String))

    expect(secondDelivered).toEqual(secondPayload)
    expect(secondDelivered).not.toBe(secondPayload)
    expect(getEventMeta(secondDelivered)?.id).toEqual(expect.any(String))
    expect(getEventMeta(secondDelivered)?.id).not.toEqual('client-id')
    expect(getEventMeta(secondDelivered)?.comments).toEqual(['audit-log'])

    await unsubscribeLive()

    const resumed = vi.fn()
    const unsubscribeResume = await publisher.subscribe(event, resumed, {
      lastEventId: getEventMeta(secondDelivered)?.id,
    })

    await vi.waitFor(() => {
      expect(resumed).toHaveBeenCalledTimes(1)
    })

    const resumedPayload = resumed.mock.calls[0]![0]

    expect(resumedPayload).toEqual(thirdDelivered)
    expect(getEventMeta(resumedPayload)?.id).toEqual(getEventMeta(thirdDelivered)?.id)

    await unsubscribeResume()
  })

  it('treats an empty resume backlog as a clean starting point and then continues with live messages', async () => {
    const publisher = createTestingPublisher({
      resume: { enabled: true, seconds: 10 },
    })
    const event = 'empty-backlog'
    const listener = vi.fn()

    const unsubscribe = await publisher.subscribe(event, listener, { lastEventId: '0' })

    await sleep(300)

    expect(listener).not.toHaveBeenCalled()

    await publisher.publish(event, { order: 1 })

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(1)
    })

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ order: 1 }))

    await unsubscribe()
  })

  it('deduplicates events that race between resume and live delivery during reconnect', async ({ onTestFinished }) => {
    const { resolve, promise } = promiseWithResolvers<void>()
    const delayedRedis = new Proxy(createClient({ url: REDIS_URL }), {
      get(target, p) {
        if (p === 'xRead') {
          const originalXRead = getOrBind(target, p)

          return async function xRead(...args: [any]) {
            await promise
            return originalXRead(...args)
          }
        }

        return getOrBind(target, p)
      },
    })
    onTestFinished(() => {
      delayedRedis.destroy()
    })

    const publisher = createTestingPublisher({
      resume: { enabled: true, seconds: 10 },
    }, { useRedis: delayedRedis })
    const event = 'timeline'

    await publisher.publish(event, { order: 1 })
    await publisher.publish(event, { order: 2 })

    const listener = vi.fn()
    const [unsubscribe] = await Promise.all([
      publisher.subscribe(event, listener, { lastEventId: '0' }),
      sleep(1000)
        .then(() => publisher.publish(event, { order: 3 }))
        .then(() => publisher.publish(event, { order: 4 }))
        .then(() => resolve()),
    ])

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(4)
    })

    expect(listener.mock.calls.map(call => call[0].order)).toEqual([1, 2, 3, 4])

    await unsubscribe()
  })

  it('keeps live delivery in stream order under concurrent publishers so resume skips nothing', async ({ onTestFinished }) => {
    const prefix = `concurrent:${crypto.randomUUID()}:`
    const event = 'orders'
    // Separate connections, like publishers in different processes.
    const clients = Array.from({ length: 4 }, () => createClient({ url: REDIS_URL }))
    onTestFinished(() => {
      clients.forEach(client => client.destroy())
    })
    const publishers = clients.map(client => createTestingPublisher({
      resume: { enabled: true, seconds: 10 },
      prefix,
    }, { useRedis: client }))
    const listener = vi.fn()

    const unsubscribe = await publishers[0]!.subscribe(event, listener)

    await Promise.all(Array.from({ length: 500 }, (_, order) => publishers[order % publishers.length]!.publish(event, { order })))

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(500)
    })

    const streamIds = (await redis.xRange(`${prefix}${event}`, '-', '+'))!.map(entry => entry.id)
    expect(listener.mock.calls.map(([payload]) => getEventMeta(payload)?.id)).toEqual(streamIds)

    await unsubscribe()
  })

  it('delivers live and resumed events when the client has a keyPrefix', async ({ onTestFinished }) => {
    // node-redis prefixes keys but not channels, so the adapter prefixes channels to match.
    const prefixedRedis = createClient({ url: REDIS_URL, keyPrefix: `key-prefix:${crypto.randomUUID()}:` })
    const subscriber = prefixedRedis.duplicate()
    onTestFinished(() => {
      prefixedRedis.destroy()
      subscriber.destroy()
    })
    const prefix = `prefix:${crypto.randomUUID()}:`
    const publisher = createTestingPublisher({
      resume: { enabled: true, seconds: 10 },
      subscriber,
      prefix,
    }, { useRedis: prefixedRedis })
    const publisherWithoutResume = createTestingPublisher({ subscriber, prefix }, { useRedis: prefixedRedis })
    const event = 'orders'
    const listener = vi.fn()

    const unsubscribe = await publisher.subscribe(event, listener)

    await publisher.publish(event, { order: 1 })
    await publisher.publish(event, { order: 2 })
    await publisherWithoutResume.publish(event, { order: 3 })

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(3)
    })

    await unsubscribe()

    const resumed = vi.fn()
    const unsubscribeResumed = await publisher.subscribe(event, resumed, {
      lastEventId: getEventMeta(listener.mock.calls[0]![0])?.id,
    })

    expect(resumed).toHaveBeenCalledTimes(1)
    expect(resumed).toHaveBeenCalledWith({ order: 2 })

    await unsubscribeResumed()
  })

  it('rejects a client whose keyPrefix is not a string', () => {
    expect(() => new RedisPublisher(createClient({ keyPrefix: Buffer.from('app:') })))
      .toThrow('RedisPublisher only supports a string keyPrefix on the Redis client.')
  })

  it('trims stale resume history on the next publish and lets Redis expire the stream key', async () => {
    const prefix = `retention:${crypto.randomUUID()}:`
    const event = 'orders'
    const key = `${prefix}${event}`
    const publisher = createTestingPublisher({
      resume: { enabled: true, seconds: 1 },
      prefix,
    })

    await Promise.all([
      publisher.publish(event, { order: 1 }),
      publisher.publish(event, { order: 2 }),
      publisher.publish(event, { order: 3 }),
    ])

    const beforeCleanup = await redis.xRange(key, '-', '+')
    expect(beforeCleanup).toHaveLength(3)

    await sleep(1100)
    await publisher.publish(event, { order: 4 })

    const afterCleanup = await redis.xRange(key, '-', '+')
    expect(afterCleanup).toHaveLength(1)

    const ttl = await redis.ttl(key)
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(2)

    await sleep(2500)

    expect(await redis.exists(key)).toBe(0)
  })

  it('supports custom serializers and custom prefixes for cross-process payloads', async () => {
    class Person {
      constructor(
        public name: string,
        public date: Date,
      ) {
      }
    }

    const serializer = new RPCJsonSerializer({
      handlers: {
        person: {
          condition: p => p instanceof Person,
          serialize: p => ({ name: p.name, date: p.date }),
          deserialize: (p: any) => new Person(p.name, p.date),
        },
      },
    })

    const prefix = `custom:${crypto.randomUUID()}:`
    const event = 'profile-updated'
    const publisher = createTestingPublisher({
      resume: { enabled: true, seconds: 10 },
      serializer,
      prefix,
    })

    const listener = vi.fn()
    const unsubscribe = await publisher.subscribe(event, listener)

    const payload = {
      order: 1,
      nested: {
        value: 'test',
        array: [1, 2, 3],
      },
      date: new Date('2024-01-01'),
      person: new Person('John Doe', new Date('2023-01-01')),
    }

    await publisher.publish(event, payload)

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(1)
    })

    const received = listener.mock.calls[0]![0]

    expect(received.order).toBe(1)
    expect(received.nested.value).toBe('test')
    expect(received.nested.array).toEqual([1, 2, 3])
    expect(received.date).toEqual(new Date('2024-01-01'))
    expect(received.person).toEqual(new Person('John Doe', new Date('2023-01-01')))

    const keys = await redis.keys(`${prefix}*`)
    expect(keys).toContain(`${prefix}${event}`)

    await unsubscribe()
  })

  it('reports resume errors while subscribing', async () => {
    const publisher = createTestingPublisher({
      resume: { enabled: true, seconds: 10 },
    })
    const event = 'resume-errors'
    const listener = vi.fn()
    const onError = vi.fn()

    await expect(publisher.subscribe(event, listener, {
      lastEventId: 'invalid-id-format',
      onError,
    })).rejects.toThrow()

    await publisher.publish(event, { order: 1 })
    await sleep(300)

    expect(onError).not.toHaveBeenCalled()
    expect(listener).not.toHaveBeenCalled()
  })

  it('fan-outs malformed pubsub payload errors to every registered subscriber', async () => {
    const prefix = `invalid:${crypto.randomUUID()}:`
    const event = 'alerts'
    const publisher = createTestingPublisher({ prefix })
    const listener1 = vi.fn()
    const listener2 = vi.fn()
    const onError1 = vi.fn()
    const onError2 = vi.fn()

    const unsubscribe1 = await publisher.subscribe(event, listener1, { onError: onError1 })
    const unsubscribe2 = await publisher.subscribe(event, listener2, { onError: onError2 })

    await redis.publish(`${prefix}${event}`, 'invalid')

    await vi.waitFor(() => {
      expect(onError1).toHaveBeenCalledTimes(1)
      expect(onError2).toHaveBeenCalledTimes(1)
    })

    expect(listener1).not.toHaveBeenCalled()
    expect(listener2).not.toHaveBeenCalled()

    await unsubscribe1()
    await unsubscribe2()
  })

  it('supports duplicate listener registration and idempotent unsubscribe handles', async () => {
    const prefix = `reuse:${crypto.randomUUID()}:`
    const event = 'status'
    const publisher = createTestingPublisher({ prefix })
    const listener = vi.fn()
    const onError = vi.fn()

    const unsubscribe1 = await publisher.subscribe(event, listener, { onError })
    const unsubscribe2 = await publisher.subscribe(event, listener, { onError })

    await Promise.all([
      publisher.publish(event, { order: 1 }),
      redis.publish(`${prefix}${event}`, 'invalid'),
    ])

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(2)
      expect(onError).toHaveBeenCalledTimes(2)
    })

    await Promise.all([unsubscribe1(), unsubscribe1(), unsubscribe1()])

    await Promise.all([
      publisher.publish(event, { order: 2 }),
      redis.publish(`${prefix}${event}`, 'invalid'),
    ])

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(3)
      expect(onError).toHaveBeenCalledTimes(3)
    })

    await unsubscribe2()
  })

  it('reports subscriber connection errors to the onError of active subscriptions only', async ({ onTestFinished }) => {
    const userSubscriber = redis.duplicate()
    onTestFinished(() => {
      userSubscriber.destroy()
    })
    const publishers = [
      createTestingPublisher(),
      createTestingPublisher({ subscriber: userSubscriber }),
    ]

    for (const publisher of publishers) {
      const subscriber = (publisher as any).subscriber
      const onError = vi.fn()
      const error = new Error('boom')

      const unsubscribe = await publisher.subscribe('connection-errors', () => {}, { onError })

      subscriber.emit('error', error)

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(error)

      await unsubscribe()

      expect(() => subscriber.emit('error', new Error('after unsubscribe'))).not.toThrow()
      expect(onError).toHaveBeenCalledTimes(1)
    }
  })

  it('reports a dropped subscriber connection and keeps delivering after node-redis reconnects', async ({ onTestFinished }) => {
    // `duplicate()` copies the name, which identifies the subscriber connection in `CLIENT LIST`.
    const name = `dropped:${crypto.randomUUID()}`
    const namedRedis = createClient({ url: REDIS_URL, name })
    const prefix = `dropped:${crypto.randomUUID()}:`
    const publisher = createTestingPublisher({ prefix }, { useRedis: namedRedis })
    onTestFinished(() => {
      namedRedis.destroy()
      ;(publisher as any).subscriber.destroy()
    })
    const event = 'alerts'
    const channel = `${prefix}${event}`
    const listener = vi.fn()
    const onError = vi.fn()

    const unsubscribe = await publisher.subscribe(event, listener, { onError })

    // Kill only this connection, since `CLIENT KILL TYPE pubsub` would break concurrent tests.
    const { id } = (await redis.clientList()).find(client => client.name === name)!
    await redis.clientKill({ filter: 'ID', id })

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
    })

    await vi.waitFor(async () => {
      expect(await redis.pubSubNumSub(channel)).toEqual({ [channel]: 1 })
    }, { timeout: 5000 })

    await publisher.publish(event, { order: 1 })

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(1)
    })

    expect(listener).toHaveBeenCalledWith({ order: 1 })

    await unsubscribe()
  })

  it('lazily connects to Redis once under concurrent limit calls', async () => {
    const redis1 = createClient({ url: REDIS_URL })
    const redis2 = createClient({ url: REDIS_URL })
    const redis3 = createClient({ url: REDIS_URL })

    const prefix = `lazy:${crypto.randomUUID()}:`
    const publisher = createTestingPublisher({ prefix, resume: { enabled: true } }, { useRedis: redis1 })
    const subscriber = createTestingPublisher({ prefix, resume: { enabled: true }, subscriber: redis3 }, { useRedis: redis2 })

    expect(redis1.isOpen).toBe(false)
    await Promise.all([
      publisher.publish('lazy', { order: 1 }),
      publisher.publish('lazy', { order: 2 }),
      publisher.publish('lazy', { order: 3 }),
    ])
    expect(redis1.isOpen).toBe(true)

    expect(redis2.isOpen).toBe(false)
    expect(redis3.isOpen).toBe(false)
    const listener = vi.fn()
    const [unsubscribe1, unsubscribe2, unsubscribe3] = await Promise.all([
      subscriber.subscribe('lazy', listener, { lastEventId: '0' }),
      subscriber.subscribe('lazy', listener, { lastEventId: '0' }),
      subscriber.subscribe('lazy', listener, { lastEventId: '0' }),
    ])
    expect(redis2.isOpen).toBe(true)
    expect(redis3.isOpen).toBe(true)

    expect(listener).toHaveBeenCalledTimes(9)
    expect(listener).toHaveBeenCalledWith({ order: 1 })
    expect(listener).toHaveBeenCalledWith({ order: 2 })
    expect(listener).toHaveBeenCalledWith({ order: 3 })

    await unsubscribe1()
    await unsubscribe2()
    await unsubscribe3()
  })
})
