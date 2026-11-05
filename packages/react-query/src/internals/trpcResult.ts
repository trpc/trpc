import type { Query, QueryClient, QueryState } from '@tanstack/react-query';
import * as React from 'react';
import type { TRPCQueryOptionsResult } from '../shared';
import type { TRPCHookResult } from '../shared/hooks/types';
import type { TRPCQueryKey } from './getQueryKey';

export function createTRPCOptionsResult(value: {
  path: readonly string[];
}): TRPCQueryOptionsResult['trpc'] {
  const path = value.path.join('.');

  return {
    path,
  };
}

/**
 * Makes a stable reference of the `trpc` prop
 */
export function useHookResult(value: {
  path: readonly string[];
}): TRPCHookResult['trpc'] {
  const result = createTRPCOptionsResult(value);
  return React.useMemo(() => result, [result]);
}

/**
 * The query at the hash the client gives this key, which is where a query
 * built from tRPC's options is, unless it has its own `queryHash` or
 * `queryKeyHashFn`.
 */
function getQueryAtKeyHash(opts: {
  client: QueryClient;
  queryKey: TRPCQueryKey;
}) {
  try {
    const { queryHash } = opts.client.defaultQueryOptions({
      queryKey: opts.queryKey,
    });
    return opts.client.getQueryCache().get(queryHash);
  } catch {
    // only the query's own `queryKeyHashFn` can hash this key
    return undefined;
  }
}

/**
 * Finds the query running this fetch, so that its stream only writes while
 * TanStack Query still waits for that fetch. Call it before the request starts,
 * as an older request can answer last. Takes what it needs from the query
 * function's context, as reading its `signal` would change what unmounting does.
 * @internal
 */
export function trackQueryFetch(opts: {
  /** The query function's context. One built by hand can lack `client`. */
  context: { client: QueryClient | undefined; queryKey: TRPCQueryKey };
  /** Where chunks went before tracking; still used when there's no `client`. */
  fallback: { client: QueryClient; queryKey: TRPCQueryKey };
}) {
  const client = opts.context.client;
  if (!client) {
    // a context built by hand: write as before, untracked
    const { fallback } = opts;
    const build = () =>
      fallback.client
        .getQueryCache()
        .build(fallback.client, { queryKey: fallback.queryKey });
    let built: ReturnType<typeof build> | undefined;
    return {
      write(state: Partial<QueryState>) {
        built ??= build();
        built.setState(state);
      },
    };
  }

  const cache = client.getQueryCache();
  // A `Query` gives its fetches its own key array, so this compares the array.
  // A wrapper that passes a copy of the key gets no live chunks, and still the
  // whole stream as the fetch's result.
  const isOwn = (query: Query) => query.queryKey === opts.context.queryKey;
  const isFetching = (query: Query) => query.state.fetchStatus !== 'idle';

  // The query is usually at the hash its client gives the key: a cheap lookup.
  // One with its own `queryHash` or `queryKeyHashFn` is elsewhere, so a miss
  // looks through the cache. A hit can be the wrong query when a spread gave
  // this key array to one with its own `queryHash`, so a stream checks once,
  // at its first write, that no other query has the array. That check can't
  // see such a query once it has left the cache: if this is its fetch and it
  // was removed before the stream started, the chunks reach the query at this
  // hash while that query's fetch runs. The final result is unaffected.
  let query = getQueryAtKeyHash({ client, queryKey: opts.context.queryKey });
  let checkShared = true;
  if (!query || !isOwn(query) || !isFetching(query)) {
    // A fetch that can't tell which query is its own writes to none.
    const queries = cache.findAll({
      predicate: (it) => isOwn(it) && isFetching(it),
    });
    query = queries.length === 1 ? queries[0] : undefined;
    checkShared = false;
  }
  // Each fetch has its own promise, which a refetch replaces, and cancelling or
  // resetting the query stops the writes too. A silent cancel without `revert`,
  // `cancelQueries(filters, { silent: true, revert: false })`, differs. On
  // TanStack Query 5.80 the query keeps the promise, so the stream goes on
  // writing, as before this change. On 5.105 and later the promise is dropped:
  // the writes stop and the query stays fetching with the data it had, the
  // state TanStack leaves after a silent cancel, where before they went on.
  const fetchPromise = query?.promise;

  return {
    write(state: Partial<QueryState>) {
      if (checkShared) {
        // only streams write, so only they pay for looking through the cache
        checkShared = false;
        const shared = cache.findAll({
          predicate: (it) => isOwn(it) && it !== query,
        });
        if (shared.length > 0) {
          query = undefined;
        }
      }
      if (query && query.promise === fetchPromise && isFetching(query)) {
        query.setState(state);
      }
    },
  };
}

/**
 * Always reads to the end: leaving the loop would abort an older stream on the
 * server, which only `abortOnUnmount` asks for, and the return value is the
 * fetch's result.
 * @internal
 */
export async function buildQueryFromAsyncIterable(
  asyncIterable: AsyncIterable<unknown>,
  queryFetch: ReturnType<typeof trackQueryFetch>,
) {
  queryFetch.write({
    data: [],
    status: 'success',
  });

  const aggregate: unknown[] = [];
  for await (const value of asyncIterable) {
    aggregate.push(value);

    queryFetch.write({
      data: [...aggregate],
    });
  }
  return aggregate;
}
