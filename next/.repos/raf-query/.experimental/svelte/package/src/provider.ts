import type { QueryClient } from "@raf-query/core";
import { getContext, hasContext, onMount, setContext } from "svelte";

/**
 * A component can't know which services the provided client has, so its
 * verbs take any factory here.
 */
const queryClientKey = Symbol("@raf-query/experimental-svelte QueryClient");

/**
 * Provide a client to this component's descendants, and in the browser
 * refetch its read, stale queries on window focus and reconnect while the
 * component is mounted. Call it in a component's `<script>`, or use
 * `QueryClientProvider`.
 */
export function setQueryClient(client: QueryClient<unknown>): void {
	setContext(queryClientKey, client);
	onMount(() => client.mount());
}

/** The client from the nearest `QueryClientProvider` or {@link setQueryClient}. */
export function useQueryClient(): QueryClient<unknown> {
	if (!hasContext(queryClientKey)) {
		throw new Error(
			"useQueryClient: no QueryClient provided. Wrap the component in QueryClientProvider, or call setQueryClient in a parent",
		);
	}
	return getContext<QueryClient<unknown>>(queryClientKey);
}
