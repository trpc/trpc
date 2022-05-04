import { CancelFn, PromiseAndCancel } from '../links/types';

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
type BatchLoader<TKey, TValue> = {
  validate: (keys: TKey[]) => boolean;
  fetch: (keys: TKey[]) => {
    promise: Promise<TValue[]>;
    cancel: CancelFn;
  };
};

/**
 * Dataloader that's very inspired by https://github.com/graphql/dataloader
 * Less configuration, no caching, and allows you to cancel requests
 * When cancelling a single fetch the whole batch will be cancelled only when _all_ items are cancelled
 */
export function dataLoader<TKey, TValue>(
  batchLoader: BatchLoader<TKey, TValue>,
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
    const thisBatch = batch!;
    destroyTimerAndBatch();
    const { promise, cancel } = batchLoader.fetch(
      thisBatch.items.map((v) => v.key),
    );
    thisBatch.cancel = cancel;

    promise
      .then((result) => {
        for (let i = 0; i < result.length; i++) {
          const value = result[i];
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          thisBatch.items[i]!.resolve(value!);
        }
      })
      .catch((cause) => {
        for (const item of thisBatch.items) {
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
    let thisBatch = batch;
    const promise = new Promise<TValue>((resolve, reject) => {
      const item = batchItem as any as BatchItem<TKey, TValue>;
      item.reject = reject;
      item.resolve = resolve;

      const isNextBatchItemsValid = batchLoader.validate(
        thisBatch.items.concat(item).map((item) => item.key),
      );

      // check if the batch will be valid before adding to it
      if (isNextBatchItemsValid) {
        thisBatch.items.push(item);
        return;
      }

      // if batch is empty dispatch immediately with item
      if (thisBatch.items.length === 0) {
        thisBatch.items.push(item);
        dispatch();
        return;
      }

      // dispatch the existing batch
      dispatch();

      // create a new batch with item
      batch = {
        items: [],
        cancel() {
          destroyTimerAndBatch();
        },
      };
      thisBatch = batch;
      thisBatch.items.push(item);

      const isThisBatchValid = batchLoader.validate(
        thisBatch.items.map((item) => item.key),
      );

      // if current batch is invalid dispatch immediately
      if (!isThisBatchValid) {
        dispatch();
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
