import type { Publisher } from '@orpc/publisher'
import { RedisPublisher } from '@orpc/publisher/redis'
import { getEventMeta, withEventMeta } from '@standard-server/core'
import { RedisClient } from 'bun'
import { afterAll, describe, expect, it, vi } from 'bun:test'
import { createClient } from 'redis'
import { BunRedisPublisher } from '../src/redis-publisher'
import { waitFor } from './__shared__/utils'

const REDIS_URL = process.env.REDIS_URL

/**
 * These tests require a real Redis Redis server.
 * Set `REDIS_URL` before running them.
 *
 * When adding new tests, always use unique keys to avoid conflicts with other cases.
 */
describe('publisher redis adapters compatibility', () => {
  const publishers: Array<{ name: string, publisher: Publisher<any> }> = []
  const prefix = `redis-adapters:${crypto.randomUUID()}`

  if (REDIS_URL) {
    const redis = createClient({ url: REDIS_URL })

    afterAll(() => {
      redis.close()
    })

    publishers.push({
      name: 'redis',
      publisher: new RedisPublisher(redis, {
        prefix,
        resume: { enabled: true, seconds: 10 },
      }),
    })

    const bunRedis = new RedisClient(REDIS_URL)

    afterAll(() => {
      bunRedis.close()
    })

    publishers.push({
      name: 'bun-redis',
      publisher: new BunRedisPublisher(bunRedis, {
        prefix,
        resume: { enabled: true, seconds: 10 },
      }),
    })
  }

  describe.skipIf(publishers.length < 2)('cross-adapter compatibility', () => {
    for (const source of publishers) {
      for (const target of publishers) {
        if (source === target) {
          continue
        }

        it(`delivers live events from ${source.name} to ${target.name} and resumes from the last received id`, async () => {
          const event = `live:${crypto.randomUUID()}`
          const liveListener = vi.fn()

          const unsubscribeLive = await target.publisher.subscribe(event, liveListener)

          await source.publisher.publish(event, withEventMeta({ order: 1 }, { id: 'client-id', comments: ['cross-adapter'] }))
          await source.publisher.publish(event, { order: 2 })

          await waitFor(() => {
            expect(liveListener).toHaveBeenCalledTimes(2)
          })

          const firstDelivered = liveListener.mock.calls[0]![0]
          const secondDelivered = liveListener.mock.calls[1]![0]

          expect(firstDelivered).toEqual({ order: 1 })
          expect(getEventMeta(firstDelivered)?.id).toEqual(expect.any(String))
          expect(getEventMeta(firstDelivered)?.id).not.toBe('client-id')
          expect(getEventMeta(firstDelivered)?.comments).toEqual(['cross-adapter'])

          expect(secondDelivered).toEqual({ order: 2 })
          expect(getEventMeta(secondDelivered)?.id).toEqual(expect.any(String))

          await unsubscribeLive()

          await source.publisher.publish(event, { order: 3 })

          const resumed = vi.fn()
          const unsubscribeResume = await target.publisher.subscribe(event, resumed, {
            lastEventId: getEventMeta(secondDelivered)?.id,
          })

          await waitFor(() => {
            expect(resumed).toHaveBeenCalledTimes(1)
          })

          const resumedPayload = resumed.mock.calls[0]![0]

          expect(resumedPayload).toEqual({ order: 3 })
          expect(getEventMeta(resumedPayload)?.id).toEqual(expect.any(String))

          await unsubscribeResume()
        }, { timeout: 20_000 })
      }
    }
  })
})
