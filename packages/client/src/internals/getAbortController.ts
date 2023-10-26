import { Maybe } from '@trpc/server';
import { AbortControllerEsque } from './types';

export function getAbortController(
  customAbortControllerImpl: Maybe<AbortControllerEsque>,
): AbortControllerEsque | null {
  if (customAbortControllerImpl) {
    return customAbortControllerImpl;
  }

  // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
  if (typeof window !== 'undefined' && window.AbortController) {
    return window.AbortController;
  }
  // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
  if (typeof globalThis !== 'undefined' && globalThis.AbortController) {
    return globalThis.AbortController;
  }

  return null;
}
