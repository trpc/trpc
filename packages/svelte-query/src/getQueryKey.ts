/**
 * Query types.
 */
export type QueryType = 'query' | 'infinite'

/**
 * Query key to identify procedure output data in the QueryClient.
 */
export type QueryKey = [string[]?, { input?: unknown; type?: QueryType }?]

/**
 * `QueryType` of each method. Unassigned methods don't have a query type.
 */
const MethodQueryTypes: Record<string, QueryType> = {
  getQueryKey: 'query',
  fetch: 'query',
  prefetch: 'query',
  getData: 'query',
  ensureData: 'query',
  setData: 'query',
  getState: 'query',
  isFetching: 'query',
  createQuery: 'query',

  getInfiniteQueryKey: 'infinite',
  fetchInfinite: 'infinite',
  prefetchInfinite: 'infinite',
  getInfiniteData: 'infinite',
  ensureInfiniteData: 'infinite',
  setInfiniteData: 'infinite',
  getInfiniteState: 'infinite',
  createInfiniteQuery: 'infinite',
}

/**
 * Keys of `MethodQueryTypes` are methods that allow input.
 */
const MethodInputs = Object.keys(MethodQueryTypes)

/**
 * Construct a `QueryKey` that is easy to destructure and flexible for partial selecting
 * to easily control groups of related queries, e.g. invalidating all queries of a router.
 * Use an array as the path when storing in tanstack query.
 * @see {@link https://github.com/trpc/trpc/issues/3128}
 *
 * @remarks This function doesn't need to convert legacy formats, unlike the one from react-query.
 *
 * @param path The tRPC path represented as a string array.
 * @param input The query input.
 * @param method The svelte-query method. i.e. the last key found in a `recursiveProxy` path.
 */
export function getQueryKey(pathArray: string[], input: unknown, method: string): QueryKey {
  const hasInput = typeof input !== 'undefined' && MethodInputs.includes(method)

  const type = MethodQueryTypes[method]

  const hasType = !!type

  /**
   * For `utils.invalidate()` to match all queries (including vanilla react-query),
   * we don't want nested array if path is empty, i.e. `[]` instead of `[[]]`.
   */
  if (!hasInput && !hasType) return pathArray.length ? [pathArray] : []

  return [pathArray, { ...(hasInput && { input }), ...(hasType && { type }) }]
}
