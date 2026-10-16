/**
 * The query cache, as an Effect service. `make` builds one in the current
 * scope; closing the scope interrupts every request and timer it started.
 * Everything that waits, or changes the cache, is an Effect; `getQueryUnsafe`,
 * `isFetchingUnsafe` and `subscribeUnsafe` are for renders and external
 * stores.
 *
 * Requests run with the services the cache was built with, under those of
 * the latest verb that called for the entry. So the verbs that can start a
 * request (`ensure`, `fetch`, `prefetch`, `getQuery`, `watch`) require the
 * factory's {@link ServicesOf}; requests a render, a refetch or `invalidate`
 * starts reuse the entry's last services.
 */
import {
	Clock,
	Context,
	Effect,
	Layer,
	Option,
	Predicate,
	RcRef,
	type Scope,
	Stream,
} from "effect";

import * as Entry from "./entry.ts";
import {
	dehydrateEntries,
	type DehydratedState,
	type DehydratedStream,
	type DehydrateOptions,
	dehydrateStream,
	hydrateEntries,
	type HydrateOptions,
} from "./hydration.ts";
import { hashKey, matchesKey, type QueryKey } from "./key.ts";
import { listen } from "./listen.ts";
import {
	type DataOf,
	type ErrorOf,
	type InputArgs,
	type InputOf,
	type LoadOptions,
	optionsFor,
	type PagedQueryFactory,
	type QueryBehavior,
	type QueryFactory,
	type QueryHandle,
	type QueryHandleWithData,
	type ServicesOf,
} from "./options.ts";
import { Platform } from "./platform.ts";
import type * as Query from "./query.ts";

export const TypeId = "~@raf-query/core/QueryCache";

export type TypeId = typeof TypeId;

export interface Config {
	/** Defaults for every query; a factory's own options win. */
	readonly defaults?: QueryBehavior;
	/**
	 * Whether this cache runs on the server. Default: the {@link Platform}'s.
	 * Server caches don't retry, never garbage-collect, skip stale timers, and
	 * reuse cached data in `prefetch` / `ensure` / `fetch` instead of
	 * revalidating it, unless `invalidate` marked it.
	 */
	readonly isServer?: boolean;
}

/** Emitted on {@link QueryCache.events} for every cache change. */
export type Event =
	| {
			readonly query: Query.Query;
			/** `observers`: a reader subscribed or unsubscribed. */
			readonly type: "added" | "observers" | "removed" | "updated";
	  }
	| {
			/** A request failed (after retries), with this error. */
			readonly error: unknown;
			readonly query: Query.Query;
			readonly type: "failed";
	  };

/**
 * Selects cache entries: by key prefix (exact key with `exact`), then by
 * `predicate`. Without `queryKey` every key matches, so `{}` selects the
 * whole cache.
 */
export interface Filter {
	readonly exact?: boolean;
	/**
	 * Keep only entries this returns `true` for; runs after key matching.
	 * `query.handle.input` is the input of the latest factory call, and stays
	 * `undefined` for an entry only hydrated so far; match on `query.key` to
	 * include those.
	 */
	readonly predicate?: (query: Query.Query) => boolean;
	readonly queryKey?: QueryKey;
}

/** The entries `invalidate`, `reset` and `remove` act on: one factory call, or a filter. */
export type Target<TFactory extends QueryFactory> =
	| [factory: TFactory, ...args: InputArgs<TFactory>]
	| [filter: Filter];

/**
 * A new value, or a function of the current one. `previous` is `undefined`
 * both with no data and with `undefined` data.
 */
export type Updater<TData> = TData | ((previous: TData | undefined) => TData);

type Loaded<TFactory extends QueryFactory> = Effect.Effect<
	QueryHandleWithData<TFactory>,
	ErrorOf<TFactory> | Query.CancelledError,
	ServicesOf<TFactory>
>;

export interface QueryCache {
	/** Every entry. */
	readonly all: Effect.Effect<ReadonlyArray<Query.Query>>;
	/** Drop every entry and interrupt their requests. */
	readonly clear: Effect.Effect<void>;
	/** Snapshot the cache for transfer to another cache (server → browser). */
	dehydrate(options?: DehydrateOptions): Effect.Effect<DehydratedState>;
	/**
	 * Snapshot the cache, then stream entries as they start or settle, each
	 * entry once. Entries that change in the same tick share a batch, which
	 * is sent a microtask later. `updates` ends when the scope closes, after
	 * sending what changed before; `hydrateStream` is the receiving end.
	 */
	dehydrateStream(
		options?: DehydrateOptions,
	): Effect.Effect<DehydratedStream, never, Scope.Scope>;
	/**
	 * {@link fetch} without waiting on stale data: start a query and wait for
	 * it on a cache miss. Stale cached data succeeds immediately and
	 * revalidates in the browser. Fails if that request fails.
	 */
	ensure<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Loaded<TFactory>;
	/** {@link ensure}, loading `options.pages` pages of a paged query. */
	ensure<TFactory extends PagedQueryFactory>(
		factory: TFactory,
		input: InputOf<TFactory>,
		options: LoadOptions,
	): Loaded<TFactory>;
	/** Cache events from the moment the stream starts. */
	readonly events: Stream.Stream<Event>;
	/**
	 * Start a query and succeed with a handle holding its data. Waits on a
	 * cache miss and on stale data (on the server, only invalidated data), so
	 * the data is fresh. Fails if that request fails.
	 */
	fetch<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Loaded<TFactory>;
	/** {@link fetch}, loading `options.pages` pages of a paged query. */
	fetch<TFactory extends PagedQueryFactory>(
		factory: TFactory,
		input: InputOf<TFactory>,
		options: LoadOptions,
	): Loaded<TFactory>;
	/**
	 * Cached data for a factory call. `Some(undefined)` when the data itself
	 * is `undefined`.
	 */
	getData<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Effect.Effect<Option.Option<DataOf<TFactory>>>;
	/**
	 * The cache entry for a factory call, created if missing. Doesn't fetch,
	 * but its requests run with this fiber's services from now on. For
	 * bindings; apps use the verbs.
	 */
	getQuery<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Effect.Effect<Query.Query<TFactory>, never, ServicesOf<TFactory>>;
	/**
	 * `getQuery`, synchronously, for renders. Leaves the entry's services as
	 * they are: the cache's, or the latest verb caller's.
	 */
	getQueryUnsafe<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Query.Query<TFactory>;
	/**
	 * Write dehydrated entries. Existing entries only take newer data; pending
	 * entries resume the sender's request.
	 */
	hydrate(
		state: DehydratedState,
		options?: HydrateOptions,
	): Effect.Effect<void>;
	/** `hydrate` every state of a stream as it arrives (`dehydrateStream`'s `updates`). */
	hydrateStream<E, R>(
		states: Stream.Stream<DehydratedState, E, R>,
		options?: HydrateOptions,
	): Effect.Effect<void, E, R>;
	/**
	 * Mark queries stale and refetch the ones being read. Succeeds once those
	 * refetches settle, so an action stays pending until fresh data is on
	 * screen.
	 */
	invalidate<TFactory extends QueryFactory>(
		...target: Target<TFactory>
	): Effect.Effect<void>;
	/**
	 * How many entries have a request in flight: all of them, or those
	 * matching `filter`. For global loading indicators.
	 */
	isFetching(filter?: Filter): Effect.Effect<number>;
	/** `isFetching`, synchronously, for renders. */
	isFetchingUnsafe(filter?: Filter): number;
	readonly isServer: boolean;
	/**
	 * Refetch read, stale queries on window focus and reconnect while the
	 * scope is open. Mounts share one platform subscription. Does nothing on
	 * the server.
	 */
	readonly mount: Effect.Effect<void, never, Scope.Scope>;
	/**
	 * Start a query without waiting and return its handle. Fresh data is
	 * reused; stale data refetches in the background (in the browser only, see
	 * {@link Config.isServer}). Errors surface where the data is read, never
	 * here.
	 */
	prefetch<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Effect.Effect<QueryHandle<TFactory>, never, ServicesOf<TFactory>>;
	/**
	 * Remove queries from the cache and interrupt their requests. Readers keep
	 * the removed entry until they render again.
	 */
	remove<TFactory extends QueryFactory>(
		...target: Target<TFactory>
	): Effect.Effect<void>;
	/**
	 * Drop queries' data and errors, as if they were never fetched. Read ones
	 * suspend and refetch; succeeds once those refetches settle.
	 */
	reset<TFactory extends QueryFactory>(
		...target: Target<TFactory>
	): Effect.Effect<void>;
	/** Write data for a factory call. Readers re-render without suspending. */
	setData<TFactory extends QueryFactory>(
		factory: TFactory,
		input: InputOf<TFactory>,
		updater: Updater<DataOf<TFactory>>,
	): Effect.Effect<void>;
	/** Listen to cache events synchronously, as they happen. */
	subscribeUnsafe(listener: (event: Event) => void): () => void;
	readonly [TypeId]: TypeId;
	/** A factory call's `Query.changes`. */
	watch<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Stream.Stream<Query.State<DataOf<TFactory>>, never, ServicesOf<TFactory>>;
}

export const QueryCache = /*#__PURE__*/ Context.Service<QueryCache>(TypeId);

export function isQueryCache(value: unknown): value is QueryCache {
	return Predicate.hasProperty(value, TypeId);
}

function isUpdateFunction<TData>(
	updater: Updater<TData>,
): updater is (previous: TData | undefined) => TData {
	return Predicate.isFunction(updater);
}

function typed<TFactory extends QueryFactory>(
	entry: Entry.Entry,
): Query.Query<TFactory> {
	// SAFETY: an entry's hash comes from its factory's `queryKey`, and only
	// that factory's `queryFn` (or data written through the same factory)
	// fills it, so its data and errors have the factory's types.
	return entry as unknown as Query.Query<TFactory>;
}

function handleOf<TFactory extends QueryFactory>(
	entry: Entry.Entry,
): QueryHandle<TFactory> {
	// SAFETY: `entry.handle.input` is the input of the latest call through
	// this factory, which `InputArgs<TFactory>` type-checked.
	return entry.handle as unknown as QueryHandle<TFactory>;
}

function dataOf<TFactory extends QueryFactory>(
	entry: Entry.Entry,
): DataOf<TFactory> {
	// SAFETY: only called when `hasData` is set, so `data` came from this
	// factory's queryFn or Entry.setData, even when its type includes `undefined`.
	return entry.state.data as DataOf<TFactory>;
}

function keyMatcher(filter: Filter): (entry: Entry.Entry) => boolean {
	const prefix = filter.queryKey;
	if (prefix === undefined) {
		return () => true;
	}
	if (filter.exact) {
		const hash = hashKey(prefix);
		return (entry) => entry.hash === hash;
	}
	return (entry) => matchesKey(entry.key, prefix);
}

/**
 * Waits for an entry's data on a cache miss, and with `fresh` also while it
 * needs a refetch (see `Entry.needsRefetch`). Otherwise cached data returns at
 * once, and revalidates in the background.
 */
function load<TFactory extends QueryFactory>(
	entry: Entry.Entry,
	pages: number | undefined,
	fresh: boolean,
): Effect.Effect<DataOf<TFactory>, ErrorOf<TFactory> | Query.CancelledError> {
	if (!entry.state.hasData || (fresh && Entry.needsRefetch(entry))) {
		// SAFETY: as in `typed`.
		return Entry.fetch(entry, { pages }) as Effect.Effect<
			DataOf<TFactory>,
			ErrorOf<TFactory> | Query.CancelledError
		>;
	}
	Entry.revalidate(entry);
	return Effect.succeed(dataOf<TFactory>(entry));
}

/** The entry's handle as of this call, with the data `loaded` succeeds with. */
function withData<TFactory extends QueryFactory>(
	entry: Entry.Entry,
	loaded: Effect.Effect<
		DataOf<TFactory>,
		ErrorOf<TFactory> | Query.CancelledError
	>,
): Effect.Effect<
	QueryHandleWithData<TFactory>,
	ErrorOf<TFactory> | Query.CancelledError
> {
	const handle = handleOf<TFactory>(entry);
	return Effect.map(loaded, (data) => ({ ...handle, data }));
}

/** Settles every effect, started together. */
function settleAll(effects: ReadonlyArray<Effect.Effect<void>>) {
	return Effect.all(effects, { concurrency: "unbounded", discard: true });
}

/** Build a cache in the current scope, with the current `Clock` and {@link Platform}. */
export const make: (
	config?: Config,
) => Effect.Effect<QueryCache, never, Scope.Scope> =
	/*#__PURE__*/ Effect.fnUntraced(function* (config: Config = {}) {
		const platform = yield* Platform;
		const state: Entry.CacheState = {
			clock: yield* Clock.Clock,
			defaults: config.defaults ?? {},
			entries: new Map(),
			isServer: config.isServer ?? platform.isServer,
			listeners: new Set(),
			platform,
			scope: yield* Effect.scope,
			services: yield* Effect.context<never>(),
		};

		const entryFor = (key: QueryKey) => {
			const hash = hashKey(key);
			const existing = state.entries.get(hash);
			if (existing) {
				return existing;
			}
			const entry = Entry.make(state, key, hash);
			state.entries.set(hash, entry);
			Entry.emit(state, { query: entry, type: "added" });
			return entry;
		};

		const build = (factory: QueryFactory, input: unknown) => {
			const options = optionsFor(factory, input);
			const entry = entryFor(options.queryKey);
			Entry.setOptions(entry, options, input);
			return entry;
		};

		/** `build`, for a verb: the entry's requests get the caller's services. */
		const buildFor = (factory: QueryFactory, input: unknown) =>
			Effect.contextWith((caller: Context.Context<never>) => {
				const entry = build(factory, input);
				Entry.provide(entry, caller);
				return Effect.succeed(entry);
			});

		const match = <TFactory extends QueryFactory>(target: Target<TFactory>) => {
			// SAFETY: a target is a factory and its input, or a lone filter;
			// `InputArgs` only narrows the input's type.
			const [first, input] = target as readonly [
				QueryFactory | Filter,
				unknown?,
			];
			if (Predicate.isFunction(first)) {
				const entry = state.entries.get(
					hashKey(optionsFor(first, input).queryKey),
				);
				return entry ? [entry] : [];
			}
			const keyMatches = keyMatcher(first);
			return [...state.entries.values()].filter(
				(entry) => keyMatches(entry) && (first.predicate?.(entry) ?? true),
			);
		};

		const subscription = yield* RcRef.make({
			acquire: Effect.acquireRelease(
				Effect.sync(() =>
					platform.subscribeUnsafe((event) => {
						for (const entry of state.entries.values()) {
							if (Entry.isObserved(entry)) {
								Entry.onPlatformEvent(entry, event);
							}
						}
					}),
				),
				(unsubscribe) => Effect.sync(unsubscribe),
			),
		});

		const subscribeUnsafe = (listener: (event: Event) => void) => {
			state.listeners.add(listener);
			return () => {
				state.listeners.delete(listener);
			};
		};

		const getQueryUnsafe = <TFactory extends QueryFactory>(
			factory: TFactory,
			...args: InputArgs<TFactory>
		) => typed<TFactory>(build(factory, args[0]));

		const isFetchingUnsafe = (filter?: Filter) =>
			(filter ? match([filter]) : [...state.entries.values()]).filter(
				(entry) => entry.state.isFetching,
			).length;

		const cache: QueryCache = {
			all: Effect.sync(() => [...state.entries.values()]),
			clear: Effect.sync(() => {
				for (const entry of state.entries.values()) {
					Entry.remove(entry);
				}
			}),
			dehydrate: (options = {}) =>
				Effect.sync(() => dehydrateEntries(state.entries.values(), options)),
			dehydrateStream: (options = {}) =>
				dehydrateStream(() => state.entries.values(), subscribeUnsafe, options),
			ensure: <TFactory extends QueryFactory>(
				factory: TFactory,
				input?: InputOf<TFactory>,
				options?: LoadOptions,
			): Loaded<TFactory> =>
				Effect.flatMap(buildFor(factory, input), (entry) =>
					withData(entry, load<TFactory>(entry, options?.pages, false)),
				),
			events: listen(subscribeUnsafe),
			fetch: <TFactory extends QueryFactory>(
				factory: TFactory,
				input?: InputOf<TFactory>,
				options?: LoadOptions,
			): Loaded<TFactory> =>
				Effect.flatMap(buildFor(factory, input), (entry) =>
					withData(entry, load<TFactory>(entry, options?.pages, true)),
				),
			getData: (factory, ...args) =>
				Effect.sync(() => {
					const options = optionsFor(factory, args[0]);
					const entry = state.entries.get(hashKey(options.queryKey));
					return entry?.state.hasData
						? Option.some(dataOf<typeof factory>(entry))
						: Option.none();
				}),
			getQuery: (factory, ...args) =>
				Effect.map(buildFor(factory, args[0]), typed<typeof factory>),
			getQueryUnsafe,
			hydrate: (dehydrated, options = {}) =>
				Effect.sync(() => hydrateEntries(entryFor, dehydrated, options)),
			hydrateStream: (states, options = {}) =>
				Stream.runForEach(states, (dehydrated) =>
					Effect.sync(() => hydrateEntries(entryFor, dehydrated, options)),
				),
			invalidate: (...target) =>
				Effect.suspend(() => settleAll(match(target).map(Entry.invalidate))),
			isFetching: (filter) => Effect.sync(() => isFetchingUnsafe(filter)),
			isFetchingUnsafe,
			isServer: state.isServer,
			mount: state.isServer
				? Effect.void
				: Effect.asVoid(RcRef.get(subscription)),
			prefetch: (factory, ...args) =>
				Effect.map(buildFor(factory, args[0]), (entry) => {
					if (entry.state.hasData) {
						Entry.revalidate(entry);
					} else {
						Entry.start(entry);
					}
					return handleOf<typeof factory>(entry);
				}),
			remove: (...target) =>
				Effect.sync(() => {
					for (const entry of match(target)) {
						Entry.remove(entry);
					}
				}),
			reset: (...target) =>
				Effect.suspend(() => settleAll(match(target).map(Entry.reset))),
			setData: (factory, input, updater) =>
				Effect.sync(() => {
					const entry = build(factory, input);
					const next = isUpdateFunction(updater)
						? updater(
								entry.state.hasData ? dataOf<typeof factory>(entry) : undefined,
							)
						: updater;
					Entry.setData(entry, next);
				}),
			subscribeUnsafe,
			[TypeId]: TypeId,
			watch: (factory, ...args) =>
				Stream.unwrap(
					Effect.map(
						buildFor(factory, args[0]),
						(entry) =>
							// SAFETY: as in `typed`, for every element.
							Entry.changes(entry) as Stream.Stream<
								Query.State<DataOf<typeof factory>>
							>,
					),
				),
		};
		return cache;
	});

/** A layer that provides a {@link QueryCache} for the layer's lifetime. */
export const layer = (config?: Config): Layer.Layer<QueryCache> =>
	Layer.effect(QueryCache, make(config));
