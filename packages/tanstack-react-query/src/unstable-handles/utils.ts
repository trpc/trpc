/** For what needs a function and wants nothing done */
export const nothing = () => undefined;

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Starts one unit of work, such as one item's query, with a throw as its
 * rejection: one unit's failure is its own, and the units after it start
 */
export function startOwn<TResult>(start: () => Promise<TResult>) {
  try {
    return start();
  } catch (error) {
    return Promise.reject(error);
  }
}
