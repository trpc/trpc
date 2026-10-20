import {
  noop,
  type QueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import type { QueryOptionsOut } from '@trpc12/tanstack-react-query';

// #region loader-query
/**
 * A query a route's loader started, for the route's components to read.
 * The loader decides when each request starts and whether the page waits
 * for it; components read what it started without naming the query again.
 */
export interface LoaderQuery<TData, TError> {
  readonly options: QueryOptionsOut<TData, TError, TData>;
}

/**
 * Starts a query and doesn't wait: the page renders, and the component
 * reading it suspends until it arrives.
 */
export function prefetch<TData, TError>(
  queryClient: QueryClient,
  options: QueryOptionsOut<TData, TError, TData>,
): LoaderQuery<TData, TError> {
  // Its error, if any, is the reading component's to throw.
  queryClient.query(options).catch(noop);
  return { options };
}

/**
 * Starts a query, or reads it from the cache however old, and the page
 * waits for it. Stale data refetches once a component reads it.
 */
export async function ensure<TData, TError>(
  queryClient: QueryClient,
  options: QueryOptionsOut<TData, TError, TData>,
): Promise<LoaderQuery<TData, TError>> {
  await queryClient.query({ ...options, staleTime: 'static' });
  return { options };
}

/**
 * The data of a query the loader started. It stays subscribed, so an
 * invalidation or a `setQueryData` re-renders with the new data.
 */
export function useLoaderQuery<TData, TError>(
  query: LoaderQuery<TData, TError>,
): TData {
  return useSuspenseQuery(query.options).data;
}
// #endregion loader-query
