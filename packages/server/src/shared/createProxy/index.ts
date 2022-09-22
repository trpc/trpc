interface ProxyCallbackOptions {
  path: string[];
  args: unknown[];
}
type ProxyCallback = (opts: ProxyCallbackOptions) => unknown;

export type ProxyPromiseGuard = {
  /**
   * We prevent our procedures from accidentally being treated as a PromiseLike
   * by always ensuring that "then" resolves to `undefined`.
   *
   * This prevents errors where a proxy client is used in a promise callback or
   * in a `Promise.resolve(proxy)`.
   *
   * This does mean that `then` is a reserved word and cannot be used to
   * name any of your procedures.
   */
  then: undefined;
};

function createProxyInner(callback: ProxyCallback, ...path: string[]) {
  const proxy: unknown = new Proxy(
    () => {
      // noop
    },
    {
      get(_obj, name) {
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
 * Where used, you should probably also use the {@link ProxyPromiseGuard}
 * as an intersection of your resulting proxy to help TypeScript users.
 *
 * @internal
 */
export const createProxy = (callback: ProxyCallback) =>
  createProxyInner(callback);
