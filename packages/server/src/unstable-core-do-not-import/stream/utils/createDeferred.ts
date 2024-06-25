/* eslint-disable @typescript-eslint/no-non-null-assertion */
export function createDeferred<TValue>() {
  let resolve: (value: TValue) => void;
  let reject: (error: unknown) => void;
  const promise = new Promise<TValue>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve: resolve!, reject: reject! };
}
export type Deferred<TValue> = ReturnType<typeof createDeferred<TValue>>;

export const createTimeoutPromise = <TValue>(
  timeoutMs: number,
  value: TValue,
) => {
  let deferred = createDeferred<TValue>();
  deferred = deferred as typeof deferred & { clear: () => void };

  let timeout: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };
  const resolve = () => {
    deferred.resolve(value);
    clear();
  };
  if (timeoutMs !== Infinity) {
    timeout = setTimeout(resolve, timeoutMs);
    timeout.unref?.();
  }

  return {
    promise: deferred.promise,
    /**
     * Clear the timeout without resolving the promise
     */
    clear,
    /**
     * Resolve the promise with the value
     */
    resolve,
  };
};
