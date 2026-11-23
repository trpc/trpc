import { isObject } from '../utils';

/** @internal */
export function isAbortError(
  error: unknown,
): error is DOMException | Error | { name: 'AbortError' } {
  return isObject(error) && error['name'] === 'AbortError';
}

/** @internal */
export function throwAbortError(): never {
  throw new DOMException('AbortError', 'AbortError');
}
