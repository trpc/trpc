import type { QueryCache } from "@raf-query/core";
import { onMount } from "svelte";
import { createSubscriber } from "svelte/reactivity";

import { useQueryClient } from "./provider.ts";

/** {@link useIsFetching}'s count. */
export interface IsFetchingCount {
	readonly current: number;
}

/**
 * How many queries have a request in flight, in `current`: all of them, or
 * those matching `filter`. It's `0` on the server and until the component
 * mounts, so the server's HTML and the browser's first render agree.
 *
 * You probably don't need this. Prefer the router's pending state for
 * navigations and per-query `isFetching` for background refetches. Kept for
 * TanStack Query compatibility when you want one global count of every
 * in-flight request:
 *
 * ```svelte
 * <script lang="ts">
 *   const fetching = useIsFetching();
 * </script>
 *
 * {#if fetching.current > 0}<ProgressBar />{/if}
 * ```
 */
export function useIsFetching(
	filter?: () => QueryCache.Filter,
): IsFetchingCount {
	const client = useQueryClient();
	if (client.isServer) {
		return { current: 0 };
	}
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
	// Cache events fire synchronously, sometimes in the middle of another
	// component's update (a read that starts a fetch), so the count catches
	// up in a microtask, once per batch.
	const subscribe = createSubscriber((update) => {
		let scheduled = false;
		return client.subscribe(() => {
			if (scheduled) {
				return;
			}
			scheduled = true;
			queueMicrotask(() => {
				scheduled = false;
				update();
			});
		});
	});
	return {
		get current() {
			if (!mounted) {
				return 0;
			}
			subscribe();
			return client.isFetching(filter?.());
		},
	};
}
