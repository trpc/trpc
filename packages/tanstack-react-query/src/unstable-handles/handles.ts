import type { QueryClient } from '@tanstack/react-query';
import * as React from 'react';
import type {
  DecorateQueryProcedure,
  DecorateRouterKeyable,
} from '../internals/createOptionsProxy';
import type { ResolverDef } from '../internals/types';
import { queryClientOf, readProxy, readRoot } from './entry';
import { TRPCEntryError } from './entryError';
import { isServerEnvironment } from './handle';
import { beginEntries, handlesOfLoads, settledOf, startEntries } from './load';
import { attemptNow } from './outcome';
import { describeEntries } from './plan';
import { toTanStackEntries } from './shared';
import type {
  LoadedEntries,
  TanStackEntriesOnly,
  TRPCLoadEntries,
  TRPCLoadedHandles,
  TRPCSettledHandles,
} from './types';

/**
 * The entries of a load, as the load reads them. A proxy that isn't the root
 * throws, as it always has; entries it can't read are a failed outcome,
 * whatever was thrown, which makes the load reject
 */
function readLoad(opts: {
  trpc: unknown;
  fn: string;
  entries: Record<string, unknown>;
}) {
  const root = readRoot(opts.trpc, opts.fn);
  return {
    queryClient: queryClientOf(root),
    entries: attemptNow(() => toTanStackEntries(opts.entries)),
  };
}

export {
  prefetchEntry,
  fetchEntry,
  ensureEntry,
  prefetchInfiniteEntry,
  fetchInfiniteEntry,
  ensureInfiniteEntry,
} from './entry';
// The client's: what reads another entry's data, and what loads for every
// item of a list. Each query in them is a TanStack Query entry
export { experimental_dataOf, experimental_perItem } from '@trpc/client';
export { fromHandle, experimental_handleOfItem } from './handle';
export type {
  TRPCQueryHandle,
  TRPCInfiniteQueryHandle,
  AnyTRPCHandle,
  TRPCQueryEntry,
  TRPCInfiniteQueryEntry,
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
  experimental_inferQueryHandleOfItem,
  experimental_inferInfiniteQueryHandleOfItem,
  experimental_inferHandles,
} from './types';

/** A load that `useLoadHandles()` started, by what its entries are */
interface UsedLoad {
  handles: Record<string, unknown>;
  /** The components that have it and are on the page */
  mounts: number;
  /** The number of each symbol its description has */
  symbols: ReadonlyMap<symbol, number>;
}

/** The loads of a `QueryClient` that components have, by their description */
interface UsedLoads {
  byKey: Map<string, UsedLoad>;
  /**
   * The number of each symbol their descriptions have, which describes it the
   * same while one of them is kept. No other symbol is held
   */
  symbolIds: Map<symbol, number>;
}

const usedLoads = new WeakMap<QueryClient, UsedLoads>();

function usedLoadsOf(queryClient: QueryClient) {
  const loads = usedLoads.get(queryClient) ?? {
    byKey: new Map<string, UsedLoad>(),
    symbolIds: new Map<symbol, number>(),
  };
  usedLoads.set(queryClient, loads);
  return loads;
}

function keepLoad(loads: UsedLoads, key: string, load: UsedLoad) {
  loads.byKey.set(key, load);
  for (const [symbol, id] of load.symbols) {
    // Not over a number a newer load has for it, which its key has
    if (!loads.symbolIds.has(symbol)) {
      loads.symbolIds.set(symbol, id);
    }
  }
}

/** Lets go of a load, and of every symbol no load that is left has */
function dropLoad(loads: UsedLoads, key: string) {
  loads.byKey.delete(key);
  const kept = new Set(
    [...loads.byKey.values()].flatMap((load) => [...load.symbols.keys()]),
  );
  for (const symbol of loads.symbolIds.keys()) {
    if (!kept.has(symbol)) {
      loads.symbolIds.delete(symbol);
    }
  }
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
 * `experimental_perItem()`, doesn't start, and the load still resolves,
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
export function loadHandles<TEntries extends TRPCLoadEntries>(
  trpc: DecorateRouterKeyable<any>,
  entries: TEntries & TanStackEntriesOnly<TEntries>,
): Promise<TRPCLoadedHandles<LoadedEntries<TEntries>>> {
  const load = readLoad({ trpc, fn: 'loadHandles', entries });
  if (!load.entries.ok) {
    return Promise.reject(load.entries.error);
  }
  return startEntries({
    queryClient: load.queryClient,
    entries: load.entries.data,
    settle: false,
  }) as Promise<any>;
}

/**
 * Like `loadHandles()`, but it waits for every fetch and ensure entry to
 * settle and never rejects because one failed. Resolves to `[handles, results]`:
 * `results` has `{ status: 'success', data }` or `{ status: 'error', error }`,
 * with a `TRPCEntryError`, for every fetch and ensure entry.
 *
 * When a fetch or ensure entry fails, the entries that read its data with
 * `experimental_dataOf()` can't start. One that reads the data in its input has no
 * handle, and its result, if it has one, is the same error. One built from it
 * with `experimental_dataOf(entry, (data) => entry)` keeps its unfinished handle,
 * and its result, if it has one, is the same error. An
 * `experimental_perItem()` over it has no handle, and its result, if it has
 * one, is an empty list. So check the
 * results before you return the handles. If the failed entry is a prefetch entry,
 * which has no result to hold the error, the load rejects with it when another
 * entry needs its data for a handle or a result: one that reads it in its input,
 * or a fetch or ensure entry built from it with a callback. A prefetch entry
 * built from it with `experimental_dataOf(entry, (data) => entry)` doesn't start,
 * but the load still resolves, with that entry's unfinished handle. A prefetch
 * entry that nothing reads can fail without making it reject. A throw while it
 * starts an entry that reads no other entry, such as from
 * a `staleTime` function, still rejects, whatever the entry's kind. So does
 * what isn't a load it can start, before any entry starts: such as a bare
 * `experimental_query()`, or an entry that reads one that isn't in the load.
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
export function loadHandlesSettled<TEntries extends TRPCLoadEntries>(
  trpc: DecorateRouterKeyable<any>,
  entries: TEntries & TanStackEntriesOnly<TEntries>,
): Promise<TRPCSettledHandles<LoadedEntries<TEntries>>> {
  const load = readLoad({ trpc, fn: 'loadHandlesSettled', entries });
  if (!load.entries.ok) {
    return Promise.reject(load.entries.error);
  }
  return startEntries({
    queryClient: load.queryClient,
    entries: load.entries.data,
    settle: true,
  }) as Promise<any>;
}

/**
 * `loadHandles()` for a component on a page without a loader: an alternative
 * to a route loader, `getServerSideProps` or a server component. Call it at
 * the top of the page's component. It starts every entry, once, and returns
 * the handles at once, without waiting for any data. The components that get
 * them read the data, and wait for it in their Suspense boundary.
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
 * Unstable: it may change in a minor release.
 * @example
 * ```tsx
 * function PostPage(props: { id: string }) {
 *   const trpc = useTRPC();
 *   const post = prefetchEntry(trpc.post.byId, { id: props.id });
 *   const handles = useLoadHandles(trpc, {
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
export function useLoadHandles<TEntries extends TRPCLoadEntries>(
  trpc: DecorateRouterKeyable<any>,
  given: TEntries & TanStackEntriesOnly<TEntries>,
): TRPCLoadedHandles<LoadedEntries<TEntries>>[0] {
  const root = readRoot(trpc, 'useLoadHandles');
  const queryClient = queryClientOf(root);
  const entries = toTanStackEntries(given);
  const loads = usedLoadsOf(queryClient);
  const { key, symbols } = describeEntries({
    queryClient,
    entries,
    symbolIds: loads.symbolIds,
  });
  let used = loads.byKey.get(key);
  if (!used) {
    const started = beginEntries({
      queryClient,
      entries,
      now: 'useLoadHandles',
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
      symbols,
    };
    used = load;
    keepLoad(loads, key, load);
    Promise.all(started.allLoads.map(settledOf))
      // A component that never got on the page keeps nothing. One that is on
      // the page lets go of it as it leaves, and no timer holds it, or its
      // symbols, after that. A server renders the component but runs no
      // effect, so nothing is ever on the page there: the request's
      // `QueryClient` goes with the request, and a timer would only hold it
      // longer
      .finally(() => {
        if (!isServerEnvironment() && load.mounts === 0) {
          setTimeout(() => {
            if (load.mounts === 0 && loads.byKey.get(key) === load) {
              dropLoad(loads, key);
            }
          }, USED_LOAD_KEPT_MS);
        }
      })
      .catch(() => {
        // Surfaces where the handle is read
      });
  }
  const load = used;
  React.useEffect(() => {
    const kept = usedLoadsOf(queryClient);
    load.mounts++;
    // Back, if a development-mode remount took it away
    keepLoad(kept, key, load);
    return () => {
      load.mounts--;
      if (load.mounts === 0 && kept.byKey.get(key) === load) {
        // The component left the page: its next visit loads again
        dropLoad(kept, key);
      }
    };
  }, [load, queryClient, key]);
  return load.handles as any;
}
