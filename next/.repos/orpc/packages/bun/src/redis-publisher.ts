import type { BaseRedisPublisherOptions, RedisStreamEntry } from '@orpc/publisher/base-redis'
import type { Promisable, ThrowableError } from '@orpc/shared'
import type { RedisClient } from 'bun'
import { BaseRedisPublisher } from '@orpc/publisher/base-redis'
import { once } from '@orpc/shared'

export interface BunRedisPublisherOptions extends BaseRedisPublisherOptions {
  /**
   * Redis subscriber instance.
   * Pub/Sub takes over the connection, so a client with subscriptions
   * cannot execute commands and must use a dedicated connection.
   *
   * @remarks
   * The publisher takes over `onconnect` and `onclose` to detect lost subscriptions.
   * Set your own handlers before the first listen, or they replace the publisher's.
   *
   * @default redis.duplicate() (lazily created on first listen)
   */
  subscriber?: undefined | Promisable<RedisClient>
}

/**
 * Publisher adapter for Bun's built-in Redis client. Distributes events across
 * processes via Redis Pub/Sub, with optional resume support backed by Redis Streams.
 *
 * @see {@link https://orpc.dev/docs/helpers/publisher#adapters | Publisher Helpers - Adapters}
 */
export class BunRedisPublisher<T extends Record<string, object>> extends BaseRedisPublisher<T> {
  private readonly getSubscriber: () => Promise<RedisClient>

  private readonly onErrors: Array<(error: ThrowableError) => void> = []

  constructor(
    private readonly redis: RedisClient,
    { subscriber, ...options }: BunRedisPublisherOptions = {},
  ) {
    super(options)

    this.getSubscriber = once(async () => {
      const client = await (subscriber ?? redis.duplicate())
      this.watchSubscriber(client)
      return client
    })
  }

  protected async publishMessage(channel: string, message: string): Promise<void> {
    await this.redis.publish(channel, message)
  }

  protected async subscribeChannel(
    channel: string,
    listener: (message: unknown) => void,
    onError?: (error: ThrowableError) => void,
  ): Promise<() => Promise<void>> {
    const subscriber = await this.getSubscriber()

    if (!subscriber.connected) {
      await subscriber.connect()
    }

    await subscriber.subscribe(channel, listener)

    // Registered after subscribing because a failed subscription rejects instead.
    if (onError) {
      this.onErrors.push(onError)
    }

    return async () => {
      if (onError) {
        const index = this.onErrors.indexOf(onError)

        if (index !== -1) {
          this.onErrors.splice(index, 1)
        }
      }

      try {
        await subscriber.unsubscribe(channel, listener)
      }
      catch (error) {
        if (subscriber.connected) {
          throw error
        }
      }
    }
  }

  protected async evalScript(script: string, keys: string[], args: string[]): Promise<unknown> {
    return await this.redis.send('EVAL', [script, String(keys.length), ...keys, ...args])
  }

  protected async readStreamEntries(key: string, lastId: string): Promise<RedisStreamEntry[]> {
    const results = await this.redis.send('XREAD', ['STREAMS', key, lastId])
    const entries: Array<[id: string, fields: [name: string, value: string]]> = results?.[key] ?? []

    return entries.map(([id, fields]) => ({ id, data: fields[1] }))
  }

  private watchSubscriber(subscriber: RedisClient): void {
    const { onconnect, onclose } = subscriber
    // Snapshot, since a callback may unsubscribe itself mid-dispatch.
    const report = (error: ThrowableError) => this.onErrors.slice().forEach(onError => onError(error))

    subscriber.onconnect = function () {
      onconnect?.call(this)
      report(new Error('Redis subscriber reconnected without its subscriptions.'))
    }

    subscriber.onclose = function (error) {
      onclose?.call(this, error)
      report(error)
    }
  }
}
