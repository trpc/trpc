import type { RPCJsonSerialization } from '@orpc/client'
import type { Public, ThrowableError } from '@orpc/shared'
import type { EventMeta } from '@standard-server/core'
import type { PublisherOptions, PublisherSubscribeListenerOptions } from '../publisher'
import { RPCJsonSerializer } from '@orpc/client'
import { once, parseEmptyableJSON, stringifyJSON } from '@orpc/shared'
import { getEventMeta, unwrapEvent, withEventMeta } from '@standard-server/core'
import { Publisher } from '../publisher'

/**
 * Adds `ARGV[1]` to stream `KEYS[1]` and publishes it with its ID to the channel of the same name,
 * trimming and setting a TTL when `ARGV[2..4]` are given. One script keeps Pub/Sub order
 * equal to stream order. Kept on one line because `EVAL` sends it with every call.
 */
const PUBLISH_SCRIPT = `local id=redis.call('XADD',KEYS[1],'*','data',ARGV[1]) if ARGV[2] then redis.call('XTRIM',KEYS[1],'MINID',ARGV[2],ARGV[3]) redis.call('EXPIRE',KEYS[1],ARGV[4]) end redis.call('PUBLISH',KEYS[1],'{"data":'..ARGV[1]..',"id":"'..id..'"}')`

/**
 * Options shared by every Redis-backed publisher adapter.
 *
 * @see {@link https://orpc.dev/docs/helpers/publisher#adapters | Publisher Helpers - Adapters}
 */
export interface BaseRedisPublisherOptions extends PublisherOptions {
  /**
   * The prefix to use for Redis keys and Pub/Sub channels.
   * Set it to isolate events when several apps share one Redis instance.
   *
   * @default ''
   */
  prefix?: string

  /**
   * Serializer for serialize and deserialize payloads.
   *
   * @default RPCJsonSerializer
   */
  serializer?: undefined | Public<RPCJsonSerializer>

  /**
   * Configuration for event resume support.
   *
   * When enabled, published events are temporarily stored so new
   * subscribers can resume from a previous position using `lastEventId`.
   *
   * @default { enabled: false }
   */
  resume?: {
    /**
     * Whether event resume support is enabled.
     *
     * When enabled, published events are temporarily stored so new
     * subscribers can resume from a previous position using `lastEventId`.
     *
     * @default false
     */
    enabled: boolean

    /**
     * How long (in seconds) to retain events for resume.
     *
     * Expired events are cleaned up lazily for performance reasons, so
     * some events may remain available slightly longer than this period.
     *
     * @default 300 (5 min)
     */
    seconds?: number
  }
}

/**
 * An entry of the Redis Stream that stores events for resume.
 *
 * @see {@link https://orpc.dev/docs/helpers/publisher#adapters | Publisher Helpers - Adapters}
 */
export interface RedisStreamEntry {
  /**
   * The entry ID assigned by Redis, which doubles as the event ID.
   */
  id: string

  /**
   * The `data` field, as JSON text or already parsed by clients that deserialize automatically.
   */
  data: unknown
}

interface SerializedEvent {
  payload: RPCJsonSerialization
  meta?: undefined | EventMeta
}

/**
 * Base class for Redis-backed publisher adapters. It owns the key naming, the
 * message format, and the resume logic, so every adapter built on it can exchange
 * events with the others regardless of the Redis client in use.
 *
 * Extend it and implement the abstract methods to support another Redis client.
 *
 * @see {@link https://orpc.dev/docs/helpers/publisher#adapters | Publisher Helpers - Adapters}
 */
export abstract class BaseRedisPublisher<T extends Record<string, object>> extends Publisher<T> {
  protected readonly prefix: string
  protected readonly serializer: Public<RPCJsonSerializer>
  protected readonly resumeEnabled: boolean
  protected readonly resumeSeconds: number

  /**
   * Tests switch this to `=` for deterministic trimming.
   */
  protected readonly xTrimExactness: '~' | '=' = '~'

  private readonly lastTrimTimes = new Map<string, number>()

  constructor({ prefix, serializer, resume, ...options }: BaseRedisPublisherOptions = {}) {
    super(options)

    this.prefix = prefix ?? ''
    this.serializer = serializer ?? new RPCJsonSerializer()
    this.resumeEnabled = resume?.enabled ?? false
    this.resumeSeconds = resume?.seconds ?? 300
  }

  /**
   * Sends a message to a Pub/Sub channel (`PUBLISH channel message`).
   */
  protected abstract publishMessage(channel: string, message: string): Promise<void>

  /**
   * Listens for messages on a Pub/Sub channel (`SUBSCRIBE channel`) and resolves
   * with a function that stops listening (`UNSUBSCRIBE channel`).
   *
   * Messages reach the listener as JSON text, or already parsed by clients that
   * deserialize automatically. The listener may be invoked as soon as the subscription is established, even
   * before the returned promise settles. When the promise rejects, nothing may be
   * left subscribed. `onError` reports failures of the established subscription,
   * such as a lost connection.
   */
  protected abstract subscribeChannel(
    channel: string,
    listener: (message: unknown) => void,
    onError?: (error: ThrowableError) => void,
  ): Promise<() => Promise<void>>

  /**
   * Runs a Lua script (`EVAL script numkeys key [key ...] arg [arg ...]`) and resolves with its reply.
   * The publish script also uses its key as the Pub/Sub channel, so a client that prefixes
   * keys must prefix channels the same way.
   */
  protected abstract evalScript(script: string, keys: string[], args: string[]): Promise<unknown>

  /**
   * Reads the entries with an ID greater than `lastId` (`XREAD STREAMS key lastId`), oldest first.
   */
  protected abstract readStreamEntries(key: string, lastId: string): Promise<RedisStreamEntry[]>

  async publish<K extends keyof T & string>(event: K, payload: T[K]): Promise<void> {
    const channel = `${this.prefix}${event}`
    const data = this.serializePayload(payload)

    if (!this.resumeEnabled) {
      await this.publishMessage(channel, stringifyJSON({ data }))
      return
    }

    const now = Date.now()
    const windowMs = this.resumeSeconds * 1000

    // Entries are inserted in time order, so expired ones come first.
    for (const [trimmedChannel, trimTime] of this.lastTrimTimes) {
      if (trimTime + windowMs >= now) {
        break
      }

      this.lastTrimTimes.delete(trimmedChannel)
    }

    const args = [stringifyJSON(data)]

    if (!this.lastTrimTimes.has(channel)) {
      this.lastTrimTimes.set(channel, now)

      args.push(
        this.xTrimExactness,
        `${now - windowMs}-0`,
        // 2x so entries added late in a window outlive it until the next trim refreshes the TTL.
        String(this.resumeSeconds * 2),
      )
    }

    await this.evalScript(PUBLISH_SCRIPT, [channel], args)
  }

  protected async subscribeListener<K extends keyof T & string>(
    event: K,
    listener: (payload: T[K]) => void,
    { lastEventId, onError }: PublisherSubscribeListenerOptions = {},
  ): Promise<() => Promise<void>> {
    const channel = `${this.prefix}${event}`

    let pendingPayloads: T[K][] | undefined = []
    const resumedIds = new Set<string>()

    const deduplicatingListener = (payload: T[K]) => {
      if (pendingPayloads) {
        pendingPayloads.push(payload)
        return
      }

      const id = getEventMeta(payload)?.id
      if (id === undefined || !resumedIds.has(id)) {
        listener(payload)
      }
    }

    const messageListener = (message: unknown) => {
      try {
        const { id, data } = parseIfText(message) as { id?: string, data: SerializedEvent }
        deduplicatingListener(this.deserializePayload(id, data) as T[K])
      }
      catch (error) {
        onError?.(error as ThrowableError)
      }
    }

    // Subscribe first so no event can slip between the stream read and live delivery.
    const unsubscribe = await this.subscribeChannel(channel, messageListener, onError)

    try {
      if (this.resumeEnabled && lastEventId !== undefined) {
        for (const { id, data } of await this.readStreamEntries(channel, lastEventId)) {
          resumedIds.add(id)
          listener(this.deserializePayload(id, parseIfText(data) as SerializedEvent) as T[K])
        }
      }

      const pending = pendingPayloads
      pendingPayloads = undefined
      pending.forEach(deduplicatingListener)
    }
    catch (error) {
      await unsubscribe()
      throw error
    }

    return once(unsubscribe)
  }

  private serializePayload(payload: object): SerializedEvent {
    const [original, meta] = unwrapEvent(payload)
    const { json, meta: jsonMeta } = this.serializer.serialize(original)
    return { payload: { json, meta: jsonMeta }, meta }
  }

  private deserializePayload(id: string | undefined, { payload, meta }: SerializedEvent): object {
    return withEventMeta(
      this.serializer.deserialize(payload) as object,
      id === undefined ? { ...meta } : { ...meta, id },
    )
  }
}

function parseIfText(value: unknown): unknown {
  return typeof value === 'string' ? parseEmptyableJSON(value) : value
}
