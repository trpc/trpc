import type { QueryClient } from '@tanstack/react-query';
import { isCancelledError, skipToken } from '@tanstack/react-query';
import { readQueryKey } from '../internals/utils';
import type { EntryState } from './entry';
import { readEntry } from './entry';
import { TRPCEntryError, entryCause } from './entryError';
import { toHandle } from './handle';
import type { TRPCLoadEntries } from './types';

export function startEntry(queryClient: QueryClient, state: EntryState) {
  const { options } = state;
  if (state.type === 'infinite') {
    switch (state.kind) {
      case 'prefetch':
        return queryClient.prefetchInfiniteQuery(options);
      case 'ensure':
        return queryClient.ensureInfiniteQueryData({
          ...options,
          revalidateIfStale: true,
        });
      case 'fetch':
        return queryClient.fetchInfiniteQuery(options);
    }
  }
  switch (state.kind) {
    case 'prefetch':
      return queryClient.prefetchQuery(options);
    case 'ensure':
      return queryClient.ensureQueryData({
        ...options,
        revalidateIfStale: true,
      });
    case 'fetch':
      return queryClient.fetchQuery(options);
  }
}

/**
 * Next.js signals control flow, such as `headers()` in a static render, by
 * throwing an error with a `digest`, and reads it off the error the page throws.
 */
function hasDigest(error: unknown): error is Error & { digest: string } {
  return (
    error instanceof Error &&
    typeof (error as { digest?: unknown }).digest === 'string'
  );
}

function toEntryError(key: string, state: EntryState, error: unknown) {
  // Not failures of the entry: pass them on as they are
  if (isCancelledError(error) || hasDigest(error)) {
    return error;
  }
  return new TRPCEntryError({
    key,
    path: readQueryKey(state.options.queryKey).path.join('.'),
    ...entryCause(error),
  });
}

function settleLoad(promise: Promise<unknown>) {
  return promise.then(
    (data) => ({ status: 'success', data }),
    (error: unknown) => {
      if (error instanceof TRPCEntryError) {
        return { status: 'error', error };
      }
      throw error;
    },
  );
}

/** The entries to start, by their keys, without the `skipToken` ones */
export function readEntries(
  queryClient: QueryClient,
  entries: TRPCLoadEntries,
) {
  return Object.entries(entries).flatMap(([key, entry]) => {
    if (entry === skipToken) {
      return [];
    }
    const state = readEntry(key, entry);
    if (state.queryClient !== queryClient) {
      throw new Error(
        `The entry for "${key}" was built with a proxy for another QueryClient than the root proxy that loads it`,
      );
    }
    return [[key, state] as const];
  });
}

export async function startEntries(opts: {
  queryClient: QueryClient;
  entries: TRPCLoadEntries;
  /** Resolve each waited entry to a `TRPCEntryResult` instead of rejecting */
  settle: boolean;
}) {
  const { queryClient } = opts;
  const states = readEntries(queryClient, opts.entries);
  const loads = states.map(([key, state]) => ({
    key,
    state,
    promise: startEntry(queryClient, state).catch((error: unknown) => {
      throw toEntryError(key, state, error);
    }),
  }));
  const waited = loads.filter((load) => load.state.kind !== 'prefetch');
  const results = await Promise.all(
    waited.map((load) =>
      opts.settle ? settleLoad(load.promise) : load.promise,
    ),
  );

  // A skipped key is absent rather than `undefined`: Next.js rejects `undefined` in props
  const handles = Object.fromEntries(
    loads.map((load) => [
      load.key,
      toHandle(load.state.options, load.state.type),
    ]),
  );
  const data = Object.fromEntries(
    waited.map((load, index) => [load.key, results[index]]),
  );
  return [handles, data] as const;
}
