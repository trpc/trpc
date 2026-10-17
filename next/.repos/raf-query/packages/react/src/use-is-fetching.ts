"use client";

import type { QueryCache, QueryClient } from "@raf-query/core";
import { useCallback, useSyncExternalStore } from "react";

import { useQueryClient } from "./provider.tsx";

// Cache events fire synchronously, sometimes while another component renders
// (a read that starts a fetch), so React hears about them in a microtask,
// once per batch.
function subscribeDeferred(
	client: QueryClient<unknown>,
	onStoreChange: () => void,
) {
	let scheduled = false;
	return client.subscribe(() => {
		if (scheduled) {
			return;
		}
		scheduled = true;
		queueMicrotask(() => {
			scheduled = false;
			onStoreChange();
		});
	});
}

const none = () => 0;

/**
 * How many queries have a request in flight: all of them, or those matching
 * `filter`. Re-renders when the count changes. It's `0` on the server and
 * while hydrating, so the server's HTML and the browser's first render agree.
 *
 * You probably don't need this. Prefer the router's pending UI for
 * navigations (`useRouterState` / `pendingComponent` in TanStack Router,
 * `useLinkStatus` in Next.js) and per-query `controls.isFetching` for
 * background refetches. Kept for TanStack Query compatibility when you want
 * one global count of every in-flight request:
 *
 * ```tsx
 * const fetching = useIsFetching();
 * return fetching > 0 ? <ProgressBar /> : null;
 * ```
 */
export function useIsFetching(filter?: QueryCache.Filter): number {
	const client = useQueryClient();
	const subscribe = useCallback(
		(onStoreChange: () => void) => subscribeDeferred(client, onStoreChange),
		[client],
	);
	const getSnapshot = () => client.isFetching(filter);
	return useSyncExternalStore(subscribe, getSnapshot, none);
}
