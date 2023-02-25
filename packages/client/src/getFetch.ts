import { FetchEsque, NativeFetchEsque } from './internals/types';

export function getFetch(
  customFetchImpl?: FetchEsque | NativeFetchEsque,
): FetchEsque {
  if (typeof customFetchImpl === 'function') {
    return customFetchImpl as FetchEsque;
  }

  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    return window.fetch.bind(window) as FetchEsque;
  }

  if (
    typeof globalThis !== 'undefined' &&
    typeof globalThis.fetch === 'function'
  ) {
    return globalThis.fetch.bind(globalThis) as FetchEsque;
  }

  throw new Error('No fetch implementation found');
}
