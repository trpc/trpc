/* eslint-disable @typescript-eslint/no-non-null-assertion */
export function createDeferred<TValue = void>() {
  let resolve: (value: TValue) => void;
  let reject: (error: unknown) => void;
  const promise = new Promise<TValue>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve: resolve!, reject: reject! };
}
export type Deferred<TValue> = ReturnType<typeof createDeferred<TValue>>;
