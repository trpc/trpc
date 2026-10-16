import {
	CancelledError,
	noop,
	type Query,
	type QueryClient,
} from "@tanstack/react-query";

/**
 * Promises that carry their own result, in the fields React's `use()` reads
 * before suspending (`status`, `value`, `reason`). A settled one can be read
 * synchronously, so React renders it without a fallback.
 */

interface PendingStatus {
	readonly status: "pending";
}

interface FulfilledStatus<T> {
	readonly status: "fulfilled";
	readonly value: T;
}

interface RejectedStatus {
	readonly reason: unknown;
	readonly status: "rejected";
}

/**
 * A promise that says whether it has settled, and with what. `status` moves
 * from `"pending"` to `"fulfilled"` (with `value`) or `"rejected"` (with
 * `reason`) once, when the promise settles.
 */
export type Thenable<T> = Promise<T> &
	(FulfilledStatus<T> | PendingStatus | RejectedStatus);

function fulfilled(value: unknown): Thenable<unknown> {
	return Object.assign(Promise.resolve(value), {
		status: "fulfilled" as const,
		value,
	});
}

function rejected(reason: unknown): Thenable<unknown> {
	const promise = Object.assign(Promise.reject(reason), {
		reason,
		status: "rejected" as const,
	});
	promise.catch(noop);
	return promise;
}

interface Settled {
	readonly promise: Thenable<unknown>;
	readonly value: unknown;
}

interface Failed extends Settled {
	/** An error boundary has had this error, so the next read retries. */
	shown: boolean;
}

/** The promises handed out for one TanStack query, shared by every reader. */
interface QueryPromises {
	failed?: Failed;
	loaded?: Settled;
	pending?: Thenable<unknown>;
}

const promisesByQuery = new WeakMap<Query, QueryPromises>();

/**
 * A promise that settles with the query's first data, or its first-load
 * error once TanStack stops retrying. Becomes the query's `loaded` / `failed`
 * promise, so readers keep the same object after it settles.
 */
function firstLoad(
	client: QueryClient,
	query: Query,
	promises: QueryPromises,
): Thenable<unknown> {
	const deferred = Promise.withResolvers<unknown>();
	const promise = Object.assign(deferred.promise, {
		status: "pending" as const,
	});
	// A rejection nobody reads (a failed prefetch) must not crash the process.
	promise.catch(noop);
	const cache = client.getQueryCache();
	const finish = () => {
		unsubscribe();
		if (promises.pending === promise) {
			promises.pending = undefined;
		}
	};
	const settle = () => {
		const state = query.state;
		if (state.data !== undefined) {
			finish();
			Object.assign(promise, { status: "fulfilled", value: state.data });
			promises.loaded = { promise, value: state.data };
			deferred.resolve(state.data);
		} else if (state.status === "error" && state.fetchStatus === "idle") {
			finish();
			Object.assign(promise, { reason: state.error, status: "rejected" });
			promises.failed = { promise, shown: false, value: state.error };
			deferred.reject(state.error);
		}
	};
	const unsubscribe = cache.subscribe((event) => {
		if (event.query !== query) {
			return;
		}
		if (event.type === "removed") {
			finish();
			const reason = new CancelledError();
			Object.assign(promise, { reason, status: "rejected" });
			deferred.reject(reason);
			return;
		}
		settle();
	});
	settle();
	return promise;
}

/**
 * The promise for a query's current state: fulfilled with its data, rejected
 * with a first-load error, or pending until one of those. One object per
 * data (or error) version, so readers re-render only when it changes.
 *
 * With no data and no request in flight, calls `fetch`. A first-load error
 * is handed out until the end of the current task (React re-renders a
 * throwing tree synchronously before showing its error boundary); a read
 * after that, such as the boundary's reset, retries.
 */
export function promiseFor(
	client: QueryClient,
	query: Query,
	fetch: () => void,
): Thenable<unknown> {
	let promises = promisesByQuery.get(query);
	if (!promises) {
		promises = {};
		promisesByQuery.set(query, promises);
	}
	const state = query.state;
	if (state.data !== undefined) {
		if (promises.loaded?.value !== state.data) {
			promises.loaded = { promise: fulfilled(state.data), value: state.data };
		}
		promises.pending = undefined;
		return promises.loaded.promise;
	}
	if (state.fetchStatus === "idle") {
		if (state.status === "error") {
			if (promises.failed?.value !== state.error) {
				promises.failed = {
					promise: rejected(state.error),
					shown: false,
					value: state.error,
				};
			}
			const failed = promises.failed;
			if (!failed.shown) {
				queueMicrotask(() => {
					failed.shown = true;
				});
				return failed.promise;
			}
		}
		fetch();
	}
	promises.pending ??= firstLoad(client, query, promises);
	return promises.pending;
}
