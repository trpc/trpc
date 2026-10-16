"use client";

import { useQueryClient } from "@tanstack/react-query";

import { prefetch } from "./client.ts";
import {
	handleOf,
	type InputArgs,
	optionsFor,
	type QueryFactory,
	type QueryHandle,
} from "./options.ts";

/**
 * Start a query during render and return its handle, for inputs only known
 * at render time (an id from a parent query's data). Each call is a request
 * waterfall: prefer starting the query in a loader or server component.
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
	const options = optionsFor(client, factory, args[0]);
	// Only a missing entry starts a request, so re-renders don't refetch.
	if (!client.getQueryState(options.queryKey)) {
		return prefetch(client, factory, ...args);
	}
	return handleOf<TFactory>(options, args[0]);
}
