export function makeResource<T>(thing: T, dispose: () => void): T & Disposable {
  const it = thing as T & Disposable;

  it[Symbol.dispose] = dispose;

  return it;
}

export function makeAsyncResource<T>(
  thing: T,
  dispose: () => Promise<void>,
): T & AsyncDisposable {
  const it = thing as T & AsyncDisposable;

  it[Symbol.asyncDispose] = dispose;

  return it;
}
