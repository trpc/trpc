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

    return ({ op, prev, onDestroy: onDone }) => {};
  };
}
