import { HTTPResponseEnvelope } from 'packages/server/src/http';
import { getAbortController, getFetch } from '../helpers';
import { TRPCLink } from './core';
import { fetchAndReturn, HttpLinkOptions } from './httpLink';

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
  const _fetch = getFetch(opts?.fetch);
  const AC = getAbortController(opts?.AbortController);
  const { url } = opts;
  const getHeaders =
    typeof opts.headers === 'function'
      ? opts.headers
      : () => opts.headers ?? {};

  const transformer = opts.transformer
    ? 'input' in opts.transformer
      ? {
          serialize: opts.transformer.input.serialize,
          deserialize: opts.transformer.output.deserialize,
        }
      : opts.transformer
    : {
        serialize: (data: any) => data,
        deserialize: (data: any) => data,
      };

  // initialized config
  return () => {
    // initialized in app

    const query = dataLoader<
      { path: string; input: unknown },
      HTTPResponseEnvelope<unknown, any>
    >((keyInputPairs) => {
      const path = keyInputPairs.map(({ path }) => path).join(',');
      const input = keyInputPairs.map(({ input }) => input);

      const { promise, cancel } = fetchAndReturn<
        HTTPResponseEnvelope<unknown, any>[]
      >({
        url: `${url}/${path}?batch=1&input=${encodeURIComponent(
          JSON.stringify(transformer.serialize(input)),
        )}`,
        fetch: _fetch,
        AbortController: AC as any,
        opts: {
          method: 'GET',
          headers: getHeaders() as any,
        },
        transformer,
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
    });
    return ({ op, prev, onDestroy }) => {
      if (op.type === 'query') {
        const { promise, cancel } = query.load(op);
        onDestroy(() => cancel());
        promise.then((data: HTTPResponseEnvelope<unknown, any>) => {
          prev(data);
        });
      }
    };
  };
}
