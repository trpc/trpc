import { ClientDataTransformerOptions, DataTransformer } from '@trpc/server';
import { TRPCClientError } from '../createTRPCClient';
import { getAbortController, getFetch } from '../helpers';
import { TRPCLink } from './core';

type Headeresque = Record<string, string | string[] | undefined>;
export interface HttpLinkOptions {
  fetch?: typeof fetch;
  AbortController?: typeof AbortController;
  url: string;
  transformer?: ClientDataTransformerOptions;
  headers?: Headeresque | (() => Headeresque);
}
type CallType = 'subscription' | 'query' | 'mutation';
type ReqOpts = {
  method: string;
  body?: string;
  url: string;
};
type CancelFn = () => void;

type CancellablePromise<T> = {
  promise: Promise<T>;
  cancel: CancelFn;
};

export function fetchAndReturn<TResponseShape = unknown>(config: {
  fetch: typeof fetch;
  AbortController?: typeof AbortController;
  url: string;
  opts: RequestInit;
  transformer: DataTransformer;
}): CancellablePromise<any> {
  const ac = config.AbortController ? new config.AbortController() : null;
  const reqOpts = {
    ...config.opts,
    headers: {
      'content-type': 'application/json',
      ...(config.opts.headers ?? {}),
    },
    signal: ac?.signal,
  };
  const promise = new Promise<TResponseShape>((resolve, reject) => {
    config
      .fetch(config.url, reqOpts)
      .then((res) => {
        return res.json();
      })
      .then((json) => {
        resolve(config.transformer.deserialize(json));
      })
      .catch(reject);
  });
  const cancel = () => {
    ac?.abort();
  };
  return { promise, cancel };
}

export function httpLink(opts: HttpLinkOptions): TRPCLink {
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

  const getHeaders =
    typeof opts.headers === 'function'
      ? opts.headers
      : () => opts.headers ?? {};
  // initialized config
  return () => {
    // initialized in app
    return ({ op, prev, onDestroy }) => {
      const { path, input, type } = op;
      const reqOptsMap: Record<CallType, () => ReqOpts> = {
        subscription: () => ({
          method: 'PATCH',
          body: JSON.stringify({ input: transformer.serialize(input) }),
          url: `${url}/${path}`,
        }),
        mutation: () => ({
          method: 'POST',
          body: JSON.stringify({ input: transformer.serialize(input) }),
          url: `${url}/${path}`,
        }),
        query: () => ({
          method: 'GET',
          url:
            `${url}/${path}` +
            (input != null
              ? `?input=${encodeURIComponent(
                  JSON.stringify(transformer.serialize(input)),
                )}`
              : ''),
        }),
      };
      const opts = reqOptsMap[type]();
      const { promise, cancel } = fetchAndReturn({
        fetch: _fetch as any,
        AbortController: AC as any,
        url: opts.url,
        opts: {
          ...opts,
          headers: getHeaders() as any,
        },
        transformer,
      });
      onDestroy(() => cancel());
      promise
        .then((data) => {
          prev(data);
        })
        .catch((originalError) => {
          const err = new TRPCClientError(originalError?.message, {
            originalError,
          });
          prev(err);
        });
    };
  };
}
