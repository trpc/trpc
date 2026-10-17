/**
 * One reader's view of one query at a time, as a data type, like TanStack
 * Query's `QueryObserver`: it derives the reader's result from the query's
 * state, keeps a previous query's data for `whilePending: "previous"`, runs
 * `refetchInterval`, and notifies its listeners only when a result property
 * they read changed (see {@link trackResult}), or a promise whose `status`
 * they read settled (see {@link trackThenable}). Bindings make one per hook.
 *
 * The `*Unsafe` functions read and update synchronously, for renders and
 * external stores. While it has listeners, the observer holds a `Scope` (a
 * child of its query's) that owns the query subscription and the polling
 * fiber; the last listener leaving, a switch to another query, or the query
 * leaving its cache closes it.
 */
import {
	Effect,
	Exit,
	FiberHandle,
	Pipeable,
	Predicate,
	Scope,
	type Stream,
} from "effect";

import { entryOf } from "./entry.ts";
import type { QueryKey } from "./key.ts";
import { listen } from "./listen.ts";
import type { DataOf, QueryFactory } from "./options.ts";
import { Platform } from "./platform.ts";
import * as Query from "./query.ts";
import type { Thenable } from "./thenable.ts";

export const TypeId = "~@raf-query/core/QueryObserver";

export type TypeId = typeof TypeId;

/** How one reader observes its query. */
export interface Options {
	/** Refetch on this interval (ms) while subscribed and the page is visible. */
	readonly refetchInterval?: number;
	/** Refetch on reconnect while stale. Default: the query's option, else `true`. */
	readonly refetchOnReconnect?: boolean;
	/** Refetch on window focus while stale. Default: the query's option, else `true`. */
	readonly refetchOnWindowFocus?: boolean;
	/**
	 * What to show while the query has no data yet:
	 * - `"suspend"` (default): the result's promise is the query's pending one.
	 * - `"previous"`: keep the last observed query's data, with `isPrevious`.
	 */
	readonly whilePending?: "previous" | "suspend";
}

/** What a reader sees of its query. Replaced, never mutated, on every change. */
export interface Result<TData = unknown> {
	/** Error of the last failed request. Existing data stays readable. */
	readonly error: unknown;
	/** The query's `fetchNextPage`. */
	readonly fetchNextPage: Effect.Effect<void>;
	/** The query's `fetchPreviousPage`. */
	readonly fetchPreviousPage: Effect.Effect<void>;
	/** Stable string form of the observed query's key. */
	readonly hash: string;
	readonly hasNextPage: boolean;
	readonly hasPreviousPage: boolean;
	/** Input of the data in `promise`; differs from the query's while `isPrevious`. */
	readonly input: unknown;
	/** A request is in flight: first load, new input, or background refetch. */
	readonly isFetching: boolean;
	readonly isFetchingNextPage: boolean;
	readonly isFetchingPreviousPage: boolean;
	/** No data yet for the observed query. */
	readonly isPending: boolean;
	/** `promise` holds a previous query's data (`whilePending: "previous"`). */
	readonly isPrevious: boolean;
	/** The data is older than `staleTime`, or was invalidated. */
	readonly isStale: boolean;
	/** Key of the data in `promise`; differs from the query's while `isPrevious`. */
	readonly key: QueryKey;
	/** Settles with the data to show; see `Query.State.promise`. */
	readonly promise: Thenable<TData>;
	/** The query's `refetch`. */
	readonly refetch: Effect.Effect<void>;
	/** When the data in `promise` was fetched (ms since epoch); `0` before that. */
	readonly updatedAt: number;
}

export type ResultKey = keyof Result;

/** An observer of a factory's queries; its results hold the factory's {@link DataOf}. */
export interface QueryObserver<TFactory extends QueryFactory = QueryFactory>
	extends Pipeable.Pipeable {
	/** The options set by the latest `make` or {@link setOptionsUnsafe}. */
	readonly options: Options;
	/** The observed query. */
	readonly query: Query.Query<TFactory>;
	readonly [TypeId]: {
		readonly _A: (_: never) => DataOf<TFactory>;
	};
}

/** Open while the observer has listeners. */
interface Subscription {
	/** At most one polling fiber, restarted when `refetchInterval` changes. */
	readonly polls: FiberHandle.FiberHandle<never, never>;
	/** Owns the query subscription and `polls`. */
	readonly scope: Scope.Closeable;
}

interface Impl<TFactory extends QueryFactory> extends QueryObserver<TFactory> {
	current: Result<DataOf<TFactory>>;
	/**
	 * `current.promise.status` when `current` was set. A first load settles
	 * its promise in place, so the status can change while the promise
	 * stays the same.
	 */
	currentStatus: Thenable<unknown>["status"];
	/** The last observed query that had data, for `whilePending: "previous"`. */
	lastWithData: Query.Query<TFactory> | undefined;
	readonly listeners: Set<() => void>;
	options: Options;
	query: Query.Query<TFactory>;
	subscription: Subscription | undefined;
	/** The latest {@link trackThenable} wrapper this observer handed out. */
	tracked: Thenable<unknown> | undefined;
	/** Result properties a reader has read; empty means notify on any change. */
	readonly trackedProps: Set<ResultKey>;
}

const Proto = {
	...Pipeable.Prototype,
	[TypeId]: { _A: (value: never) => value },
};

const resultKeys = {
	error: true,
	fetchNextPage: true,
	fetchPreviousPage: true,
	hash: true,
	hasNextPage: true,
	hasPreviousPage: true,
	input: true,
	isFetching: true,
	isFetchingNextPage: true,
	isFetchingPreviousPage: true,
	isPending: true,
	isPrevious: true,
	isStale: true,
	key: true,
	promise: true,
	refetch: true,
	updatedAt: true,
} satisfies Record<ResultKey, true>;

export function isQueryObserver(value: unknown): value is QueryObserver {
	return Predicate.hasProperty(value, TypeId);
}

function implOf<TFactory extends QueryFactory>(
	self: QueryObserver<TFactory>,
): Impl<TFactory> {
	// SAFETY: `makeUnsafe` creates every value that carries `TypeId`, and the
	// public `QueryObserver` type is how they leave this module.
	return self as Impl<TFactory>;
}

function isResultKey(name: PropertyKey): name is ResultKey {
	return Predicate.isString(name) && Object.hasOwn(resultKeys, name);
}

/** Whether `next.promise` has a different status than it had in the current result. */
function settled<TFactory extends QueryFactory>(
	self: Impl<TFactory>,
	next: Result,
) {
	return self.currentStatus !== next.promise.status;
}

function anyChanged<TFactory extends QueryFactory>(
	self: Impl<TFactory>,
	next: Result,
) {
	return (
		settled(self, next) ||
		Object.keys(resultKeys).some(
			(name) => isResultKey(name) && self.current[name] !== next[name],
		)
	);
}

function setCurrent<TFactory extends QueryFactory>(
	self: Impl<TFactory>,
	next: Result<DataOf<TFactory>>,
) {
	self.current = next;
	self.currentStatus = next.promise.status;
}

/** The result for `query` with `options`, given the last query that had data. */
function resultOf<TFactory extends QueryFactory>(
	query: Query.Query<TFactory>,
	options: Options,
	lastWithData: Query.Query<TFactory> | undefined,
): Result<DataOf<TFactory>> {
	const state = Query.getUnsafe(query);
	const previous =
		options.whilePending === "previous" &&
		!state.hasData &&
		state.status !== "error" &&
		lastWithData !== undefined &&
		lastWithData.hash !== query.hash
			? lastWithData
			: undefined;
	const shown = previous ?? query;
	const shownState = previous ? Query.getUnsafe(previous) : state;
	return {
		error: state.error,
		fetchNextPage: Query.fetchNextPage(query),
		fetchPreviousPage: Query.fetchPreviousPage(query),
		hash: query.hash,
		hasNextPage: Query.hasNextPageUnsafe(query),
		hasPreviousPage: Query.hasPreviousPageUnsafe(query),
		input: shown.handle.input,
		isFetching: state.isFetching,
		isFetchingNextPage: state.fetchDirection === "forward",
		isFetchingPreviousPage: state.fetchDirection === "backward",
		isPending: !state.hasData,
		isPrevious: previous !== undefined,
		isStale: state.isStale,
		key: shown.handle.key,
		promise: shownState.promise,
		refetch: Query.refetch(query),
		updatedAt: shownState.updatedAt,
	};
}

/** Observe `query`. Doesn't subscribe to it until the observer has a listener. */
export function makeUnsafe<TFactory extends QueryFactory>(
	query: Query.Query<TFactory>,
	options: Options = {},
): QueryObserver<TFactory> {
	const current = resultOf(query, options, undefined);
	const self: Impl<TFactory> = Object.assign(Object.create(Proto), {
		current,
		currentStatus: current.promise.status,
		lastWithData: Query.getUnsafe(query).hasData ? query : undefined,
		listeners: new Set(),
		options,
		query,
		subscription: undefined,
		tracked: undefined,
		trackedProps: new Set(),
	});
	return self;
}

/** {@link makeUnsafe}, as an Effect. */
export function make<TFactory extends QueryFactory>(
	query: Query.Query<TFactory>,
	options?: Options,
): Effect.Effect<QueryObserver<TFactory>> {
	return Effect.sync(() => makeUnsafe(query, options));
}

/** The current result. */
export function getUnsafe<TFactory extends QueryFactory>(
	self: QueryObserver<TFactory>,
): Result<DataOf<TFactory>> {
	return implOf(self).current;
}

/** {@link getUnsafe}, as an Effect. */
export function get<TFactory extends QueryFactory>(
	self: QueryObserver<TFactory>,
): Effect.Effect<Result<DataOf<TFactory>>> {
	return Effect.sync(() => getUnsafe(self));
}

/**
 * The result for `query` with `options` right now, without switching to
 * them. Bindings call this during render, before `setOptionsUnsafe` commits.
 */
export function getOptimisticResultUnsafe<TFactory extends QueryFactory>(
	self: QueryObserver<TFactory>,
	query: Query.Query<TFactory>,
	options: Options,
): Result<DataOf<TFactory>> {
	const impl = implOf(self);
	const result = resultOf(query, options, impl.lastWithData);
	if (anyChanged(impl, result)) {
		setCurrent(impl, result);
	}
	return result;
}

/** Observe `query` with `options` from now on. */
export function setOptionsUnsafe<TFactory extends QueryFactory>(
	self: QueryObserver<TFactory>,
	query: Query.Query<TFactory>,
	options: Options,
): void {
	const impl = implOf(self);
	const previous = impl.query;
	const previousInterval = impl.options.refetchInterval;
	impl.query = query;
	impl.options = options;
	if (impl.listeners.size > 0) {
		if (query !== previous) {
			connect(impl);
		} else if (options.refetchInterval !== previousInterval) {
			restartPolling(impl);
		}
	}
	updateResult(impl);
}

/** Listen for result changes. The first listener subscribes to the query. */
export function subscribeUnsafe<TFactory extends QueryFactory>(
	self: QueryObserver<TFactory>,
	listener: () => void,
): () => void {
	const impl = implOf(self);
	impl.listeners.add(listener);
	if (!impl.subscription) {
		connect(impl);
		updateResult(impl);
	}
	return () => {
		if (!impl.listeners.delete(listener) || impl.listeners.size > 0) {
			return;
		}
		disconnect(impl);
	};
}

/**
 * The current result, then every change listeners are notified of. Counts
 * as a listener while the stream runs, so the query counts as read.
 */
export function changes<TFactory extends QueryFactory>(
	self: QueryObserver<TFactory>,
): Stream.Stream<Result<DataOf<TFactory>>> {
	return listen((push) => {
		let last: Result<DataOf<TFactory>> | undefined;
		const emit = () => {
			const result = getUnsafe(self);
			if (result !== last) {
				last = result;
				push(result);
			}
		};
		const unsubscribe = subscribeUnsafe(self, emit);
		emit();
		return unsubscribe;
	});
}

/**
 * Wrap `result` so that reading a property marks it tracked. Once any
 * property is tracked, listeners are only notified when a tracked one
 * changes.
 */
export function trackResult<
	TFactory extends QueryFactory,
	TResult extends Result<DataOf<TFactory>>,
>(self: QueryObserver<TFactory>, result: TResult): TResult {
	return new Proxy(result, {
		get: (target, name, receiver) => {
			if (isResultKey(name)) {
				trackProp(self, name);
			}
			// oxlint-disable-next-line anti-slop/no-reflect-get -- a Proxy trap forwarding to its target
			return Reflect.get(target, name, receiver);
		},
	});
}

const settledFields: ReadonlySet<PropertyKey> = new Set([
	"reason",
	"status",
	"value",
]);

/**
 * One wrapper per promise, shared by every observer, so its identity is as
 * stable as the promise's: an observer made by a render that suspended
 * before committing is replaced on the next attempt, and `use()` expects
 * the same promise again.
 */
const wrappers = new WeakMap<Thenable<unknown>, Thenable<unknown>>();

/** Wrappers whose `status`, `value` or `reason` a reader has read. */
const settledReads = new WeakSet<Thenable<unknown>>();

/**
 * Wrap `promise`, the result's or one derived from it, so that reading its
 * `status`, `value` or `reason` marks its settling as tracked. A first load
 * settles its promise in place, without a new promise, so only readers of
 * those fields need to hear about it. The mark is the wrapper's, shared by
 * the observers that hand it out.
 */
export function trackThenable<
	TFactory extends QueryFactory,
	TThenable extends Thenable<unknown>,
>(self: QueryObserver<TFactory>, promise: TThenable): TThenable {
	let wrapper = wrappers.get(promise);
	if (!wrapper) {
		const created: Thenable<unknown> = new Proxy(promise, {
			get: (target, name) => {
				if (settledFields.has(name)) {
					settledReads.add(created);
				}
				// oxlint-disable-next-line anti-slop/no-reflect-get -- a Proxy trap forwarding to its target
				const value: unknown = Reflect.get(target, name, target);
				// `Promise.prototype.then` throws on a receiver that isn't a promise.
				return Predicate.isFunction(value) ? value.bind(target) : value;
			},
		});
		wrappers.set(promise, created);
		wrapper = created;
	}
	implOf(self).tracked = wrapper;
	// SAFETY: stored above under the promise it wraps.
	return wrapper as TThenable;
}

function readsSettled<TFactory extends QueryFactory>(self: Impl<TFactory>) {
	return self.tracked !== undefined && settledReads.has(self.tracked);
}

/** Mark `name` as read, for bindings that track access themselves. */
export function trackProp<TFactory extends QueryFactory>(
	self: QueryObserver<TFactory>,
	name: ResultKey,
): void {
	implOf(self).trackedProps.add(name);
}

/** Recompute the result, and notify listeners if a tracked property changed. */
function updateResult<TFactory extends QueryFactory>(self: Impl<TFactory>) {
	const next = resultOf(self.query, self.options, self.lastWithData);
	if (Query.getUnsafe(self.query).hasData) {
		self.lastWithData = self.query;
	}
	if (!anyChanged(self, next)) {
		return;
	}
	const notify = shouldNotify(self, next);
	setCurrent(self, next);
	if (notify) {
		for (const listener of self.listeners) {
			listener();
		}
	}
}

/** Whether something tracked differs in `next` from the current result. */
function shouldNotify<TFactory extends QueryFactory>(
	self: Impl<TFactory>,
	next: Result,
) {
	if (self.trackedProps.size === 0 && !readsSettled(self)) {
		return true;
	}
	if (readsSettled(self) && settled(self, next)) {
		return true;
	}
	for (const name of self.trackedProps) {
		if (self.current[name] !== next[name]) {
			return true;
		}
	}
	return false;
}

/**
 * Subscribe to the current query in a new scope under its entry's, and
 * start polling. Replaces any previous subscription.
 */
function connect<TFactory extends QueryFactory>(self: Impl<TFactory>) {
	disconnect(self);
	const query = self.query;
	const preferences: Query.SubscribeOptions = {
		get refetchOnReconnect() {
			return self.options.refetchOnReconnect;
		},
		get refetchOnWindowFocus() {
			return self.options.refetchOnWindowFocus;
		},
	};
	const scope = Scope.forkUnsafe(entryOf(query).scope);
	// Finalizers run last-in first, so closing the scope unsubscribes before
	// it interrupts the polling fiber.
	const polls = Effect.runSync(
		FiberHandle.make<never, never>().pipe(
			Effect.tap(
				Effect.acquireRelease(
					Effect.sync(() =>
						Query.subscribeUnsafe(query, () => updateResult(self), preferences),
					),
					(unsubscribe) => Effect.sync(unsubscribe),
				),
			),
			Scope.provide(scope),
		),
	);
	self.subscription = { polls, scope };
	restartPolling(self);
}

function disconnect<TFactory extends QueryFactory>(self: Impl<TFactory>) {
	const subscription = self.subscription;
	self.subscription = undefined;
	if (subscription) {
		Effect.runFork(Scope.close(subscription.scope, Exit.void));
	}
}

/** Run `poll` for the current `refetchInterval`, or stop polling without one. */
function restartPolling<TFactory extends QueryFactory>(self: Impl<TFactory>) {
	const subscription = self.subscription;
	if (!subscription) {
		return;
	}
	const interval = self.options.refetchInterval;
	const polls = subscription.polls;
	Effect.runForkWith(entryOf(self.query).cache.services)(
		interval !== undefined && Number.isFinite(interval) && interval > 0
			? FiberHandle.run(polls, poll(self.query, interval))
			: FiberHandle.clear(polls),
	);
}

/** Refetch `query` every `interval` ms while the page is visible. */
function poll<TFactory extends QueryFactory>(
	query: Query.Query<TFactory>,
	interval: number,
): Effect.Effect<never> {
	return Effect.gen(function* () {
		const platform = yield* Platform;
		if (platform.isVisibleUnsafe()) {
			yield* Effect.forkChild(Query.refetch(query), {
				startImmediately: true,
			});
		}
	}).pipe(Effect.delay(interval), Effect.forever);
}
