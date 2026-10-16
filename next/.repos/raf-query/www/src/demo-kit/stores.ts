import { Query, type QueryClient } from "@raf-query/react";
import { useSyncExternalStore } from "react";

import type { FakeServer, NetworkRequest } from "./server.ts";

const tickers = new Map<
	number,
	{ now: number; subscribe: (onTick: () => void) => () => void }
>();

function tickerFor(interval: number) {
	let ticker = tickers.get(interval);
	if (!ticker) {
		const listeners = new Set<() => void>();
		let timer: ReturnType<typeof setInterval> | undefined;
		const created = {
			now: Date.now(),
			subscribe(onTick: () => void) {
				listeners.add(onTick);
				created.now = Date.now();
				timer ??= setInterval(() => {
					created.now = Date.now();
					for (const listener of listeners) {
						listener();
					}
				}, interval);
				return () => {
					listeners.delete(onTick);
					if (listeners.size === 0) {
						clearInterval(timer);
						timer = undefined;
					}
				};
			},
		};
		ticker = created;
		tickers.set(interval, ticker);
	}
	return ticker;
}

/** `Date.now()`, re-rendering every `interval` ms while mounted. */
export function useNow(interval: number) {
	const ticker = tickerFor(interval);
	return useSyncExternalStore(
		ticker.subscribe,
		() => ticker.now,
		() => 0,
	);
}

export function useRequests(
	server: FakeServer<unknown>,
): ReadonlyArray<NetworkRequest> {
	return useSyncExternalStore(
		server.subscribe,
		server.getRequests,
		server.getRequests,
	);
}

/** What an entry holds: nothing yet, a failure, or data within or past `staleTime`. */
export type DataStatus = "error" | "fresh" | "pending" | "stale";

export interface CacheRow {
	readonly data: DataStatus;
	readonly failureCount: number;
	readonly hash: string;
	readonly isFetching: boolean;
	readonly observers: number;
	readonly updatedAt: number;
}

function dataStatusOf(query: Query.Query): DataStatus {
	const state = Query.getUnsafe(query);
	if (state.status === "error") {
		return "error";
	}
	if (state.updatedAt === 0) {
		return "pending";
	}
	return Query.isStaleUnsafe(query) ? "stale" : "fresh";
}

function rowOf(query: Query.Query): CacheRow {
	const state = Query.getUnsafe(query);
	return {
		data: dataStatusOf(query),
		failureCount: state.failureCount,
		hash: query.hash,
		isFetching: state.isFetching,
		observers: Query.observerCountUnsafe(query),
		updatedAt: state.updatedAt,
	};
}

function sameRows(a: ReadonlyArray<CacheRow>, b: ReadonlyArray<CacheRow>) {
	return (
		a.length === b.length &&
		a.every((row, index) => {
			const other = b[index];
			return (
				other !== undefined &&
				row.hash === other.hash &&
				row.data === other.data &&
				row.isFetching === other.isFetching &&
				row.observers === other.observers &&
				row.updatedAt === other.updatedAt &&
				row.failureCount === other.failureCount
			);
		})
	);
}

interface CacheStore {
	readonly getSnapshot: () => ReadonlyArray<CacheRow>;
	readonly subscribe: (onChange: () => void) => () => void;
}

const cacheStores = new WeakMap<QueryClient<unknown>, CacheStore>();

function cacheStoreFor(client: QueryClient<unknown>): CacheStore {
	let store = cacheStores.get(client);
	if (store) {
		return store;
	}
	let rows: ReadonlyArray<CacheRow> = [];
	let scheduled = false;
	const listeners = new Set<() => void>();
	const refresh = () => {
		const next = client.getAll().map(rowOf);
		if (sameRows(rows, next)) {
			return;
		}
		rows = next;
		for (const listener of listeners) {
			listener();
		}
	};
	// Cache events can fire while another component renders, so the rows are
	// refreshed in a microtask, once per batch.
	client.subscribe(() => {
		if (scheduled) {
			return;
		}
		scheduled = true;
		queueMicrotask(() => {
			scheduled = false;
			refresh();
		});
	});
	let timer: ReturnType<typeof setInterval> | undefined;
	store = {
		getSnapshot: () => rows,
		subscribe: (onChange) => {
			listeners.add(onChange);
			rows = client.getAll().map(rowOf);
			// Staleness changes with time, not with a cache event.
			timer ??= setInterval(refresh, 250);
			return () => {
				listeners.delete(onChange);
				if (listeners.size === 0) {
					clearInterval(timer);
					timer = undefined;
				}
			};
		},
	};
	cacheStores.set(client, store);
	return store;
}

/** Every entry of `client`'s cache, with its status kept current. */
export function useCacheRows(
	client: QueryClient<unknown>,
): ReadonlyArray<CacheRow> {
	const store = cacheStoreFor(client);
	return useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot,
	);
}
