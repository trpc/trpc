import { Query, type QueryClient } from "@raf-query/core";
import { useSyncExternalStore } from "react";

/** How the devtools label an entry, most urgent first. */
export type DevtoolsStatus =
	| "error"
	| "fetching"
	| "fresh"
	| "inactive"
	| "stale";

export const statuses: ReadonlyArray<DevtoolsStatus> = [
	"fetching",
	"error",
	"stale",
	"fresh",
	"inactive",
];

/** One cache entry as of the latest snapshot. */
export interface QueryRow {
	readonly hash: string;
	readonly observers: number;
	readonly query: Query.Query;
	readonly state: Query.State<unknown>;
	readonly status: DevtoolsStatus;
}

export type SortBy = "hash" | "status" | "updated";

export const sortOrders: ReadonlyArray<SortBy> = ["status", "hash", "updated"];

interface CacheStore {
	getSnapshot(): ReadonlyArray<QueryRow>;
	subscribe(onChange: () => void): () => void;
}

const stores = new WeakMap<QueryClient, CacheStore>();

function statusOf(query: Query.Query): DevtoolsStatus {
	const state = Query.getUnsafe(query);
	if (state.isFetching) {
		return "fetching";
	}
	if (state.status === "error") {
		return "error";
	}
	if (Query.observerCountUnsafe(query) === 0) {
		return "inactive";
	}
	return Query.isStaleUnsafe(query) ? "stale" : "fresh";
}

function rowOf(query: Query.Query): QueryRow {
	return {
		hash: query.hash,
		observers: Query.observerCountUnsafe(query),
		query,
		state: Query.getUnsafe(query),
		status: statusOf(query),
	};
}

function createStore(client: QueryClient): CacheStore {
	const listeners = new Set<() => void>();
	let version = 0;
	let snapshotVersion = -1;
	let snapshot: ReadonlyArray<QueryRow> = [];
	let scheduled = false;
	// Cache events fire synchronously, sometimes while another component
	// renders (a read that starts a fetch), so listeners hear about them in a
	// microtask, once per batch.
	client.subscribe(() => {
		version++;
		if (scheduled || listeners.size === 0) {
			return;
		}
		scheduled = true;
		queueMicrotask(() => {
			scheduled = false;
			for (const listener of listeners) {
				listener();
			}
		});
	});
	return {
		getSnapshot: () => {
			if (snapshotVersion !== version) {
				snapshotVersion = version;
				snapshot = client.getAll().map(rowOf);
			}
			return snapshot;
		},
		subscribe: (onChange) => {
			listeners.add(onChange);
			return () => {
				listeners.delete(onChange);
			};
		},
	};
}

function storeFor(client: QueryClient): CacheStore {
	let store = stores.get(client);
	if (!store) {
		store = createStore(client);
		stores.set(client, store);
	}
	return store;
}

/** Every cache entry, re-rendering on each batch of cache events. */
export function useQueryRows(client: QueryClient): ReadonlyArray<QueryRow> {
	const store = storeFor(client);
	return useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot,
	);
}

export function countByStatus(rows: ReadonlyArray<QueryRow>) {
	const counts = {
		error: 0,
		fetching: 0,
		fresh: 0,
		inactive: 0,
		stale: 0,
	} satisfies Record<DevtoolsStatus, number>;
	for (const row of rows) {
		counts[row.status]++;
	}
	return counts;
}

function compareRows(sortBy: SortBy) {
	return (a: QueryRow, b: QueryRow) => {
		const primary = {
			hash: 0,
			status: statuses.indexOf(a.status) - statuses.indexOf(b.status),
			updated: b.state.updatedAt - a.state.updatedAt,
		}[sortBy];
		return primary === 0 ? a.hash.localeCompare(b.hash) : primary;
	};
}

/** Rows whose hash contains `filter` (case-insensitive), sorted. */
export function visibleRows(
	rows: ReadonlyArray<QueryRow>,
	filter: string,
	sortBy: SortBy,
): ReadonlyArray<QueryRow> {
	const needle = filter.trim().toLowerCase();
	return rows
		.filter((row) => row.hash.toLowerCase().includes(needle))
		.toSorted(compareRows(sortBy));
}
