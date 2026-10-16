import type { Publisher } from '../src'
import { getEventMeta, withEventMeta } from '@standard-server/core'
import { Redis } from '@upstash/redis'
import { createClient } from 'redis'
import { RedisPublisher } from '../src/adapters/redis'
import { UpstashPublisher } from '../src/adapters/upstash'

const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

/**
 * These tests require a real Redis/Upstash Redis server.
 * Set  `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN` before running them.
 *
 * When adding new tests, always use unique keys to avoid conflicts with other cases.
 *
 * all adapters must connect to the same server.
 */
describe('publisher redis adapters compatibility', { timeout: 20_000 }, () => {
  const publishers: Array<{ name: string, publisher: Publisher<any> }> = []
  const prefix = `redis-adapters:${crypto.randomUUID()}`

  if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
    const redis = createClient({ url: `rediss://default:${UPSTASH_REDIS_REST_TOKEN}@${new URL(UPSTASH_REDIS_REST_URL).host}:6379` })
    const publisher = new RedisPublisher(redis, {
      prefix,
      resume: { enabled: true, seconds: 10 },
    })
    publishers.push({ name: 'redis', publisher })
  }

  // TODO: Upstash is not compatible with Node 26 yet — temporarily disable these tests and revisit in the future.
  if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN && !process.versions.node.startsWith('26.')) {
    const upstashRedis = new Redis({ url: UPSTASH_REDIS_REST_URL, token: UPSTASH_REDIS_REST_TOKEN })
    const publisher = new UpstashPublisher(upstashRedis, {
      prefix,
      resume: { enabled: true, seconds: 10 },
    })
    publishers.push({ name: 'upstash', publisher: new UpstashPublisher(upstashRedis, {
      prefix,
      resume: { enabled: true, seconds: 10 },
    }) })
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

          await vi.waitFor(() => {
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

          await vi.waitFor(() => {
            expect(resumed).toHaveBeenCalledTimes(1)
          })

          const resumedPayload = resumed.mock.calls[0]![0]

          expect(resumedPayload).toEqual({ order: 3 })
          expect(getEventMeta(resumedPayload)?.id).toEqual(expect.any(String))

          await unsubscribeResume()
        })
      }
    }
  })
})
