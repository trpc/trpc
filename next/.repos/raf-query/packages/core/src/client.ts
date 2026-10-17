import { Context, Effect, Exit, Layer, Option, Predicate, Scope } from "effect";

import * as QueryCache from "./cache.ts";
import type {
	DehydratedState,
	DehydrateOptions,
	HydrateOptions,
} from "./hydration.ts";
import type {
	DataOf,
	InputArgs,
	InputOf,
	LoadOptions,
	PagedQueryFactory,
	QueryFactory,
	QueryHandle,
	QueryHandleWithData,
} from "./options.ts";
import type * as Query from "./query.ts";

export interface QueryClientConfig<TServices = never>
	extends QueryCache.Config {
	/**
	 * Services for queries whose `queryFn` returns an Effect. Built with the
	 * client, so it must build synchronously; `dispose()` runs its
	 * finalizers.
	 */
	readonly layer?: Layer.Layer<TServices>;
	/** Called with every failed request, including failed prefetches. */
	onError?(error: unknown, query: Query.Query): void;
	/**
	 * When `false`, `useQuery` for an Effect `queryFn` (a typed `ErrorOf`)
	 * returns a `Result` in the first tuple slot instead of a promise that
	 * rejects. Defaults to `false` when `layer` is set, `true` otherwise.
	 * A query's own `throwOnError` (in `queryOptions`) and a read's win over
	 * it; types only see those two. Promise `queryFn`s always throw, whatever
	 * the flags say: reads tell them apart by what the `queryFn` returned
	 * ({@link Query.returnsEffectUnsafe}).
	 */
	readonly throwOnError?: boolean;
}

/**
 * A verb's Effect, run by a client. Its requirement is the factory's
 * `ServicesOf`, which the client's verbs only accept when its `layer`
 * provides them.
 */
function provided<A, E, R>(
	effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E> {
	// SAFETY: the cache was built over the client's `layer`, so every request
	// already runs with those services, and the verbs take only factories of
	// `QueryFactory<TServices>`.
	return effect as Effect.Effect<A, E>;
}

/**
 * Run a verb that waits on a request. A cancelled request rejects with an
 * `AbortError`, as an aborted `fetch` does, not with the Effect API's
 * `Query.CancelledError`.
 */
function runLoad<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
	return Effect.runPromise(effect).catch((error: unknown) => {
		throw Predicate.isTagged(error, "CancelledError")
			? new DOMException("The query was cancelled", "AbortError")
			: error;
	});
}

/** `ensure` / `fetch` arguments, forwarded to the cache's same verb. */
function loadArgs<TFactory extends QueryFactory>(
	input: InputOf<TFactory> | undefined,
	options: LoadOptions | undefined,
): InputArgs<TFactory> {
	// SAFETY: the client's overloads checked `input` against the factory and
	// allowed `options` for paged factories only, as the cache's overloads do;
	// the cache reads both positions.
	return [input, options] as unknown as InputArgs<TFactory>;
}

/**
 * The query cache, with Promise methods. Create one per request on the
 * server and one per browser tab. `effect` is the same cache's Effect API.
 * Its verbs take factories whose `queryFn` needs at most `TServices`, the
 * services of `config.layer`.
 */
export class QueryClient<TServices = never> {
	/** The Effect-native cache behind this client. */
	readonly effect: QueryCache.QueryCache;
	readonly isServer: boolean;
	/**
	 * Default for Effect `useQuery` reads. See
	 * {@link QueryClientConfig.throwOnError}.
	 */
	readonly throwOnError: boolean;
	/**
	 * The cache and the layer's services. Typed `never` so clients of any
	 * `TServices` stay assignable to each other; `runPromise` restores it.
	 */
	readonly #context: Context.Context<never>;
	/**
	 * Owns the cache's fibers, mounts and the layer's services; lives until
	 * `dispose()`.
	 */
	readonly #scope = Scope.makeUnsafe();

	constructor(config: QueryClientConfig<TServices> = {}) {
		const cache = QueryCache.layer(config);
		const services = Effect.runSync(
			Layer.buildWithScope(
				config.layer ? Layer.provideMerge(cache, config.layer) : cache,
				this.#scope,
			),
		);
		this.#context = services;
		this.effect = Context.get(services, QueryCache.QueryCache);
		this.isServer = this.effect.isServer;
		this.throwOnError = config.throwOnError ?? config.layer === undefined;
		const onError = config.onError;
		if (onError) {
			this.effect.subscribeUnsafe((event) => {
				if (event.type === "failed") {
					onError(event.error, event.query);
				}
			});
		}
	}

	/**
	 * The cache entry for a factory call, created if missing. Doesn't fetch.
	 * For bindings; apps use the verbs.
	 */
	getQuery<TFactory extends QueryFactory<TServices>>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Query.Query<TFactory> {
		return this.effect.getQueryUnsafe(factory, ...args);
	}

	/**
	 * Start a query without waiting and return its handle. Fresh data is
	 * reused; stale data refetches in the background (in the browser only).
	 * Errors surface where the data is read, never here.
	 */
	prefetch<TFactory extends QueryFactory<TServices>>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): QueryHandle<TFactory> {
		return Effect.runSync(provided(this.effect.prefetch(factory, ...args)));
	}

	/**
	 * {@link fetch} without waiting on stale data: start a query and wait for
	 * it on a cache miss. Stale cached data resolves immediately and
	 * revalidates in the browser. Rejects if that request fails.
	 */
	ensure<TFactory extends QueryFactory<TServices>>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Promise<QueryHandleWithData<TFactory>>;
	/** {@link ensure}, loading `options.pages` pages of a paged query. */
	ensure<TFactory extends PagedQueryFactory<TServices>>(
		factory: TFactory,
		input: InputOf<TFactory>,
		options: LoadOptions,
	): Promise<QueryHandleWithData<TFactory>>;
	ensure<TFactory extends QueryFactory<TServices>>(
		factory: TFactory,
		input?: InputOf<TFactory>,
		options?: LoadOptions,
	): Promise<QueryHandleWithData<TFactory>> {
		return runLoad(
			provided(
				this.effect.ensure(factory, ...loadArgs<TFactory>(input, options)),
			),
		);
	}

	/**
	 * Start a query and resolve to a handle holding its data. Waits on a cache
	 * miss and on stale data (on the server, only invalidated data), so the
	 * data is fresh. Rejects if that request fails.
	 */
	fetch<TFactory extends QueryFactory<TServices>>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Promise<QueryHandleWithData<TFactory>>;
	/** {@link fetch}, loading `options.pages` pages of a paged query. */
	fetch<TFactory extends PagedQueryFactory<TServices>>(
		factory: TFactory,
		input: InputOf<TFactory>,
		options: LoadOptions,
	): Promise<QueryHandleWithData<TFactory>>;
	fetch<TFactory extends QueryFactory<TServices>>(
		factory: TFactory,
		input?: InputOf<TFactory>,
		options?: LoadOptions,
	): Promise<QueryHandleWithData<TFactory>> {
		return runLoad(
			provided(
				this.effect.fetch(factory, ...loadArgs<TFactory>(input, options)),
			),
		);
	}

	/**
	 * Mark queries stale and refetch the ones being read. Resolves once those
	 * refetches settle, so an action stays pending until fresh data is on
	 * screen. Takes a factory and its input, or a {@link QueryCache.Filter}.
	 */
	invalidate<TFactory extends QueryFactory<TServices>>(
		...target: QueryCache.Target<TFactory>
	): Promise<void> {
		return Effect.runPromise(this.effect.invalidate(...target));
	}

	/**
	 * Drop queries' data and errors, as if they were never fetched. Read ones
	 * suspend and refetch; resolves once those refetches settle.
	 */
	reset<TFactory extends QueryFactory<TServices>>(
		...target: QueryCache.Target<TFactory>
	): Promise<void> {
		return Effect.runPromise(this.effect.reset(...target));
	}

	/**
	 * Remove queries from the cache and abort their requests. Readers keep the
	 * removed entry until they render again.
	 */
	remove<TFactory extends QueryFactory<TServices>>(
		...target: QueryCache.Target<TFactory>
	): void {
		Effect.runSync(this.effect.remove(...target));
	}

	/** Write data for a factory call. Readers re-render without suspending. */
	setData<TFactory extends QueryFactory<TServices>>(
		factory: TFactory,
		input: InputOf<TFactory>,
		updater: QueryCache.Updater<DataOf<TFactory>>,
	): void {
		Effect.runSync(this.effect.setData(factory, input, updater));
	}

	/**
	 * Cached data for a factory call, or `undefined` if there is none. Data can
	 * itself be `undefined`; `Query.getUnsafe(getQuery(...)).hasData` tells
	 * them apart.
	 */
	getData<TFactory extends QueryFactory<TServices>>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): DataOf<TFactory> | undefined {
		return Option.getOrUndefined(
			Effect.runSync(this.effect.getData(factory, ...args)),
		);
	}

	/** Every entry, for devtools and integrations. */
	getAll(): ReadonlyArray<Query.Query> {
		return Effect.runSync(this.effect.all);
	}

	/**
	 * How many entries have a request in flight: all of them, or those
	 * matching `filter`. For global loading indicators.
	 */
	isFetching(filter?: QueryCache.Filter): number {
		return this.effect.isFetchingUnsafe(filter);
	}

	/** Listen to entries being added, updated, and removed. */
	subscribe(listener: (event: QueryCache.Event) => void): () => void {
		return this.effect.subscribeUnsafe(listener);
	}

	/** Drop every entry and abort in-flight requests. */
	clear(): void {
		Effect.runSync(this.effect.clear);
	}

	/**
	 * Start refetching read, stale queries on window focus and reconnect.
	 * Returns the matching unmount. Providers call this; mounts are counted.
	 */
	mount(): () => void {
		const scope = Scope.forkUnsafe(this.#scope);
		Effect.runSync(this.effect.mount.pipe(Scope.provide(scope)));
		return () => {
			Effect.runSync(Scope.close(scope, Exit.void));
		};
	}

	/**
	 * Run an Effect with the cache (`QueryCache`) and the services of
	 * `config.layer`, as `Effect.runPromise` does: it rejects with the
	 * Effect's failure, or its defect. For an app's loaders and actions.
	 */
	runPromise<A, E>(
		effect: Effect.Effect<A, E, QueryCache.QueryCache | TServices>,
	): Promise<A> {
		return Effect.runPromiseWith(this.#context)(
			// SAFETY: `#context` holds the cache and the layer's services, the
			// requirement of every Effect this method's signature accepts.
			effect as Effect.Effect<A, E>,
		);
	}

	/**
	 * Close the client: interrupt every request and timer, and release the
	 * layer's services. Resolves once the layer's finalizers have run.
	 */
	dispose(): Promise<void> {
		return Effect.runPromise(Scope.close(this.#scope, Exit.void));
	}
}

/** Snapshot the cache for transfer to another client (server → browser). */
export function dehydrate(
	client: QueryClient,
	options?: DehydrateOptions,
): DehydratedState {
	return Effect.runSync(client.effect.dehydrate(options));
}

/**
 * Write dehydrated entries into a client. Existing entries only take newer
 * data; pending entries resume the sender's request.
 */
export function hydrate(
	client: QueryClient,
	state: DehydratedState,
	options?: HydrateOptions,
): void {
	Effect.runSync(client.effect.hydrate(state, options));
}
