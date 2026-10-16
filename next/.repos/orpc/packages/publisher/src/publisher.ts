import type { ThrowableError } from '@orpc/shared'
import { AsyncIteratorClass, throwIfAborted } from '@orpc/shared'

export interface PublisherOptions {
  /**
   * Maximum number of events to buffer for AsyncIteratorObject subscribers.
   *
   * If the buffer exceeds this limit, the oldest event is dropped.
   * This prevents unbounded memory growth if consumers process events slowly.
   *
   * Set to:
   * - `0`: Disable buffering. Events must be consumed before the next one arrives.
   * - `1`: Only keep the latest event. Useful for real-time updates where only the most recent value matters.
   * - `Infinity`: Keep all events. Ensures no data loss, but may lead to high memory usage.
   *
   * @default 100
   */
  maxBufferedEvents?: number
}

export interface PublisherSubscribeListenerOptions {
  /**
   * Resume from a specific event ID
   */
  lastEventId?: string | undefined

  /**
   * Triggered when an error occur
   */
  onError?: (error: ThrowableError) => void
}

export interface PublisherSubscribeIteratorOptions
  extends Pick<PublisherSubscribeListenerOptions, 'lastEventId'>, Pick<PublisherOptions, 'maxBufferedEvents'> {
  /**
   * Abort signal, automatically unsubscribes on abort
   */
  signal?: AbortSignal | undefined | null
}

export abstract class Publisher<T extends Record<string, object>> {
  private readonly maxBufferedEvents: Exclude<PublisherOptions['maxBufferedEvents'], undefined>

  constructor(
    options: PublisherOptions = {},
  ) {
    this.maxBufferedEvents = options.maxBufferedEvents ?? 100
  }

  /**
   * Publish an event to subscribers
   */
  abstract publish<K extends keyof T & string>(event: K, payload: T[K]): Promise<void>

  /**
   * Subscribes to a specific event using a callback function.
   * Returns an unsubscribe function to remove the listener.
   *
   * @remarks
   * This method should be protected to avoid conflicts with `subscribe` method
   */
  protected abstract subscribeListener<K extends keyof T & string>(
    event: K,
    listener: (payload: T[K]) => void,
    options?: PublisherSubscribeListenerOptions
  ): Promise<() => Promise<void>>

  /**
   * Subscribes to a specific event using a callback function.
   * Returns an unsubscribe function to remove the listener.
   *
   * @example
   * ```ts
   * const unsubscribe = publisher.subscribe('event', (payload) => {
   *   console.log(payload)
   * }, {
   *   lastEventId,
   *   onError: (error) => {
   *     // handle error (consider unsubscribe if error can't be recovered)
   *   }
   * })
   *
   * // Later
   * unsubscribe()
   * ```
   */
  subscribe<K extends keyof T & string>(event: K, listener: (payload: T[K]) => void, options?: PublisherSubscribeListenerOptions): Promise<() => Promise<void>>
  /**
   * Subscribes to a specific event using an AsyncIteratorObject.
   * Useful for `for await...of` loops with optional buffering and abort support.
   *
   * @example
   * ```ts
   * for await (const payload of publisher.subscribe('event', { signal, lastEventId })) {
   *   console.log(payload)
   * }
   * ```
   */
  subscribe<K extends keyof T & string>(event: K, options?: PublisherSubscribeIteratorOptions): AsyncIteratorClass<T[K], void, void>
  subscribe<K extends keyof T & string>(
    event: K,
    listenerOrOptions?: ((payload: T[K]) => void) | PublisherSubscribeIteratorOptions,
    listenerOptions?: PublisherSubscribeListenerOptions,
  ): Promise<() => Promise<void>> | AsyncIteratorClass<T[K], void, void> {
    if (typeof listenerOrOptions === 'function') {
      return this.subscribeListener(event, listenerOrOptions, listenerOptions)
    }

    const signal = listenerOrOptions?.signal
    const maxBufferedEvents = listenerOrOptions?.maxBufferedEvents ?? this.maxBufferedEvents

    throwIfAborted(signal)

    const bufferedEvents = new Queue<T[K]>()
    const pullResolvers: { resolve: (result: IteratorResult<T[K]>) => void, reject: (error: Error) => void }[] = []

    const unsubscribePromise = this
      .subscribeListener(event, (payload) => {
        if (signal?.aborted) {
          return
        }

        const resolver = pullResolvers.shift()

        if (resolver) {
          resolver.resolve({ done: false, value: payload })
        }
        else {
          bufferedEvents.push(payload)

          if (bufferedEvents.length > maxBufferedEvents) {
            bufferedEvents.shift()
          }
        }
      }, {
        lastEventId: listenerOrOptions?.lastEventId,
        onError: error => terminate({ kind: 'error', error }),
      })
      .catch(error => terminate({ kind: 'error', error }))

    const abortListener = () => terminate({ kind: 'error', error: signal!.reason })
    signal?.addEventListener('abort', abortListener)

    let terminalState: { kind: 'error', error: ThrowableError } | { kind: 'cancelled' } | undefined
    async function terminate(state: Exclude<typeof terminalState, undefined>) {
      if (terminalState) {
        return
      }

      terminalState = state
      signal?.removeEventListener('abort', abortListener)

      if (state.kind === 'error') {
        pullResolvers.forEach(resolver => resolver.reject(state.error))
      }
      else {
        pullResolvers.forEach(resolver => resolver.resolve({ done: true, value: undefined }))
      }

      if (signal?.aborted) {
        pullResolvers.length = 0
        bufferedEvents.clear()
      }

      // Keep this async call at the end to avoid race conditions.
      await unsubscribePromise.then(unsubscribe => unsubscribe?.())
    }

    return new AsyncIteratorClass(
      async () => {
        /* v8 ignore next 3 - AsyncIteratorClass already covers this, but we keep this check for safety. */
        if (terminalState?.kind === 'cancelled') {
          return { done: true, value: undefined }
        }

        const value = bufferedEvents.shift()

        if (value !== undefined) {
          return { done: false, value }
        }

        if (terminalState?.kind === 'error') {
          throw terminalState.error
        }

        return new Promise((resolve, reject) => {
          pullResolvers.push({ resolve, reject })
        })
      },
      () => terminate({ kind: 'cancelled' }),
    )
  }
}

/**
 * FIFO queue with O(1) `shift`, since `Array.prototype.shift` copies large arrays on every call.
 */
class Queue<T extends object> {
  private readonly items: (T | undefined)[] = []
  private head = 0

  get length(): number {
    return this.items.length - this.head
  }

  push(item: T): void {
    this.items.push(item)
  }

  shift(): T | undefined {
    if (this.head === this.items.length) {
      return undefined
    }

    const item = this.items[this.head]
    this.items[this.head++] = undefined

    if (this.head >= 32 && this.head * 2 >= this.items.length) {
      this.items.splice(0, this.head)
      this.head = 0
    }

    return item
  }

  clear(): void {
    this.items.length = 0
    this.head = 0
  }
}
