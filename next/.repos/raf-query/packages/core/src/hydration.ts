import { type Cause, Data, Effect, Queue, type Scope, Stream } from "effect";

import type { Event as CacheEvent } from "./cache.ts";
import * as Entry from "./entry.ts";
import type { QueryKey } from "./key.ts";
import type { QueryFactory, QueryMeta } from "./options.ts";
import * as Query from "./query.ts";

/** What a dehydrated pending query's promise resolves to. */
export interface DehydratedResult {
	readonly data?: unknown;
	/** When the sender got `data` (ms since epoch). */
	readonly updatedAt: number;
}

/**
 * One cache entry in transit. Settled entries carry `data`; entries still
 * loading their first data carry the request's `promise`, so the receiving
 * cache resumes it instead of fetching again.
 */
export interface DehydratedQuery {
	readonly data?: unknown;
	/** Whether the sender's `queryFn` returned an Effect, when it ran there. */
	readonly effect?: boolean;
	readonly key: QueryKey;
	/** The query's `meta`, for receivers that haven't called its factory. */
	readonly meta?: QueryMeta;
	readonly promise?: Promise<DehydratedResult>;
	/** When `data` was fetched; `0` while pending. */
	readonly updatedAt: number;
}

export interface DehydratedState {
	readonly queries: ReadonlyArray<DehydratedQuery>;
}

/** The cache now, then entries as they start or settle. */
export interface DehydratedStream {
	/** The entries to send first. */
	readonly initial: DehydratedState;
	/**
	 * Later entries, in batches. Ends once the scope `dehydrateStream` ran in
	 * closes, after a last batch of what changed before. One consumer only.
	 */
	readonly updates: Stream.Stream<DehydratedState>;
}

export interface DehydrateOptions {
	/**
	 * Which entries to send. Default: entries with data or a request in
	 * flight ({@link canDehydrate}).
	 */
	readonly filter?: (query: Query.Query) => boolean;
	/**
	 * Send a pending query's rejection as-is. By default the receiving side
	 * gets a {@link RedactedError}, so server errors don't leak into the page;
	 * its error boundary can still retry on the client.
	 */
	readonly keepErrors?: boolean;
	/**
	 * Hashes of entries sent already, shared by every dehydration of one
	 * transfer (e.g. one request). Those entries are skipped, and the ones
	 * sent are added.
	 */
	readonly sent?: Set<string>;
	/** Transform data before it is serialized. */
	readonly serializeData?: (data: unknown) => unknown;
}

export interface HydrateOptions {
	/** Reverse `serializeData`. */
	readonly deserializeData?: (data: unknown) => unknown;
}

/**
 * What a dehydrated pending query rejects with when its request failed and
 * `keepErrors` is off: the receiving side learns which query failed, not why.
 */
export class RedactedError extends Data.TaggedError("RedactedError")<{
	readonly hash: string;
}> {
	override get message() {
		return `Query ${this.hash} failed`;
	}
}

const noop = () => {};
const identity = <T>(value: T) => value;

/** The default dehydrate filter: entries with data or a request in flight. */
export function canDehydrate<TFactory extends QueryFactory>(
	query: Query.Query<TFactory>,
): boolean {
	const state = Query.getUnsafe(query);
	return state.hasData || state.isFetching;
}

function dehydrateUnsafe<TFactory extends QueryFactory>(
	query: Query.Query<TFactory>,
	options: DehydrateOptions,
): DehydratedQuery {
	const sent = dehydrateState(query, options);
	const effect = Query.returnsEffectUnsafe(query);
	return effect === undefined ? sent : { ...sent, effect };
}

/** {@link dehydrateUnsafe} without `effect`. */
function dehydrateState<TFactory extends QueryFactory>(
	query: Query.Query<TFactory>,
	options: DehydrateOptions,
): DehydratedQuery {
	const state = Query.getUnsafe(query);
	const serialize = options.serializeData ?? identity;
	const meta = Query.metaUnsafe(query);
	const sent =
		meta === undefined ? { key: query.key } : { key: query.key, meta };
	if (state.hasData) {
		return { ...sent, data: serialize(state.data), updatedAt: state.updatedAt };
	}
	const promise = state.promise.then(
		(data): DehydratedResult => ({
			data: serialize(data),
			updatedAt: Query.getUnsafe(query).updatedAt,
		}),
		(error: unknown) => {
			throw options.keepErrors
				? error
				: new RedactedError({ hash: query.hash });
		},
	);
	promise.catch(noop);
	return { ...sent, promise, updatedAt: 0 };
}

/** Snapshot one entry for transfer. */
export function dehydrateQuery<TFactory extends QueryFactory>(
	query: Query.Query<TFactory>,
	options: DehydrateOptions = {},
): Effect.Effect<DehydratedQuery> {
	return Effect.sync(() => dehydrateUnsafe(query, options));
}

/** Dehydrate the entries `options` selects, recording them in `options.sent`. */
export function dehydrateEntries(
	queries: Iterable<Query.Query>,
	options: DehydrateOptions,
): DehydratedState {
	const filter = options.filter ?? canDehydrate;
	const sent = options.sent;
	const dehydrated: Array<DehydratedQuery> = [];
	for (const query of queries) {
		if (
			!sent?.has(query.hash) &&
			!Entry.isDisabled(Entry.entryOf(query)) &&
			filter(query)
		) {
			sent?.add(query.hash);
			dehydrated.push(dehydrateUnsafe(query, options));
		}
	}
	return { queries: dehydrated };
}

/**
 * Snapshots `queries()` and subscribes in the same synchronous step, so no
 * change falls between the two. Changed entries are collected for a
 * microtask, so entries that settle together share a batch, and the batch is
 * handed to the reader before that microtask ends: ahead of the Suspense
 * boundaries React resumes for those entries.
 */
export const dehydrateStream: (
	queries: () => Iterable<Query.Query>,
	subscribe: (listener: (event: CacheEvent) => void) => () => void,
	options: DehydrateOptions,
) => Effect.Effect<DehydratedStream, never, Scope.Scope> =
	/*#__PURE__*/ Effect.fnUntraced(function* (queries, subscribe, options) {
		const sent = options.sent ?? new Set<string>();
		const send = { ...options, sent };
		const queue = yield* Queue.unbounded<DehydratedState, Cause.Done>();
		let batch: Map<string, Query.Query> | undefined;
		const flush = () => {
			const changed = batch;
			batch = undefined;
			if (!changed) {
				return;
			}
			const state = dehydrateEntries(changed.values(), send);
			if (state.queries.length > 0) {
				Queue.offerUnsafe(queue, state);
				// Wake the reader now, not on the queue's next scheduler tick.
				Queue.flushUnsafe(queue);
			}
		};
		yield* Effect.acquireRelease(
			Effect.sync(() =>
				subscribe((event) => {
					if (event.type === "removed" || sent.has(event.query.hash)) {
						return;
					}
					if (!batch) {
						batch = new Map();
						queueMicrotask(flush);
					}
					batch.set(event.query.hash, event.query);
				}),
			),
			(unsubscribe) =>
				Effect.sync(() => {
					flush();
					unsubscribe();
					Queue.endUnsafe(queue);
				}),
		);
		return {
			initial: dehydrateEntries(queries(), send),
			updates: Stream.fromQueue(queue),
		};
	});

/**
 * Take the sender's data if it's newer than the entry's. An entry that keeps
 * its own (the sender's is older, as in a router's cached payload) was asked
 * for again, so it revalidates if stale, as `prefetch` would.
 */
function takeNewer(entry: Entry.Entry, data: unknown, updatedAt: number) {
	const current = entry.state;
	if (!current.hasData || current.updatedAt < updatedAt) {
		Entry.setData(entry, data, updatedAt);
	} else {
		Entry.revalidate(entry);
	}
}

/**
 * Write dehydrated entries into a cache. Existing entries only take newer
 * data. A pending entry the cache has nothing for resumes the sender's
 * request. One that has data, or a request of its own, waits for the
 * sender's instead of fetching again, and then takes whichever is newer;
 * if the sender's failed, it revalidates.
 */
export function hydrateEntries(
	entryFor: (key: QueryKey) => Entry.Entry,
	state: DehydratedState,
	options: HydrateOptions,
): void {
	const deserialize = options.deserializeData ?? identity;
	for (const query of state.queries) {
		const entry = entryFor(query.key);
		if (!entry.options && query.meta !== undefined) {
			entry.hydratedMeta = query.meta;
		}
		entry.returnsEffect ??= query.effect;
		if (query.updatedAt > 0) {
			takeNewer(entry, deserialize(query.data), query.updatedAt);
		} else if (query.promise) {
			// Flight-decoded promises are thenables, not always real promises.
			const result = Promise.resolve(query.promise).then(
				(sent): DehydratedResult => ({
					data: deserialize(sent.data),
					updatedAt: sent.updatedAt,
				}),
			);
			if (!entry.state.hasData && !entry.inFlight) {
				Entry.resume(entry, result);
			} else {
				result.then(
					(sent) => takeNewer(entry, sent.data, sent.updatedAt),
					() => Entry.revalidate(entry),
				);
			}
		} else {
			Entry.revalidate(entry);
		}
	}
}
