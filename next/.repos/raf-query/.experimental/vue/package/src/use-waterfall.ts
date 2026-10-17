import {
	type InputArgs,
	type InputOf,
	Query,
	type QueryFactory,
	type QueryHandle,
} from "@raf-query/core";
import {
	computed,
	type ComputedRef,
	type MaybeRefOrGetter,
	toValue,
	watch,
} from "vue";

import { useQueryClient } from "./provider.ts";

/**
 * Start a query from a component and return its handle, for inputs only
 * known there (an id from a parent query's data). Each call is a request
 * waterfall: prefer starting the query in a loader or on the server. Like
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
		? [input?: MaybeRefOrGetter<InputOf<TFactory>>]
		: [input: MaybeRefOrGetter<InputOf<TFactory>>]
): ComputedRef<QueryHandle<TFactory>> {
	const client = useQueryClient();
	const input = args[0];
	const query = computed(() => {
		// SAFETY: the rest parameter's type is `InputArgs<TFactory>` with each
		// input wrapped in a ref or getter, unwrapped here.
		const inputArgs = [toValue(input)] as InputArgs<TFactory>;
		return client.getQuery(factory, ...inputArgs);
	});
	watch(
		query,
		(next) => {
			if (Query.getUnsafe(next).hasData) {
				Query.revalidateUnsafe(next);
			} else {
				Query.readUnsafe(next);
			}
		},
		{ flush: "sync", immediate: true },
	);
	return computed(() => query.value.handle);
}
