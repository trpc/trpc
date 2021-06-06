import { getAbortController, getFetch } from '../helpers';

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
  cancel: CancelFn;
};
type BatchLoadFn<TKey, TValue> = (keys: TKey[]) => CancellablePromise<TValue[]>;

export function dataLoader<TKey, TValue>(fetchMany: BatchLoadFn<TKey, TValue>) {
  let batch: Batch<TKey, TValue> | null = null;
  let dispatchTimer: NodeJS.Timer | number | null = null;

  const destroyTimer = () => {
    if (dispatchTimer) {
      clearTimeout(dispatchTimer as any);
    }
    dispatchTimer = null;
  };
  function dispatch() {
    destroyTimer();
    if (!batch) {
      return;
    }
    const batchCopy = batch;
    batch = null;
    const promise = fetchMany(batchCopy.items.map((v) => v.key));
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
        cancel() {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          batch!.cancelled = true;
          batch = null;
          destroyTimer();
        },
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
      thisBatch.cancel?.();
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
