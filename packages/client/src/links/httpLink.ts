import { DataTransformer } from '@trpc/server';
import {
  HttpLinkOptions,
  httpRequest,
  PromiseAndCancel,
  TRPCLink,
} from './core';

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
  return (runtime) => {
    // initialized in app
    return ({ op, prev, onDestroy }) => {
      const { path, input, type } = op;
      const { promise, cancel } = httpRequest({
        runtime,
        type,
        input,
        url,
        path,
      });
      onDestroy(() => cancel());
      promise.then(prev).catch(prev);
    };
  };
}
