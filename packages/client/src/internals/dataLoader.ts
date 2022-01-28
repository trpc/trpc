import { CancelFn, PromiseAndCancel } from '../links/core';

type BatchItem<TKey, TValue> = {
  cancelled: boolean;
  key: TKey;
  resolve: (value: TValue) => void;
  reject: (error: Error) => void;
};
type Batch<TKey, TValue> = {
  items: BatchItem<TKey, TValue>[];
  cancel: CancelFn;
};
type BatchLoadFn<TKey, TValue> = (keys: TKey[]) => {
  promise: Promise<TValue[]>;
  cancel: CancelFn;
};

/**
 * Dataloader that's very inspired by https://github.com/graphql/dataloader
 * Less configuration, no caching, and allows you to cancel requests
 * When cancelling a single fetch the whole batch will be cancelled only when _all_ items are cancelled
 */
export function dataLoader<TKey, TValue>(
  fetchMany: BatchLoadFn<TKey, TValue>,
  opts?: { maxBatchSize?: number },
) {
  let batch: Batch<TKey, TValue> | null = null;
  let dispatchTimer: NodeJS.Timer | number | null = null;

  const destroyTimerAndBatch = () => {
    clearTimeout(dispatchTimer as any);
    dispatchTimer = null;
    batch = null;
  };
  function dispatch() {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const batchCopy = batch!;
    destroyTimerAndBatch();
    const { promise, cancel } = fetchMany(batchCopy.items.map((v) => v.key));
    batchCopy.cancel = cancel;

    promise
      .then((result) => {
        for (let i = 0; i < result.length; i++) {
          const value = result[i];
          batchCopy.items[i].resolve(value);
        }
      })
      .catch((cause) => {
        for (const item of batchCopy.items) {
          item.reject(cause);
        }
      });
  }
  function load(key: TKey): PromiseAndCancel<TValue> {
    const batchItem = {
      cancelled: false,
      key,
    };

    if (!batch) {
      batch = {
        items: [],
        cancel() {
          destroyTimerAndBatch();
        },
      };
    }
    const thisBatch = batch;
    const promise = new Promise<TValue>((resolve, reject) => {
      const item = batchItem as any as BatchItem<TKey, TValue>;
      item.reject = reject;
      item.resolve = resolve;
      thisBatch.items.push(item);

      if (
        typeof opts?.maxBatchSize !== 'undefined' &&
        thisBatch.items.length >= opts.maxBatchSize
      ) {
        dispatch();
        return;
      }
    });

    if (!dispatchTimer) {
      dispatchTimer = setTimeout(dispatch);
    }
    const cancel = () => {
      batchItem.cancelled = true;

      if (thisBatch.items.some((item) => !item.cancelled)) {
        // there are still things that can be resolved
        return;
      }
      thisBatch.cancel();
    };

    return { promise, cancel };
  }

  return {
    load,
  };
}
