import type { QueryClient } from "@raf-query/core";

const sentByClient = new WeakMap<QueryClient, Set<string>>();

/**
 * Hashes of the request client's entries an earlier `HydrationBoundary`
 * already sent. Boundaries pass it as `sent`, so each entry crosses once.
 */
export function sentHashes(client: QueryClient): Set<string> {
	let sent = sentByClient.get(client);
	if (!sent) {
		sent = new Set();
		sentByClient.set(client, sent);
	}
	return sent;
}
