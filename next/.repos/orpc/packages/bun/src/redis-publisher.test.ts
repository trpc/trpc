import type { BunRedisPublisherOptions } from './redis-publisher'
import { RPCJsonSerializer } from '@orpc/client'
import { getOrBind, promiseWithResolvers, sleep } from '@orpc/shared'
import { getEventMeta, withEventMeta } from '@standard-server/core'
import { RedisClient } from 'bun'
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from 'bun:test'
import { waitFor } from '../tests/__shared__/utils'
import { BunRedisPublisher } from './redis-publisher'

const REDIS_URL = process.env.REDIS_URL

/**
 * These tests depend on a real Redis server — make sure to set the `REDIS_URL` env.
 * When writing new tests, always use unique keys to avoid conflicts with other test cases.
 */
describe.skipIf(!REDIS_URL)('bun redis publisher', () => {
  const createdPublishers: BunRedisPublisher<Record<string, object>>[] = []

  const redis = new RedisClient(REDIS_URL)

  beforeAll(async () => {
    await redis.connect()
  })

  afterAll(async () => {
    redis.close()
  })

  function createTestingPublisher(
    options: BunRedisPublisherOptions = {},
    { useRedis = redis }: { useRedis?: RedisClient } = {},
  ) {
    const publisher = new BunRedisPublisher<Record<string, object>>(
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

    await waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(2)
    })

    const payload0 = listener.mock.calls[0]![0]
    expect(payload0).toEqual({ order: 1 })
    expect(getEventMeta(payload0)).toEqual(undefined)

    const payload1 = listener.mock.calls[1]![0]
    expect(payload1).toEqual({ order: 2 })
    expect(getEventMeta(payload1)).toEqual({ id: '__id__', comments: ['__comment__'] })

    await unsubscribe()

    const resumeAttempt = vi.fn()
    const unsubscribeResumeAttempt = await publisher.subscribe(liveEvent, resumeAttempt, { lastEventId: '0' })

    await sleep(300)

    expect(resumeAttempt).not.toHaveBeenCalled()

    await unsubscribeResumeAttempt()
  }, { timeout: 20_000 })

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

    await waitFor(() => {
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

    await waitFor(() => {
      expect(resumed).toHaveBeenCalledTimes(1)
    })

    const resumedPayload = resumed.mock.calls[0]![0]

    expect(resumedPayload).toEqual(thirdDelivered)
    expect(getEventMeta(resumedPayload)?.id).toEqual(getEventMeta(thirdDelivered)?.id)

    await unsubscribeResume()
  }, { timeout: 20_000 })

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

    await waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(1)
    })

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ order: 1 }))

    await unsubscribe()
  }, { timeout: 20_000 })

  it('deduplicates events that race between resume and live delivery during reconnect', async () => {
    const { resolve, promise } = promiseWithResolvers<void>()
    const delayedRedis = new Proxy(new RedisClient(REDIS_URL), {
      get(target, p) {
        if (p === 'send') {
          const originalSend = getOrBind(target, p)
          return async (command: string, args: any[]) => {
            if (command === 'XREAD') {
              await promise
            }

            return originalSend(command, args)
          }
        }

        return getOrBind(target, p)
      },
    })

    onTestFinished(() => {
      delayedRedis.close()
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

    await waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(4)
    })

    expect(listener.mock.calls.map(call => call[0].order)).toEqual([1, 2, 3, 4])

    await unsubscribe()
  }, { timeout: 20_000 })

  it('keeps live delivery in stream order under concurrent publishers so resume skips nothing', async () => {
    const prefix = `concurrent:${crypto.randomUUID()}:`
    const event = 'orders'
    // Separate connections, like publishers in different processes.
    const clients = Array.from({ length: 4 }, () => new RedisClient(REDIS_URL))
    onTestFinished(() => {
      clients.forEach(client => client.close())
    })
    const publishers = clients.map(client => createTestingPublisher({
      resume: { enabled: true, seconds: 10 },
      prefix,
    }, { useRedis: client }))
    const listener = vi.fn()

    const unsubscribe = await publishers[0]!.subscribe(event, listener)

    await Promise.all(Array.from({ length: 500 }, (_, order) => publishers[order % publishers.length]!.publish(event, { order })))

    await waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(500)
    })

    const streamIds = (await redis.send('XRANGE', [`${prefix}${event}`, '-', '+'])).map(([id]: [string]) => id)
    expect(listener.mock.calls.map(([payload]) => getEventMeta(payload)?.id)).toEqual(streamIds)

    await unsubscribe()
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

    const beforeCleanup = await redis.send('XRANGE', [key, '-', '+'])
    expect(beforeCleanup.length).toBe(3)

    await sleep(1100)
    await publisher.publish(event, { order: 4 })

    const afterCleanup = await redis.send('XRANGE', [key, '-', '+'])
    expect(afterCleanup.length).toBe(1)

    const ttl = await redis.ttl(key)
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(2)

    await sleep(2500)

    expect(await redis.exists(key)).toBe(false)
  }, { timeout: 20_000 })

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

    await waitFor(() => {
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
  }, { timeout: 20_000 })

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

    await sleep(1000)
    await publisher.publish(event, { order: 1 })
    await sleep(300)

    expect(onError).not.toHaveBeenCalled()
    expect(listener).not.toHaveBeenCalled()
  }, { timeout: 20_000, retry: 5 }) // not sure why but bun.redis can slow on unsubscribe, so we need retry sometimes

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

    await waitFor(() => {
      expect(onError1).toHaveBeenCalledTimes(1)
      expect(onError2).toHaveBeenCalledTimes(1)
    })

    expect(listener1).not.toHaveBeenCalled()
    expect(listener2).not.toHaveBeenCalled()

    await unsubscribe1()
    await unsubscribe2()
  }, { timeout: 20_000 })

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

    await waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(2)
      expect(onError).toHaveBeenCalledTimes(2)
    })

    await Promise.all([unsubscribe1(), unsubscribe1(), unsubscribe1()])

    await Promise.all([
      publisher.publish(event, { order: 2 }),
      redis.publish(`${prefix}${event}`, 'invalid'),
    ])

    await waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(3)
      expect(onError).toHaveBeenCalledTimes(3)
    })

    await unsubscribe2()
  }, { timeout: 20_000 })

  it('reports a lost subscriber connection to the onError of active subscriptions only', async () => {
    const userSubscriber = await redis.duplicate()
    const userOnclose = vi.fn()
    userSubscriber.onclose = userOnclose
    onTestFinished(() => {
      userSubscriber.close()
    })
    const publishers = [
      createTestingPublisher(),
      createTestingPublisher({ subscriber: userSubscriber }),
    ]

    for (const publisher of publishers) {
      const onError = vi.fn()
      const error = new Error('boom')

      const unsubscribe = await publisher.subscribe('connection-errors', () => {}, { onError })
      const subscriber: RedisClient = await (publisher as any).getSubscriber()

      subscriber.onconnect!.call(subscriber)
      subscriber.onclose!.call(subscriber, error)

      expect(onError).toHaveBeenCalledTimes(2)
      expect(onError).toHaveBeenNthCalledWith(1, expect.any(Error))
      expect(onError).toHaveBeenNthCalledWith(2, error)

      await unsubscribe()

      subscriber.onconnect!.call(subscriber)
      subscriber.onclose!.call(subscriber, error)

      expect(onError).toHaveBeenCalledTimes(2)
    }

    expect(userOnclose).toHaveBeenCalledTimes(2)
  }, { timeout: 20_000 })

  it.each([
    // Bun reconnects without restoring subscriptions, so a new subscription must restore delivery.
    ['dropped', async (subscriber: RedisClient) => {
      await redis.send('CLIENT', ['KILL', 'ID', String(await subscriber.send('CLIENT', ['ID']))])
    }],
    // Bun also closes the client like this once it gives up reconnecting.
    ['closed', (subscriber: RedisClient) => subscriber.close()],
  ] as const)('reports a %s subscriber connection and delivers again after subscribing again', async (_, loseConnection) => {
    const publisher = createTestingPublisher()
    const event = 'alerts'
    const onError = vi.fn()

    const unsubscribe = await publisher.subscribe(event, () => {}, { onError })

    await loseConnection(await (publisher as any).getSubscriber())

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
    })

    await unsubscribe() // must not reject, even on a closed connection

    const listener = vi.fn()
    const unsubscribeAgain = await publisher.subscribe(event, listener)

    await publisher.publish(event, { order: 1 })

    await waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(1)
    })

    expect(listener).toHaveBeenCalledWith({ order: 1 })

    await unsubscribeAgain()
  }, { timeout: 20_000 })
})
