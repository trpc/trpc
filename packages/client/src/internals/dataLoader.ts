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

    const itemBatches: BatchItem<TKey, TValue>[][] = [[]];

    for (const item of thisBatch.items) {
      const lastItemBatch = itemBatches[itemBatches.length - 1];
      const isValid = batchLoader.validate(
        lastItemBatch.concat(item).map((_item) => _item.key),
      );
      if (isValid) {
        lastItemBatch.push(item);
      } else {
        itemBatches.push([item]);
        if (lastItemBatch.length === 0) {
          itemBatches.push([]);
        }
      }
    }

    const promises: Promise<void>[] = [];
    const cancels: CancelFn[] = [];

    for (const itemBatch of itemBatches) {
      if (itemBatch.length > 0) {
        const { promise, cancel } = batchLoader.fetch(
          itemBatch.map((_item) => _item.key),
        );
        const thenPromise = promise.then((result) => {
          for (let i = 0; i < result.length; i++) {
            const value = result[i];
            itemBatch[i].resolve(value);
          }
        });
        promises.push(thenPromise);
        cancels.push(cancel);
      }
    }

    const promise = Promise.all(promises);
    const cancel = () => cancels.forEach((_cancel) => _cancel());

    thisBatch.cancel = cancel;

    promise.catch((cause) => {
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
    const thisBatch = batch;
    const promise = new Promise<TValue>((resolve, reject) => {
      const item = batchItem as any as BatchItem<TKey, TValue>;
      item.reject = reject;
      item.resolve = resolve;

      thisBatch.items.push(item);
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
