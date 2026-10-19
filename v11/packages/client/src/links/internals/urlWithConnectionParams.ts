import { type TRPCRequestInfo } from '@trpc/server/http';

/**
 * Get the result of a value or function that returns a value
 * It also optionally accepts typesafe arguments for the function
 */
export const resultOf = <T, TArgs extends any[]>(
  value: T | ((...args: TArgs) => T),
  ...args: TArgs
): T => {
  return typeof value === 'function'
    ? (value as (...args: TArgs) => T)(...args)
    : value;
};

/**
 * A value that can be wrapped in callback
 */
export type CallbackOrValue<T> = T | (() => T | Promise<T>);

export interface UrlOptionsWithConnectionParams {
  /**
   * The URL to connect to (can be a function that returns a URL)
   */
  url: CallbackOrValue<string>;

  /**
   * Connection params that are available in `createContext()`
   * - For `wsLink`/`wsClient`, these are sent as the first message
   * - For `httpSubscriptionLink`, these are serialized as part of the URL under the `connectionParams` query
   */
  connectionParams?: CallbackOrValue<TRPCRequestInfo['connectionParams']>;
}
