"use client";

import {
	type DefaultedQueryObserverOptions,
	type DefaultError,
	type InfiniteData,
	InfiniteQueryObserver,
	type InfiniteQueryObserverResult,
	noop,
	notifyManager,
	type Query,
	type QueryClient,
	type QueryKey,
	QueryObserver,
	type QueryObserverOptions,
	type QueryObserverResult,
	useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";

import {
	type AnyQueryOptions,
	type DataOf,
	type InputOf,
	type IsPaged,
	optionsFor,
	type QueryFactory,
	type QueryHandle,
} from "./options.ts";
import { promiseFor, type Thenable } from "./thenable.ts";

export interface UseQueryOptions {
	/** Refetch on this interval (ms) while mounted and the page is visible. */
	readonly refetchInterval?: number;
	/** Refetch on reconnect while stale. Default: the query's option, else `true`. */
	readonly refetchOnReconnect?: boolean;
	/** Refetch on window focus while stale. Default: the query's option, else `true`. */
	readonly refetchOnWindowFocus?: boolean;
	/**
	 * What to render while the handle's input has no data yet:
	 * - `"suspend"` (default): the promise is pending, so `use()` suspends.
	 * - `"previous"`: keep returning the last input's data, with `isPrevious`.
	 */
	readonly whilePending?: "previous" | "suspend";
}

/** The second element of {@link useQuery}'s result. */
export interface QueryControls<TFactory extends QueryFactory> {
	/** Error of the last failed request. Existing data stays readable. */
	readonly error: DefaultError | null;
	/** Stable string form of the handle's key, for `key` props. */
	readonly hash: string;
	/** Input of the data in the promise; differs from the handle's while `isPrevious`. */
	readonly input: InputOf<TFactory>;
	/** A request is in flight: first load, new input, or background refetch. */
	readonly isFetching: boolean;
	/** No data yet for the handle's input. */
	readonly isPending: boolean;
	/** The promise holds a previous input's data (`whilePending: "previous"`). */
	readonly isPrevious: boolean;
	/** The data is older than `staleTime`, or was invalidated. */
	readonly isStale: boolean;
	/** Key of the data in the promise; differs from the handle's while `isPrevious`. */
	readonly key: QueryKey;
	/** Refetch now. Resolves when the request settles; never rejects. */
	refetch(): Promise<void>;
	/** When the data in the promise was fetched (ms since epoch); `0` before that. */
	readonly updatedAt: number;
}

/** Extra controls for factories that return `infiniteQueryOptions(...)`. */
export interface PagingControls {
	fetchNextPage(): Promise<void>;
	fetchPreviousPage(): Promise<void>;
	readonly hasNextPage: boolean;
	readonly hasPreviousPage: boolean;
	readonly isFetchingNextPage: boolean;
	readonly isFetchingPreviousPage: boolean;
}

export type UseQueryControls<TFactory extends QueryFactory> =
	IsPaged<TFactory> extends true
		? QueryControls<TFactory> & PagingControls
		: QueryControls<TFactory>;

export type UseQueryResult<TFactory extends QueryFactory> = readonly [
	promise: Promise<DataOf<TFactory>>,
	controls: UseQueryControls<TFactory>,
];

type ObserverOptions = QueryObserverOptions<
	unknown,
	DefaultError,
	unknown,
	unknown,
	QueryKey,
	unknown
>;

type Defaulted = DefaultedQueryObserverOptions<
	unknown,
	DefaultError,
	unknown,
	unknown,
	QueryKey
>;

/**
 * An observer of one query, with callbacks that keep their identity. A hook
 * gets a new reader when its handle points at another query, so moving to a
 * query mounts a fresh observer (which never refetches on mount) instead of
 * re-pointing one (which refetches stale data, including data a loader just
 * fetched).
 */
interface Reader {
	readonly client: QueryClient;
	fetchNextPage(): Promise<void>;
	fetchPreviousPage(): Promise<void>;
	getSnapshot(): QueryObserverResult;
	readonly hash: string;
	readonly observer: QueryObserver<unknown, DefaultError, unknown, unknown>;
	refetch(): Promise<void>;
	subscribe(onChange: () => void): () => void;
}

function createReader(
	client: QueryClient,
	options: Defaulted,
	paged: boolean,
): Reader {
	const infinite = paged
		? new InfiniteQueryObserver(
				client,
				// SAFETY: `paged` is true only for `infiniteQueryOptions(...)` factories,
				// whose options carry `initialPageParam` and `getNextPageParam`.
				options as ConstructorParameters<
					typeof InfiniteQueryObserver<
						unknown,
						DefaultError,
						InfiniteData<unknown>,
						QueryKey,
						unknown
					>
				>[1],
			)
		: undefined;
	const observer = infinite
		? // SAFETY: an infinite observer is a query observer whose data is
			// `InfiniteData`; readers only pass that data through as `unknown`.
			(infinite as QueryObserver<unknown, DefaultError, unknown, unknown>)
		: new QueryObserver<unknown, DefaultError, unknown, unknown>(
				client,
				options,
			);
	return {
		client,
		fetchNextPage: () =>
			infinite ? infinite.fetchNextPage().then(noop) : Promise.resolve(),
		fetchPreviousPage: () =>
			infinite ? infinite.fetchPreviousPage().then(noop) : Promise.resolve(),
		getSnapshot: () => observer.getCurrentResult(),
		hash: options.queryHash,
		observer,
		refetch: () => observer.refetch().then(noop),
		subscribe: (onChange) => {
			const unsubscribe = observer.subscribe(
				notifyManager.batchCalls(onChange),
			);
			// Catch updates between creating the observer and subscribing.
			observer.updateResult();
			return unsubscribe;
		},
	};
}

/**
 * Observer options for a read. Never refetches on mount: queries start in
 * loaders, server components, and `useWaterfall`, so a mount that finds data
 * shows it. Per-read settings only override the query's when given.
 */
function observerOptions(
	client: QueryClient,
	options: AnyQueryOptions,
	read: UseQueryOptions,
): Defaulted {
	// SAFETY: factory options are TanStack observer options plus `kind`
	// (see `queryOptions` / `infiniteQueryOptions`).
	const base = options as ObserverOptions;
	const next: ObserverOptions = { ...base, refetchOnMount: false };
	if (read.refetchInterval !== undefined) {
		next.refetchInterval = read.refetchInterval;
	}
	if (read.refetchOnReconnect !== undefined) {
		next.refetchOnReconnect = read.refetchOnReconnect;
	}
	if (read.refetchOnWindowFocus !== undefined) {
		next.refetchOnWindowFocus = read.refetchOnWindowFocus;
	}
	const defaulted = client.defaultQueryOptions(next);
	// TanStack's own field: results read during render report a fetch the
	// mount is about to start.
	// oxlint-disable-next-line eslint/no-underscore-dangle
	defaulted._optimisticResults = "optimistic";
	return defaulted;
}

interface Shown {
	readonly hash: string;
	readonly input: unknown;
	readonly key: QueryKey;
	readonly promise: Thenable<unknown>;
	readonly updatedAt: number;
}

function isInfiniteResult(
	result: QueryObserverResult,
): result is InfiniteQueryObserverResult {
	return "hasNextPage" in result;
}

/**
 * Read the query a handle points at. Returns a promise to unwrap with
 * `use()` and the query's controls:
 *
 * ```tsx
 * const [postPromise, postState] = useQuery(postQuery, loaderData.post);
 * const post = use(postPromise);
 * ```
 *
 * The promise is stable per data version and already fulfilled once the
 * cache has data, so `use()` only suspends while there is nothing to show.
 */
export function useQuery<TFactory extends QueryFactory>(
	factory: TFactory,
	handle: QueryHandle<TFactory>,
	options: UseQueryOptions = {},
): UseQueryResult<TFactory> {
	const client = useQueryClient();
	const factoryOptions = optionsFor(client, factory, handle.input);
	const defaulted = observerOptions(client, factoryOptions, options);
	const paged = factoryOptions.kind === "infinite";
	const [lastReader, setReader] = useState(() =>
		createReader(client, defaulted, paged),
	);
	let reader = lastReader;
	if (reader.hash !== defaulted.queryHash || reader.client !== client) {
		reader = createReader(client, defaulted, paged);
		setReader(reader);
	}
	const observer = reader.observer;
	const result = observer.getOptimisticResult(defaulted);
	useSyncExternalStore(
		reader.subscribe,
		reader.getSnapshot,
		reader.getSnapshot,
	);
	useEffect(() => {
		observer.setOptions(defaulted);
	}, [defaulted, observer]);

	const query: Query = observer.getCurrentQuery();
	// `use()` suspends before effects run, so a read that has to start its
	// own request (a garbage-collected entry, an error boundary retrying)
	// can't wait for the observer's mount to do it.
	const promise = promiseFor(client, query, () => {
		observer.fetchOptimistic(defaulted).catch(noop);
	});

	const keepPrevious = options.whilePending === "previous";
	const current: Shown = {
		hash: defaulted.queryHash,
		input: handle.input,
		key: factoryOptions.queryKey,
		promise,
		updatedAt: query.state.dataUpdatedAt,
	};
	const hasData = query.state.data !== undefined;
	const [lastShown, setLastShown] = useState<Shown | undefined>(undefined);
	if (keepPrevious && hasData && lastShown?.promise !== promise) {
		setLastShown(current);
	}
	const previous =
		keepPrevious &&
		!hasData &&
		query.state.status !== "error" &&
		lastShown !== undefined &&
		lastShown.hash !== current.hash
			? lastShown
			: undefined;
	const shown = previous ?? current;

	const paging = isInfiniteResult(result) ? result : undefined;
	const controls = {
		error: result.error,
		fetchNextPage: reader.fetchNextPage,
		fetchPreviousPage: reader.fetchPreviousPage,
		hash: current.hash,
		hasNextPage: paging?.hasNextPage ?? false,
		hasPreviousPage: paging?.hasPreviousPage ?? false,
		input: shown.input,
		isFetching: result.isFetching,
		isFetchingNextPage: paging?.isFetchingNextPage ?? false,
		isFetchingPreviousPage: paging?.isFetchingPreviousPage ?? false,
		isPending: !hasData,
		isPrevious: previous !== undefined,
		isStale: result.isStale,
		key: shown.key,
		refetch: reader.refetch,
		updatedAt: shown.updatedAt,
	} satisfies Record<
		keyof QueryControls<QueryFactory> | keyof PagingControls,
		unknown
	>;
	// SAFETY: `shown.promise` is this factory's entry's promise (or an earlier
	// input's entry of the same factory), and `controls` has every field of
	// both control shapes.
	return [shown.promise, controls] as UseQueryResult<TFactory>;
}
