import { type TRPCRequestInfo } from '@trpc/server/http';

/**
 * Get the result of a value or function that returns a value
 */
export const resultOf = <T>(value: T | (() => T)): T => {
  return typeof value === 'function' ? (value as () => T)() : value;
};

/**
 * A value that can be wrapped in callback
 */
type CallbackOrValue<T> = T | (() => T | Promise<T>);

export interface UrlOptionsWithConnectionParams {
  /**
   * The URL to connect to (can be a function that returns a URL)
   */
  url: CallbackOrValue<string>;

  /**
   * Connection params that can be picked up in `createContext()`
   * These are serialized as part of the URL for `httpSubscriptionLink` and sent as a first message in `wsLink`
   */
  connectionParams?: CallbackOrValue<TRPCRequestInfo['connectionParams']>;
}
