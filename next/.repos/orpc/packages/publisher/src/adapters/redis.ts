import type { ThrowableError } from '@orpc/shared'
import type { RedisClientType } from 'redis'
import type { BaseRedisPublisherOptions, RedisStreamEntry } from './base-redis'
import { BaseRedisPublisher } from './base-redis'

export interface RedisPublisherOptions extends BaseRedisPublisherOptions {
  /**
   * Redis subscriber instance.
   * Pub/Sub takes over the connection, so a client with subscriptions
   * cannot execute commands and must use a dedicated connection.
   *
   * @default redis.duplicate()
   */
  subscriber?: undefined | RedisClientType<any, any, any, any, any>
}

/**
 * Publisher adapter for Redis. Distributes events across processes via
 * Redis Pub/Sub, with optional resume support backed by Redis Streams.
 *
 * @see {@link https://orpc.dev/docs/helpers/publisher#adapters | Publisher Helpers - Adapters}
 */
export class RedisPublisher<T extends Record<string, object>> extends BaseRedisPublisher<T> {
  private readonly subscriber: Exclude<RedisPublisherOptions['subscriber'], undefined>

  /**
   * node-redis applies `keyPrefix` to keys but not channels, while the publish script
   * publishes on its key, so channels need the same prefix.
   */
  private readonly channelPrefix: string

  private readonly onErrors: Array<(error: ThrowableError) => void> = []

  constructor(
    private readonly redis: RedisClientType<any, any, any, any, any>,
    { subscriber, ...options }: RedisPublisherOptions = {},
  ) {
    super(options)

    const keyPrefix = redis.options?.keyPrefix

    if (keyPrefix !== undefined && typeof keyPrefix !== 'string') {
      throw new TypeError('RedisPublisher only supports a string keyPrefix on the Redis client.')
    }

    this.subscriber = subscriber ?? redis.duplicate()
    this.channelPrefix = keyPrefix ?? ''

    this.subscriber.on('error', (error) => {
      // Snapshot, since a callback may unsubscribe itself mid-dispatch.
      this.onErrors.slice().forEach(onError => onError(error))
    })
  }

  protected async publishMessage(channel: string, message: string): Promise<void> {
    await connectIfNeeded(this.redis)
    await this.redis.publish(`${this.channelPrefix}${channel}`, message)
  }

  protected async subscribeChannel(
    channel: string,
    listener: (message: unknown) => void,
    onError?: (error: ThrowableError) => void,
  ): Promise<() => Promise<void>> {
    const prefixedChannel = `${this.channelPrefix}${channel}`

    await connectIfNeeded(this.subscriber)
    await this.subscriber.subscribe(prefixedChannel, listener)

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

      await this.subscriber.unsubscribe(prefixedChannel, listener)
    }
  }

  protected async evalScript(script: string, keys: string[], args: string[]): Promise<unknown> {
    await connectIfNeeded(this.redis)

    return await this.redis.eval(script, { keys, arguments: args })
  }

  protected async readStreamEntries(key: string, lastId: string): Promise<RedisStreamEntry[]> {
    await connectIfNeeded(this.redis)

    const results = await this.redis.xRead({ key, id: lastId })

    const entries: Array<{ id: string, message: Record<string, string> }> = results?.[0]?.messages ?? []

    return entries.map(({ id, message }) => ({ id, data: message.data! }))
  }
}

async function connectIfNeeded(client: RedisClientType<any, any, any, any, any>): Promise<void> {
  if (!client.isOpen) {
    await client.connect()
  }
}
