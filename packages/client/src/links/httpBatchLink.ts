import { HTTPResponseEnvelope } from 'packages/server/src/http';
import { DataTransformer } from 'packages/server/src/transformer';
import { getAbortController, getFetch } from '../helpers';
import { AppLink, ResultEnvelope } from './core';
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

function fetchAndReturn(config: {
  fetch: typeof fetch;
  AbortController?: typeof AbortController;
  url: string;
  opts: RequestInit;
  transformer: DataTransformer;
}): CancellablePromise<any> {
  const ac = config.AbortController ? new config.AbortController() : null;
  const reqOpts = {
    ...config.opts,
    signal: ac?.signal,
  };
  const promise = new Promise((resolve, reject) => {
    config
      .fetch(config.url, reqOpts)
      .then((res) => {
        return res.json();
      })
      .then((json) => {
        resolve(config.transformer.deserialize(json));
      })
      .catch(reject);
  }) as CancellablePromise<unknown>;
  promise.cancel = () => {
    ac?.abort();
  };
  return promise;
}
export function httpBatchLink(opts: HttpLinkOptions): AppLink {
  const _fetch = getFetch(opts?.fetch);
  const AC = getAbortController(opts?.AbortController);
  const { url } = opts;

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

      return fetchAndReturn({
        url: `${url}/${path}?batch=1&input=${encodeURIComponent(
          JSON.stringify(transformer.serialize(input)),
        )}`,
        fetch: _fetch,
        AbortController: AC as any,
        opts: {
          method: 'GET',
        },
        transformer,
      });
    });
    return ({ op, prev, onDestroy }) => {
      if (op.type === 'query') {
        const promise = query.load(op);
        onDestroy(() => promise.cancel());
        promise.then(prev);
      }
    };
  };
}
