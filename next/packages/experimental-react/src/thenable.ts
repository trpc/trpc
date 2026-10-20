/**
 * Promises that carry their own result in the fields React's `use()` reads
 * before suspending (`status`, `value`, `reason`), as raf-query's and
 * TanStack Query's do. A settled one renders without a fallback.
 */

/**
 * A promise that says whether it has settled, and with what.
 * @since 0.1.0
 * @stability experimental
 */
export type Thenable<T> = Promise<T> &
  (
    | { readonly status: 'pending' }
    | { readonly status: 'fulfilled'; readonly value: T }
    | { readonly status: 'rejected'; readonly reason: unknown }
  );

const noop = () => {};

export const fulfilled = <T>(value: T): Thenable<T> =>
  Object.assign(Promise.resolve(value), {
    status: 'fulfilled' as const,
    value,
  });

export const rejected = (reason: unknown): Thenable<never> => {
  const deferred = pending<never>();
  deferred.reject(reason);
  return deferred.promise;
};

export interface Pending<T> {
  readonly promise: Thenable<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

export function pending<T>(): Pending<T> {
  let deferred!: {
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
  };
  const promise = Object.assign(
    new Promise<T>((resolve, reject) => {
      deferred = { resolve, reject };
    }),
    { status: 'pending' as const },
  );
  // A rejection nobody reads (a loader's query that no component read) must
  // not crash the process.
  promise.catch(noop);
  return {
    promise,
    resolve(value) {
      void Object.assign(promise, { status: 'fulfilled', value });
      deferred.resolve(value);
    },
    reject(reason) {
      void Object.assign(promise, { status: 'rejected', reason });
      deferred.reject(reason);
    },
  };
}
