import type { UpstashPublisherOptions } from './upstash'
import { RPCJsonSerializer } from '@orpc/client'
import { getOrBind, promiseWithResolvers, sleep } from '@orpc/shared'
import { getEventMeta, withEventMeta } from '@standard-server/core'
import { Redis } from '@upstash/redis'
import { UpstashPublisher } from './upstash'

const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

/**
 * These tests depend on a real Upstash redis server — make sure to set the `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` envs.
 * When writing new tests, always use unique keys to avoid conflicts with other test cases.
 */
describe.concurrent(
  'upstashPublisher',
  {
    // TODO: Upstash is not compatible with Node 26 yet — temporarily disable these tests and revisit in the future.
    skip: !UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN || process.versions.node.startsWith('26.'),
    timeout: 20000,
  },
  () => {
    let redis: Redis
    const createdPublishers: UpstashPublisher<Record<string, object>>[] = []

    function createTestingPublisher(
      options: UpstashPublisherOptions = {},
      {
        useRedis = redis,
      }: {
        useRedis?: Redis
      } = {},
    ) {
      const publisher = new UpstashPublisher<Record<string, object>>(
        useRedis,
        {
          prefix: `upstash:${crypto.randomUUID()}:`,
          ...options,
        },
      )

      ;(publisher as any).xTrimExactness = '=' // for easier testing

      createdPublishers.push(publisher)

      return publisher
    }

    beforeAll(() => {
      redis = new Redis({
        url: UPSTASH_REDIS_REST_URL,
        token: UPSTASH_REDIS_REST_TOKEN,
      })
    })

    afterAll(() => {
      for (const publisher of createdPublishers) {
        expect((publisher as any).listenersMap.size).toEqual(0) // ensure cleanup correctly
        expect((publisher as any).subscriptionMap.size).toEqual(0) // ensure cleanup correctly
        expect((publisher as any).onErrorsMap.size).toEqual(0) // ensure cleanup correctly
        expect((publisher as any).pendingSubscriptionsMap.size).toEqual(0) // ensure cleanup correctly
      }
    })

    it('delivers live events and meta (without resume and prefix)', async () => {
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
      const event = ('orders')
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
      expect(getEventMeta(secondDelivered)?.id).not.toBe('client-id')
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
      const event = ('empty-backlog')
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

    it('deduplicates events that race between resume and live delivery during reconnect', async () => {
      const { resolve, promise } = promiseWithResolvers<void>()
      const redis = new Proxy(
        new Redis({
          url: UPSTASH_REDIS_REST_URL,
          token: UPSTASH_REDIS_REST_TOKEN,
        }),
        {
          get(target, p) {
            if (p === 'xread') {
              const originalXRead = getOrBind(target, p)
              return async function xread(...args: [any, any]) {
                await promise // slow down resume process
                return originalXRead(...args)
              }
            }

            return getOrBind(target, p)
          },
        },
      )

      const publisher = createTestingPublisher({
        resume: { enabled: true, seconds: 10 },
      }, { useRedis: redis })
      const event = ('timeline')

      await publisher.publish(event, { order: 1 })
      await publisher.publish(event, { order: 2 })

      const listener = vi.fn()
      const [unsubscribe] = await Promise.all([
        publisher.subscribe(event, listener, { lastEventId: '0' }),
        sleep(1000) // ensure some events arrive in pub/sub channel
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

    it('shares one Redis subscription across listeners and ignores late messages after local teardown', async () => {
      const dedicatedRedis = new Redis({
        url: UPSTASH_REDIS_REST_URL,
        token: UPSTASH_REDIS_REST_TOKEN,
      })
      const subscribeSpy = vi.spyOn(dedicatedRedis, 'subscribe')
      const publisher = createTestingPublisher({}, { useRedis: dedicatedRedis })
      const event = ('shared-subscription')
      const listener1 = vi.fn()
      const listener2 = vi.fn()

      const [unsubscribe1, unsubscribe2] = await Promise.all([
        publisher.subscribe(event, listener1),
        publisher.subscribe(event, listener2),
      ])

      expect(subscribeSpy).toHaveBeenCalledTimes(1)

      await publisher.publish(event, { order: 1 })

      await vi.waitFor(() => {
        expect(listener1).toHaveBeenCalledTimes(1)
        expect(listener2).toHaveBeenCalledTimes(1)
      })

      await unsubscribe1()
      await publisher.publish(event, { order: 2 })

      await vi.waitFor(() => {
        expect(listener1).toHaveBeenCalledTimes(1)
        expect(listener2).toHaveBeenCalledTimes(2)
      })

      await unsubscribe2()
    })

    it('keeps live delivery in stream order under concurrent publishers so resume skips nothing', async () => {
      const prefix = `concurrent:${crypto.randomUUID()}:`
      const event = 'orders'
      const publisher = createTestingPublisher({
        resume: { enabled: true, seconds: 10 },
        prefix,
      })
      const listener = vi.fn()

      const unsubscribe = await publisher.subscribe(event, listener)

      // Each command is a separate HTTP request, like publishers in different processes.
      await Promise.all(Array.from({ length: 50 }, (_, order) => publisher.publish(event, { order })))

      await vi.waitFor(() => {
        expect(listener).toHaveBeenCalledTimes(50)
      })

      const streamIds = (await redis.xread(`${prefix}${event}`, '0') as any)[0][1].map(([id]: [string]) => id)
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

      const beforeCleanup = await redis.xread(key, '0') as any
      expect(beforeCleanup[0][1].length).toBe(3)

      await sleep(1100)
      await publisher.publish(event, { order: 4 })

      const afterCleanup = await redis.xread(key, '0') as any
      expect(afterCleanup[0][1].length).toBe(1)

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
        ) { }
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

      const publisher = createTestingPublisher({
        resume: { enabled: true, seconds: 10 },
        serializer,
        prefix: `custom:${crypto.randomUUID()}:`,
      })
      const event = 'profile-updated'

      const listener1 = vi.fn()
      const unsub1 = await publisher.subscribe(event, listener1)

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
        expect(listener1).toHaveBeenCalledTimes(1)
      })
      const received = listener1.mock.calls[0]![0]
      expect(received.order).toBe(1)
      expect(received.nested.value).toBe('test')
      expect(received.nested.array).toEqual([1, 2, 3])
      expect(received.date).toEqual(new Date('2024-01-01'))
      expect(received.person).toEqual(new Person('John Doe', new Date('2023-01-01')))

      const keys = await redis.keys(`${(publisher as any).prefix}*`)
      expect(keys).toContain(`${(publisher as any).prefix}${event}`)

      await unsub1()
    })

    it('reports resume errors while subscribing', async () => {
      const publisher = createTestingPublisher({
        resume: { enabled: true, seconds: 10 },
      })
      const event = ('resume-errors')
      const listener = vi.fn()
      const onError = vi.fn()

      await expect(publisher.subscribe(event, listener, {
        lastEventId: 'invalid-id-format',
        onError,
      })).rejects.toThrow()

      await publisher.publish(event, { order: 1 })

      await sleep(1000)

      expect(onError).toHaveBeenCalledTimes(0)
      expect(listener).toHaveBeenCalledTimes(0)
    })

    it('fan-outs malformed pubsub payload errors to every registered onError handler', async () => {
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

    it('rejects concurrent subscribers when the Redis subscription cannot be established', async () => {
      const invalidRedis = new Redis({
        url: 'http://invalid:6379',
        token: 'invalid',
      })
      const publisher = createTestingPublisher({}, { useRedis: invalidRedis })
      const event1 = ('connection-error')
      const event2 = ('connection-error')
      const listener1 = vi.fn()
      const listener2 = vi.fn()
      const onError1 = vi.fn()
      const onError2 = vi.fn()

      await Promise.all([
        expect(publisher.subscribe(event1, listener1, { onError: onError1 })).rejects.toThrow(),
        expect(publisher.subscribe(event1, listener1, { onError: onError1 })).rejects.toThrow(),
        expect(publisher.subscribe(event2, listener2, { onError: onError2 })).rejects.toThrow(),
      ])

      expect(listener1).not.toHaveBeenCalled()
      expect(listener2).not.toHaveBeenCalled()
      expect(onError1).not.toHaveBeenCalled()
      expect(onError2).not.toHaveBeenCalled()
    })

    it('does not crash if teardown runs after internal maps were already pruned', async () => {
      const publisher = createTestingPublisher()
      const event = ('defensive-cleanup')
      const listener = vi.fn()
      const onError = vi.fn()

      const unsubscribe = await publisher.subscribe(event, listener, { onError })
      const channel = `${(publisher as any).prefix}${event}`
      const subscription = (publisher as any).subscriptionMap.get(channel)

      if (!subscription) {
        throw new Error('No active subscription found')
      }

      ;(publisher as any).onErrorsMap.delete(channel)
      ;(publisher as any).subscriptionMap.delete(channel)

      await expect(unsubscribe()).resolves.toBeUndefined()
      await subscription.unsubscribe()
    })

    it('works with clients that disable automatic deserialization', async () => {
      const publisher = createTestingPublisher({ resume: { enabled: true, seconds: 10 } }, {
        useRedis: new Redis({
          url: UPSTASH_REDIS_REST_URL,
          token: UPSTASH_REDIS_REST_TOKEN,
          automaticDeserialization: false,
        }),
      })
      const event = 'orders'
      const listener = vi.fn()

      const unsubscribe = await publisher.subscribe(event, listener)
      await publisher.publish(event, withEventMeta({ order: 1 }, { comments: ['audit'] }))

      await vi.waitFor(() => {
        expect(listener).toHaveBeenCalledTimes(1)
      })

      expect(listener.mock.calls[0]![0]).toEqual({ order: 1 })
      expect(getEventMeta(listener.mock.calls[0]![0])).toEqual({ id: expect.any(String), comments: ['audit'] })

      await unsubscribe()

      const resumed = vi.fn()
      const unsubscribeResume = await publisher.subscribe(event, resumed, { lastEventId: '0' })

      await vi.waitFor(() => {
        expect(resumed).toHaveBeenCalledTimes(1)
      })

      expect(resumed.mock.calls[0]![0]).toEqual(listener.mock.calls[0]![0])

      await unsubscribeResume()
    })

    it('delivers to every listener even when one unsubscribes itself while receiving', async () => {
      const publisher = createTestingPublisher()
      const event = 'self-unsubscribe'
      let unsubscribeFirst: () => Promise<void>
      const first = vi.fn(() => {
        void unsubscribeFirst()
      })
      const second = vi.fn()

      unsubscribeFirst = await publisher.subscribe(event, first)
      const unsubscribeSecond = await publisher.subscribe(event, second)

      await publisher.publish(event, { order: 1 })

      await vi.waitFor(() => {
        expect(first).toHaveBeenCalledTimes(1)
        expect(second).toHaveBeenCalledTimes(1)
      })

      await unsubscribeSecond()
    })

    it('establishes a single subscription when waiters retry after a failed attempt', async () => {
      const invalidRedis = new Redis({ url: 'http://invalid:6379', token: 'invalid' })
      let failNext = true
      let subscribes = 0
      const flakyRedis = new Proxy(redis, {
        get(target, p) {
          if (p === 'subscribe') {
            return (...args: [string]) => {
              if (failNext) {
                failNext = false
                return invalidRedis.subscribe(...args)
              }

              subscribes++
              return getOrBind(target, p)(...args)
            }
          }

          return getOrBind(target, p)
        },
      })
      const publisher = createTestingPublisher({}, { useRedis: flakyRedis })
      const event = 'retry'
      const listener1 = vi.fn()
      const listener2 = vi.fn()
      const listener3 = vi.fn()

      const results = await Promise.allSettled([
        publisher.subscribe(event, listener1),
        publisher.subscribe(event, listener2),
        publisher.subscribe(event, listener3),
      ])

      expect(results.map(result => result.status)).toEqual(['rejected', 'fulfilled', 'fulfilled'])
      expect(subscribes).toBe(1)

      await publisher.publish(event, { order: 1 })
      await sleep(1000)

      expect(listener1).not.toHaveBeenCalled()
      expect(listener2).toHaveBeenCalledTimes(1)
      expect(listener3).toHaveBeenCalledTimes(1)

      for (const result of results) {
        if (result.status === 'fulfilled') {
          await result.value()
        }
      }
    })

    it('fan-outs subscription errors to every registered onError handler', async () => {
      const subscription = createFakeSubscription()
      const publisher = createTestingPublisher({}, {
        useRedis: withFakeSubscribe(redis, () => {
          queueMicrotask(() => subscription.emit('subscribe', 1))
          return subscription
        }),
      })
      const event = 'connection-lost'
      const onError1 = vi.fn()
      const onError2 = vi.fn()

      const unsubscribe1 = await publisher.subscribe(event, vi.fn(), { onError: onError1 })
      const unsubscribe2 = await publisher.subscribe(event, vi.fn(), { onError: onError2 })

      const error = new Error('connection lost')
      subscription.emit('error', error)

      expect(onError1).toHaveBeenCalledExactlyOnceWith(error)
      expect(onError2).toHaveBeenCalledExactlyOnceWith(error)

      await unsubscribe1()
      await unsubscribe2()

      expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
    })

    it('tears down a subscription that fails before it is established', async () => {
      const subscription = createFakeSubscription()
      const publisher = createTestingPublisher({}, {
        useRedis: withFakeSubscribe(redis, () => {
          queueMicrotask(() => subscription.emit('error', new Error('connection refused')))
          return subscription
        }),
      })

      await expect(publisher.subscribe('unreachable', vi.fn())).rejects.toThrow('connection refused')

      expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
    })

    it('opens a fresh subscription when subscribing while the previous one is being torn down', async () => {
      const dedicatedRedis = new Redis({ url: UPSTASH_REDIS_REST_URL, token: UPSTASH_REDIS_REST_TOKEN })
      const subscribeSpy = vi.spyOn(dedicatedRedis, 'subscribe')
      const publisher = createTestingPublisher({}, { useRedis: dedicatedRedis })
      const event = 'resubscribe'
      const first = vi.fn()
      const second = vi.fn()

      const unsubscribeFirst = await publisher.subscribe(event, first)
      const [, unsubscribeSecond] = await Promise.all([unsubscribeFirst(), publisher.subscribe(event, second)])
      await publisher.publish(event, { order: 1 })

      await vi.waitFor(() => {
        expect(second).toHaveBeenCalledTimes(1)
      })

      expect(first).not.toHaveBeenCalled()
      expect(subscribeSpy).toHaveBeenCalledTimes(2)

      await unsubscribeSecond()
    })
  },
)

function createFakeSubscription() {
  const handlers = new Map<string, Array<(event: unknown) => void>>()

  return {
    on: (type: string, handler: (event: unknown) => void) => {
      handlers.set(type, [...handlers.get(type) ?? [], handler])
    },
    emit: (type: string, event: unknown) => handlers.get(type)?.forEach(handler => handler(event)),
    unsubscribe: vi.fn(async () => {}),
  }
}

function withFakeSubscribe(redis: Redis, subscribe: () => unknown): Redis {
  return new Proxy(redis, {
    get(target, p) {
      return p === 'subscribe' ? subscribe : getOrBind(target, p)
    },
  })
}
