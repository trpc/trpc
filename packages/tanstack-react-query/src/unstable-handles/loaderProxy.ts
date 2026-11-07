import type { AnyTRPCRouter } from '@trpc/server';
import type {
  TRPCOptionsProxy,
  TRPCOptionsProxyOptions,
} from '../internals/createOptionsProxy';
import { createTRPCOptionsProxy } from '../internals/createOptionsProxy';
import type { DefaultFeatureFlags, FeatureFlags } from '../internals/types';

declare const loaderBrand: unique symbol;

/**
 * Type-only: marks the root of a {@link TRPCLoaderOptionsProxy}, which
 * `loadHandles` takes, and its query procedures, which the entries take.
 * `useTRPC()` doesn't have it, since a render can't wait for queries.
 * @internal
 */
export interface TRPCLoaderBrand<TLevel extends 'root' | 'procedure'> {
  readonly [loaderBrand]: TLevel;
}

/**
 * The loader brand of each query procedure of a proxy, to intersect with it
 */
type LoaderBrands<TValue> = TValue extends { queryOptions: unknown }
  ? TRPCLoaderBrand<'procedure'>
  : TValue extends (...args: any[]) => any
    ? unknown
    : { [TKey in keyof TValue]: LoaderBrands<TValue[TKey]> };

/**
 * The object returned by {@link createTRPCLoaderProxy}: a `TRPCOptionsProxy`
 * that can also load handles, in a route loader or a server component.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles
 */
export type TRPCLoaderOptionsProxy<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
> = TRPCOptionsProxy<TRouter, TFeatureFlags> &
  LoaderBrands<TRPCOptionsProxy<TRouter, TFeatureFlags>> &
  TRPCLoaderBrand<'root'>;

/**
 * Marks every level of a loader proxy. The options proxy returns `undefined`
 * for symbol keys, so other proxies, like `useTRPC()`'s, don't have it.
 */
const loaderProxy = Symbol('trpc.loaderProxy');

/**
 * Creates an options proxy, like `createTRPCOptionsProxy`, that can also load
 * handles with `loadHandles`. Use it where queries can be waited for: a route
 * loader, a server component, `getServerSideProps`.
 *
 * @example
 * ```ts
 * export const trpc = createTRPCLoaderProxy<AppRouter>({
 *   client: trpcClient,
 *   queryClient,
 * });
 * ```
 * @see https://trpc.io/docs/client/tanstack-react-query/handles
 */
export function createTRPCLoaderProxy<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
>(
  opts: TRPCOptionsProxyOptions<TRouter, TFeatureFlags>,
): TRPCLoaderOptionsProxy<TRouter, TFeatureFlags> {
  return markLoader(createTRPCOptionsProxy(opts)) as any;
}

function markLoader(target: object): object {
  return new Proxy(target, {
    get(proxy, key) {
      if (key === loaderProxy) {
        return true;
      }
      const value: unknown = Reflect.get(proxy, key);
      return typeof value === 'function' ? markLoader(value) : value;
    },
  });
}

export function isLoaderProxy(proxy: object) {
  return (proxy as { [loaderProxy]?: true })[loaderProxy] === true;
}
