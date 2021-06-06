import { ClientDataTransformerOptions } from 'packages/server/src/transformer';
import { getAbortController, getFetch } from '../helpers';
import { AppLink } from './core';

export interface HttpLinkOptions {
  fetch?: typeof fetch;
  AbortController?: typeof AbortController;
  url: string;
  transformer?: ClientDataTransformerOptions;
}
type CallType = 'subscription' | 'query' | 'mutation';
type ReqOpts = {
  method: string;
  body?: string;
  url: string;
};
export function httpLink(opts: HttpLinkOptions): AppLink {
  const _fetch = getFetch(opts?.fetch);
  const AC = getAbortController(opts?.AbortController);
  const { url } = opts;
  // initialized config
  return () => {
    // initialized in app
    return ({ op, prev, onDestroy: onDone }) => {
      const ac = AC ? new AC() : null;
      const { path, input, type } = op;
      const reqOptsMap: Record<CallType, () => ReqOpts> = {
        subscription: () => ({
          method: 'PATCH',
          body: JSON.stringify({ input }),
          url: `${url}/${path}`,
        }),
        mutation: () => ({
          method: 'POST',
          body: JSON.stringify({ input }),
          url: `${url}/${path}`,
        }),
        query: () => ({
          method: 'GET',
          url:
            `${url}/${path}` +
            (input != null
              ? `?input=${encodeURIComponent(JSON.stringify(input))}`
              : ''),
        }),
      };

      async function fetchAndReturn() {
        const opts = reqOptsMap[type]();
        try {
          const res = await _fetch(opts.url, { ...opts, signal: ac?.signal });
          const json = await res.json();

          prev(json);
        } catch (error) {
          prev({
            ok: false,
            error,
          });
        }
      }
      fetchAndReturn();
      onDone(() => {
        ac?.abort();
      });
    };
  };
}
