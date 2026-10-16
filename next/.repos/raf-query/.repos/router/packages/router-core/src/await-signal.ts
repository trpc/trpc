function observeLate<T>(
  callback: ((value: T) => unknown) | undefined,
  value: T,
) {
  if (!callback) {
    return
  }

  try {
    const result = callback(value)
    if (result !== undefined) {
      void Promise.resolve(result).catch(() => {})
    }
  } catch {}
}

/**
 * Await `value` unless `signal` aborts first. A result that settles after the
 * abort is passed to `onLate` / `onLateError` instead.
 *
 * One abort listener per wait: SSR requests nest at most a few waits on one
 * signal, so pooling them was measurably slower than this.
 */
export function waitForReason<T>(
  value: T | PromiseLike<T>,
  signal: AbortSignal,
  onLate?: (value: T) => unknown,
  onLateError?: (reason: unknown) => unknown,
): Promise<T> {
  const promise = Promise.resolve(value)
  if (signal.aborted) {
    void promise.then(
      (result) => observeLate(onLate, result),
      (error) => observeLate(onLateError, error),
    )
    return Promise.reject(signal.reason)
  }

  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    void promise.then(
      (result) => {
        signal.removeEventListener('abort', abort)
        if (signal.aborted) {
          observeLate(onLate, result)
        } else {
          resolve(result)
        }
      },
      (error) => {
        signal.removeEventListener('abort', abort)
        if (signal.aborted) {
          observeLate(onLateError, error)
        } else {
          reject(error)
        }
      },
    )
  })
}
