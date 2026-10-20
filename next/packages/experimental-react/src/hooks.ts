import { Duration, identity } from 'effect';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { QueryPromise } from './client.ts';
import { replaceEqualDeep } from './share.ts';
import {
  ownerOf,
  type QueryEntry,
  type QuerySnapshot,
  type QueryStore,
} from './store.ts';
import { fulfilled, pending, rejected, type Thenable } from './thenable.ts';

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
 * Options for {@link useQuery}.
 * @since 0.1.0
 * @stability experimental
 */
export interface UseQueryOptions<T, U = T> {
  /**
   * Picks what the component reads from the data. The result is shared
   * structurally with the last one, so the returned promise stays the same
   * object, and the component doesn't re-render, while the picked part
   * doesn't change, even when the rest of the data does.
   */
  select?: ((data: T) => U) | undefined;
  /**
   * Polls: refetches the query this long after each request settles, while
   * the component is mounted. While the page is hidden it waits, and
   * refetches once the page is visible again. Milliseconds, a string like
   * `'10 seconds'` or a `Duration`; `false` or `undefined` doesn't poll.
   */
  refetchInterval?: Duration.Input | false | undefined;
}

type Select = (data: unknown) => unknown;

/** A component's last selection, so equal picks keep their promise. */
interface Selection {
  source: Thenable<unknown> | undefined;
  select: Select | undefined;
  /** The `select` of the latest render, which a pending source resolves with. */
  latest: Select;
  result: Thenable<unknown> | undefined;
}

const keep = (
  prev: Thenable<unknown> | undefined,
  value: unknown,
): Thenable<unknown> => {
  if (prev?.status !== 'fulfilled') return fulfilled(value);
  const shared = replaceEqualDeep(prev.value, value);
  return shared === prev.value ? prev : fulfilled(shared);
};

const selectFrom = (
  memo: Selection,
  source: Thenable<unknown>,
  select: Select,
): Thenable<unknown> => {
  memo.latest = select;
  if (
    memo.result &&
    memo.source === source &&
    (memo.select === select || source.status === 'pending')
  )
    return memo.result;
  let result: Thenable<unknown>;
  if (source.status === 'rejected') result = source;
  else if (source.status === 'fulfilled') {
    try {
      result = keep(memo.result, select(source.value));
    } catch (error) {
      result = rejected(error);
    }
  } else {
    const deferred = pending<unknown>();
    source.then(
      (value) => {
        try {
          deferred.resolve(memo.latest(value));
        } catch (error) {
          deferred.reject(error);
        }
      },
      (error: unknown) => deferred.reject(error),
    );
    result = deferred.promise;
  }
  memo.source = source;
  memo.select = select;
  memo.result = result;
  return result;
};

/**
 * Reads the query a promise from `.query()` belongs to, and returns its
 * current promise for `use()`. The component re-renders when the data
 * changes (a refetch, `setData`); the promise stays the same object while
 * it doesn't. While mounted, the entry is kept and links such as
 * `refetchOnMountLink()` see it. With `select`, it returns a promise of the
 * picked part, and re-renders only when that part changes. With
 * `refetchInterval`, it polls while mounted.
 *
 * @example
 * ```tsx
 * function Post(props: { post: QueryPromise<Post> }) {
 *   const post = use(useQuery(props.post));
 *   return <h1>{post.title}</h1>;
 * }
 *
 * function LiveTitle(props: { post: QueryPromise<Post> }) {
 *   const title = use(
 *     useQuery(props.post, {
 *       select: (post) => post.title,
 *       refetchInterval: '10 seconds',
 *     }),
 *   );
 *   return <h1>{title}</h1>;
 * }
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function useQuery<T, E, U = T>(
  promise: QueryPromise<T, E>,
  opts?: UseQueryOptions<T, U>,
): QueryPromise<U, E> {
  const slot = useEntry(promise);
  const [memo] = useState<Selection>(() => ({
    source: undefined,
    select: undefined,
    latest: identity,
    result: undefined,
  }));
  const every = opts?.refetchInterval;
  const interval =
    every === undefined || every === false ? 0 : Duration.toMillis(every);
  useEffect(
    () => slot.store.poll(slot.entry, interval),
    [slot.store, slot.entry, interval],
  );
  const select = opts?.select as Select | undefined;
  const read = () => {
    const source = slot.entry.promise;
    return (select ? selectFrom(memo, source, select) : source) as QueryPromise<
      U,
      E
    >;
  };
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
