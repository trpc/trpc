import { getWindow } from './internals/fetchHelpers';

export function getFetch(f?: typeof fetch): typeof fetch {
  if (f) {
    return f;
  }
  const win = getWindow();
  if (win.fetch) {
    return typeof win.fetch.bind === 'function'
      ? win.fetch.bind(win)
      : win.fetch;
  }

  throw new Error('No fetch implementation found');
}
