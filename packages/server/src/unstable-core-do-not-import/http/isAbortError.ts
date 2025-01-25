import { isObject } from '../utils';

export function isAbortError(
  error: unknown,
): error is DOMException | Error | { name: 'AbortError' } {
  return isObject(error) && error['name'] === 'AbortError';
}
