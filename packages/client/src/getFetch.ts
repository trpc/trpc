import { FetchEsque, NativeFetchEsque } from './internals/types';

export function getFetch(
  customFetchImpl?: FetchEsque | NativeFetchEsque,
): FetchEsque {
  if (customFetchImpl) {
    return customFetchImpl as FetchEsque;
  }

  if (typeof window !== 'undefined' && window.fetch) {
    return window.fetch.bind(window) as FetchEsque;
  }

  if (typeof globalThis !== 'undefined' && typeof globalThis.fetch) {
    return globalThis.fetch as FetchEsque;
  }

  throw new Error('No fetch implementation found');
}
