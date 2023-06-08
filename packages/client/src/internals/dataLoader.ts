/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { CancelFn, GeneratorAndCancel, PromiseAndCancel } from '../links/types';

type BatchItem<TKey, TValue> = {
  aborted: boolean;
  key: TKey;
  markBatchComplete: () => void;
  next: ((value: TValue) => void) | null;
  reject: ((error: Error) => void) | null;
  batch: Batch<TKey, TValue> | null;
};
type Batch<TKey, TValue> = {
  items: BatchItem<TKey, TValue>[];
  cancel: CancelFn;
};
type BatchLoader<TKey, TValue> = {
  validate: (keys: TKey[]) => boolean;
  fetch: (
    keys: TKey[],
    unitResolver: (index: number, value: NonNullable<TValue>) => void,
    batchComplete: () => void,
  ) => {
    promise: Promise<TValue[]>;
    cancel: CancelFn;
  };
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
        cancel: throwFatalError,
      };
      for (const item of items) {
        item.batch = batch;
      }
      const unitResolver = (index: number, value: NonNullable<TValue>) => {
        const item = batch.items[index]!;

        const prevNext = item.next;

        prevNext?.(value);
      };
      const { promise, cancel } = batchLoader.fetch(
        batch.items.map((_item) => _item.key),
        unitResolver,
        () => { batch.items.map((item) => item.markBatchComplete()) }
      );
      batch.cancel = cancel;

      promise
        .then((result) => {
          for (let i = 0; i < result.length; i++) {
            const value = result[i]!;
            unitResolver(i, value);
          }
          for (let i = 0; i < batch.items.length; i++) {
            const item = batch.items[i]!;
            item.reject?.(new Error(`Missing result at ${i}`));
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

  type PromiseChainNode<TType> = { value: TType, next: Promise<PromiseChainNode<TType>> } | { done: true };
  type RecursiveNextFunction<TType> = (value: TType) => { next: RecursiveNextFunction<TType>, done: () => void, reject: (err: unknown) => void };

  function startPromiseChain<TType>(): { next: RecursiveNextFunction<TType>, done: () => void, reject: (err: unknown) => void, promise: Promise<PromiseChainNode<TType>> } {
    let resolver: ((value: PromiseChainNode<TType> | PromiseLike<PromiseChainNode<TType>>) => void) | undefined
    let rejecter: ((err: unknown) => void) | undefined
    const promise = new Promise<PromiseChainNode<TType>>((resolve, rejecter) => {
      resolver = resolve;
      rejecter = rejecter;
    })

    let done = { current: false };
    let doneResolver = () => {
      done.current = true;
    }

    return {
      promise: promise,
      next: (value: TType) => continuePromiseChain(value, done, resolver!),
      reject: rejecter!,
      done: doneResolver,
    }
  }

  function continuePromiseChain<TType>(
    value: TType,
    done: { current: boolean },
    prevResolver: (value: PromiseChainNode<TType> | PromiseLike<PromiseChainNode<TType>>) => void
  ) {
    let newResolver: ((value: PromiseChainNode<TType> | PromiseLike<PromiseChainNode<TType>>) => void) | undefined
    let newRejecter: ((err: unknown) => void) | undefined
    const promise: Promise<PromiseChainNode<TType>> = done.current ? Promise.resolve({ done: true }) : new Promise<PromiseChainNode<TType>>((resolve, reject) => {
      newResolver = resolve;
      newRejecter = reject
    })

    prevResolver({
      value,
      next: promise,
    });

    return {
      promise: promise,
      next: (innerValue: TType) => continuePromiseChain(innerValue, done, newResolver!),
      reject: (err: unknown) => newRejecter!(err),
      done: () => newResolver!({ done: true })
    }
  }

  async function* promiseChainToGenerator<TValue>(promise: Promise<PromiseChainNode<TValue>>) {
    let node = await promise;
    while (true) {
      if ("done" in node) {
        break;
      }
      yield node.value;
      node = await node.next;
    }
  }

  function loadGenerator(key: TKey): GeneratorAndCancel<TValue> {
    const item: BatchItem<TKey, TValue> = {
      aborted: false,
      key,
      batch: null,
      markBatchComplete: throwFatalError,
      next: throwFatalError,
      reject: throwFatalError,
    };

    const chain = startPromiseChain<TValue>();

    function updateItem({ next, reject, done }: ReturnType<typeof chain.next>) {
      item.next = (value) => { updateItem(next(value)); }
      item.reject = reject;
      item.markBatchComplete = () => {
        item.next = null;
        item.reject = null;
        item.batch = null;
        done();
      }
    }

    updateItem(chain);

    if (!pendingItems) {
      pendingItems = [];
    }
    pendingItems.push(item);

    const generator = promiseChainToGenerator(chain.promise);

    if (!dispatchTimer) {
      dispatchTimer = setTimeout(dispatch);
    }
    const cancel = () => {
      item.aborted = true;

      if (item.batch?.items.every((item) => item.aborted)) {
        // All items in the batch have been cancelled
        item.batch.cancel();
        item.batch = null;
      }
    };

    return { generator, cancel };
  }

  function load(key: TKey): PromiseAndCancel<TValue> {
    const item: BatchItem<TKey, TValue> = {
      aborted: false,
      key,
      batch: null,
      markBatchComplete: () => { },
      next: throwFatalError,
      reject: throwFatalError,
    };

    const promise = new Promise<TValue>((resolve, reject) => {
      item.reject = reject;
      item.next = (val: TValue) => {
        resolve(val);
        item.batch = null;
        item.reject = null;
        item.next = null;
      };

      if (!pendingItems) {
        pendingItems = [];
      }
      pendingItems.push(item);
    });

    if (!dispatchTimer) {
      dispatchTimer = setTimeout(dispatch);
    }
    const cancel = () => {
      item.aborted = true;

      if (item.batch?.items.every((item) => item.aborted)) {
        // All items in the batch have been cancelled
        item.batch.cancel();
        item.batch = null;
      }
    };

    return { promise, cancel };
  }

  return {
    load,
    loadGenerator,
  };
}
