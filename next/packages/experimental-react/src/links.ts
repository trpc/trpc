import { Effect, Stream } from 'effect';
import {
  link,
  retryLink,
  type Operation,
  type RetryLinkOptions,
  type TrpcLink,
} from '@trpc12/trpc/client';
import { replaceEqualDeep } from './share.ts';
import {
  withQueryFeature,
  type QueryFilter,
  type QueryStore,
} from './store.ts';

const passThrough = (): TrpcLink => link((opts) => opts.next(opts.op));

/** Refetches the stale entries a mounted `useQuery` reads. */
const refetchObserved = (store: QueryStore) => {
  for (const entry of store.entries()) {
    if (entry.observers > 0 && store.isStale(entry)) void store.refetch(entry);
  }
};

/**
 * Options for {@link cacheLink}.
 * @since 0.1.0
 * @stability experimental
 */
export interface CacheLinkOptions {
  /**
   * How long data counts as fresh, in ms: `.query()` returns it without a
   * request. Stale data is still returned, and refetched in the background.
   * @default 0
   */
  staleTime?: number;
  /**
   * How long an entry no component reads is kept, in ms. `Infinity` keeps
   * it. A server's store never drops entries.
   * @default 300_000
   */
  gcTime?: number;
}

/**
 * Keeps query data after the last reader unmounts, and serves fresh data
 * without a request. Without it, an entry lives only while a request is in
 * flight or a component reads it.
 *
 * @example
 * ```ts
 * createReactClient({
 *   router: routerType<AppRouter>(),
 *   links: [cacheLink({ staleTime: 30_000 }), httpLink({ url })],
 * });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function cacheLink(opts: CacheLinkOptions = {}): TrpcLink {
  return withQueryFeature(passThrough(), {
    staleTime: opts.staleTime ?? 0,
    gcTime: opts.gcTime ?? 300_000,
  });
}

/**
 * Refetched data keeps every part that is deeply equal to the old data, so
 * unchanged objects keep their identity, and data that didn't change at
 * all keeps its promise: components reading it don't re-render. Compares
 * plain objects, arrays and `Date`s.
 *
 * @example
 * ```ts
 * links: [structuralSharingLink(), httpLink({ url })];
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function structuralSharingLink(): TrpcLink {
  return withQueryFeature(passThrough(), { share: replaceEqualDeep });
}

/**
 * Refetches stale data when a `useQuery` mounts on it. The first mount
 * after a `.query()` call that started a request doesn't, so a loader's
 * request isn't sent twice.
 *
 * @example
 * ```ts
 * links: [refetchOnMountLink(), httpLink({ url })];
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function refetchOnMountLink(): TrpcLink {
  return withQueryFeature(passThrough(), {
    onMount(entry, store) {
      if (
        !entry.requested &&
        !entry.snapshot.isFetching &&
        store.isStale(entry)
      )
        void store.refetch(entry);
    },
  });
}

/**
 * Refetches the stale data mounted components read when the page becomes
 * visible again.
 *
 * @example
 * ```ts
 * links: [refetchOnWindowFocusLink(), httpLink({ url })];
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function refetchOnWindowFocusLink(): TrpcLink {
  return withQueryFeature(passThrough(), {
    attach(store) {
      if (store.isServer || typeof document === 'undefined') return;
      const onChange = () => {
        if (document.visibilityState === 'visible') refetchObserved(store);
      };
      document.addEventListener('visibilitychange', onChange);
      return () => document.removeEventListener('visibilitychange', onChange);
    },
  });
}

/**
 * Refetches the stale data mounted components read when the browser comes
 * back online.
 *
 * @example
 * ```ts
 * links: [refetchOnReconnectLink(), httpLink({ url })];
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function refetchOnReconnectLink(): TrpcLink {
  return withQueryFeature(passThrough(), {
    attach(store) {
      if (store.isServer || typeof window === 'undefined') return;
      const onOnline = () => refetchObserved(store);
      window.addEventListener('online', onOnline);
      return () => window.removeEventListener('online', onOnline);
    },
  });
}

/**
 * Options for {@link invalidateOnMutationLink}.
 * @since 0.1.0
 * @stability experimental
 */
export interface InvalidateOnMutationLinkOptions {
  /**
   * The queries a successful mutation invalidates: a path prefix, a
   * predicate, or `undefined` for all of them.
   * @default every query
   */
  invalidates?: (op: Operation) => QueryFilter;
}

/**
 * Invalidates queries after each successful mutation, as a router
 * revalidates its loaders after an action. The mutation resolves once the
 * mounted queries have refetched, so an action stays pending until fresh
 * data is on screen.
 *
 * @example
 * ```ts
 * links: [
 *   invalidateOnMutationLink({ invalidates: (op) => op.path.split('.')[0] }),
 *   httpLink({ url }),
 * ];
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function invalidateOnMutationLink(
  opts: InvalidateOnMutationLinkOptions = {},
): TrpcLink {
  const stores = new Set<QueryStore>();
  const invalidates = opts.invalidates ?? (() => undefined);
  const chain = link((args) => {
    const { op } = args;
    const out = args.next(op);
    return op.type !== 'mutation'
      ? out
      : out.pipe(
          Stream.tap(() =>
            Effect.promise(() =>
              Promise.all(
                [...stores].map((store) => store.invalidate(invalidates(op))),
              ),
            ),
          ),
        );
  });
  return withQueryFeature(chain, {
    attach(store) {
      stores.add(store);
      return () => stores.delete(store);
    },
  });
}

/**
 * Options for {@link standardLinks}.
 * @since 0.1.0
 * @stability experimental
 */
export interface StandardLinksOptions
  extends CacheLinkOptions, InvalidateOnMutationLinkOptions {
  /** `retryLink`'s options. @default 3 retries of failed queries */
  retry?: RetryLinkOptions;
}

/**
 * What {@link standardLinks} returns.
 * @since 0.1.0
 * @stability experimental
 */
export type StandardLinks = readonly [
  cache: TrpcLink,
  structuralSharing: TrpcLink,
  refetchOnMount: TrpcLink,
  refetchOnWindowFocus: TrpcLink,
  refetchOnReconnect: TrpcLink,
  invalidateOnMutation: TrpcLink,
  retry: TrpcLink,
];

/**
 * The links that make the client behave like TanStack Query's defaults:
 * a cache kept 5 minutes, structural sharing, refetching stale data on
 * mount, window focus and reconnect, and 3 retries of failed queries. Like
 * a router after an action, it also invalidates queries after each
 * mutation (every query, unless `invalidates` narrows it). Spread it before
 * the link that sends; pick single links instead for less.
 *
 * @example
 * ```ts
 * createReactClient({
 *   router: routerType<AppRouter>(),
 *   links: [...standardLinks({ staleTime: 10_000 }), httpLink({ url })],
 * });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function standardLinks(opts: StandardLinksOptions = {}): StandardLinks {
  return [
    cacheLink(opts),
    structuralSharingLink(),
    refetchOnMountLink(),
    refetchOnWindowFocusLink(),
    refetchOnReconnectLink(),
    invalidateOnMutationLink(opts),
    retryLink(opts.retry),
  ];
}
