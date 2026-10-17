/**
 * What a framework's `useQuery` does, without the framework: one observer
 * per component, following the handle and options it reads through
 * getters, and a result of getters over the observer. A binding supplies
 * {@link Hooks}: how a read is tracked, how a change is announced, and how
 * cache writes run outside the framework's tracking. The Vue and Svelte
 * packages are this plus their reactivity and lifecycle.
 *
 * Synchronous throughout, for renders.
 */
import { Result } from "effect";

import type { QueryClient } from "./client.ts";
import {
	promiseControls,
	type ReadValue,
	resultThenable,
	throwsOnError,
	type UseQueryControls,
	type UseQueryOptions,
	type UseQueryThrowOptions,
} from "./controls.ts";
import { hashKey } from "./key.ts";
import * as QueryObserver from "./observer.ts";
import type { InputArgs, QueryFactory, QueryHandle } from "./options.ts";
import * as Query from "./query.ts";
import type { Thenable } from "./thenable.ts";

/** A read's options: the observer's, and `throwOnError` for typed errors. */
export type ReadOptions<
	TFactory extends QueryFactory,
	TThrow extends boolean | undefined = undefined,
> = UseQueryOptions &
	UseQueryThrowOptions<TFactory> & { readonly throwOnError?: TThrow };

/**
 * What a binding's `useQuery` returns: the query's controls, the `promise`
 * of the data to show, and that `data` once it's there. Each property is a
 * getter that calls {@link Hooks.track}, so destructuring reads it once.
 */
export type Result<
	TFactory extends QueryFactory,
	TThrow extends boolean | undefined = undefined,
> = UseQueryControls<TFactory> & {
	/** The promise's data once it has settled, else `undefined`. */
	readonly data: ReadValue<TFactory, TThrow> | undefined;
	/**
	 * Settles with the data to show. A new promise per data version, already
	 * settled once the cache has data.
	 */
	readonly promise: Promise<ReadValue<TFactory, TThrow>>;
};

/** {@link Result} for a handle from `ensure` or `fetch`. */
export type ResultWithData<
	TFactory extends QueryFactory,
	TThrow extends boolean | undefined = undefined,
> = Result<TFactory, TThrow> & {
	/** The query's data. The handle's `data` until the cache has data again. */
	readonly data: ReadValue<TFactory, TThrow>;
};

/** How a framework plugs into a binding. */
export interface Hooks {
	/**
	 * Runs when the result changed: a property something read, or a pending
	 * promise something read settling in place. Typically bumps the version.
	 */
	readonly notify: () => void;
	/**
	 * Runs on every read of the result, before the read, so the framework
	 * re-runs whatever read it after {@link Hooks.notify}. Typically reads a
	 * version signal.
	 */
	readonly track: () => void;
	/**
	 * Runs cache writes (starting a read can notify observers synchronously)
	 * outside the framework's tracking. Default: runs `f` as is.
	 */
	readonly untracked?: <A>(f: () => A) => A;
}

/** Where a binding reads its handle and options from. */
export interface Source<TFactory extends QueryFactory> {
	readonly handle: () => QueryHandle<TFactory>;
	readonly options: () => UseQueryOptions & {
		readonly throwOnError?: boolean;
	};
}

/** One component's read of a query. */
export interface QueryBinding<TFactory extends QueryFactory = QueryFactory> {
	readonly client: QueryClient<unknown>;
	readonly observer: QueryObserver.QueryObserver<TFactory>;
	/** The result, the same object for the binding's life. */
	readonly result: Result<TFactory, boolean>;
}

/**
 * The query a handle points at. Calls the factory, so callers keep it for
 * as long as the handle is the same.
 */
export function queryFor<TFactory extends QueryFactory>(
	client: QueryClient<unknown>,
	factory: TFactory,
	handle: QueryHandle<TFactory>,
): Query.Query<TFactory> {
	// SAFETY: `handle.input` is the input of a handle typed to this factory
	// (`QueryHandle<TFactory>`), so it fits the factory's arguments.
	const args = [handle.input] as InputArgs<TFactory>;
	return client.getQuery(factory, ...args);
}

/** The observer's part of a read's options. */
export function observerOptions(
	options: UseQueryOptions,
): QueryObserver.Options {
	return {
		refetchInterval: options.refetchInterval,
		refetchOnReconnect: options.refetchOnReconnect,
		refetchOnWindowFocus: options.refetchOnWindowFocus,
		whilePending: options.whilePending,
	};
}

function sameObserverOptions(
	a: QueryObserver.Options,
	b: QueryObserver.Options,
) {
	return (
		a.refetchInterval === b.refetchInterval &&
		a.refetchOnReconnect === b.refetchOnReconnect &&
		a.refetchOnWindowFocus === b.refetchOnWindowFocus &&
		a.whilePending === b.whilePending
	);
}

/** A binding's state, which its result reads. */
interface State<TFactory extends QueryFactory> {
	/** Pending promises a read has seen, so each announces its settling once. */
	readonly awaited: WeakSet<PromiseLike<unknown>>;
	readonly client: QueryClient<unknown>;
	readonly factory: TFactory;
	handle: QueryHandle<TFactory>;
	readonly hooks: Hooks;
	readonly observer: QueryObserver.QueryObserver<TFactory>;
	options: QueryObserver.Options;
	query: Query.Query<TFactory>;
	readonly source: Source<TFactory>;
}

function stateOf<TFactory extends QueryFactory>(
	self: QueryBinding<TFactory>,
): State<TFactory> {
	// SAFETY: `makeUnsafe` creates every binding from a `State`, and the
	// public `QueryBinding` type is how they leave this module.
	return self as unknown as State<TFactory>;
}

const runNow = <A>(f: () => A): A => f();

/**
 * Bind `factory` to the handle and options `source` returns. Reads the
 * query and observes it, but doesn't subscribe: call {@link subscribeUnsafe}
 * where the framework mounts, in the browser.
 */
export function makeUnsafe<TFactory extends QueryFactory>(
	client: QueryClient<unknown>,
	factory: TFactory,
	source: Source<TFactory>,
	hooks: Hooks,
): QueryBinding<TFactory> {
	const untracked = hooks.untracked ?? runNow;
	return untracked(() => {
		const handle = source.handle();
		const query = queryFor(client, factory, handle);
		const options = observerOptions(source.options());
		Query.readUnsafe(query);
		const state: State<TFactory> = {
			awaited: new WeakSet(),
			client,
			factory,
			handle,
			hooks,
			observer: QueryObserver.makeUnsafe(query, options),
			options,
			query,
			source,
		};
		return Object.assign(state, { result: resultOf(state) });
	});
}

/**
 * Follow the source: switch to a new handle's query, or new options. Reads
 * call it themselves, so markup that reads before the framework's effects
 * run still sees the new query. Bindings also call it from an effect, so a
 * new handle is observed even when nothing reads the result.
 */
export function syncUnsafe<TFactory extends QueryFactory>(
	self: QueryBinding<TFactory>,
): void {
	sync(stateOf(self));
}

function sync<TFactory extends QueryFactory>(impl: State<TFactory>) {
	const handle = impl.source.handle();
	const options = observerOptions(impl.source.options());
	// A getter may build an equal handle on each call: only a new key
	// switches queries.
	const newQuery =
		handle !== impl.handle && hashKey(handle.key) !== impl.query.hash;
	impl.handle = handle;
	if (!newQuery && sameObserverOptions(options, impl.options)) {
		return;
	}
	(impl.hooks.untracked ?? runNow)(() => {
		if (newQuery) {
			impl.query = queryFor(impl.client, impl.factory, handle);
			Query.readUnsafe(impl.query);
		}
		impl.options = options;
		QueryObserver.setOptionsUnsafe(impl.observer, impl.query, options);
	});
}

/**
 * Notify {@link Hooks.notify} on result changes from now on. A server
 * render reads once and never unmounts, so bindings call it in the browser
 * only. Returns the unsubscribe.
 */
export function subscribeUnsafe<TFactory extends QueryFactory>(
	self: QueryBinding<TFactory>,
): () => void {
	const impl = stateOf(self);
	return QueryObserver.subscribeUnsafe(impl.observer, impl.hooks.notify);
}

function resultOf<TFactory extends QueryFactory>(
	impl: State<TFactory>,
): Result<TFactory, boolean> {
	const { hooks, observer } = impl;

	function read(name: QueryObserver.ResultKey): QueryObserver.Result {
		sync(impl);
		hooks.track();
		QueryObserver.trackProp(observer, name);
		// Without a subscription the observer doesn't hear of cache changes,
		// so a server read derives the result from the cache each time.
		return impl.client.isServer
			? QueryObserver.getOptimisticResultUnsafe(
					observer,
					impl.query,
					impl.options,
				)
			: QueryObserver.getUnsafe(observer);
	}

	function throwOnError() {
		return throwsOnError(
			impl.query,
			impl.source.options().throwOnError,
			impl.client.throwOnError,
		);
	}

	// A promise settles in place, so the result doesn't change when it does;
	// whatever read a pending one re-runs when it settles.
	function shown(): Thenable<unknown> {
		const promise = read("promise").promise;
		if (promise.status === "pending" && !impl.awaited.has(promise)) {
			impl.awaited.add(promise);
			promise.then(hooks.notify, hooks.notify);
		}
		return throwOnError() ? promise : resultThenable(promise);
	}

	function controls() {
		return promiseControls(QueryObserver.getUnsafe(observer));
	}

	const result = {
		get data() {
			const promise = shown();
			if (promise.status === "fulfilled") {
				return promise.value;
			}
			const handle = impl.handle;
			if (!("data" in handle)) {
				return undefined;
			}
			const data: unknown = handle.data;
			return throwOnError() ? data : Result.succeed(data);
		},
		get error() {
			return read("error").error;
		},
		fetchNextPage: () => controls().fetchNextPage(),
		fetchPreviousPage: () => controls().fetchPreviousPage(),
		get hash() {
			return read("hash").hash;
		},
		get hasNextPage() {
			return read("hasNextPage").hasNextPage;
		},
		get hasPreviousPage() {
			return read("hasPreviousPage").hasPreviousPage;
		},
		get input() {
			return read("input").input;
		},
		get isFetching() {
			return read("isFetching").isFetching;
		},
		get isFetchingNextPage() {
			return read("isFetchingNextPage").isFetchingNextPage;
		},
		get isFetchingPreviousPage() {
			return read("isFetchingPreviousPage").isFetchingPreviousPage;
		},
		get isPending() {
			return read("isPending").isPending;
		},
		get isPrevious() {
			return read("isPrevious").isPrevious;
		},
		get isStale() {
			return read("isStale").isStale;
		},
		get key() {
			return read("key").key;
		},
		get promise() {
			return shown();
		},
		refetch: () => controls().refetch(),
		get updatedAt() {
			return read("updatedAt").updatedAt;
		},
	};
	// SAFETY: `data` and `promise` hold this factory's data, or a `Result` of
	// it when the read doesn't throw, and the object has every control of
	// both shapes; bindings' overloads pick the shape from the handle's type.
	return result as unknown as Result<TFactory, boolean>;
}
