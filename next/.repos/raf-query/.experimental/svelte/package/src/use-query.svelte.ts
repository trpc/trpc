import {
	QueryBinding,
	type QueryFactory,
	type QueryHandle,
	type QueryHandleWithData,
	type UseQueryOptions,
} from "@raf-query/core";
import { onDestroy, untrack } from "svelte";

import { useQueryClient } from "./provider.ts";

/** {@link useQuery}'s options: the observer's, and `throwOnError` for typed errors. */
export type UseQueryReadOptions<
	TFactory extends QueryFactory,
	TThrow extends boolean | undefined = undefined,
> = QueryBinding.ReadOptions<TFactory, TThrow>;

/**
 * What {@link useQuery} returns: the query's controls, the `promise` of the
 * data to show (for `{#await}`), and that `data` once it's there. Read its
 * properties in markup, `$derived` or `$effect`; destructuring reads them
 * once.
 */
export type UseQueryResult<
	TFactory extends QueryFactory,
	TThrow extends boolean | undefined = undefined,
> = QueryBinding.Result<TFactory, TThrow>;

/** {@link useQuery}'s result for a handle from `ensure` or `fetch`. */
export type UseQueryResultWithData<
	TFactory extends QueryFactory,
	TThrow extends boolean | undefined = undefined,
> = QueryBinding.ResultWithData<TFactory, TThrow>;

/**
 * Read the query a handle points at. Call it in a component's `<script>`,
 * with getters of the handle and the options, so it follows new ones (a
 * page's load data):
 *
 * ```ts
 * const post = useQuery(postQuery, () => data.post);
 * ```
 *
 * ```svelte
 * {#if post.data}<h1>{post.data.title}</h1>{/if}
 * ```
 *
 * `data` is `undefined` until the promise settles. A handle from `ensure`
 * or `fetch` (a server `load`) already has its data, so `data` is never
 * `undefined` for it, and the server's HTML has it.
 *
 * For an Effect `queryFn` (typed `ErrorOf`), with `throwOnError: false`
 * (the call's, else the query's, else the client's, which is the default
 * when it has a `layer`), `data` and the promise hold a `Result` instead,
 * and the promise never rejects.
 *
 * The result follows the cache: a refetch, `setData` or invalidation
 * updates what reads it, and markup updates only when a property it read
 * changed.
 */
export function useQuery<
	TFactory extends QueryFactory,
	const TThrow extends boolean | undefined = undefined,
>(
	factory: TFactory,
	handle: () => QueryHandleWithData<TFactory>,
	options?: () => UseQueryReadOptions<TFactory, TThrow>,
): UseQueryResultWithData<TFactory, TThrow>;
export function useQuery<
	TFactory extends QueryFactory,
	const TThrow extends boolean | undefined = undefined,
>(
	factory: TFactory,
	handle: () => QueryHandle<TFactory>,
	options?: () => UseQueryReadOptions<TFactory, TThrow>,
): UseQueryResult<TFactory, TThrow>;
export function useQuery<TFactory extends QueryFactory>(
	factory: TFactory,
	handle: () => QueryHandle<TFactory>,
	options: () => UseQueryOptions & {
		readonly throwOnError?: boolean;
	} = () => ({}),
): UseQueryResult<TFactory, boolean> {
	const client = useQueryClient();
	let version = $state(0);
	const binding = QueryBinding.makeUnsafe(
		client,
		factory,
		{ handle, options },
		{
			notify: () => {
				version += 1;
			},
			track: () => {
				void version;
			},
			// Starting a read can notify readers synchronously, and Svelte
			// refuses state writes from inside markup or a `$derived`.
			untracked: untrack,
		},
	);
	$effect.pre(() => {
		QueryBinding.syncUnsafe(binding);
	});
	// A server render reads once and never unmounts, so it doesn't subscribe.
	if (!client.isServer) {
		onDestroy(QueryBinding.subscribeUnsafe(binding));
	}
	return binding.result;
}
