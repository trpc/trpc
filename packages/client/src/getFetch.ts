import type { FetchEsque, NativeFetchEsque } from './internals/types';

type AnyFn = (...args: any[]) => unknown;

const isFunction = (fn: unknown): fn is AnyFn => typeof fn === 'function';

export function getFetch(
  customFetchImpl?: FetchEsque | NativeFetchEsque,
): FetchEsque {
  if (customFetchImpl) {
    return customFetchImpl as FetchEsque;
  }

  if (typeof window !== 'undefined' && isFunction(window.fetch)) {
    return window.fetch as FetchEsque;
  }

  if (typeof globalThis !== 'undefined' && isFunction(globalThis.fetch)) {
    return globalThis.fetch as FetchEsque;
  }

  throw new Error('No fetch implementation found');
}
