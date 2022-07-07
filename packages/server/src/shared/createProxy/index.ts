interface ProxyCallbackOptions {
  path: string[];
  args: unknown[];
}
type ProxyCallback = (opts: ProxyCallbackOptions) => unknown;

interface CreateProxyOptionsGeneric {
  target: unknown;
}
interface CreateProxyOptions<TOpts extends CreateProxyOptionsGeneric> {
  target: TOpts['target'];
  callback: ProxyCallback;
}

function createProxyInner<TOptions extends CreateProxyOptionsGeneric>(
  opts: CreateProxyOptions<TOptions>,
  ...path: string[]
) {
  const proxy: any = new Proxy(
    () => {
      // noop
    },
    {
      get(_obj, name) {
        if (typeof name === 'string') {
          return createProxyInner(opts, ...path, name);
        }

        return opts.target;
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      apply(_1, _2, args) {
        return opts.callback({
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
export function createProxy<TOptions extends CreateProxyOptionsGeneric>(
  opts: CreateProxyOptions<TOptions>,
) {
  return createProxyInner(opts);
}
