export type AnyFunction = (...args: any[]) => any

const AsyncGeneratorFunction = Object.getPrototypeOf(async function* () {}).constructor

/**
 * Checks whether a value is an async generator function (`async function*`).
 */
export function isAsyncGeneratorFunction(value: unknown): value is (...args: any[]) => AsyncGenerator {
  return value instanceof AsyncGeneratorFunction
}

export function once<T>(fn: () => T): () => T {
  let cached: { result: T } | undefined

  return (): T => {
    if (cached) {
      return cached.result
    }

    const result = fn()
    cached = { result }

    return result
  }
}

/**
 * Executes the callback function after the current call stack has been cleared,
 * waiting at least `delay` ms when `setTimeout` is available.
 */
export function defer(callback: () => void, delay = 0): void {
  if (typeof setTimeout === 'function') {
    setTimeout(callback, delay)
  }
  else {
    Promise.resolve()
      .then(() => Promise.resolve()
        .then(() => Promise.resolve()
          .then(callback)))
  }
}

export function tryOrUndefined<T>(fn: () => T): undefined | T {
  try {
    return fn()
  }
  catch {
    return undefined
  }
}
