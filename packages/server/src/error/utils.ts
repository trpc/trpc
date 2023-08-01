/**
 * @internal
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  // check that value is object
  return !!value && !Array.isArray(value) && typeof value === 'object';
}

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
  if (isObject(err) && typeof err.message === 'string') {
    return err.message;
  }
  return fallback;
}
