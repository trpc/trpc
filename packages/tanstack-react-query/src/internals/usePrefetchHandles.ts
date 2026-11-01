import type { Query } from '@tanstack/react-query';
import * as React from 'react';
import type { RenderPrefetch } from './handles';
import { collectRenderPrefetches } from './handles';

/**
 * Queries a render started without data, until its mount commits. A
 * suspended render keeps no state, so this is how its retry knows the data it
 * finds is the load it just waited for, not cached data to revalidate.
 */
const waitedFor = new WeakSet<Query>();

const noStarts: ReadonlySet<string> = new Set();

function startPrefetch(prefetch: RenderPrefetch) {
  void (prefetch.kind === 'infinite'
    ? prefetch.queryClient.prefetchInfiniteQuery(prefetch.options)
    : prefetch.queryClient.prefetchQuery(prefetch.options));
}

function sameHashes(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  if (a.size !== b.size) {
    return false;
  }
  for (const hash of a) {
    if (!b.has(hash)) {
      return false;
    }
  }
  return true;
}

/**
 * Start queries during render and return their handles, for pages with no
 * route loader or server component to start them in. Call
 * `trpc.<path>.unstable_prefetch(input)` inside `start`, at the top of the
 * page, and pass the handles down: every query starts before any component
 * reads one.
 *
 * Each query starts once per mount and input. Like `unstable_prefetch` in a
 * loader, a query with cached data refetches in the background if it's stale.
 * Re-renders don't refetch.
 *
 * ```tsx
 * const trpc = useTRPC();
 * const { post, comments } = usePrefetchHandles(() => ({
 *   post: trpc.post.byId.unstable_prefetch({ id }),
 *   comments: trpc.post.comments.unstable_prefetchInfinite({ postId: id }),
 * }));
 * ```
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#use-prefetch-handles
 */
export function usePrefetchHandles<T>(start: () => T): T {
  const { result, prefetches } = collectRenderPrefetches(start);
  const [started, setStarted] = React.useState(noStarts);

  const hashes = new Set<string>();
  const queries: Query[] = [];
  for (const prefetch of prefetches) {
    const cache = prefetch.queryClient.getQueryCache();
    const { queryHash } = prefetch.queryClient.defaultQueryOptions(
      prefetch.options,
    );
    hashes.add(queryHash);
    const cached = cache.get(queryHash);
    if (!started.has(queryHash)) {
      if (cached?.state.data === undefined) {
        startPrefetch(prefetch);
        const query = cache.get(queryHash);
        if (query) {
          waitedFor.add(query);
        }
      } else if (!waitedFor.delete(cached)) {
        startPrefetch(prefetch);
      }
    }
    const query = cache.get(queryHash);
    if (query) {
      queries.push(query);
    }
  }
  if (!sameHashes(started, hashes)) {
    setStarted(hashes);
  }

  React.useEffect(() => {
    for (const query of queries) {
      waitedFor.delete(query);
    }
  });

  return result;
}
