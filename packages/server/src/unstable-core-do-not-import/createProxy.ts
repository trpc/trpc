import { emptyObject } from './utils';

interface ProxyCallbackOptions {
  path: readonly string[];
  args: readonly unknown[];
}
type ProxyCallback = (opts: ProxyCallbackOptions) => unknown;

const noop = () => {
  // noop
};

const freezeIfAvailable = (obj: object) => {
  if (Object.freeze) {
    Object.freeze(obj);
  }
};

function createInnerProxy(
  callback: ProxyCallback,
  path: readonly string[],
  memo: Record<string, unknown>,
) {
  const cacheKey = path.join('.');

  memo[cacheKey] ??= new Proxy(noop, {
    get(_obj, key) {
      if (typeof key !== 'string' || key === 'then') {
        // special case for if the proxy is accidentally treated
        // like a PromiseLike (like in `Promise.resolve(proxy)`)
        return undefined;
      }
      return createInnerProxy(callback, [...path, key], memo);
    },
    apply(_1, _2, args) {
      const lastOfPath = path[path.length - 1];

      // React 19 may call valueOf / toString / toJSON when coercing a proxy
      // to a primitive (e.g. during rendering or logging). Return a debug
      // string so the coercion does not recurse into the proxy. This only
      // triggers for direct calls (proxy.toString()), not for chained access
      // (proxy.toString.query()), preserving route naming freedom.
      if (
        lastOfPath === 'valueOf' ||
        lastOfPath === 'toString' ||
        lastOfPath === 'toJSON'
      ) {
        const debugPath = path.slice(0, -1).join('.');
        return `tRPC.proxy(${debugPath})`;
      }

      let opts = { args, path };
      // special handling for e.g. `trpc.hello.call(this, 'there')` and `trpc.hello.apply(this, ['there'])
      if (lastOfPath === 'call') {
        opts = {
          args: args.length >= 2 ? [args[1]] : [],
          path: path.slice(0, -1),
        };
      } else if (lastOfPath === 'apply') {
        opts = {
          args: args.length >= 2 ? args[1] : [],
          path: path.slice(0, -1),
        };
      }
      freezeIfAvailable(opts.args);
      freezeIfAvailable(opts.path);
      return callback(opts);
    },
  });

  return memo[cacheKey];
}

/**
 * Creates a proxy that calls the callback with the path and arguments
 *
 * @internal
 */
export const createRecursiveProxy = <TFaux = unknown>(
  callback: ProxyCallback,
): TFaux => createInnerProxy(callback, [], emptyObject()) as TFaux;

/**
 * Used in place of `new Proxy` where each handler will map 1 level deep to another value.
 *
 * @internal
 */
export const createFlatProxy = <TFaux>(
  callback: (path: keyof TFaux) => any,
): TFaux => {
  return new Proxy(noop, {
    get(_obj, name) {
      if (name === 'then') {
        // special case for if the proxy is accidentally treated
        // like a PromiseLike (like in `Promise.resolve(proxy)`)
        return undefined;
      }
      return callback(name as any);
    },
  }) as TFaux;
};
