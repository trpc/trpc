import { HTTPResponseEnvelope } from '@trpc/server';
import { ProcedureType } from '@trpc/server';
import { HttpLinkOptions, PromiseAndCancel, TRPCLink } from './core';
import { httpRequest } from '../internals/httpRequest';

type CancelFn = () => void;
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
type BatchLoadFn<TKey, TValue> = (keys: TKey[]) => {
  promise: Promise<TValue[]>;
  cancel: CancelFn;
};

export function dataLoader<TKey, TValue>(fetchMany: BatchLoadFn<TKey, TValue>) {
  let batch: Batch<TKey, TValue> | null = null;
  let dispatchTimer: NodeJS.Timer | number | null = null;

  const destroyTimerAndBatch = () => {
    if (dispatchTimer) {
      clearTimeout(dispatchTimer as any);
    }
    dispatchTimer = null;
    batch = null;
  };
  function dispatch() {
    const batchCopy = batch;
    destroyTimerAndBatch();
    if (!batchCopy) {
      return;
    }
    const { promise, cancel } = fetchMany(batchCopy.items.map((v) => v.key));
    batchCopy.cancel = cancel;

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
  function load(key: TKey): PromiseAndCancel<TValue> {
    const batchItem = {
      cancelled: false,
      key,
    };

    if (!batch) {
      batch = {
        cancelled: false,
        items: [],
        cancel() {
          if (batch) {
            batch.cancelled = true;
          }
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

    return { promise, cancel };
  }

  return {
    load,
  };
}

export function httpBatchLink(opts: HttpLinkOptions): TRPCLink {
  const { url } = opts;
  // initialized config
  return (runtime) => {
    // initialized in app

    const fetcher =
      (type: ProcedureType) =>
      (keyInputPairs: { path: string; input: unknown }[]) => {
        const path = keyInputPairs.map(({ path }) => path).join(',');
        const input = keyInputPairs.map(({ input }) => input);

        const { promise, cancel } = httpRequest<
          HTTPResponseEnvelope<unknown, any>[]
        >({
          url,
          input,
          path,
          runtime,
          type,
          searchParams: 'batch=1',
        });

        return {
          promise: promise.then((res: unknown[] | unknown) => {
            if (!Array.isArray(res)) {
              return keyInputPairs.map(() => res);
            }
            return res;
          }),
          cancel,
        };
      };
    const query = dataLoader(fetcher('query'));
    const mutation = dataLoader(fetcher('mutation'));
    const subscription = dataLoader(fetcher('subscription'));

    const loaders = { query, subscription, mutation };
    return ({ op, prev, onDestroy }) => {
      const loader = loaders[op.type];
      const { promise, cancel } = loader.load(op);
      onDestroy(() => cancel());
      promise.then(prev).catch(prev);
    };
  };
}
