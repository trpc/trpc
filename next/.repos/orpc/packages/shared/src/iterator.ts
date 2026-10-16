import type { Promisable } from 'type-fest'
import type { StartSpanOptions } from './tracing'
import type { PromiseWithError, ThrowableError } from './types'
import { AsyncIteratorClass } from '@standard-server/shared'
import { once } from './function'
import { AsyncIdQueue } from './queue'
import { recordSpanError, runInSpanContext, startSpan } from './tracing'

export interface WrapAsyncIteratorOptions<TYield, TReturn, TMappedYield, TMappedReturn> {
  /**
   * Any call to the original iterator will be executed inside this function.
   * Useful when you want execution to happen within a specific context,
   * such as AsyncLocalStorage.
   */
  runWith?: <T>(run: () => Promise<T>) => Promisable<T>
  mapResult?: (result: IteratorResult<TYield, TReturn>) => Promisable<IteratorResult<TMappedYield, TMappedReturn>>
  mapError?: (error: ThrowableError) => Promisable<ThrowableError>
  onError?: (error: ThrowableError) => Promisable<void>

  /**
   * Execute after the stream finishes or is cancelled.
   */
  onFinish?: () => Promisable<void>
}

export function wrapAsyncIterator<TYield, TReturn, TMappedYield = TYield, TMappedReturn = TReturn>(
  iterator: AsyncIterator<TYield, TReturn>,
  { runWith, mapResult, mapError, onError, onFinish }: WrapAsyncIteratorOptions<TYield, TReturn, TMappedYield, TMappedReturn>,
): NoInfer<AsyncIteratorClass<TMappedYield, TMappedReturn>> {
  runWith ??= run => run()

  let isDone: boolean | undefined

  return new AsyncIteratorClass<TMappedYield, TMappedReturn>(async () => {
    try {
      let result
      try {
        result = await runWith(() => iterator.next())
        isDone = result.done
      }
      catch (error) {
        isDone = true
        throw error
      }

      return mapResult ? await mapResult(result) : result as any
    }
    catch (error) {
      await onError?.(error as ThrowableError)
      throw mapError ? await mapError(error as ThrowableError) : error
    }
  }, async (_state) => {
    try {
      // Only cancel the original iterator if it has not finished yet.
      // Do not rely on _state because the user's options may throw errors.
      if (!isDone) {
        try {
          await runWith(async () => iterator.return?.())
        }
        catch (error) {
          await onError?.(error as ThrowableError)
          throw error
        }
      }
    }
    finally {
      await onFinish?.()
    }
  })
}

export function traceAsyncIterator<T, TReturn, TNext>(
  options: StartSpanOptions | string,
  iterator: AsyncIterator<T, TReturn, TNext>,
): AsyncIteratorClass<T, TReturn, TNext> {
  const getSpan = once(() => startSpan(options))

  return wrapAsyncIterator(iterator, {
    runWith: run => runInSpanContext(getSpan(), run),
    mapResult(result) {
      getSpan()?.addEvent(result.done ? 'completed' : 'yielded')
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

export function replicateAsyncIterator<T, TReturn, TNext>(
  source: AsyncIterator<T, TReturn, TNext>,
  count: number,
): (AsyncIteratorClass<T, TReturn, TNext>)[] {
  const queue = new AsyncIdQueue<
    { next: IteratorResult<T, TReturn> } | { next?: never, error: unknown }
  >()

  const ids = Array.from({ length: count }, (_, i) => i.toString())
  let isSourceFinished = false

  const start = once(async () => {
    try {
      while (true) {
        const item = await source.next()

        ids.forEach((id) => {
          if (queue.isOpen(id)) {
            queue.push(id, { next: item })
          }
        })

        if (item.done) {
          break
        }
      }
    }
    catch (error) {
      ids.forEach((id) => {
        if (queue.isOpen(id)) {
          queue.push(id, { error })
        }
      })
    }
    finally {
      isSourceFinished = true
    }
  })

  const replicated: AsyncIteratorClass<T, TReturn, TNext>[] = ids.map((id) => {
    queue.open(id)

    return new AsyncIteratorClass(
      async () => {
        start()

        const item = await queue.pull(id)

        if (item.next) {
          return item.next
        }

        throw item.error
      },
      async ({ kind, error }) => {
        queue.close({ id, reason: error })

        if (kind === 'cancelled' && !queue.size && !isSourceFinished) {
          isSourceFinished = true
          await source?.return?.()
        }
      },
    )
  })

  return replicated
}

export interface ConsumeAsyncIteratorOptions<T, TReturn, TError> {
  /**
   * Called on each event
   */
  onEvent: (event: T) => void
  /**
   * Called once error happens
   */
  onError?: (error: TError) => void
  /**
   * Called once AsyncIteratorObject is done
   *
   * @remarks
   * **Note**: If iterator is canceled, `undefined` can be passed on success
   */
  onSuccess?: (value: TReturn | undefined) => void
  /**
   * Called once after onError or onSuccess
   *
   * @remarks
   * **Note**: If iterator is canceled, `undefined` can be passed on success
   */
  onFinish?: (state: [error: TError, data: undefined, isSuccess: false] | [error: null, data: TReturn | undefined, isSuccess: true]) => void
}

/**
 * Consumes an AsyncIteratorObject with lifecycle callbacks.
 *
 * @remarks
 * **Warning**: If no `onError` or `onFinish` is provided, errors are thrown into the unhandled rejection channel.
 *
 * @returns An unsubscribe callback that stops consuming and cleans up the iterator.
 * @see {@link https://orpc.dev/docs/client/async-iterator-object#using-consumeasynciterator | AsyncIteratorObject in Client - Using consumeAsyncIterator}
 */
export function consumeAsyncIterator<T, TReturn, TError = ThrowableError>(
  iterator: AsyncIterator<T, TReturn> | PromiseWithError<AsyncIterator<T, TReturn>, TError>,
  options: ConsumeAsyncIteratorOptions<T, TReturn, TError | ThrowableError>,
): () => Promise<void> {
  // The typed error should always be combined with `ThrowableError`
  // because an AsyncIterator can throw any error during iteration,
  // while TError only represents errors from the initial promise.
  // In oRPC client/server usage, initial and iteration errors are usually the same,
  // but this utility is shared, so it needs to support the general case.

  void (async () => {
    let onFinishState: [error: TError | ThrowableError, data: undefined, isSuccess: false] | [error: null, data: TReturn | undefined, isSuccess: true]

    try {
      const resolvedIterator = await iterator

      while (true) {
        const { done, value } = await resolvedIterator.next()

        if (done) {
          // if iterator is canceled, value can be undefined
          const realValue = value as typeof value | undefined
          onFinishState = [null, realValue, true]
          options.onSuccess?.(realValue)
          break
        }

        try {
          options.onEvent(value)
        }
        catch (error) {
          // Close the source before reporting the onEvent error
          await resolvedIterator.return?.()
          throw error
        }
      }
    }
    catch (error) {
      onFinishState = [error as ThrowableError, undefined, false]
      options.onError?.(error as ThrowableError)
    }
    finally {
      options.onFinish?.(onFinishState!)
    }
  })()

  return async () => {
    await (await iterator)?.return?.()
  }
}
