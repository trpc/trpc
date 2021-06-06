import { getAbortController, getFetch } from '../helpers';
import { AppLink } from './core';
import { HttpLinkOptions } from './httpLink';

type CancelFn = () => void;
export type CancellablePromise<T = unknown> = Promise<T> & {
  cancel: CancelFn;
};
type BatchItem<TKey, TValue> = {
  cancelled: boolean;
  key: TKey;
  resolve: (value: TValue) => void;
  reject: (error: Error) => void;
};
type Batch<TKey, TValue> = {
  items: BatchItem<TKey, TValue>[];
  cancelled: boolean;
  cancel?: CancelFn;
};
type BatchLoadFn<TKey, TValue> = (keys: TKey[]) => CancellablePromise<TValue[]>;

export function dataLoader<TKey, TValue>(opts: {
  fetchMany: BatchLoadFn<TKey, TValue>;
}) {
  let batch: Batch<TKey, TValue> | null = null;
  let dispatchTimer: NodeJS.Timer | number | null = null;
  function dispatch() {
    if (!batch) {
      return;
    }
    const batchCopy = batch;
    batch = null;
    const promise = opts.fetchMany(batchCopy.items.map((v) => v.key));
    batchCopy.cancel = promise.cancel;
    promise
      .then((result) => {
        for (let i = 0; i < result.length; i++) {
          const value = result[i];
          batchCopy.items[i].resolve(value);
        }
      })
      .catch((error) => {
        for (const item of batchCopy.items) {
          item.reject(error);
        }
      });
  }
  function load(key: TKey): CancellablePromise<TValue> {
    const batchItem = {
      cancelled: false,
      key,
    };

    if (!batch) {
      batch = {
        cancelled: false,
        items: [],
      };
    }
    const thisBatch = batch;
    const promise = new Promise<TValue>((resolve, reject) => {
      const item = batchItem as any as BatchItem<TKey, TValue>;
      item.reject = reject;
      item.resolve = resolve;
      thisBatch.items.push(item);
    }) as CancellablePromise<TValue>;
    if (!dispatchTimer) {
      dispatchTimer = setTimeout(dispatch);
    }
    promise.cancel = () => {
      batchItem.cancelled = true;
      if (thisBatch.cancelled) {
        return;
      }
      if (!thisBatch.items.some((item) => item.cancelled)) {
        // there are still things that can be resolved
        return;
      }
      thisBatch.cancelled = true;
    };

    return promise;
  }

  return {
    load,
  };
}
export function httpBatchLink(opts: HttpLinkOptions): AppLink {
  const _fetch = getFetch(opts?.fetch);
  const AC = getAbortController(opts?.AbortController);
  const { url } = opts;
  // initialized config
  return () => {
    // initialized in app

    return ({ op, prev, onDestroy: onDone }) => {};
  };
}
