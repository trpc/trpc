import type { Promisable } from 'type-fest'
import type { PromiseWithError, ThrowableError } from './types'
import { isAsyncIteratorObject } from '@standard-server/shared'
import { wrapAsyncIterator } from './iterator'
import { override } from './proxy'
import { wrapReadableStream } from './stream'

export type InterceptableOptions = Record<string, any>

export type InterceptorOptions<
  TOptions extends InterceptableOptions,
  TResult,
> = Omit<TOptions, 'next'> & {
  next(options?: TOptions): TResult
}

export type Interceptor<
  TOptions extends InterceptableOptions,
  TResult,
> = (options: InterceptorOptions<TOptions, TResult>) => TResult

/**
 * Can used for interceptors or middlewares
 */
export function onStart<T, TOptions extends { next: () => any }, TRest extends any[]>(
  callback: NoInfer<(options: TOptions, ...rest: TRest) => Promisable<void>>,
): (options: TOptions, ...rest: TRest) => T | Promise<Awaited<ReturnType<TOptions['next']>>> {
  return async (options, ...rest) => {
    await callback(options, ...rest)
    return await options.next()
  }
}

/**
 * Can used for interceptors or middlewares
 */
export function onSuccess<T, TOptions extends { next: () => any }, TRest extends any[]>(
  callback: NoInfer<(result: Awaited<ReturnType<TOptions['next']>>, options: TOptions, ...rest: TRest) => Promisable<void>>,
): (options: TOptions, ...rest: TRest) => T | Promise<Awaited<ReturnType<TOptions['next']>>> {
  return async (options, ...rest) => {
    const result = await options.next()
    await callback(result, options, ...rest)
    return result
  }
}

/**
 * Creates an interceptor or middleware that invokes a callback whenever an error
 * is thrown. The error is rethrown after the callback completes.
 *
 * @see {@link https://orpc.dev/docs/adapters/fetch-api | Fetch API Adapter}
 */
export function onError<T, TOptions extends { next: () => any }, TRest extends any[]>(
  callback: NoInfer<(
    error: ReturnType<TOptions['next']> extends PromiseWithError<any, infer E> ? E : ThrowableError,
    options: TOptions,
    ...rest: TRest
  ) => Promisable<void>>,
): (options: TOptions, ...rest: TRest) => T | Promise<Awaited<ReturnType<TOptions['next']>>> {
  return async (options, ...rest) => {
    try {
      return await options.next()
    }
    catch (error) {
      await callback(error as any, options, ...rest)
      throw error
    }
  }
}

export type OnFinishState<TResult, TError>
  = | [error: TError, data: undefined, isSuccess: false]
    | [error: null, data: TResult, isSuccess: true]

/**
 * Can used for interceptors or middlewares
 */
export function onFinish<T, TOptions extends { next: () => any }, TRest extends any[]>(
  callback: NoInfer<(
    state: OnFinishState<
      Awaited<ReturnType<TOptions['next']>>,
      ReturnType<TOptions['next']> extends PromiseWithError<any, infer E> ? E : ThrowableError
    >,
    options: TOptions,
    ...rest: TRest
  ) => Promisable<void>>,
): (options: TOptions, ...rest: TRest) => T | Promise<Awaited<ReturnType<TOptions['next']>>> {
  return async (options, ...rest) => {
    let state: any

    try {
      const result = await options.next()
      state = [null, result, true]
      return result
    }
    catch (error) {
      state = [error, undefined, false]
      throw error
    }
    finally {
      await callback(state, options, ...rest)
    }
  }
}

/**
 * Creates a middleware or interceptor that invokes a callback when the returned async
 * iterator object throws an error while being consumed.
 *
 * This does not replace the `onError`. `onError` only fires on the
 * initial call (before the interceptor returns the iterator), whereas this
 * callback only fires while consuming the iterator. Use both together to
 * catch all possible errors.
 */
export function onAsyncIteratorObjectError<
  T,
  TOptions extends { next: () => any },
  TRest extends any[],
>(
  callback: NoInfer<(
    error: ThrowableError | (ReturnType<TOptions['next']> extends PromiseWithError<any, infer E> ? E : ThrowableError),
    options: TOptions,
    ...rest: TRest
  ) => Promisable<void>>,
): (options: TOptions, ...rest: TRest) => T | Promise<Awaited<ReturnType<TOptions['next']>>> {
  // The typed error should always be combined with `ThrowableError`
  // because an AsyncIterator can throw any error during iteration,
  // while TError only represents errors from the initial promise.
  // In oRPC client/server usage, initial and iteration errors are usually the same,
  // but this utility is shared, so it needs to support the general case.

  return async (options, ...rest) => {
    const output = await options.next()

    if (!isAsyncIteratorObject(output)) {
      return output
    }

    /**
     * @warning
     * Remember use `override` for AsyncIteratorObject to remain other special properties
     */
    return override(output, wrapAsyncIterator(output, {
      onError: error => callback(error, options, ...rest),
    }))
  }
}

/**
 * Creates an interceptor that invokes a callback when the returned readable
 * stream errors while being consumed.
 *
 * This does not replace the `onError`. `onError` only fires on the
 * initial call (before the interceptor returns the stream), whereas this
 * callback only fires while consuming the stream. Use both together to catch
 * all possible errors.
 */
export function onReadableStreamError<
  T,
  TOptions extends { next: () => any },
  TRest extends any[],
>(
  callback: NoInfer<(
    error: ThrowableError | (ReturnType<TOptions['next']> extends PromiseWithError<any, infer E> ? E : ThrowableError),
    options: TOptions,
    ...rest: TRest
  ) => Promisable<void>>,
): (options: TOptions, ...rest: TRest) => T | Promise<Awaited<ReturnType<TOptions['next']>>> {
  // The typed error should always be combined with `ThrowableError`
  // because a ReadableStream can throw any error during iteration,
  // while TError only represents errors from the initial promise.
  // In oRPC client/server usage, initial and iteration errors are usually the same,
  // but this utility is shared, so it needs to support the general case.

  return async (options, ...rest) => {
    const output = await options.next()

    if (!(output instanceof ReadableStream)) {
      return output
    }

    /**
     * @warning
     * Remember use `override` for ReadableStream to remain other special properties
     */
    return override(output, wrapReadableStream(output, {
      onError: error => callback(error, options, ...rest),
    }))
  }
}

export function intercept<TOptions extends InterceptableOptions, TResult>(
  interceptors: undefined | Interceptor<TOptions, TResult>[],
  options: NoInfer<TOptions>,
  main: NoInfer<(options: TOptions) => TResult>,
): TResult {
  if (!interceptors?.length) {
    return main(options)
  }

  const next = (options: TOptions, index: number): TResult => {
    const interceptor = interceptors[index]

    if (!interceptor) {
      return main(options)
    }

    return interceptor({
      ...options,
      next: (newOptions: TOptions = options) => next(newOptions, index + 1),
    })
  }

  return next(options, 0)
}
