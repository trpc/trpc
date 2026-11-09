import { Duration, identity } from 'effect';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { TrpcPromise } from '@trpc12/trpc/client';
import { procedureOf, type QueryPromise } from './client.ts';
import { ownInvalidates, revalidated } from './links.ts';
import { replaceEqualDeep } from './share.ts';
import {
  matches,
  ownerOf,
  type QueryEntry,
  type QueryFilter,
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

/**
 * The queries a mutation invalidates: path prefixes (`'post'` matches
 * `post.byId`) and query keys (`trpc.post.byId.queryKey({ id })`). An
 * empty array invalidates none.
 * @since 0.1.0
 * @stability experimental
 */
export type Invalidates = string | ReadonlyArray<string>;

/**
 * Options for {@link useMutation}.
 * @since 0.1.0
 * @stability experimental
 */
export interface UseMutationOptions<TInput, T> {
  /**
   * What a successful call invalidates, or a function of its input and
   * result that says. The call resolves once the invalidated queries on
   * screen have refetched. With `invalidateOnMutationLink()` in the links
   * (it's in `standardLinks()`), it replaces the link's filter for this
   * hook's calls; without, the hook invalidates on its own.
   * @default what `invalidateOnMutationLink()` does, or nothing without it
   */
  invalidates?:
    | Invalidates
    | ((opts: { input: TInput; data: T }) => Invalidates)
    | undefined;
}

/**
 * The state of a {@link useMutation}'s latest call.
 * @since 0.1.0
 * @stability experimental
 */
export type MutationState<TInput, T, E> =
  | {
      readonly status: 'idle';
      readonly input: undefined;
      readonly data: undefined;
      readonly error: undefined;
    }
  | {
      readonly status: 'pending';
      readonly input: TInput;
      readonly data: undefined;
      readonly error: undefined;
    }
  | {
      readonly status: 'success';
      readonly input: TInput;
      readonly data: T;
      readonly error: undefined;
    }
  | {
      readonly status: 'error';
      readonly input: TInput;
      readonly data: undefined;
      readonly error: E;
    };

/**
 * What {@link useMutation} returns: the latest call's state, and the
 * function that calls.
 * @since 0.1.0
 * @stability experimental
 */
export type UseMutationResult<
  TArgs extends readonly unknown[],
  T,
  E,
> = MutationState<TArgs[0], T, E> & {
  /** `status === 'pending'`. */
  readonly isPending: boolean;
  /**
   * Calls the mutation, with the procedure's input and call options. The
   * promise rejects with the typed error too; the hook already handles
   * it, so `void mutate(input)` is safe. The same function every render.
   */
  readonly mutate: (...args: TArgs) => TrpcPromise<T, E>;
  /** Back to `idle`; a call in flight no longer updates the state. */
  readonly reset: () => void;
};

const idle: MutationState<unknown, unknown, unknown> = {
  status: 'idle',
  input: undefined,
  data: undefined,
  error: undefined,
};

const toFilter = (invalidates: Invalidates): QueryFilter =>
  typeof invalidates === 'string'
    ? invalidates
    : (entry) => invalidates.some((filter) => matches(filter, entry));

/**
 * Calls a mutation of a React client and tracks its latest call: `status`,
 * `isPending`, `data`, and `error`, typed with the procedure's error union.
 * `invalidates` picks the queries a call refetches before it resolves.
 * Inside a transition, such as a form's `action`, React shows the state
 * once the transition ends; read `useFormStatus()` there for pending.
 *
 * @example
 * ```tsx
 * function Rename(props: { id: string }) {
 *   const rename = useMutation(trpc.post.rename, {
 *     invalidates: (opts) => trpc.post.byId.queryKey({ id: opts.input.id }),
 *   });
 *   return (
 *     <button
 *       disabled={rename.isPending}
 *       onClick={() => void rename.mutate({ id: props.id, title: 'New' })}
 *     >
 *       {rename.error ? 'Retry' : 'Rename'}
 *     </button>
 *   );
 * }
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function useMutation<TArgs extends readonly unknown[], T, E>(
  procedure: { mutate(...args: TArgs): TrpcPromise<T, E> },
  opts?: UseMutationOptions<TArgs[0], T>,
): UseMutationResult<TArgs, T, E> {
  const owner = procedureOf(procedure);
  if (!owner) {
    throw new TypeError(
      "useMutation() takes a React client's mutation, such as trpc.post.create",
    );
  }
  const [state, setState] =
    useState<MutationState<unknown, unknown, unknown>>(idle);
  // The latest render's procedure and options, so `mutate` stays the same
  // function while reading them.
  const [latest] = useState(() => ({ call: 0, procedure, opts, owner }));
  latest.procedure = procedure;
  latest.opts = opts;
  latest.owner = owner;
  const mutate = useCallback(
    (...args: TArgs) => {
      const call = ++latest.call;
      const input = args[0];
      const store = latest.owner.store;
      const own = latest.opts?.invalidates;
      const filterOf =
        own === undefined
          ? undefined
          : (data: T) =>
              toFilter(typeof own === 'function' ? own({ input, data }) : own);
      const linked = revalidated.has(store);
      const callArgs: unknown[] = [...args];
      if (filterOf && linked) {
        callArgs[1] = {
          ...(args[1] as object | undefined),
          [ownInvalidates]: filterOf,
        };
      }
      setState({ status: 'pending', input, data: undefined, error: undefined });
      const target = latest.procedure;
      const run = async () => {
        const data = await target.mutate(...(callArgs as unknown as TArgs));
        if (filterOf && !linked) await store.invalidate(filterOf(data));
        return data;
      };
      const promise = run();
      promise.then(
        (data) => {
          if (latest.call === call)
            setState({ status: 'success', input, data, error: undefined });
        },
        (error: unknown) => {
          if (latest.call === call)
            setState({ status: 'error', input, data: undefined, error });
        },
      );
      return promise as TrpcPromise<T, E>;
    },
    [latest],
  );
  const reset = useCallback(() => {
    latest.call++;
    setState(idle);
  }, [latest]);
  return {
    ...(state as MutationState<TArgs[0], T, E>),
    isPending: state.status === 'pending',
    mutate,
    reset,
  };
}
