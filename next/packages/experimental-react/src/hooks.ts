import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { QueryPromise } from './client.ts';
import {
  ownerOf,
  type QueryEntry,
  type QuerySnapshot,
  type QueryStore,
} from './store.ts';

const lookup = (
  promise: Promise<unknown>,
): { store: QueryStore; entry: QueryEntry } => {
  const owner = ownerOf(promise);
  const entry = owner?.store.entryOf(promise);
  if (!owner || !entry) {
    throw new TypeError(
      "useQuery() takes a promise from a React client's .query()",
    );
  }
  return { store: owner.store, entry };
};

const useEntry = (promise: Promise<unknown>) => {
  const { store, entry } = lookup(promise);
  const subscribe = useCallback(
    (onChange: () => void) => store.subscribe(entry, onChange),
    [store, entry],
  );
  useEffect(() => store.mount(entry), [store, entry]);
  return { store, entry, subscribe };
};

/**
 * Reads the query a promise from `.query()` belongs to, and returns its
 * current promise for `use()`. The component re-renders when the data
 * changes (a refetch, `setData`); the promise stays the same object while
 * it doesn't. While mounted, the entry is kept and links such as
 * `refetchOnMountLink()` see it.
 *
 * @example
 * ```tsx
 * function Post(props: { post: QueryPromise<Post> }) {
 *   const post = use(useQuery(props.post));
 *   return <h1>{post.title}</h1>;
 * }
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function useQuery<T, E>(
  promise: QueryPromise<T, E>,
): QueryPromise<T, E> {
  const slot = useEntry(promise);
  const read = () => slot.entry.promise as QueryPromise<T, E>;
  return useSyncExternalStore(slot.subscribe, read, read);
}

/**
 * What {@link useQueryState} returns.
 * @since 0.1.0
 * @stability experimental
 */
export interface QueryState extends QuerySnapshot {
  /** Refetches now. Resolves when the request settles; never rejects. */
  refetch(): Promise<void>;
}

/**
 * The fetching state of the query a promise belongs to, for spinners and
 * retry buttons. Re-renders on every change, so read it apart from the data.
 *
 * @example
 * ```tsx
 * const { isFetching, refetch } = useQueryState(props.post);
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function useQueryState(promise: Promise<unknown>): QueryState {
  const slot = useEntry(promise);
  const read = () => slot.entry.snapshot;
  const snapshot = useSyncExternalStore(slot.subscribe, read, read);
  return { ...snapshot, refetch: () => slot.store.refetch(slot.entry) };
}
