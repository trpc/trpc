import {
	Cause,
	type Clock,
	type Context,
	Data,
	Deferred,
	Effect,
	Exit,
	FiberMap,
	Pipeable,
	Predicate,
	Schedule,
	Scope,
	type Stream,
} from "effect";

import type { Event as CacheEvent } from "./cache.ts";
import {
	type Direction,
	fetchPages,
	isInfiniteData,
	nextPageParam,
	previousPageParam,
} from "./infinite.ts";
import type { QueryKey } from "./key.ts";
import { listen } from "./listen.ts";
import { scheduleNotify } from "./notify.ts";
import type {
	AnyQueryOptions,
	QueryBehavior,
	QueryFactory,
	QueryFnResult,
	QueryHandle,
	QueryMeta,
} from "./options.ts";
import { type Platform, type PlatformEvent, whenOnline } from "./platform.ts";
import type { FetchRequest, Query, State, SubscribeOptions } from "./query.ts";
import { fromQueryFn, requestServices, runRequest } from "./request.ts";
import { retrySchedule } from "./retry.ts";
import { replaceEqualDeep } from "./share.ts";
import { fulfilled, type Pending, pending, type Thenable } from "./thenable.ts";

export const TypeId = "~@raf-query/core/Query";

/**
 * The failure of a request that was interrupted rather than settled: its
 * entry was removed or cleared, or an Effect `queryFn` was interrupted.
 */
export class CancelledError extends Data.TaggedError("CancelledError") {
	override readonly message = "The query was cancelled";
}

/**
 * Why a query with `enabled: false` has no data: `ensure` / `fetch` die
 * with it, and on a server its promise rejects with it.
 */
export class DisabledError extends Data.TaggedError("DisabledError")<{
	readonly hash: string;
}> {
	override get message() {
		return `Query ${this.hash} is disabled (enabled: false)`;
	}
}

/**
 * The state a cache shares with its entries. Entries are created
 * synchronously (a render reads one), so they fork their fibers with the
 * services and into the scope the cache was made with.
 */
export interface CacheState {
	readonly clock: Clock.Clock;
	readonly defaults: QueryBehavior;
	readonly entries: Map<string, Entry>;
	readonly isServer: boolean;
	readonly listeners: Set<(event: CacheEvent) => void>;
	readonly platform: Platform;
	readonly scope: Scope.Scope;
	readonly services: Context.Context<never>;
}

/** The background work of an entry, one fiber per kind. */
type Task = "errorShown" | "gc" | "request" | "stale";

interface Tasks {
	cancel(task: Task): void;
	fork(
		task: Task,
		effect: Effect.Effect<void>,
		options?: { readonly onlyIfMissing?: boolean },
	): void;
}

interface Commands {
	readonly fetchNextPage: Effect.Effect<void>;
	readonly fetchPreviousPage: Effect.Effect<void>;
	readonly refetch: Effect.Effect<void>;
}

/** A cache entry: a {@link Query} and the state behind it. */
export interface Entry extends Query {
	readonly cache: CacheState;
	/** One Effect per command, so readers can compare them by identity. */
	readonly commands: Commands;
	/** A failed first load was shown; the next read retries it. */
	errorShown: boolean;
	/** `failureCount` before the request in flight, restored if it's cancelled. */
	failureCountBefore: number;
	handle: QueryHandle;
	/** `meta` sent with dehydrated state, for an entry no factory call has reached. */
	hydratedMeta: QueryMeta | undefined;
	/** Awaited by every caller of the request in flight; outlives restarts. */
	inFlight: Deferred.Deferred<unknown, unknown> | undefined;
	readonly listeners: Map<() => void, SubscribeOptions>;
	options: AnyQueryOptions | undefined;
	/** The first load's promise, until it settles. */
	pending: Pending<unknown> | undefined;
	/** The last reader left during the request in flight: it retries no more. */
	retriesStopped: boolean;
	/**
	 * The last `queryFn` call returned an Effect (`true`) or a promise or
	 * plain value (`false`), here or on the cache it was hydrated from.
	 * `undefined` until one has run.
	 */
	returnsEffect: boolean | undefined;
	/** Open while the entry is cached; owns its fibers. */
	readonly scope: Scope.Closeable;
	/**
	 * What its requests run with: the cache's services, under those of the
	 * latest verb that called for this entry ({@link provide}).
	 */
	services: Context.Context<never>;
	/**
	 * The request in flight read its `signal`, or returned an Effect, so
	 * interrupting it cancels its work (TanStack's `abortSignalConsumed`).
	 */
	signalRead: boolean;
	state: State<unknown>;
	readonly tasks: Tasks;
}

const Proto = {
	...Pipeable.Prototype,
	[TypeId]: { _A: (value: never) => value, _E: (value: never) => value },
};

const defaultSubscribeOptions: SubscribeOptions = {};

export function isQuery(value: unknown): value is Query {
	return Predicate.hasProperty(value, TypeId);
}

export function entryOf<TFactory extends QueryFactory>(
	query: Query<TFactory>,
): Entry {
	// SAFETY: `make` below creates every value that carries `TypeId`, and the
	// public `Query` type is how those entries leave this module.
	return query as unknown as Entry;
}

export function emit(cache: CacheState, event: CacheEvent) {
	for (const listener of cache.listeners) {
		listener(event);
	}
}

/** Fibers keyed by task: forking a task interrupts its previous fiber. */
function makeTasks(cache: CacheState, scope: Scope.Scope): Tasks {
	const runSync = Effect.runSyncWith(cache.services);
	const runFork = Effect.runForkWith(cache.services);
	const fibers = runSync(
		FiberMap.make<Task, void, never>().pipe(Scope.provide(scope)),
	);
	const run = runSync(FiberMap.runtime(fibers)<never>());
	return {
		cancel(task) {
			if (FiberMap.hasUnsafe(fibers, task)) {
				runFork(FiberMap.remove(fibers, task));
			}
		},
		fork(task, effect, options) {
			run(task, effect, options);
		},
	};
}

export function make(cache: CacheState, key: QueryKey, hash: string): Entry {
	const scope = Scope.forkUnsafe(cache.scope);
	const first = pending<unknown>();
	const entry: Entry = Object.assign(Object.create(Proto), {
		cache,
		errorShown: false,
		failureCountBefore: 0,
		handle: { input: undefined, key },
		hash,
		hydratedMeta: undefined,
		inFlight: undefined,
		key,
		listeners: new Map(),
		options: undefined,
		pending: first,
		retriesStopped: false,
		returnsEffect: undefined,
		scope,
		services: cache.services,
		signalRead: false,
		state: {
			data: undefined,
			error: null,
			failureCount: 0,
			fetchDirection: undefined,
			hasData: false,
			isFetching: false,
			isInvalidated: false,
			isStale: true,
			promise: first.promise,
			status: "pending",
			updatedAt: 0,
		},
		tasks: makeTasks(cache, scope),
	});
	const command = (request?: FetchRequest) =>
		Effect.suspend(() =>
			isDisabled(entry) ? Effect.void : Effect.ignore(fetch(entry, request)),
		);
	const commands: Commands = {
		fetchNextPage: command({ direction: "forward" }),
		fetchPreviousPage: command({ direction: "backward" }),
		refetch: command(),
	};
	Object.assign(entry, { commands });
	scheduleGc(entry);
	return entry;
}

// Reads

function now(entry: Entry) {
	return entry.cache.clock.currentTimeMillisUnsafe();
}

/** Readers are subscribed; `invalidate` and focus refetch only what is read. */
export function isObserved(entry: Entry) {
	return entry.listeners.size > 0;
}

function behavior<TName extends keyof QueryBehavior>(
	entry: Entry,
	name: TName,
): QueryBehavior[TName] {
	return entry.options?.[name] ?? entry.cache.defaults[name];
}

/** The entry's latest factory call returned `enabled: false`: it doesn't run. */
export function isDisabled(entry: Entry) {
	return behavior(entry, "enabled") === false;
}

/** Until a factory call attaches options, `meta` comes from hydration. */
export function metaOf(entry: Entry): QueryMeta | undefined {
	return entry.options
		? behavior(entry, "meta")
		: (entry.hydratedMeta ?? entry.cache.defaults.meta);
}

function computeStale(entry: Entry, state: State<unknown>) {
	if (state.isInvalidated || !state.hasData) {
		return true;
	}
	const staleTime = behavior(entry, "staleTime") ?? 0;
	return now(entry) - state.updatedAt >= staleTime;
}

export function isStaleUnsafe(entry: Entry) {
	return computeStale(entry, entry.state);
}

export function hasNextPageUnsafe(entry: Entry) {
	const options = entry.options;
	const data = entry.state.data;
	return (
		options?.kind === "infinite" &&
		isInfiniteData(data) &&
		nextPageParam(options, data) != null
	);
}

export function hasPreviousPageUnsafe(entry: Entry) {
	const options = entry.options;
	const data = entry.state.data;
	return (
		options?.kind === "infinite" &&
		isInfiniteData(data) &&
		previousPageParam(options, data) != null
	);
}

// Subscriptions

export function subscribeUnsafe(
	entry: Entry,
	listener: () => void,
	options = defaultSubscribeOptions,
): () => void {
	entry.listeners.set(listener, options);
	entry.retriesStopped = false;
	entry.tasks.cancel("gc");
	scheduleStale(entry);
	emit(entry.cache, { query: entry, type: "observers" });
	return () => {
		if (!entry.listeners.delete(listener)) {
			return;
		}
		if (entry.listeners.size === 0) {
			entry.tasks.cancel("stale");
			scheduleGc(entry);
			const inFlight = entry.inFlight;
			if (inFlight) {
				// React unsubscribes and resubscribes in one commit (StrictMode,
				// a route swapping in a page that reads the same query), so the
				// decision waits until that commit is done.
				scheduleNotify(() => unobserved(entry, inFlight));
			}
		}
		emit(entry.cache, { query: entry, type: "observers" });
	};
}

export function changes(entry: Entry): Stream.Stream<State<unknown>> {
	return listen((push) => {
		push(entry.state);
		return subscribeUnsafe(entry, () => push(entry.state));
	});
}

// Requests

/**
 * Run this entry's requests with the services of `caller`, a verb's fiber
 * context, over the cache's: every request from now on, including ones a
 * render, a refetch or `invalidate` starts.
 */
export function provide(entry: Entry, caller: Context.Context<never>) {
	entry.services = requestServices(entry.cache.services, caller);
}

/** Attach the options and input of the latest factory call. */
export function setOptions(
	entry: Entry,
	options: AnyQueryOptions,
	input: unknown,
) {
	entry.options = options;
	if (entry.handle.input !== input) {
		entry.handle = { input, key: entry.key };
	}
}

/**
 * The promise a render should unwrap. Starts the first request if nothing
 * has, and retries a failed first load once its error has been shown.
 */
export function readUnsafe(entry: Entry): Thenable<unknown> {
	const state = entry.state;
	if (!state.hasData && !state.isFetching) {
		if (state.status !== "error" || entry.errorShown) {
			begin(entry, {});
		} else {
			markErrorShown(entry);
		}
	}
	return entry.state.promise;
}

/** Start a request unless one is in flight, without waiting for it. */
export function start(entry: Entry) {
	begin(entry, {});
}

/**
 * Whether cached data that was asked for again should be refetched. A server
 * cache renders once, so a refetch there could only duplicate a request whose
 * result is never shown; it refetches only what `invalidate` marked.
 */
export function needsRefetch(entry: Entry) {
	return entry.cache.isServer
		? entry.state.isInvalidated
		: isStaleUnsafe(entry);
}

/** Background refetch of cached data that was asked for again. */
export function revalidate(entry: Entry) {
	const state = entry.state;
	if (state.hasData && !state.isFetching && needsRefetch(entry)) {
		start(entry);
	}
}

export function fetch(
	entry: Entry,
	request: FetchRequest = {},
): Effect.Effect<unknown, unknown> {
	return Effect.suspend(() => {
		const inFlight = entry.inFlight;
		if (inFlight && request.direction && !request.restart) {
			// A page joins the list the in-flight request returns.
			return Deferred.await(inFlight).pipe(
				Effect.exit,
				Effect.andThen(fetch(entry, request)),
			);
		}
		return begin(entry, request);
	});
}

export function invalidate(entry: Entry): Effect.Effect<void> {
	return Effect.suspend(() => {
		set(entry, { isInvalidated: true });
		if (!isObserved(entry) || !entry.options || isDisabled(entry)) {
			return Effect.void;
		}
		return Effect.ignore(begin(entry, { restart: true }));
	});
}

export function reset(entry: Entry): Effect.Effect<void> {
	return Effect.suspend(() => {
		entry.tasks.cancel("errorShown");
		entry.errorShown = false;
		entry.pending ??= pending();
		set(entry, {
			data: undefined,
			error: null,
			failureCount: 0,
			hasData: false,
			isInvalidated: false,
			promise: entry.pending.promise,
			status: "pending",
			updatedAt: 0,
		});
		// An in-flight request restarts too, or its response would restore the
		// data that was just dropped.
		if (
			!entry.options ||
			isDisabled(entry) ||
			(!isObserved(entry) && !entry.inFlight)
		) {
			return Effect.void;
		}
		return Effect.ignore(begin(entry, { restart: true }));
	});
}

/** Write data directly, as if a request had returned it. */
export function setData(entry: Entry, data: unknown, updatedAt = now(entry)) {
	succeed(entry, data, updatedAt);
}

/**
 * Adopt a request started elsewhere (the server's, during hydration). Its
 * data counts as fetched when the sender got it, not when it arrived.
 */
export function resume(
	entry: Entry,
	promise: PromiseLike<{ readonly data?: unknown; readonly updatedAt: number }>,
) {
	if (entry.state.hasData || entry.inFlight) {
		return;
	}
	let updatedAt: number | undefined;
	// The sender's error type doesn't survive the trip, so a rejection is
	// a defect.
	startRequest(
		entry,
		Effect.promise(async () => {
			const result = await promise;
			updatedAt = result.updatedAt;
			return result.data;
		}),
		undefined,
		() => updatedAt,
	);
}

/** Refetch a read, stale entry whose readers want it on this event. */
export function onPlatformEvent(entry: Entry, event: PlatformEvent) {
	const option =
		event === "focus" ? "refetchOnWindowFocus" : "refetchOnReconnect";
	const fallback = behavior(entry, option) ?? true;
	const wanted = [...entry.listeners.values()].some(
		(options) => options[option] ?? fallback,
	);
	if (wanted && isStaleUnsafe(entry)) {
		start(entry);
	}
}

/** Take `entry` out of its cache: interrupt its fibers and fail its awaiters. */
export function remove(entry: Entry) {
	const cache = entry.cache;
	if (cache.entries.get(entry.hash) !== entry) {
		return;
	}
	cache.entries.delete(entry.hash);
	const inFlight = entry.inFlight;
	entry.inFlight = undefined;
	Effect.runForkWith(cache.services)(Scope.close(entry.scope, Exit.void));
	if (inFlight) {
		Deferred.doneUnsafe(inFlight, Exit.fail(new CancelledError()));
	}
	emit(cache, { query: entry, type: "removed" });
}

/**
 * Start a request now, or join the one in flight. The returned Effect
 * waits for its result.
 */
function begin(
	entry: Entry,
	request: FetchRequest,
): Effect.Effect<unknown, unknown> {
	if (Predicate.isTagged(entry.scope.state, "Closed")) {
		return Effect.fail(new CancelledError());
	}
	if (isDisabled(entry)) {
		const error = new DisabledError({ hash: entry.hash });
		// A server render can't wait for a later factory call, so its readers
		// reject and React renders the Suspense fallback there, then the
		// component in the browser. Browser readers stay suspended until a
		// factory call enables the query.
		if (entry.cache.isServer) {
			const firstLoad = entry.pending;
			entry.pending = undefined;
			firstLoad?.reject(error);
		}
		return Effect.die(error);
	}
	const options = entry.options;
	const inFlight = entry.inFlight;
	if (inFlight && !(request.restart && options)) {
		return Deferred.await(inFlight);
	}
	if (!options) {
		const promise = entry.state.promise;
		return Effect.promise(() => promise);
	}
	entry.tasks.cancel("request");
	return Deferred.await(
		startRequest(
			entry,
			runRequest(
				requestEffect(entry, options, request),
				entry.hash,
				entry.services,
			),
			request.direction,
		),
	);
}

function set(entry: Entry, patch: Partial<State<unknown>>) {
	const next = { ...entry.state, ...patch };
	entry.state = { ...next, isStale: computeStale(entry, next) };
	for (const listener of entry.listeners.keys()) {
		scheduleNotify(listener);
	}
	emit(entry.cache, { query: entry, type: "updated" });
	scheduleStale(entry);
}

/** Run `request` as the entry's request fiber, settling into its awaiter. */
function startRequest(
	entry: Entry,
	request: Effect.Effect<unknown, unknown>,
	direction: Direction | undefined,
	updatedAt?: () => number | undefined,
): Deferred.Deferred<unknown, unknown> {
	if (!entry.inFlight) {
		entry.failureCountBefore = entry.state.failureCount;
	}
	const awaiter = entry.inFlight ?? Deferred.makeUnsafe<unknown, unknown>();
	entry.inFlight = awaiter;
	entry.retriesStopped = false;
	entry.signalRead = false;
	entry.tasks.cancel("gc");
	// A first load that failed, or was rejected while disabled, has settled
	// its promise; readers need a pending one again.
	if (!entry.state.hasData && !entry.pending) {
		entry.pending = pending();
		set(entry, {
			error: null,
			failureCount: 0,
			fetchDirection: direction,
			isFetching: true,
			promise: entry.pending.promise,
			status: "pending",
		});
	} else {
		set(entry, {
			failureCount: 0,
			fetchDirection: direction,
			isFetching: true,
		});
	}
	entry.tasks.fork(
		"request",
		Effect.exit(request).pipe(
			Effect.flatMap((exit) =>
				Effect.sync(() =>
					settle(entry, awaiter, exit, updatedAt?.() ?? now(entry)),
				),
			),
		),
	);
	return awaiter;
}

function settle(
	entry: Entry,
	awaiter: Deferred.Deferred<unknown, unknown>,
	exit: Exit.Exit<unknown, unknown>,
	updatedAt: number,
) {
	if (entry.inFlight !== awaiter) {
		return;
	}
	entry.inFlight = undefined;
	if (Exit.isSuccess(exit)) {
		const data = succeed(entry, exit.value, updatedAt);
		Deferred.doneUnsafe(awaiter, Exit.succeed(data));
	} else if (Cause.hasInterruptsOnly(exit.cause)) {
		set(entry, { fetchDirection: undefined, isFetching: false });
		Deferred.doneUnsafe(awaiter, Exit.fail(new CancelledError()));
	} else {
		fail(entry, Cause.squash(exit.cause));
		Deferred.doneUnsafe(awaiter, exit);
	}
	scheduleGc(entry);
}

/**
 * The last reader left while `awaiter`'s request was in flight. A refetch
 * whose work an interrupt cancels (`signalRead`) is interrupted, and the
 * entry goes back to its state before the request; its awaiters get the
 * cached data. Any other request finishes, so its result is cached, but
 * runs no more retries.
 */
function unobserved(
	entry: Entry,
	awaiter: Deferred.Deferred<unknown, unknown>,
) {
	if (isObserved(entry) || entry.inFlight !== awaiter) {
		return;
	}
	// A render suspended on a first load isn't subscribed. It waits on
	// `entry.pending`, which an interrupted request leaves pending until a
	// later read, so a first load always finishes.
	if (!entry.signalRead || !entry.state.hasData) {
		entry.retriesStopped = true;
		return;
	}
	entry.inFlight = undefined;
	entry.tasks.cancel("request");
	set(entry, {
		failureCount: entry.failureCountBefore,
		fetchDirection: undefined,
		isFetching: false,
	});
	Deferred.doneUnsafe(awaiter, Exit.succeed(entry.state.data));
	scheduleGc(entry);
}

function succeed(entry: Entry, next: unknown, updatedAt: number) {
	const previous = entry.state;
	const data =
		previous.hasData && behavior(entry, "structuralSharing") !== false
			? replaceEqualDeep(previous.data, next)
			: next;
	const firstLoad = entry.pending;
	entry.pending = undefined;
	firstLoad?.resolve(data);
	const unchanged = previous.hasData && data === previous.data;
	// Data written while this entry's own request runs (hydration, `setData`)
	// leaves that request in flight.
	const isFetching = entry.inFlight !== undefined;
	set(entry, {
		data,
		error: null,
		failureCount: 0,
		fetchDirection: isFetching ? previous.fetchDirection : undefined,
		hasData: true,
		isFetching,
		isInvalidated: false,
		promise:
			firstLoad?.promise ?? (unchanged ? previous.promise : fulfilled(data)),
		status: "success",
		updatedAt,
	});
	return data;
}

function fail(entry: Entry, error: unknown) {
	emit(entry.cache, { error, query: entry, type: "failed" });
	if (!entry.state.hasData) {
		const firstLoad = entry.pending;
		entry.pending = undefined;
		firstLoad?.reject(error);
		entry.errorShown = false;
	}
	set(entry, {
		error,
		fetchDirection: undefined,
		isFetching: false,
		status: "error",
	});
}

/**
 * A failed first load rejects its promise, so the reader throws to an error
 * boundary. Every read in that same task (React retries a throwing render
 * once, StrictMode renders twice) gets the rejection too; a read in a later
 * task — the boundary was reset — starts a new request.
 */
function markErrorShown(entry: Entry) {
	entry.tasks.fork(
		"errorShown",
		Effect.yieldNow.pipe(
			Effect.andThen(
				Effect.sync(() => {
					entry.errorShown = true;
				}),
			),
		),
		{ onlyIfMissing: true },
	);
}

function requestEffect(
	entry: Entry,
	options: AnyQueryOptions,
	request: FetchRequest,
): Effect.Effect<unknown, unknown> {
	const meta = metaOf(entry);
	const queryKey = options.queryKey;
	if (options.kind === "query") {
		return attempt(entry, (readSignal) =>
			options.queryFn({
				meta,
				queryKey,
				get signal() {
					return readSignal();
				},
			}),
		);
	}
	const pagesOf = () =>
		isInfiniteData(entry.state.data) ? entry.state.data : undefined;
	return fetchPages(
		options,
		pagesOf(),
		request,
		(pageParam, direction) =>
			attempt(entry, (readSignal) =>
				options.queryFn({
					direction,
					meta,
					pageParam,
					queryKey,
					get signal() {
						return readSignal();
					},
				}),
			),
		pagesOf,
	);
}

/**
 * One `queryFn` call, retried per the query's policy. Every failure counts.
 * `call` reads the signal through `readSignal`, which marks the entry's
 * `signalRead`. Its services are erased with its data type; `runRequest`
 * provides them.
 */
function attempt(
	entry: Entry,
	call: (readSignal: () => AbortSignal) => QueryFnResult<{ data: unknown }>,
): Effect.Effect<unknown, unknown> {
	const once = fromQueryFn<unknown, unknown, never>((signal) => {
		const result = call(() => {
			entry.signalRead = true;
			return signal;
		});
		entry.returnsEffect = Effect.isEffect(result);
		// Interrupting an Effect cancels it, whether it reads the signal or not.
		if (entry.returnsEffect) {
			entry.signalRead = true;
		}
		return result;
	}).pipe(
		Effect.tapError(() =>
			Effect.sync(() =>
				set(entry, { failureCount: entry.state.failureCount + 1 }),
			),
		),
	);
	const schedule = retrySchedule(
		{
			retry: behavior(entry, "retry"),
			retryDelay: behavior(entry, "retryDelay"),
		},
		entry.cache.isServer,
	);
	if (!schedule) {
		return once;
	}
	// Retries wait while the browser is offline; the first attempt doesn't.
	const online = entry.cache.isServer ? Effect.void : whenOnline;
	return Effect.suspend(() => {
		let retrying = false;
		let lastError: unknown;
		// Readers can leave while a retry waits out its delay or the network.
		const unlessStopped = <A>(next: Effect.Effect<A, unknown>) =>
			Effect.suspend(() =>
				entry.retriesStopped ? Effect.fail(lastError) : next,
			);
		const gated = Effect.suspend(() => {
			if (!retrying) {
				retrying = true;
				return once;
			}
			return unlessStopped(Effect.andThen(online, unlessStopped(once)));
		}).pipe(
			Effect.tapError((error) =>
				Effect.sync(() => {
					lastError = error;
				}),
			),
		);
		return Effect.retry(
			gated,
			Schedule.while(schedule, () => !entry.retriesStopped),
		);
	});
}

function scheduleGc(entry: Entry) {
	const gcTime =
		behavior(entry, "gcTime") ?? (entry.cache.isServer ? Infinity : 300_000);
	if (isObserved(entry) || entry.inFlight || !Number.isFinite(gcTime)) {
		entry.tasks.cancel("gc");
		return;
	}
	entry.tasks.fork(
		"gc",
		Effect.sleep(gcTime).pipe(Effect.andThen(Effect.sync(() => remove(entry)))),
	);
}

function scheduleStale(entry: Entry) {
	const state = entry.state;
	const staleTime = behavior(entry, "staleTime") ?? 0;
	if (
		entry.cache.isServer ||
		!isObserved(entry) ||
		state.isStale ||
		!Number.isFinite(staleTime)
	) {
		entry.tasks.cancel("stale");
		return;
	}
	const remaining = state.updatedAt + staleTime - now(entry);
	entry.tasks.fork(
		"stale",
		Effect.sleep(Math.max(remaining, 0) + 1).pipe(
			Effect.andThen(Effect.sync(() => set(entry, {}))),
		),
	);
}
