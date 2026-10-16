import type { PublisherSubscribeListenerOptions } from './publisher'
import { promiseWithResolvers, sleep } from '@orpc/shared'
import { Publisher } from './publisher'

// Concrete implementation for testing
class TestPublisher<T extends Record<string, object>> extends Publisher<T> {
  optionsMap = new Map<keyof T, (PublisherSubscribeListenerOptions | undefined)[]>()
  listenersMap = new Map<keyof T, Set<(payload: any) => void>>()

  async publish<K extends keyof T>(event: K, payload: T[K]): Promise<void> {
    const eventListeners = this.listenersMap.get(event)
    if (eventListeners) {
      eventListeners.forEach(listener => listener(payload))
    }
  }

  async subscribeListener<K extends keyof T>(
    event: K,
    listener: (payload: T[K]) => void,
    options?: PublisherSubscribeListenerOptions,
  ): Promise<() => Promise<void>> {
    if (!this.optionsMap.has(event)) {
      this.optionsMap.set(event, [])
    }
    this.optionsMap.get(event)!.push(options)

    if (!this.listenersMap.has(event)) {
      this.listenersMap.set(event, new Set())
    }
    this.listenersMap.get(event)!.add(listener)

    return async () => {
      this.listenersMap.get(event)?.delete(listener)
    }
  }
}

type TestEvents = {
  message: { text: string }
  count: { value: number }
  user: { id: string, name: string }
}

describe('publisher', () => {
  let publisher: TestPublisher<TestEvents>
  let subscribeListenerSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    publisher = new TestPublisher<TestEvents>()
    subscribeListenerSpy = vi.spyOn(publisher, 'subscribeListener')
  })

  afterEach(() => {
    let size = 0
    for (const listeners of publisher.listenersMap.values()) {
      size += listeners.size
    }

    expect(size).toBe(0) // ensure all listeners are unsubscribed correctly
  })

  it('passes resume metadata and error hooks to direct listeners', async () => {
    const listener = vi.fn()
    const lastEventId = '__last__'
    const onError = vi.fn()

    const unsubscribe = await publisher.subscribe('message', listener, { lastEventId, onError })
    expect(subscribeListenerSpy).toHaveBeenCalledTimes(1)
    expect(subscribeListenerSpy).toHaveBeenNthCalledWith(1, 'message', listener, { lastEventId, onError })

    const iterator = publisher.subscribe('message', { lastEventId })
    expect(subscribeListenerSpy).toHaveBeenCalledTimes(2)
    expect(subscribeListenerSpy).toHaveBeenNthCalledWith(2, 'message', expect.any(Function), { lastEventId, onError: expect.any(Function) })

    await unsubscribe()
    await iterator.return()
  })

  describe('asyncIteratorObject subscriptions', () => {
    it('streams messages in the order they are published', async () => {
      const events: string[] = []
      const iterator = publisher.subscribe('message')

      setTimeout(() => {
        publisher.publish('message', { text: 'first' })
        publisher.publish('message', { text: 'second' })
        publisher.publish('message', { text: 'third' })
        setTimeout(() => iterator.return(), 50)
      }, 10)

      for await (const payload of iterator) {
        events.push(payload.text)
      }

      expect(events).toEqual(['first', 'second', 'third'])
    })

    it('broadcasts the same live message to multiple subscribers', async () => {
      const iterator1 = publisher.subscribe('message')
      const iterator2 = publisher.subscribe('message')

      await publisher.publish('message', { text: 'concurrent' })

      const [result1, result2] = await Promise.all([
        iterator1.next(),
        iterator2.next(),
      ])

      expect(result1.value?.text).toBe('concurrent')
      expect(result2.value?.text).toBe('concurrent')

      await iterator1.return()
      await iterator2.return()
    })

    it('keeps up with a burst of sequential counter updates', async () => {
      const iterator = publisher.subscribe('count')
      const received: number[] = []

      const publishPromise = (async () => {
        for (let i = 0; i < 100; i++) {
          await publisher.publish('count', { value: i })
        }
      })()

      for (let i = 0; i < 100; i++) {
        const result = await iterator.next()
        if (!result.done) {
          received.push(result.value.value)
        }
      }

      await publishPromise
      await iterator.return()

      expect(received).toHaveLength(100)
    })

    it('keeps order while a large buffer is drained and refilled', async () => {
      const iterator = publisher.subscribe('count', { maxBufferedEvents: Infinity })

      for (let i = 0; i < 100; i++) {
        await publisher.publish('count', { value: i })
      }

      for (let i = 0; i < 50; i++) {
        expect((await iterator.next()).value?.value).toBe(i)
      }

      for (let i = 100; i < 200; i++) {
        await publisher.publish('count', { value: i })
      }

      for (let i = 50; i < 200; i++) {
        expect((await iterator.next()).value?.value).toBe(i)
      }

      await iterator.return()
    })

    describe('when a subscriber falls behind', () => {
      it('delivers queued messages once the subscriber catches up', async () => {
        const iterator = publisher.subscribe('message', { maxBufferedEvents: 3 })

        await publisher.publish('message', { text: 'first' })
        await publisher.publish('message', { text: 'second' })
        await publisher.publish('message', { text: 'third' })

        const result1 = await iterator.next()
        const result2 = await iterator.next()
        const result3 = await iterator.next()

        expect(result1.value?.text).toBe('first')
        expect(result2.value?.text).toBe('second')
        expect(result3.value?.text).toBe('third')

        await iterator.return()
      })

      it('keeps the newest queued messages when the backlog limit is exceeded', async () => {
        const iterator = publisher.subscribe('message', { maxBufferedEvents: 2 })

        await publisher.publish('message', { text: 'first' })
        await publisher.publish('message', { text: 'second' })
        await publisher.publish('message', { text: 'third' })
        await publisher.publish('message', { text: 'fourth' })

        const result1 = await iterator.next()
        const result2 = await iterator.next()

        expect(result1.value?.text).toBe('third')
        expect(result2.value?.text).toBe('fourth')

        await iterator.return()
      })

      it('waits for a live message when backlog storage is disabled', async () => {
        const iterator = publisher.subscribe('message', { maxBufferedEvents: 0 })

        await publisher.publish('message', { text: 'dropped' })

        const nextPromise = iterator.next()
        await new Promise(resolve => setTimeout(resolve, 1))

        await publisher.publish('message', { text: 'received' })

        const result = await nextPromise
        expect(result.value?.text).toBe('received')

        await iterator.return()
      })

      it('keeps only the freshest queued message when capacity is one', async () => {
        const iterator = publisher.subscribe('message', { maxBufferedEvents: 1 })

        await publisher.publish('message', { text: 'first' })
        await publisher.publish('message', { text: 'second' })

        const result = await iterator.next()
        expect(result.value?.text).toBe('second')

        await iterator.return()
      })

      it('uses the publisher default backlog when a subscriber does not override it', async () => {
        const pub = new TestPublisher<TestEvents>({ maxBufferedEvents: 1 })
        const iterator = pub.subscribe('message')

        await pub.publish('message', { text: 'first' })
        await pub.publish('message', { text: 'second' })

        const result = await iterator.next()
        expect(result.value?.text).toBe('second')

        await iterator.return()
      })

      it('lets a subscriber keep a larger backlog than the publisher default', async () => {
        const pub = new TestPublisher<TestEvents>({ maxBufferedEvents: 1 })
        const iterator = pub.subscribe('message', { maxBufferedEvents: 3 })

        await pub.publish('message', { text: 'first' })
        await pub.publish('message', { text: 'second' })

        const result1 = await iterator.next()
        const result2 = await iterator.next()

        expect(result1.value?.text).toBe('first')
        expect(result2.value?.text).toBe('second')

        await iterator.return()
      })
    })

    describe('when subscriptions end', () => {
      it('rejects a pending read if the subscriber aborts mid-stream', async () => {
        const controller = new AbortController()
        const iterator = publisher.subscribe('message', { signal: controller.signal })

        const nextPromise = iterator.next()
        controller.abort(new Error('Aborted'))

        await expect(nextPromise).rejects.toThrow('Aborted')
      })

      it('drops buffered messages when the subscriber aborts before reading them', async () => {
        const controller = new AbortController()
        const iterator = publisher.subscribe('message', {
          signal: controller.signal,
          maxBufferedEvents: 2,
        })

        await publisher.publish('message', { text: 'first' })
        await publisher.publish('message', { text: 'second' })
        controller.abort(new Error('Aborted'))
        await publisher.publish('message', { text: 'third' })

        await expect(iterator.next()).rejects.toThrow('Aborted')
        await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
      })

      it('fails fast when a subscriber is already aborted', () => {
        const controller = new AbortController()
        controller.abort(new Error('Already aborted'))

        expect(() => {
          publisher.subscribe('message', { signal: controller.signal })
        }).toThrow('Already aborted')

        expect(subscribeListenerSpy).toHaveBeenCalledTimes(0)
      })

      it('unsubscribes after an abort so later messages are ignored', async () => {
        const controller = new AbortController()
        const iterator = publisher.subscribe('message', { signal: controller.signal })

        const nextPromise = iterator.next()
        controller.abort()
        await expect(nextPromise).rejects.toThrow('This operation was aborted')

        await publisher.publish('message', { text: 'after abort' })

        const result = await iterator.next()
        expect(result.done).toBe(true)
      })

      it('closes cleanly when the subscriber leaves the stream', async () => {
        const iterator = publisher.subscribe('message')

        await publisher.publish('message', { text: 'first' })
        await iterator.next()

        const returnResult = await iterator.return()
        expect(returnResult.done).toBe(true)

        const result = await iterator.next()
        expect(result.done).toBe(true)
      })
    })

    describe('when the event source reports an error', () => {
      it('surfaces an error that arrives before the subscriber starts reading', async () => {
        const iterator = publisher.subscribe('message')
        publisher.optionsMap.get('message')?.[0]?.onError?.(new Error('Test error'))
        await expect(iterator.next()).rejects.toThrow('Test error')
      })

      it('surfaces an error while the subscriber is waiting for the next message', async () => {
        const iterator = publisher.subscribe('message', { signal: AbortSignal.timeout(100) })
        const promise = expect(iterator.next()).rejects.toThrow('Test error')
        await sleep(0)

        publisher.optionsMap.get('message')?.[0]?.onError?.(new Error('Test error'))
        await promise
      })

      it('drains buffered messages before surfacing a terminal error', async () => {
        const iterator = publisher.subscribe('message', { maxBufferedEvents: 3 })

        await publisher.publish('message', { text: 'first' })
        await publisher.publish('message', { text: 'second' })
        publisher.optionsMap.get('message')?.[0]?.onError?.(new Error('Test error'))
        await publisher.publish('message', { text: 'third' })

        await expect(iterator.next()).resolves.toMatchObject({ done: false, value: { text: 'first' } })
        await expect(iterator.next()).resolves.toMatchObject({ done: false, value: { text: 'second' } })
        await expect(iterator.next()).resolves.toMatchObject({ done: false, value: { text: 'third' } })
        await expect(iterator.next()).rejects.toThrow('Test error')
      })
    })

    describe('when the backing listener fails during setup', () => {
      it('fails the first read if subscription setup breaks immediately', async () => {
        const { promise, reject } = promiseWithResolvers<any>()
        subscribeListenerSpy.mockReturnValueOnce(promise)
        const iterator = publisher.subscribe('message')
        reject(new Error('__TEST__'))
        await expect(iterator.next()).rejects.toThrow('__TEST__')
      })

      it('fails a pending read if subscription setup breaks after the stream starts', async () => {
        const { promise, reject } = promiseWithResolvers<any>()
        subscribeListenerSpy.mockReturnValueOnce(promise)
        const iterator = publisher.subscribe('message')
        const nextPromise = expect(iterator.next()).rejects.toThrow('__TEST__')
        await sleep(0)

        reject(new Error('__TEST__'))
        await nextPromise
      })

      it('drains buffered messages before surfacing a setup failure', async () => {
        const { promise, reject } = promiseWithResolvers<() => Promise<void>>()
        let listener: ((payload: TestEvents['message']) => void) | undefined

        subscribeListenerSpy.mockImplementationOnce(async (_event: any, innerListener: any) => {
          listener = innerListener
          return promise
        })

        const iterator = publisher.subscribe('message', { maxBufferedEvents: 10 })

        listener?.({ text: 'first' })
        listener?.({ text: 'second' })
        reject(new Error('__TEST__'))
        listener?.({ text: 'third' })
        await sleep(0)

        await expect(iterator.next()).resolves.toMatchObject({ done: false, value: { text: 'first' } })
        await expect(iterator.next()).resolves.toMatchObject({ done: false, value: { text: 'second' } })
        await expect(iterator.next()).resolves.toMatchObject({ done: false, value: { text: 'third' } })
        await expect(iterator.next()).rejects.toThrow('__TEST__')
      })
    })
  })
})
