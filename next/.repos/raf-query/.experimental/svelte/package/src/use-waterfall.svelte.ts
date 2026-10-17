import {
	type InputArgs,
	type InputOf,
	Query,
	type QueryFactory,
	type QueryHandle,
} from "@raf-query/core";
import { untrack } from "svelte";

import { useQueryClient } from "./provider.ts";

/**
 * Start a query from a component and return a getter of its handle, for
 * inputs only known there (an id from a parent query's data). Each call is
 * a request waterfall: prefer starting the query in a `load`. Like
 * `prefetch`, it refetches stale cached data in the background, once per
 * input.
 *
 * ```ts
 * const author = useWaterfall(authorQuery, () => ({ id: post.data.authorId }));
 * const authorState = useQuery(authorQuery, author);
 * ```
 */
export function useWaterfall<TFactory extends QueryFactory>(
	factory: TFactory,
	...args: [] extends Parameters<TFactory>
		? [input?: () => InputOf<TFactory>]
		: [input: () => InputOf<TFactory>]
): () => QueryHandle<TFactory> {
	const client = useQueryClient();
	const input = args[0];
	const query = $derived.by(() => {
		// SAFETY: the rest parameter's type is `InputArgs<TFactory>` with each
		// input as a getter, called here.
		const inputArgs = [input?.()] as InputArgs<TFactory>;
		return client.getQuery(factory, ...inputArgs);
	});
	let started: Query.Query<TFactory> | undefined;
	function start(next: Query.Query<TFactory>) {
		if (next === started) {
			return;
		}
		started = next;
		untrack(() => {
			if (Query.getUnsafe(next).hasData) {
				Query.revalidateUnsafe(next);
			} else {
				Query.readUnsafe(next);
			}
		});
	}
	untrack(() => {
		start(query);
	});
	$effect.pre(() => {
		start(query);
	});
	return () => {
		start(query);
		return query.handle;
	};
}
