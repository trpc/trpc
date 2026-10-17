import type { QueryCache } from "@raf-query/core";
import {
	type MaybeRefOrGetter,
	onScopeDispose,
	type Ref,
	readonly,
	shallowRef,
	toValue,
	watch,
} from "vue";

import { useQueryClient } from "./provider.ts";

/**
 * How many queries have a request in flight: all of them, or those matching
 * `filter`. It's `0` on the server, so the server's HTML and the browser's
 * first render agree.
 *
 * You probably don't need this. Prefer the router's pending state for
 * navigations and per-query `isFetching` for background refetches. Kept for
 * TanStack Query compatibility when you want one global count of every
 * in-flight request:
 *
 * ```ts
 * const fetching = useIsFetching();
 * ```
 *
 * ```vue
 * <ProgressBar v-if="fetching > 0" />
 * ```
 */
export function useIsFetching(
	filter?: MaybeRefOrGetter<QueryCache.Filter | undefined>,
): Readonly<Ref<number>> {
	const client = useQueryClient();
	const count = shallowRef(0);
	if (client.isServer) {
		return readonly(count);
	}
	const update = () => {
		count.value = client.isFetching(toValue(filter));
	};
	// Cache events fire synchronously, sometimes in the middle of another
	// component's update (a read that starts a fetch), so the count catches
	// up in a microtask, once per batch.
	let scheduled = false;
	onScopeDispose(
		client.subscribe(() => {
			if (scheduled) {
				return;
			}
			scheduled = true;
			queueMicrotask(() => {
				scheduled = false;
				update();
			});
		}),
	);
	watch(() => toValue(filter), update, { immediate: true });
	return readonly(count);
}
