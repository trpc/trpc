import { isObject } from '../internals/utils';

/**
 * @internal
 */
export function getMessageFromUnknownError(
  err: unknown,
  fallback: string,
): string {
  if (typeof err === 'string') {
    return err;
  }
  if (isObject(err) && typeof err['message'] === 'string') {
    return err['message'];
  }
  return fallback;
}
