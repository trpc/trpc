import type { QueryClient } from '@tanstack/react-query';
import { hashKey } from '@tanstack/react-query';
import * as React from 'react';
import type {
  DecorateQueryProcedure,
  DecorateRouterKeyable,
} from '../internals/createOptionsProxy';
import type { FeatureFlags, ResolverDef } from '../internals/types';
import { queryClientOf, readProxy, readRoot } from './entry';
import { TRPCEntryError } from './entryError';
import { toHandle } from './handle';
import { readEntries, startEntries, startEntry } from './load';
import type {
  TRPCInfiniteEntryOptions,
  TRPCLoadEntries,
  TRPCLoadedHandles,
  TRPCSettledHandles,
} from './types';

export {
  prefetchEntry,
  fetchEntry,
  ensureEntry,
  prefetchInfiniteEntry,
  fetchInfiniteEntry,
  ensureInfiniteEntry,
} from './entry';
export { fromHandle } from './handle';
export type {
  TRPCQueryHandle,
  TRPCInfiniteQueryHandle,
  AnyTRPCHandle,
  TRPCQueryEntry,
  TRPCInfiniteQueryEntry,
  AnyTRPCEntry,
  TRPCEntryKind,
  TRPCLoadEntries,
  TRPCLoadedHandles,
  TRPCSettledHandles,
  TRPCEntryResult,
  TRPCEntryOptions,
  TRPCInfiniteEntryOptions,
  inferQueryHandle,
  inferInfiniteQueryHandle,
} from './types';

/**
 * Whether `error` is a failed entry from `loadHandles()`. Pass a procedure to
 * check that the entry was for it, which types `error.cause` with its errors.
 * @example
 * ```ts
 * const [handles] = await loadHandles(trpc, {
 *   post: ensureEntry(trpc.post.byId, { id }),
 * }).catch((error: unknown) => {
 *   if (isTRPCEntryError(error, trpc.post.byId) && error.code === 'NOT_FOUND') {
 *     throw notFound();
 *   }
 *   throw error;
 * });
 * ```
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#errors-ensure
 */
export function isTRPCEntryError<TDef extends ResolverDef>(
  error: unknown,
  procedure: DecorateQueryProcedure<TDef>,
): error is TRPCEntryError<TDef>;
export function isTRPCEntryError(error: unknown): error is TRPCEntryError;
export function isTRPCEntryError(error: unknown, procedure?: unknown) {
  if (!(error instanceof TRPCEntryError)) {
    return false;
  }
  return (
    procedure === undefined ||
    error.path === readProxy(procedure, 'isTRPCEntryError').path.join('.')
  );
}

/**
 * Starts every entry before it waits for any, so the order of the entries doesn't
 * matter. Resolves to `[handles, data]` once every fetch and ensure entry has data:
 * a handle for every entry, and the data of the fetch and ensure entries. Rejects as
 * soon as a fetch or ensure entry fails. Prefetch entries never make it reject.
 * It rejects with a `TRPCEntryError`, except for an error with a `digest`, such as
 * Next.js's `headers()` in a static render throws, which it rethrows as is.
 *
 * Put TanStack Query's `skipToken` in place of an entry to start nothing for that
 * key: its handle is `undefined`, and `data` has no key for it.
 *
 * Takes the root of an options proxy, from `createTRPCOptionsProxy` or `useTRPC()`.
 * Call it in a route loader, a server component or an event handler, not during
 * render: every render would start the entries again. On a page without a
 * loader, call `useLoadHandles()` in its component.
 * @example
 * ```ts
 * const [handles, data] = await loadHandles(trpc, {
 *   comments: prefetchInfiniteEntry(trpc.post.comments, { postId: id }),
 *   post: ensureEntry(trpc.post.byId, { id }),
 *   draft: viewer.isAdmin ? prefetchEntry(trpc.post.draftById, { id }) : skipToken,
 * });
 * if (!data.post.published) throw notFound();
 * return handles;
 * ```
 * @see https://trpc.io/docs/client/tanstack-react-query/handles
 */
export function loadHandles<
  TFeatureFlags extends FeatureFlags,
  TEntries extends TRPCLoadEntries,
>(
  trpc: DecorateRouterKeyable<TFeatureFlags>,
  entries: TEntries,
): Promise<TRPCLoadedHandles<TEntries>> {
  return startEntries({
    queryClient: queryClientOf(readRoot(trpc, 'loadHandles')),
    entries,
    settle: false,
  }) as Promise<TRPCLoadedHandles<TEntries>>;
}

/**
 * Like `loadHandles()`, but it waits for every fetch and ensure entry to
 * settle and never rejects because one failed. Resolves to `[handles, results]`:
 * `results` has `{ status: 'success', data }` or `{ status: 'error', error }`,
 * with a `TRPCEntryError`, for every fetch and ensure entry.
 *
 * A cancelled query, or an error with a `digest` such as Next.js's `headers()`
 * in a static render throws, still rejects, as it does with `loadHandles()`.
 * @example
 * ```ts
 * const [handles, results] = await loadHandlesSettled(trpc, {
 *   post: ensureEntry(trpc.post.byId, { id }),
 *   comments: prefetchInfiniteEntry(trpc.post.comments, { postId: id }),
 * });
 * if (results.post.status === 'error') {
 *   if (results.post.error.code === 'NOT_FOUND') throw notFound();
 *   throw results.post.error;
 * }
 * ```
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#errors-as-values
 */
export function loadHandlesSettled<
  TFeatureFlags extends FeatureFlags,
  TEntries extends TRPCLoadEntries,
>(
  trpc: DecorateRouterKeyable<TFeatureFlags>,
  entries: TEntries,
): Promise<TRPCSettledHandles<TEntries>> {
  return startEntries({
    queryClient: queryClientOf(readRoot(trpc, 'loadHandlesSettled')),
    entries,
    settle: true,
  }) as Promise<TRPCSettledHandles<TEntries>>;
}

/** What `QueryClient.defaultQueryOptions()` takes: the options proxy built them */
type QueryOptionsToDefault = Parameters<QueryClient['defaultQueryOptions']>[0];

/** The options of an entry that say how its query starts */
const startOptions = [
  'staleTime',
  'retry',
  'retryDelay',
  'gcTime',
  'pages',
  // Whether there is one: without it, an infinite query loads no page after
  // its first, and a load with `pages` fails
  'getNextPageParam',
] as const satisfies readonly (keyof TRPCInfiniteEntryOptions<ResolverDef>)[];

/**
 * A start option as a string. `undefined` and `Infinity` have no JSON, and
 * would read the same as `null`. Which function an option is isn't compared:
 * an inline one is new on every render.
 */
function describeOption(value: unknown) {
  return typeof value === 'function'
    ? 'function'
    : `${typeof value}:${String(value)}`;
}

/**
 * `loadHandles()` for a component on a page without a loader: an alternative
 * to a route loader, `getServerSideProps` or a server component. Call it at
 * the top of the page's component. It starts every entry, once, and returns
 * the handles at once, without waiting for any data. The components that get
 * them read the data, and wait for it in their Suspense boundary.
 *
 * Nothing waits for a fetch or ensure entry, so their errors surface where the
 * handle is read, as a prefetch entry's do. Rendering doesn't start a query
 * that failed again: resetting the reader's error boundary retries it. The entry's kind still says how
 * its query starts: `ensureEntry` uses any cached data, `fetchEntry` fetches
 * unless the data is fresh.
 *
 * It starts the entries again when they change, such as with another id, and
 * when the component comes back to the page. Rendering again starts nothing.
 * A component that renders again before it is on the page, such as after a
 * Suspense boundary above it waited, starts them again, as a loader that runs
 * again does: a query that is loading or has fresh data asks for nothing.
 * Entries are compared by value, as query keys are: the procedure, the input,
 * and the options that say how a query starts, such as `staleTime`. Build them
 * from values that stay the same from render to render, such as props.
 *
 * Unstable: it may change in a minor release.
 * @example
 * ```tsx
 * function PostPage(props: { id: string }) {
 *   const trpc = useTRPC();
 *   const handles = useLoadHandles(trpc, {
 *     post: prefetchEntry(trpc.post.byId, { id: props.id }),
 *     comments: prefetchInfiniteEntry(trpc.post.comments, { postId: props.id }),
 *   });
 *   return (
 *     <Suspense fallback={<p>Loading…</p>}>
 *       <Post post={handles.post} />
 *       <Comments comments={handles.comments} />
 *     </Suspense>
 *   );
 * }
 * ```
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#without-a-loader
 */
export function useLoadHandles<
  TFeatureFlags extends FeatureFlags,
  TEntries extends TRPCLoadEntries,
>(
  trpc: DecorateRouterKeyable<TFeatureFlags>,
  entries: TEntries,
): TRPCLoadedHandles<TEntries>[0] {
  const queryClient = queryClientOf(readRoot(trpc, 'useLoadHandles'));
  const states = readEntries(queryClient, entries);
  // By name, as an object: `hashKey` sorts its keys, so the order of the
  // entries doesn't make another load
  const key = hashKey([
    Object.fromEntries(
      states.map(([name, state]) => [
        name,
        [
          state.kind,
          state.type,
          // As the cache hashes it, with the `queryKeyHashFn` it is set up
          // with: the keys it tells apart are other queries
          queryClient.defaultQueryOptions(
            state.options as unknown as QueryOptionsToDefault,
          ).queryHash,
          // Not all of the options: `meta` can hold what has no JSON, or what
          // is new on every render
          startOptions.map((option) => describeOption(state.options[option])),
          // Not the first cursor: TanStack Query keys a query without it
        ],
      ]),
    ),
  ]);
  const start = () => {
    Promise.all(
      states
        // Rendering doesn't start a query that failed again: its reader
        // throws, and its error boundary retries it. A page whose Suspense
        // boundary is above it renders again from nothing once the query
        // fails, and would start it again, forever
        .filter(([, state]) => {
          const query = queryClient.getQueryState(state.options.queryKey);
          return !(query?.status === 'error' && query.fetchStatus === 'idle');
        })
        .map(([, state]) => startEntry(queryClient, state)),
    ).catch(() => {
      // Surfaces where the handle is read
    });
    const handles: Record<string, unknown> = Object.fromEntries(
      states.map(([name, state]) => [
        name,
        toHandle(state.options, state.type),
      ]),
    );
    return {
      key,
      queryClient,
      handles: handles as TRPCLoadedHandles<TEntries>[0],
    };
  };
  // Kept while the component is on the page, also through a render React
  // throws away, as when a reader suspends to a boundary above the page. A
  // component that renders again before it is on the page has none, and
  // starts the entries again, as a loader that runs again does: a query that
  // is loading or has fresh data asks for nothing
  const loadRef = React.useRef<ReturnType<typeof start>>(null);
  if (
    loadRef.current?.key !== key ||
    // Another `QueryClient`'s cache has none of the queries
    loadRef.current.queryClient !== queryClient
  ) {
    loadRef.current = start();
  }
  return loadRef.current.handles;
}
