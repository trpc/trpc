/**
 * Promises that carry their own result, in the fields React's `use()` reads
 * before suspending (`status`, `value`, `reason`). A settled one can be read
 * synchronously, so React renders it without a fallback.
 */

const noop = () => {};

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

export function fulfilled<T>(value: T): Thenable<T> {
	return Object.assign(Promise.resolve(value), {
		status: "fulfilled" as const,
		value,
	});
}

export interface Pending<T> {
	readonly promise: Thenable<T>;
	reject(reason: unknown): void;
	resolve(value: T): void;
}

export function pending<T>(): Pending<T> {
	const deferred = Promise.withResolvers<T>();
	const promise = Object.assign(deferred.promise, {
		status: "pending" as const,
	});
	// A rejection nobody reads (a failed prefetch) must not crash the process.
	promise.catch(noop);
	return {
		promise,
		reject(reason) {
			Object.assign(promise, { reason, status: "rejected" });
			deferred.reject(reason);
		},
		resolve(value) {
			Object.assign(promise, { status: "fulfilled", value });
			deferred.resolve(value);
		},
	};
}
