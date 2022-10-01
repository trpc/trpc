interface ProxyCallbackOptions {
  path: string[];
  args: unknown[];
}
type ProxyCallback = (opts: ProxyCallbackOptions) => unknown;

function createProxyInner(callback: ProxyCallback, ...path: string[]) {
  const proxy: unknown = new Proxy(
    () => {
      // noop
    },
    {
      get(_obj, name) {
        if (name === 'then') {
          return undefined;
        }
        if (typeof name === 'string') {
          if (name === 'then') {
            // special case for if the proxy is accidentally treated
            // like a PromiseLike (like in `Promise.resolve(proxy)`)
            return undefined;
          }
          return createProxyInner(callback, ...path, name);
        }

        throw new Error('Not supported');
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      apply(_1, _2, args) {
        return callback({
          args,
          path,
        });
      },
    },
  );

  return proxy;
}

/**
 * Creates a proxy that calls the callback with the path and arguments
 *
 * @remarks
 * This has a special handling to manage if it's accidentally treated like
 * a PromiseLike.
 *
 * @internal
 */
export const createProxy = (callback: ProxyCallback) =>
  createProxyInner(callback);
