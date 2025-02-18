// @ts-expect-error - polyfilling symbol
// eslint-disable-next-line no-restricted-syntax
Symbol.dispose ??= Symbol();

// @ts-expect-error - polyfilling symbol
// eslint-disable-next-line no-restricted-syntax
Symbol.asyncDispose ??= Symbol();

/**
 * Takes a value and a dispose function and returns a new object that implements the Disposable interface.
 * The returned object is the original value augmented with a Symbol.dispose method.
 * @param thing The value to make disposable
 * @param dispose Function to call when disposing the resource
 * @returns The original value with Symbol.dispose method added
 */
export function makeResource<T>(thing: T, dispose: () => void): T & Disposable {
  const it = thing as T & Disposable;

  // eslint-disable-next-line no-restricted-syntax
  if (it[Symbol.dispose]) {
    throw new Error('Symbol.dispose already exists');
  }

  // eslint-disable-next-line no-restricted-syntax
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

  // eslint-disable-next-line no-restricted-syntax
  if (it[Symbol.asyncDispose]) {
    throw new Error('Symbol.asyncDispose already exists');
  }

  // eslint-disable-next-line no-restricted-syntax
  it[Symbol.asyncDispose] = dispose;

  return it;
}
