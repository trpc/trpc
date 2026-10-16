"use client";

import {
	type InputArgs,
	Query,
	type QueryFactory,
	type QueryHandle,
} from "@raf-query/core";
import { useState } from "react";

import { startsRequests } from "./query-provider/browser-requests.ts";
import { useQueryClient } from "./provider.tsx";

/**
 * First loads a waterfall suspended on. A suspended mount keeps no state, so
 * this is how its retry knows the data it finds is the load it just waited
 * for, not cached data to revalidate.
 */
const waitedFor = new WeakSet<PromiseLike<unknown>>();

/**
 * Start a query during render and return its handle, for inputs only known
 * at render time (an id from a parent query's data). Each call is a request
 * waterfall: prefer starting the query in a loader or server component.
 * Like `prefetch` in a loader, it refetches stale cached data in the
 * background, once per mount and input. Under `QueryProvider` it
 * starts nothing on the server: the reader's Suspense boundary renders its
 * fallback there, and the query loads in the browser.
 *
 * ```tsx
 * const author = useWaterfall(authorQuery, { id: post.authorId });
 * const [authorPromise] = useQuery(authorQuery, author);
 * ```
 */
export function useWaterfall<TFactory extends QueryFactory>(
	factory: TFactory,
	...args: InputArgs<TFactory>
): QueryHandle<TFactory> {
	const client = useQueryClient();
	const query = client.getQuery(factory, ...args);
	// Once per entry, not per render: with `staleTime: 0` the data is stale
	// again as soon as a refetch re-renders this component.
	const [started, setStarted] = useState<string>();
	if (!startsRequests(client)) {
		return query.handle;
	}
	const promise = Query.readUnsafe(query);
	if (started !== query.hash) {
		if (!Query.getUnsafe(query).hasData) {
			waitedFor.add(promise);
		} else if (!waitedFor.delete(promise)) {
			Query.revalidateUnsafe(query);
		}
		setStarted(query.hash);
	} else if (Query.getUnsafe(query).hasData) {
		waitedFor.delete(promise);
	}
	return query.handle;
}
