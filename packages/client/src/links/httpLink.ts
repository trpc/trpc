import { DataTransformer } from '@trpc/server';
import { TRPCClientError } from '../createTRPCClient';
import { HttpLinkOptions, PromiseAndCancel, TRPCLink } from './core';

type CallType = 'subscription' | 'query' | 'mutation';
type ReqOpts = {
  method: string;
  body?: string;
  url: string;
};

export function fetchAndReturn<TResponseShape = unknown>(config: {
  fetch: typeof fetch;
  AbortController?: typeof AbortController;
  url: string;
  opts: RequestInit;
  transformer: DataTransformer;
}): PromiseAndCancel<any> {
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
  const { url } = opts;

  // initialized config
  return (rt) => {
    // initialized in app
    return ({ op, prev, onDestroy }) => {
      const { path, input, type } = op;
      const reqOptsMap: Record<CallType, () => ReqOpts> = {
        subscription: () => ({
          method: 'PATCH',
          body: JSON.stringify({ input: rt.transformer.serialize(input) }),
          url: `${url}/${path}`,
        }),
        mutation: () => ({
          method: 'POST',
          body: JSON.stringify({ input: rt.transformer.serialize(input) }),
          url: `${url}/${path}`,
        }),
        query: () => ({
          method: 'GET',
          url:
            `${url}/${path}` +
            (input != null
              ? `?input=${encodeURIComponent(
                  JSON.stringify(rt.transformer.serialize(input)),
                )}`
              : ''),
        }),
      };
      const opts = reqOptsMap[type]();
      const { promise, cancel } = fetchAndReturn({
        fetch: rt.fetch,
        AbortController: rt.AbortController,
        url: opts.url,
        opts: {
          ...opts,
          headers: rt.headers() as any,
        },
        transformer: rt.transformer,
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
