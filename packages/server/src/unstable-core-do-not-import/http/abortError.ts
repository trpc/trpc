import { isObject } from '../utils';

/** @internal */
export function isAbortError(
  error: unknown,
): error is DOMException | Error | { name: 'AbortError' } {
  return isObject(error) && error['name'] === 'AbortError';
}

/**
 * Libraries outside tRPC call this with and without a message.
 * @internal
 */
// oxlint-disable-next-line trpc/no-internal-optional
export function throwAbortError(message = 'AbortError'): never {
  throw new DOMException(message, 'AbortError');
}
