/**
 * Get the result of a value or function that returns a value
 */
const resultOf = <T>(value: T | (() => T)): T => {
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
   * These are serialized as part of the URL
   */
  connectionParams?: CallbackOrValue<Record<string, unknown>>;
}

export async function urlWithConnectionParams(
  opts: UrlOptionsWithConnectionParams,
): Promise<string> {
  let url = await resultOf(opts.url);
  if (opts.connectionParams) {
    const params = await resultOf(opts.connectionParams);

    const prefix = url.includes('?') ? '&' : '?';
    url +=
      prefix + 'connectionParams=' + encodeURIComponent(JSON.stringify(params));
  }

  return url;
}
