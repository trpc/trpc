// @ts-expect-error - polyfilling symbol
// oxlint-disable-next-line trpc/no-symbol-dispose
Symbol.dispose ??= Symbol();

// @ts-expect-error - polyfilling symbol
// oxlint-disable-next-line trpc/no-symbol-dispose
Symbol.asyncDispose ??= Symbol();

/**
 * Takes a value and a dispose function and returns a new object that implements the Disposable interface.
 * The returned object is the original value augmented with a Symbol.dispose method.
 * @param thing The value to make disposable
 * @param dispose Function to call when disposing the resource
 * @returns The original value with Symbol.dispose method added
 */
export function makeResource<T>(thing: T, dispose: () => void): T & Disposable {
  const it = thing as T & Partial<Disposable>;

  // oxlint-disable-next-line trpc/no-symbol-dispose
  const existing = it[Symbol.dispose];

  // oxlint-disable-next-line trpc/no-symbol-dispose
  it[Symbol.dispose] = () => {
    dispose();
    existing?.call(it);
  };

  return it as T & Disposable;
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
  const it = thing as T & Partial<AsyncDisposable>;

  // oxlint-disable-next-line trpc/no-symbol-dispose
  const existing = it[Symbol.asyncDispose];

  // oxlint-disable-next-line trpc/no-symbol-dispose
  it[Symbol.asyncDispose] = async () => {
    await dispose();
    await existing?.call(it);
  };

  return it as T & AsyncDisposable;
}
