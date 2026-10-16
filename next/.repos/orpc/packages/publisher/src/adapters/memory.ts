import type { PublisherOptions, PublisherSubscribeListenerOptions } from '../publisher'
import { compareSequentialIds, once, SequentialIdGenerator } from '@orpc/shared'
import { getEventMeta, unwrapEvent, withEventMeta } from '@standard-server/core'
import { Publisher } from '../publisher'

export interface MemoryPublisherOptions extends PublisherOptions {
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

interface StoredEvent<T> {
  expiresAt: number
  payload: T
}

/**
 * Publisher adapter backed by in-memory storage, with optional resume support.
 * Events are delivered to subscribers within the same process only.
 *
 * @see {@link https://orpc.dev/docs/helpers/publisher#adapters | Publisher Helpers - Adapters}
 */
export class MemoryPublisher<T extends Record<string, object>> extends Publisher<T> {
  private readonly listenersMap: Map<keyof T, ((payload: any) => void)[]> = new Map()
  private readonly idGenerator = new SequentialIdGenerator()
  private readonly eventsMap: Map<keyof T, Array<StoredEvent<T[keyof T]>>> = new Map()
  private readonly resumeEnabled: boolean
  private readonly resumeSeconds: number

  constructor({ resume, ...options }: MemoryPublisherOptions = {}) {
    super(options)
    this.resumeEnabled = resume?.enabled ?? false
    this.resumeSeconds = resume?.seconds ?? 300
  }

  async publish<K extends keyof T & string>(event: K, payload: T[K]): Promise<void> {
    this.cleanup()

    if (this.resumeEnabled) {
      const expiresAt = Date.now() + this.resumeSeconds * 1000

      let bucket = this.eventsMap.get(event)
      if (!bucket) {
        this.eventsMap.set(event, bucket = [])
      }

      const [original, meta] = unwrapEvent(payload)

      // Attach a monotonically increasing ID for resume support.
      payload = withEventMeta(original, { ...meta, id: this.idGenerator.generate() })
      bucket.push({ expiresAt, payload })
    }

    this.listenersMap.get(event)?.forEach(listener => listener(payload))
  }

  protected async subscribeListener<K extends keyof T & string>(
    event: K,
    listener: (payload: T[K]) => void,
    options?: PublisherSubscribeListenerOptions,
  ): Promise<() => Promise<void>> {
    this.cleanup()

    if (this.resumeEnabled && options?.lastEventId !== undefined) {
      const bucket = this.eventsMap.get(event)
      if (bucket?.length) {
        const startIdx = findResumeStartIndex(bucket, options.lastEventId)
        for (let i = startIdx; i < bucket.length; i++) {
          listener(bucket[i]!.payload as T[K])
        }
      }
    }

    let listeners = this.listenersMap.get(event)
    if (!listeners) {
      this.listenersMap.set(event, listeners = [])
    }

    listeners.push(listener)

    // Ensure the returned cleanup function is safe to call multiple times.
    return once(async () => {
      const current = this.listenersMap.get(event)!
      const index = current.indexOf(listener)
      const remaining = current.filter((_, i) => i !== index)

      if (remaining.length === 0) {
        this.listenersMap.delete(event)
      }
      else {
        this.listenersMap.set(event, remaining)
      }
    })
  }

  private lastCleanupTime: number = 0
  private cleanup(): void {
    if (!this.resumeEnabled) {
      return
    }

    const now = Date.now()

    // Throttle: only run cleanup at most once per retention window.
    if (now - this.lastCleanupTime < this.resumeSeconds * 1000) {
      return
    }

    this.lastCleanupTime = now

    for (const [key, bucket] of this.eventsMap) {
      bucket.splice(0, findFirstUnexpiredIndex(bucket, now))

      if (bucket.length === 0) {
        this.eventsMap.delete(key)
      }
    }
  }
}

function findResumeStartIndex<T>(
  bucket: Array<StoredEvent<T>>,
  lastEventId: string,
): number {
  let lo = 0
  let hi = bucket.length

  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    const id = getEventMeta(bucket[mid]!.payload)?.id

    if (id !== undefined && compareSequentialIds(id, lastEventId) > 0) {
      hi = mid
    }
    else {
      lo = mid + 1
    }
  }

  return lo
}

function findFirstUnexpiredIndex<T>(
  bucket: Array<StoredEvent<T>>,
  now: number,
): number {
  let lo = 0
  let hi = bucket.length

  while (lo < hi) {
    const mid = (lo + hi) >>> 1

    if (bucket[mid]!.expiresAt <= now) {
      lo = mid + 1
    }
    else {
      hi = mid
    }
  }

  return lo
}
