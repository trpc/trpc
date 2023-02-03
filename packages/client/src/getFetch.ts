import { getWindow } from './internals/fetchHelpers';
import { FetchEsque, NativeFetchEsque } from './internals/types';

export function getFetch(f?: FetchEsque | NativeFetchEsque): FetchEsque {
  if (f) {
    return f as FetchEsque;
  }

  const win = getWindow();
  const globalFetch = win.fetch;
  if (globalFetch) {
    return (
      typeof globalFetch.bind === 'function'
        ? globalFetch.bind(win)
        : globalFetch
    ) as FetchEsque;
  }

  throw new Error('No fetch implementation found');
}
