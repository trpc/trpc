import {
	QueryBinding,
	type QueryFactory,
	type QueryHandle,
	type QueryHandleWithData,
	type UseQueryOptions,
} from "@raf-query/core";
import {
	type MaybeRefOrGetter,
	onScopeDispose,
	shallowRef,
	toValue,
	watch,
} from "vue";

import { useQueryClient } from "./provider.ts";

/** {@link useQuery}'s options: the observer's, and `throwOnError` for typed errors. */
export type UseQueryReadOptions<
	TFactory extends QueryFactory,
	TThrow extends boolean | undefined = undefined,
> = QueryBinding.ReadOptions<TFactory, TThrow>;

/**
 * What {@link useQuery} returns: the query's controls, the `promise` of the
 * data to show (for `await` in an async `setup` under `<Suspense>`), and
 * that `data` once it's there. Read its properties in a template,
 * `computed` or `watch`; destructuring reads them once.
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
 * Read the query a handle points at. Call it in `setup`, with the handle
 * as a ref or getter when it changes (a route's loader data):
 *
 * ```ts
 * const post = useQuery(postQuery, () => props.post);
 * ```
 *
 * ```vue
 * <h1 v-if="post.data">{{ post.data.title }}</h1>
 * ```
 *
 * `data` is `undefined` until the promise settles. Under `<Suspense>`,
 * await the promise in an async `setup` instead, and `data` is there on
 * the first render (and in the server's HTML):
 *
 * ```ts
 * const post = useQuery(postQuery, () => props.post);
 * await post.promise;
 * ```
 *
 * A handle from `ensure` or `fetch` already has its data, so `data` is
 * never `undefined` for it.
 *
 * For an Effect `queryFn` (typed `ErrorOf`), with `throwOnError: false`
 * (the call's, else the query's, else the client's, which is the default
 * when it has a `layer`), `data` and the promise hold a `Result` instead,
 * and the promise never rejects.
 *
 * The result follows the cache: a refetch, `setData` or invalidation
 * updates what reads it. A component re-renders only when a property it
 * read changed.
 */
export function useQuery<
	TFactory extends QueryFactory,
	const TThrow extends boolean | undefined = undefined,
>(
	factory: TFactory,
	handle: MaybeRefOrGetter<QueryHandleWithData<TFactory>>,
	options?: MaybeRefOrGetter<UseQueryReadOptions<TFactory, TThrow>>,
): UseQueryResultWithData<TFactory, TThrow>;
export function useQuery<
	TFactory extends QueryFactory,
	const TThrow extends boolean | undefined = undefined,
>(
	factory: TFactory,
	handle: MaybeRefOrGetter<QueryHandle<TFactory>>,
	options?: MaybeRefOrGetter<UseQueryReadOptions<TFactory, TThrow>>,
): UseQueryResult<TFactory, TThrow>;
export function useQuery<TFactory extends QueryFactory>(
	factory: TFactory,
	handle: MaybeRefOrGetter<QueryHandle<TFactory>>,
	options: MaybeRefOrGetter<
		UseQueryOptions & { readonly throwOnError?: boolean }
	> = {},
): UseQueryResult<TFactory, boolean> {
	const client = useQueryClient();
	const version = shallowRef(0);
	const binding = QueryBinding.makeUnsafe(
		client,
		factory,
		{ handle: () => toValue(handle), options: () => toValue(options) },
		{
			notify: () => {
				version.value += 1;
			},
			track: () => {
				void version.value;
			},
		},
	);
	// Synchronous, so a new handle's query is observed even before anything
	// reads the result.
	watch(
		() => [toValue(handle), toValue(options)],
		() => {
			QueryBinding.syncUnsafe(binding);
		},
		{ flush: "sync" },
	);
	// A server render reads once and never unmounts, so it doesn't subscribe.
	if (!client.isServer) {
		onScopeDispose(QueryBinding.subscribeUnsafe(binding));
	}
	return binding.result;
}
