import type { Promisable } from 'type-fest'
import type { StartSpanOptions } from './tracing'
import type { ThrowableError } from './types'
import { AsyncIteratorClass } from '@standard-server/shared'
import { once } from './function'
import { isPlainObject } from './object'
import { promiseWithResolvers } from './promise'
import { recordSpanError, runInSpanContext, startSpan } from './tracing'

export function replicateReadableStream<T>(
  stream: ReadableStream<T>,
  count: number,
): ReadableStream<T>[] {
  if (count <= 0) {
    return []
  }

  const replicated: ReadableStream<T>[] = []
  let pending = stream

  for (let index = 0; index < count - 1; index++) {
    const [replica, remainder] = pending.tee()
    replicated.push(replica)
    pending = remainder
  }

  replicated.push(pending)

  return replicated
}

export type ReadableStreamReadResult<T> = { done: false, value: T } | { done: true, value?: undefined | T }

export interface WrapReadableStreamOptions<T, TMapped> {
  /**
   * Any call to the original stream reader will be executed inside this function.
   * Useful when you want execution to happen within a specific context,
   * such as AsyncLocalStorage.
   */
  runWith?: <T>(run: () => Promise<T>) => Promisable<T>
  mapResult?: (result: ReadableStreamReadResult<T>) => Promisable<ReadableStreamReadResult<TMapped>>
  mapError?: (error: ThrowableError) => Promisable<ThrowableError>
  onError?: (error: ThrowableError) => Promisable<void>

  /**
   * Guaranteed to execute exactly once after the stream finishes or is cancelled.
   */
  onFinish?: () => Promisable<void>
}

export function wrapReadableStream<T, TMapped = T>(
  stream: ReadableStream<T>,
  { runWith, mapResult, mapError, onError, onFinish }: WrapReadableStreamOptions<T, TMapped>,
): NoInfer<ReadableStream<TMapped>> {
  runWith ??= run => run()

  const reader = once(() => stream.getReader())
  const finish = once(async () => onFinish?.())

  // TODO:
  return new ReadableStream<TMapped>({
    async pull(controller) {
      let result: ReadableStreamReadResult<TMapped>

      try {
        const readResult = await runWith(() => reader().read())
        result = mapResult ? await mapResult(readResult) : readResult as ReadableStreamReadResult<TMapped>
      }
      catch (error) {
        try {
          await onError?.(error as ThrowableError)
          controller.error(mapError ? await mapError(error as ThrowableError) : error)
        }
        finally {
          await finish()
        }

        return
      }

      if (result.done) {
        controller.close()
        await finish()
      }
      else {
        controller.enqueue(result.value)
      }
    },
    async cancel(reason) {
      try {
        try {
          await runWith(() => reader().cancel(reason))
        }
        catch (error) {
          await onError?.(error as ThrowableError)
          throw error
        }
      }
      finally {
        await finish()
      }
    },
  })
}

export function traceReadableStream<T>(
  options: StartSpanOptions | string,
  stream: ReadableStream<T>,
): ReadableStream<T> {
  const getSpan = once(() => startSpan(options))
  return wrapReadableStream(stream, {
    runWith: run => runInSpanContext(getSpan(), run),
    mapResult(result) {
      getSpan()?.addEvent(result.done ? 'closed' : 'enqueued')
      return result
    },
    onError(error) {
      recordSpanError(getSpan(), error)
    },
    onFinish() {
      getSpan()?.end()
    },
  })
}

/**
 * Converts a {@link ReadableStream} into an {@link AsyncIteratorClass}.
 *
 * @see {@link https://orpc.dev/docs/integrations/ai-sdk | AI SDK Integration}
 */
export function streamToAsyncIteratorObject<T>(
  stream: ReadableStream<T>,
  { signal }: { signal?: undefined | AbortSignal } = {},
): AsyncIteratorClass<T> {
  const reader = stream.getReader()
  let cancelledBySignal = false

  return new AsyncIteratorClass<T>(
    async () => {
      if (signal?.aborted) {
        cancelledBySignal = true
        throw signal.reason
      }

      if (!signal) {
        return reader.read() as Promise<IteratorResult<T>>
      }

      const { promise, reject } = promiseWithResolvers<never>()
      const onAbort = () => reject(signal.reason)
      signal.addEventListener('abort', onAbort, { once: true })

      try {
        return await Promise.race([
          reader.read() as Promise<IteratorResult<T>>,
          promise.catch(async (reason) => {
            cancelledBySignal = true
            throw reason
          }),
        ])
      }
      finally {
        signal.removeEventListener('abort', onAbort)
      }
    },
    async ({ kind, error }) => {
      if (kind === 'cancelled' || (kind === 'error' && cancelledBySignal)) {
        await reader.cancel(error)
      }
    },
  )
}

/**
 * Converts an `AsyncIterator` into a `ReadableStream`.
 */
export function asyncIteratorToStream<T>(
  iterator: AsyncIterator<T>,
): ReadableStream<T> {
  return new ReadableStream<T>({
    async pull(controller) {
      const { done, value } = await iterator.next()

      if (done) {
        controller.close()
      }
      else {
        controller.enqueue(value)
      }
    },
    async cancel() {
      await iterator.return?.()
    },
  })
}

/**
 * Converts an `AsyncIterator` into a `ReadableStream`, ensuring that
 * all emitted object values are *unproxied* before enqueuing.
 *
 * @see {@link https://orpc.dev/docs/integrations/ai-sdk | AI SDK Integration}
 */
export function asyncIteratorToUnproxiedDataStream<T>(
  iterator: AsyncIterator<T>,
): ReadableStream<T> {
  return new ReadableStream<T>({
    async pull(controller) {
      const { done, value } = await iterator.next()

      if (done) {
        controller.close()
      }
      else {
        const unproxied = isPlainObject(value)
          ? { ...value }
          : Array.isArray(value)
            ? value.map(i => i) as T // use .map instead of ... to deal with sparse arrays
            : value

        controller.enqueue(unproxied)
      }
    },
    async cancel() {
      await iterator.return?.()
    },
  })
}
