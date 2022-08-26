import { getWindow } from './internals/fetchHelpers';

export function getFetch(f?: typeof fetch): typeof fetch {
  if (f) {
    return f;
  }

  const win = getWindow();
  const globalFetch = win.fetch;
  if (globalFetch) {
    return typeof globalFetch.bind === 'function'
      ? globalFetch.bind(win)
      : globalFetch;
  }

  throw new Error('No fetch implementation found');
}
