interface ProxyCallbackOptions {
  path: string[];
  args: unknown[];
}
type ProxyCallback = (opts: ProxyCallbackOptions) => unknown;

const noop = () => {
  // noop
};

function createProxyInner(callback: ProxyCallback, path: string[]) {
  const proxy: unknown = new Proxy(noop, {
    get(_obj, key) {
      if (typeof key !== 'string' || key === 'then') {
        // special case for if the proxy is accidentally treated
        // like a PromiseLike (like in `Promise.resolve(proxy)`)
        return undefined;
      }
      return createProxyInner(callback, [...path, key]);
    },
    apply(_1, _2, args) {
      return callback({
        args,
        path,
      });
    },
  });

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
  createProxyInner(callback, []);

/**
 * Used in place of `new Proxy` where each handler will map 1 level deep to another value.
 * Handles `PromiseLike` situations
 */
export const createFlatProxy = <TActor>(
  callback: (path: keyof TActor & string) => any,
): TActor => {
  return new Proxy(noop, {
    get(_obj, name) {
      if (typeof name !== 'string' || name === 'then') {
        // special case for if the proxy is accidentally treated
        // like a PromiseLike (like in `Promise.resolve(proxy)`)
        return undefined;
      }
      return callback(name as any);
    },
  }) as TActor;
};
