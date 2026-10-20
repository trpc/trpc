/**
 * tRPC for React's `use()`, render-as-you-fetch: loaders start queries,
 * components read the promises. Promises are stable: one per query while
 * it loads, the same object while its data doesn't change. Everything
 * else (caching, structural sharing, refetching on mount, focus and
 * reconnect, retries, invalidation after mutations) is a link, opt-in one
 * by one or all at once with `standardLinks()`. Every export is
 * experimental, as the package name says.
 *
 * @example
 * ```tsx
 * import { createReactClient, standardLinks, useQuery } from '@trpc12/experimental-react';
 *
 * export const trpc = createReactClient({
 *   router: routerType<AppRouter>(),
 *   links: [...standardLinks(), httpLink({ url: '/trpc' })],
 * });
 *
 * const post = trpc.post.byId.query({ id }); // in a loader
 * const data = use(useQuery(post)); // in the component
 * ```
 * @module
 */
export {
  createReactClient,
  type DecorateQuery,
  type QueryPromise,
  type ReactClient,
  type ReactClientOptions,
  type ReactProcedures,
} from './client.ts';
export {
  useQuery,
  useQueryState,
  type QueryState,
  type UseQueryOptions,
} from './hooks.ts';
export {
  dehydrate,
  hydrate,
  type DehydratedQueries,
  type HydrationOptions,
} from './hydration.ts';
export {
  cacheLink,
  invalidateOnMutationLink,
  refetchOnMountLink,
  refetchOnReconnectLink,
  refetchOnWindowFocusLink,
  standardLinks,
  structuralSharingLink,
  type CacheLinkOptions,
  type InvalidateOnMutationLinkOptions,
  type StandardLinks,
  type StandardLinksOptions,
} from './links.ts';
export {
  queryKey,
  withQueryFeature,
  type QueryEntry,
  type QueryFeature,
  type QueryFilter,
  type QuerySnapshot,
  type QueryStore,
} from './store.ts';
export type { Thenable } from './thenable.ts';
