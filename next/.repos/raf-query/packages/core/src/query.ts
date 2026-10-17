/**
 * One cache entry, as a data type: a `Query` carries its key, handle and
 * options, and the functions here read it, subscribe to it and run its
 * requests. Get one from `QueryCache.getQuery(factory, input)`.
 *
 * Requests are Effects. The `*Unsafe` functions read and subscribe
 * synchronously, for renders and external stores that can't run an Effect.
 */
import { type Context, Effect, type Pipeable, type Stream } from "effect";
import { dual } from "effect/Function";

import * as internal from "./entry.ts";
import type { Direction } from "./infinite.ts";
import type { QueryKey } from "./key.ts";
import type {
	AnyQueryOptions,
	DataOf,
	ErrorOf,
	QueryFactory,
	QueryHandle,
	QueryMeta,
	ServicesOf,
} from "./options.ts";
import type { Thenable } from "./thenable.ts";

export const TypeId: typeof internal.TypeId = internal.TypeId;

export type TypeId = typeof TypeId;

/**
 * A cache entry, typed by the factory whose calls fill it: its data is the
 * factory's {@link DataOf}, its error the factory's {@link ErrorOf}.
 */
export interface Query<TFactory extends QueryFactory = QueryFactory>
	extends Pipeable.Pipeable {
	/** The serializable handle for this entry's factory call. */
	readonly handle: QueryHandle<TFactory>;
	/** Stable string form of `key`. */
	readonly hash: string;
	readonly key: QueryKey;
	/** Options from the latest factory call; `undefined` for an entry only hydrated so far. */
	readonly options: AnyQueryOptions | undefined;
	readonly [TypeId]: {
		readonly _A: (_: never) => DataOf<TFactory>;
		readonly _E: (_: never) => ErrorOf<TFactory>;
	};
}

/** A snapshot of one cache entry. Replaced, never mutated, on every change. */
export interface State<TData> {
	/** Last successful data, kept through background errors. */
	readonly data: TData | undefined;
	/** Error of the last failed request, or `null`. */
	readonly error: unknown;
	/** Failed attempts of the current request, retries included. */
	readonly failureCount: number;
	/** Set while a paged query loads a page at one end of the list. */
	readonly fetchDirection: Direction | undefined;
	readonly hasData: boolean;
	/** A request is in flight. */
	readonly isFetching: boolean;
	/** Marked stale by `invalidate`; cleared by the next successful request. */
	readonly isInvalidated: boolean;
	/** Older than `staleTime`, invalidated, or without data. */
	readonly isStale: boolean;
	/**
	 * Settles with `data`. A new promise is created per data version, already
	 * fulfilled once data exists, so it can be read synchronously.
	 */
	readonly promise: Thenable<TData>;
	readonly status: "error" | "pending" | "success";
	/** When `data` was fetched (ms since epoch); `0` without data. */
	readonly updatedAt: number;
}

/** Per-reader preferences, registered with {@link subscribeUnsafe}. */
export interface SubscribeOptions {
	readonly refetchOnReconnect?: boolean;
	readonly refetchOnWindowFocus?: boolean;
}

export interface FetchRequest {
	/** Load one more page at this end of a paged query. */
	readonly direction?: Direction;
	/** Pages to load when a paged query has none yet. */
	readonly pages?: number;
	/** Interrupt an in-flight request and start over (used by `invalidate`). */
	readonly restart?: boolean;
}

export const CancelledError: typeof internal.CancelledError =
	internal.CancelledError;

export type CancelledError = internal.CancelledError;

export const DisabledError: typeof internal.DisabledError =
	internal.DisabledError;

export type DisabledError = internal.DisabledError;

export const isQuery: (value: unknown) => value is Query = internal.isQuery;

function typed<TFactory extends QueryFactory>(
	effect: Effect.Effect<unknown, unknown, ServicesOf<TFactory>>,
): Effect.Effect<
	DataOf<TFactory>,
	ErrorOf<TFactory> | CancelledError,
	ServicesOf<TFactory>
> {
	// SAFETY: an entry is keyed by its factory's `queryKey`, and only that
	// factory's `queryFn` (or data written through it) fills it, so its data
	// and failures have the factory's types. Interrupts become CancelledError.
	return effect as Effect.Effect<
		DataOf<TFactory>,
		ErrorOf<TFactory> | CancelledError,
		ServicesOf<TFactory>
	>;
}

function typedState<TFactory extends QueryFactory>(
	state: State<unknown>,
): State<DataOf<TFactory>> {
	// SAFETY: as in `typed`; `data` and `promise` hold the factory's data.
	return state as State<DataOf<TFactory>>;
}

/**
 * Start a request, or join the one in flight. Fails with the request's
 * error, or a {@link CancelledError} if the entry leaves the cache first.
 * The entry's requests run with this fiber's services from now on, as after
 * a `QueryCache` verb.
 */
export const fetch: {
	(
		request?: FetchRequest,
	): <TFactory extends QueryFactory>(
		self: Query<TFactory>,
	) => Effect.Effect<
		DataOf<TFactory>,
		ErrorOf<TFactory> | CancelledError,
		ServicesOf<TFactory>
	>;
	<TFactory extends QueryFactory>(
		self: Query<TFactory>,
		request?: FetchRequest,
	): Effect.Effect<
		DataOf<TFactory>,
		ErrorOf<TFactory> | CancelledError,
		ServicesOf<TFactory>
	>;
} = dual(
	(args) => isQuery(args[0]),
	<TFactory extends QueryFactory>(
		self: Query<TFactory>,
		request?: FetchRequest,
	) =>
		typed<TFactory>(
			Effect.contextWith((caller: Context.Context<never>) => {
				const entry = internal.entryOf(self);
				internal.provide(entry, caller);
				return internal.fetch(entry, request);
			}),
		),
);

/** Refetch now; succeeds when the request settles, whatever its outcome. */
export function refetch<TFactory extends QueryFactory>(
	self: Query<TFactory>,
): Effect.Effect<void> {
	return internal.entryOf(self).commands.refetch;
}

/** Load the page after the last one; succeeds once it settles. */
export function fetchNextPage<TFactory extends QueryFactory>(
	self: Query<TFactory>,
): Effect.Effect<void> {
	return internal.entryOf(self).commands.fetchNextPage;
}

/** Load the page before the first one; succeeds once it settles. */
export function fetchPreviousPage<TFactory extends QueryFactory>(
	self: Query<TFactory>,
): Effect.Effect<void> {
	return internal.entryOf(self).commands.fetchPreviousPage;
}

/** Mark stale, and refetch if read; succeeds once that refetch settles. */
export function invalidate<TFactory extends QueryFactory>(
	self: Query<TFactory>,
): Effect.Effect<void> {
	return internal.invalidate(internal.entryOf(self));
}

/**
 * Drop data and errors, back to the state of a new entry. Readers suspend
 * and refetch; succeeds when that refetch settles.
 */
export function reset<TFactory extends QueryFactory>(
	self: Query<TFactory>,
): Effect.Effect<void> {
	return internal.reset(internal.entryOf(self));
}

/**
 * The query's `meta`: the latest factory call's (the one it was hydrated
 * with, before any), else the cache default's.
 */
export function metaUnsafe<TFactory extends QueryFactory>(
	self: Query<TFactory>,
): QueryMeta | undefined {
	return internal.metaOf(internal.entryOf(self));
}

/**
 * Whether the query's `queryFn` returns an Effect (`true`) or a promise or
 * plain value (`false`), as of its last call, on this cache or the one its
 * data was hydrated from. `undefined` until one has run. Bindings read typed
 * errors as a `Result` only for Effects.
 */
export function returnsEffectUnsafe<TFactory extends QueryFactory>(
	self: Query<TFactory>,
): boolean | undefined {
	return internal.entryOf(self).returnsEffect;
}

/** The entry's current state. */
export function get<TFactory extends QueryFactory>(
	self: Query<TFactory>,
): Effect.Effect<State<DataOf<TFactory>>> {
	return Effect.sync(() => getUnsafe(self));
}

/** {@link get}, synchronously. */
export function getUnsafe<TFactory extends QueryFactory>(
	self: Query<TFactory>,
): State<DataOf<TFactory>> {
	return typedState<TFactory>(internal.entryOf(self).state);
}

/**
 * The entry's current state, then every change. Counts as a reader while
 * the stream runs, so invalidation and focus refetch it.
 */
export function changes<TFactory extends QueryFactory>(
	self: Query<TFactory>,
): Stream.Stream<State<DataOf<TFactory>>> {
	// SAFETY: as in `typedState`, for every element.
	return internal.changes(internal.entryOf(self)) as Stream.Stream<
		State<DataOf<TFactory>>
	>;
}

/**
 * The promise a render should unwrap. Starts the first request if nothing
 * has, and retries a failed first load once its error has been shown.
 */
export function readUnsafe<TFactory extends QueryFactory>(
	self: Query<TFactory>,
): Thenable<DataOf<TFactory>> {
	// SAFETY: as in `typedState`.
	return internal.readUnsafe(internal.entryOf(self)) as Thenable<
		DataOf<TFactory>
	>;
}

/**
 * Refetch cached data in the background if it's stale, as `prefetch` does
 * (on a server cache, only if invalidated). Does nothing without data or
 * while a request is in flight.
 */
export function revalidateUnsafe<TFactory extends QueryFactory>(
	self: Query<TFactory>,
): void {
	internal.revalidate(internal.entryOf(self));
}

/** Listen for state changes. Subscribed entries count as read. */
export function subscribeUnsafe<TFactory extends QueryFactory>(
	self: Query<TFactory>,
	listener: () => void,
	options?: SubscribeOptions,
): () => void {
	return internal.subscribeUnsafe(internal.entryOf(self), listener, options);
}

/** Staleness as of now; `state.isStale` is only kept current while read. */
export function isStaleUnsafe<TFactory extends QueryFactory>(
	self: Query<TFactory>,
): boolean {
	return internal.isStaleUnsafe(internal.entryOf(self));
}

export function hasNextPageUnsafe<TFactory extends QueryFactory>(
	self: Query<TFactory>,
): boolean {
	return internal.hasNextPageUnsafe(internal.entryOf(self));
}

export function hasPreviousPageUnsafe<TFactory extends QueryFactory>(
	self: Query<TFactory>,
): boolean {
	return internal.hasPreviousPageUnsafe(internal.entryOf(self));
}

/** Readers currently subscribed. */
export function observerCountUnsafe<TFactory extends QueryFactory>(
	self: Query<TFactory>,
): number {
	return internal.entryOf(self).listeners.size;
}
