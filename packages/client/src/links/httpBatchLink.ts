import { getAbortController, getFetch } from '../helpers';
import { AppLink } from './core';
import { HttpLinkOptions } from './httpLink';

export function httpBatchLink(opts: HttpLinkOptions): AppLink {
  const _fetch = getFetch(opts?.fetch);
  const AC = getAbortController(opts?.AbortController);
  const { url } = opts;
  // initialized config
  return () => {
    // initialized in app

    return ({ op, prev, onDestroy: onDone }) => {
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
