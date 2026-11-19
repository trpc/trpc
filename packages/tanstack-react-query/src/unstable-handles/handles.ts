import type { QueryClient } from '@tanstack/react-query';
import * as React from 'react';
import type {
  DecorateQueryProcedure,
  DecorateRouterKeyable,
} from '../internals/createOptionsProxy';
import type { FeatureFlags, ResolverDef } from '../internals/types';
import { queryClientOf, readProxy, readRoot } from './entry';
import { TRPCEntryError } from './entryError';
import { isServerEnvironment } from './handle';
import { beginEntries, handlesOfLoads, settledOf, startEntries } from './load';
import { describeEntries } from './plan';
import type {
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
  experimental_dataOf,
  experimental_entryPerItem,
} from './entry';
export { fromHandle, experimental_handleOfItem } from './handle';
export type {
  TRPCQueryHandle,
  TRPCInfiniteQueryHandle,
  AnyTRPCHandle,
  TRPCQueryEntry,
  TRPCInfiniteQueryEntry,
  experimental_TRPCEntryPerItem,
  experimental_TRPCEntryFromData,
  experimental_TRPCQueryHandlePerItem,
  experimental_TRPCInfiniteQueryHandlePerItem,
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
  experimental_inferHandles,
} from './types';

/** A load that `experimental_useHandles()` started, by what its entries are */
interface UsedLoad {
  handles: Record<string, unknown>;
  /** The components that have it and are on the page */
  mounts: number;
}

const usedLoads = new WeakMap<QueryClient, Map<string, UsedLoad>>();

function usedLoadsOf(queryClient: QueryClient) {
  const loads = usedLoads.get(queryClient) ?? new Map<string, UsedLoad>();
  usedLoads.set(queryClient, loads);
  return loads;
}

/**
 * How long the handles of a load stay for a component that rendered and
 * isn't on the page: one that waits, in a Suspense boundary above it, for the
 * queries it started. It then renders again, and must not start them again.
 */
const USED_LOAD_KEPT_MS = 30_000;

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
 * soon as a fetch or ensure entry fails. A prefetch entry's failed request makes it
 * reject only if another entry needs its data for a handle or for data the load
 * waits for: one that reads it in its input with `experimental_dataOf(entry)`, or
 * a fetch or ensure entry built from it with `experimental_dataOf(entry, (data) => entry)`.
 * That is so also when the cache has data for it, such as from `setQueryData()`.
 * A prefetch entry built from it with a callback, or with
 * `experimental_entryPerItem()`, doesn't start, and the load still resolves,
 * with its unfinished handle. A throw while
 * it starts an entry that reads no other entry, such as from a `staleTime`
 * function, makes it reject too, whatever the entry's kind.
 * It rejects with a `TRPCEntryError`, except for an interruption, which it
 * rethrows as is: a cancelled query's `CancelledError`, or an error with a
 * `digest`, such as Next.js's `headers()` in a static render throws.
 *
 * Put TanStack Query's `skipToken` in place of an entry to start nothing for that
 * key: its handle is `undefined`, and `data` has no key for it.
 *
 * Takes the root of an options proxy, from `createTRPCOptionsProxy` or `useTRPC()`.
 * Call it in a route loader, a server component or an event handler, not during
 * render: every render would start the entries again.
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
  }) as Promise<any>;
}

/**
 * Like `loadHandles()`, but it waits for every fetch and ensure entry to
 * settle and never rejects because one failed. Resolves to `[handles, results]`:
 * `results` has `{ status: 'success', data }` or `{ status: 'error', error }`,
 * with a `TRPCEntryError`, for every fetch and ensure entry.
 *
 * When an entry fails, the entries that read its data with `experimental_dataOf()` can't
 * start, and a fetch or ensure entry among them has the same error as its result.
 * One that reads the data in its input, or an `experimental_entryPerItem()` over
 * it, has no handle. One built from it with
 * `experimental_dataOf(entry, (data) => entry)` keeps its unfinished handle. So check the
 * results before you return the handles. If the failed entry is a prefetch entry,
 * which has no result to hold the error, the load rejects with it when another
 * entry needs its data for a handle or a result: one that reads it in its input,
 * or a fetch or ensure entry built from it with a callback. A prefetch entry
 * built from it with `experimental_dataOf(entry, (data) => entry)` doesn't start,
 * but the load still resolves, with that entry's unfinished handle. A prefetch
 * entry that nothing reads can fail without making it reject. A throw while it
 * starts an entry that reads no other entry, such as from
 * a `staleTime` function, still rejects, whatever the entry's kind.
 *
 * An interruption still rejects, as it does with `loadHandles()`: a cancelled
 * query, such as an ensure entry's uncached fetch that `cancelQueries()` stops,
 * rejects with TanStack Query's `CancelledError`, and an error with a `digest`,
 * such as Next.js's `headers()` throws in a static render, is rethrown as is.
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
  }) as Promise<any>;
}

/**
 * `loadHandles()` for a client component that has no loader. Call it at the
 * top of the page's component: it starts every entry, once, and returns the
 * handles at once. The components that get them read the data, and wait for
 * it in their Suspense boundary.
 *
 * It waits for nothing, so no handle can have another entry's data in its
 * input. Build an entry that needs data with
 * `experimental_dataOf(entry, (data) => entry)`, and finish its handle where
 * the data is, with `experimental_handleOfItem(handle, data)`. It throws for an
 * entry whose handle would need data.
 *
 * It starts the entries again when they change, such as with another id, and
 * when the component comes back to the page. Rendering again starts nothing.
 * Entries are compared by value, as query keys are: the procedure, the input,
 * and the options that say how a query starts, such as `staleTime`. Build them
 * from values that stay the same from render to render, such as props.
 *
 * Experimental: it may change in a minor release.
 * @example
 * ```tsx
 * function PostPage(props: { id: string }) {
 *   const trpc = useTRPC();
 *   const post = prefetchEntry(trpc.post.byId, { id: props.id });
 *   const handles = experimental_useHandles(trpc, {
 *     post,
 *     author: experimental_dataOf(post, (it) =>
 *       prefetchEntry(trpc.author.byId, { id: it.authorId }),
 *     ),
 *   });
 *   return (
 *     <Suspense fallback={<p>Loading…</p>}>
 *       <Post post={handles.post} author={handles.author} />
 *     </Suspense>
 *   );
 * }
 * ```
 * @see https://trpc.io/docs/client/tanstack-react-query/nested-queries#without-a-loader
 */
export const experimental_useHandles = useHandles;

function useHandles<
  TFeatureFlags extends FeatureFlags,
  TEntries extends TRPCLoadEntries,
>(
  trpc: DecorateRouterKeyable<TFeatureFlags>,
  entries: TEntries,
): TRPCLoadedHandles<TEntries>[0] {
  const queryClient = queryClientOf(readRoot(trpc, 'experimental_useHandles'));
  const key = describeEntries({ queryClient, entries });
  const loads = usedLoadsOf(queryClient);
  let used = loads.get(key);
  if (!used) {
    const started = beginEntries({
      queryClient,
      entries,
      now: 'experimental_useHandles',
    });
    const load: UsedLoad = {
      handles: handlesOfLoads({
        tree: started.tree,
        handleOfLeaf: new Map(
          started.allLoads.map((entryLoad) => [
            entryLoad.leaf,
            entryLoad.handleNow(),
          ]),
        ),
      }),
      mounts: 0,
    };
    used = load;
    loads.set(key, load);
    // A component that never got on the page keeps nothing. On a server, the
    // request's `QueryClient` goes with the request
    void Promise.all(started.allLoads.map(settledOf)).then(() => {
      if (!isServerEnvironment()) {
        setTimeout(() => {
          if (load.mounts === 0 && loads.get(key) === load) {
            loads.delete(key);
          }
        }, USED_LOAD_KEPT_MS);
      }
    });
  }
  const load = used;
  React.useEffect(() => {
    const kept = usedLoadsOf(queryClient);
    load.mounts++;
    // Back, if a development-mode remount took it away
    kept.set(key, load);
    return () => {
      load.mounts--;
      if (load.mounts === 0 && kept.get(key) === load) {
        // The component left the page: its next visit loads again
        kept.delete(key);
      }
    };
  }, [load, queryClient, key]);
  return load.handles as any;
}
