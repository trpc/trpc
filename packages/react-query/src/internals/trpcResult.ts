import {
  experimental_streamedQuery as streamedQuery,
  type QueryClient,
  type QueryFunctionContext,
  type QueryKey,
} from '@tanstack/react-query';
import * as React from 'react';
import type { TRPCQueryOptionsResult } from '../shared';
import type { TRPCHookResult } from '../shared/hooks/types';

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
 * Streams a procedure's async iterable into the query with TanStack Query's
 * `streamedQuery`, which stops writing to the cache once the fetch is
 * cancelled or replaced by a refetch.
 * @internal
 */
export async function streamIntoQuery(opts: {
  iterable: AsyncIterable<unknown>;
  context: QueryFunctionContext<QueryKey>;
  queryClient: QueryClient;
  /** Aborts the request, for a stream that isn't read to the end. */
  abortController: AbortController;
}) {
  // a context built by hand can lack `client`; a real one is passed as is, as
  // spreading it would read `signal` and make unmounting cancel the query
  const context = opts.context.client
    ? opts.context
    : { ...opts.context, client: opts.queryClient };
  let finished = false;
  const { iterable } = opts;
  async function* readToEnd() {
    yield* iterable;
    finished = true;
  }
  try {
    return await streamedQuery<unknown>({ streamFn: readToEnd })(context);
  } finally {
    // `streamedQuery` stops reading, or never starts, once the fetch is
    // cancelled: abort the request so the server stops streaming too
    if (!finished) {
      opts.abortController.abort();
    }
  }
}
