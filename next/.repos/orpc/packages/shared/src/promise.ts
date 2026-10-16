/**
 * Creates a promise together with its associated `resolve` and `reject`
 * functions.
 *
 * Equivalent to `Promise.withResolvers()`, but works in environments
 * where that API is not yet available.
 */
export function promiseWithResolvers<T>(): {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (reason: unknown) => void
} {
  const result: {
    promise?: Promise<T>
    resolve?: (v: T) => void
    reject?: (reason: unknown) => void
  } = {}

  result.promise = new Promise((resolve, reject) => {
    result.resolve = resolve
    result.reject = reject
  })

  return result as Required<typeof result>
}

/**
 * Captures the current async context (such as AsyncLocalStorage) through a promise reaction, so no runtime API is needed.
 * The returned function runs a callback inside it once; later calls reject.
 */
export function captureAsyncContext(): <T>(callback: () => Promise<T>) => Promise<T> {
  const { promise, resolve } = promiseWithResolvers<() => Promise<unknown>>()
  const result = promise.then(callback => callback())
  let called = false

  return (callback) => {
    if (called) {
      return Promise.reject(new Error('A captured async context can be run only once.'))
    }

    called = true
    resolve(callback)
    return result as Promise<any>
  }
}
