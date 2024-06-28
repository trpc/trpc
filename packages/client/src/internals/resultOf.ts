/**
 * Get the result of a value or function that returns a value
 */
export const resultOf = <T>(value: T | (() => T)): T => {
  return typeof value === 'function' ? (value as () => T)() : value;
};

/**
 * A value that can be wrapped in callback
 */
export type CallbackOrValue<T> = T | (() => T | Promise<T>);
