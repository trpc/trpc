/* eslint-disable @typescript-eslint/no-non-null-assertion */

type BatchItem<TKey, TValue> = {
  aborted: boolean;
  key: TKey;
  resolve: ((value: TValue) => void) | null;
  reject: ((error: Error) => void) | null;
  batch: Batch<TKey, TValue> | null;
};
type Batch<TKey, TValue> = {
  items: BatchItem<TKey, TValue>[];
};
export type BatchLoader<TKey, TValue> = {
  validate: (keys: TKey[]) => boolean;
  fetch: (keys: TKey[]) => Promise<TValue[] | Promise<TValue>[]>;
};

/**
 * A function that should never be called unless we messed something up.
 */
const throwFatalError = () => {
  throw new Error(
    'Something went wrong. Please submit an issue at https://github.com/trpc/trpc/issues/new',
  );
};

/**
 * Dataloader that's very inspired by https://github.com/graphql/dataloader
 * Less configuration, no caching, and allows you to cancel requests
 * When cancelling a single fetch the whole batch will be cancelled only when _all_ items are cancelled
 */
export function dataLoader<TKey, TValue>(
  batchLoader: BatchLoader<TKey, TValue>,
) {
  let pendingItems: BatchItem<TKey, TValue>[] | null = null;
  let dispatchTimer: ReturnType<typeof setTimeout> | null = null;

  const destroyTimerAndPendingItems = () => {
    clearTimeout(dispatchTimer as any);
    dispatchTimer = null;
    pendingItems = null;
  };

  /**
   * Iterate through the items and split them into groups based on the `batchLoader`'s validate function
   */
  function groupItems(items: BatchItem<TKey, TValue>[]) {
    const groupedItems: BatchItem<TKey, TValue>[][] = [[]];
    let index = 0;
    while (true) {
      const item = items[index];
      if (!item) {
        // we're done
        break;
      }
      const lastGroup = groupedItems[groupedItems.length - 1]!;

      if (item.aborted) {
        // Item was aborted before it was dispatched
        item.reject?.(new Error('Aborted'));
        index++;
        continue;
      }

      const isValid = batchLoader.validate(
        lastGroup.concat(item).map((it) => it.key),
      );

      if (isValid) {
        lastGroup.push(item);
        index++;
        continue;
      }

      if (lastGroup.length === 0) {
        item.reject?.(new Error('Input is too big for a single dispatch'));
        index++;
        continue;
      }
      // Create new group, next iteration will try to add the item to that
      groupedItems.push([]);
    }
    return groupedItems;
  }

  function dispatch() {
    const groupedItems = groupItems(pendingItems!);
    destroyTimerAndPendingItems();

    // Create batches for each group of items
    for (const items of groupedItems) {
      if (!items.length) {
        continue;
      }
      const batch: Batch<TKey, TValue> = {
        items,
      };
      for (const item of items) {
        item.batch = batch;
      }
      const promise = batchLoader.fetch(batch.items.map((_item) => _item.key));

      promise
        .then(async (result) => {
          await Promise.all(
            result.map(async (valueOrPromise, index) => {
              const item = batch.items[index]!;
              try {
                const value = await Promise.resolve(valueOrPromise);

                item.resolve?.(value);
              } catch (cause) {
                item.reject?.(cause as Error);
              }

              item.batch = null;
              item.reject = null;
              item.resolve = null;
            }),
          );

          for (const item of batch.items) {
            item.reject?.(new Error('Missing result'));
            item.batch = null;
          }
        })
        .catch((cause) => {
          for (const item of batch.items) {
            item.reject?.(cause);
            item.batch = null;
          }
        });
    }
  }
  function load(key: TKey): Promise<TValue> {
    const item: BatchItem<TKey, TValue> = {
      aborted: false,
      key,
      batch: null,
      resolve: throwFatalError,
      reject: throwFatalError,
    };

    const promise = new Promise<TValue>((resolve, reject) => {
      item.reject = reject;
      item.resolve = resolve;

      pendingItems ??= [];
      pendingItems.push(item);
    });

    dispatchTimer ??= setTimeout(dispatch);

    return promise;
  }

  return {
    load,
  };
}
