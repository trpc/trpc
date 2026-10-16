import {
	defaultShouldDehydrateQuery,
	dehydrate,
	type DehydrateOptions,
	type Query,
	type QueryClient,
	HydrationBoundary as TanStackHydrationBoundary,
} from "@tanstack/react-query";
import type { ReactNode } from "react";

const sentByClient = new WeakMap<QueryClient, Set<string>>();

/** Entries with data, and pending ones, which cross as their request's promise. */
function shouldSend(query: Query) {
	return defaultShouldDehydrateQuery(query) || query.state.status === "pending";
}

/**
 * Server component: sends the request client's entries to the browser cache
 * through TanStack's `HydrationBoundary`. Pending entries cross as promises
 * and stream in as they settle. Entries an earlier boundary already sent in
 * this request are skipped.
 *
 * ```tsx
 * const qc = getQueryClient();
 * const comments = prefetch(qc, commentsQuery, { slug });
 * return (
 *   <HydrationBoundary client={qc}>
 *     <Comments handle={comments} />
 *   </HydrationBoundary>
 * );
 * ```
 */
export function HydrationBoundary(props: {
	readonly children?: ReactNode;
	/** The request's server client (e.g. from React's `cache()`). */
	readonly client: QueryClient;
	readonly options?: DehydrateOptions;
}) {
	const client = props.client;
	let sent = sentByClient.get(client);
	if (!sent) {
		sent = new Set();
		sentByClient.set(client, sent);
	}
	const alreadySent = sent;
	const filter = props.options?.shouldDehydrateQuery ?? shouldSend;
	const state = dehydrate(client, {
		...props.options,
		shouldDehydrateMutation: () => false,
		shouldDehydrateQuery: (query) =>
			!alreadySent.has(query.queryHash) && filter(query),
	});
	for (const query of state.queries) {
		alreadySent.add(query.queryHash);
	}
	return (
		<TanStackHydrationBoundary state={state}>
			{props.children}
		</TanStackHydrationBoundary>
	);
}
