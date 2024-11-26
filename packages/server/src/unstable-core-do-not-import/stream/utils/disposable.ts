/* eslint-disable no-restricted-syntax */
// @ts-expect-error - polyfilling symbol
Symbol.dispose ??= Symbol('Symbol.dispose');

// @ts-expect-error - polyfilling symbol
Symbol.asyncDispose ??= Symbol('Symbol.asyncDispose');

/**
 * Takes a value and a dispose function and returns a new object that implements the Disposable interface.
 * The returned object is the original value augmented with a Symbol.dispose method.
 * @param thing The value to make disposable
 * @param dispose Function to call when disposing the resource
 * @returns The original value with Symbol.dispose method added
 */
export function makeResource<T>(thing: T, dispose: () => void): T & Disposable {
  const it = thing as T & Disposable;

  if (it[Symbol.dispose]) {
    throw new Error('Symbol.dispose already exists');
  }

  it[Symbol.dispose] = dispose;

  return it;
}

/**
 * Takes a value and an async dispose function and returns a new object that implements the AsyncDisposable interface.
 * The returned object is the original value augmented with a Symbol.asyncDispose method.
 * @param thing The value to make async disposable
 * @param dispose Async function to call when disposing the resource
 * @returns The original value with Symbol.asyncDispose method added
 */
export function makeAsyncResource<T>(
  thing: T,
  dispose: () => Promise<void>,
): T & AsyncDisposable {
  const it = thing as T & AsyncDisposable;

  if (it[Symbol.asyncDispose]) {
    throw new Error('Symbol.asyncDispose already exists');
  }

  it[Symbol.asyncDispose] = dispose;

  return it;
}
