interface ProxyCallbackOptions {
  path: string[];
  args: unknown[];
}
type ProxyCallback = (opts: ProxyCallbackOptions) => unknown;

function createProxyInner(callback: ProxyCallback, ...path: string[]) {
  const proxy: any = new Proxy(
    () => {
      // noop
    },
    {
      get(_obj, name) {
        if (typeof name === 'string') {
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
 * @internal
 */
export const createProxy = (callback: ProxyCallback) =>
  createProxyInner(callback);
