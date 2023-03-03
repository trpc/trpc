import { FetchEsque, NativeFetchEsque } from './internals/types';

type AnyFn = (...args: any[]) => unknown;

const isFunction = (fn: unknown): fn is AnyFn => typeof fn === 'function';

function _bind(fn: AnyFn, thisArg: unknown): AnyFn {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  return isFunction(fn.bind) ? fn.bind(thisArg) : fn;
}

export function getFetch(
  customFetchImpl?: FetchEsque | NativeFetchEsque,
): FetchEsque {
  if (customFetchImpl) {
    return customFetchImpl as FetchEsque;
  }

  if (typeof window !== 'undefined' && isFunction(window.fetch)) {
    return _bind(window.fetch, window) as FetchEsque;
  }

  if (typeof globalThis !== 'undefined' && isFunction(globalThis.fetch)) {
    return _bind(globalThis.fetch, globalThis) as FetchEsque;
  }

  throw new Error('No fetch implementation found');
}
