"use client";

import {
	type DataOf,
	type ErrorOf,
	promiseControls,
	QueryBinding,
	type QueryFactory,
	type QueryHandle,
	type QueryHandleWithData,
	QueryObserver,
	Query,
	resultThenable,
	type Thenable,
	type ThrowsOnError,
	throwsOnError,
	type UseQueryControls,
	type UseQueryOptions,
	type UseQueryThrowOptions,
} from "@raf-query/core";
import type { Result } from "effect";
import { use, useEffect, useState, useSyncExternalStore } from "react";

import { assertSent } from "./query-provider/browser-requests.ts";
import { useQueryClient } from "./provider.tsx";

export type UseQueryResult<
	TFactory extends QueryFactory,
	TThrow extends boolean | undefined = undefined,
> =
	ThrowsOnError<TFactory, TThrow> extends true
		? readonly [
				promise: Thenable<DataOf<TFactory>>,
				controls: UseQueryControls<TFactory>,
			]
		: readonly [
				promise: Thenable<Result.Result<DataOf<TFactory>, ErrorOf<TFactory>>>,
				controls: UseQueryControls<TFactory>,
			];

/** {@link useQuery}'s result for a handle from `ensure` or `fetch`. */
export type UseQueryResultWithData<
	TFactory extends QueryFactory,
	TThrow extends boolean | undefined = undefined,
> =
	ThrowsOnError<TFactory, TThrow> extends true
		? readonly [data: DataOf<TFactory>, controls: UseQueryControls<TFactory>]
		: readonly [
				result: Result.Result<DataOf<TFactory>, ErrorOf<TFactory>>,
				controls: UseQueryControls<TFactory>,
			];

/** An observer, with the stable callbacks `useSyncExternalStore` needs. */
interface ObserverStore<TFactory extends QueryFactory> {
	getSnapshot(): QueryObserver.Result<DataOf<TFactory>>;
	readonly observer: QueryObserver.QueryObserver<TFactory>;
	subscribe(onChange: () => void): () => void;
}

function storeFor<TFactory extends QueryFactory>(
	query: Query.Query<TFactory>,
	options: QueryObserver.Options,
): ObserverStore<TFactory> {
	const observer = QueryObserver.makeUnsafe(query, options);
	return {
		getSnapshot: () => QueryObserver.getUnsafe(observer),
		observer,
		subscribe: (onChange) => QueryObserver.subscribeUnsafe(observer, onChange),
	};
}

/**
 * Read the query a handle points at. Returns a promise to unwrap with
 * `use()` and the query's controls:
 *
 * ```tsx
 * const [postPromise, postState] = useQuery(postQuery, loaderData.post);
 * const post = use(postPromise);
 * ```
 *
 * For an Effect `queryFn` (typed {@link ErrorOf}), with `throwOnError: false`
 * (the call's, else the query's, else the client's, which is the default
 * when it has a `layer`), the first slot is a `Result` instead — `use()`
 * never throws:
 *
 * ```tsx
 * const [issueResult, issueState] = useQuery(issueQuery, loaderData.issue);
 * const issue = use(issueResult);
 * Result.match(issue, { onFailure: …, onSuccess: … });
 * ```
 *
 * The promise is stable per data version and already fulfilled once the
 * cache has data, so `use()` only suspends while there is nothing to show.
 * The component re-renders when the promise changes, and when a control it
 * has read changes; changes to controls it never reads are skipped. A
 * first load settles its pending promise in place: that counts as a change
 * once the component has read the promise's `status`, `value` or `reason`,
 * so reading them without `use()` re-renders when the data lands:
 *
 * ```tsx
 * const [tagPromise] = useQuery(tagQuery, loaderData.tag);
 * const tag = tagPromise.status === "fulfilled" ? tagPromise.value : "…";
 * ```
 *
 * A handle from `ensure` or `fetch` already has its data, so the hook
 * unwraps the promise itself and returns the data (or `Result`):
 *
 * ```tsx
 * const [post, postState] = useQuery(postQuery, loaderData.post);
 * ```
 *
 * It reads the live entry, not the handle's `data` snapshot. If that entry
 * has lost its data since (garbage-collected, `reset`), the hook suspends
 * until it is refetched.
 *
 * The hook picks by the handle at runtime (`data` in it), so a prop that
 * receives a handle from `ensure` / `fetch` must be typed
 * {@link QueryHandleWithData}: typed as `QueryHandle`, it reads as a promise
 * while the hook returns the data.
 */
export function useQuery<
	TFactory extends QueryFactory,
	const TThrow extends boolean | undefined = undefined,
>(
	factory: TFactory,
	handle: QueryHandleWithData<TFactory>,
	options?: UseQueryOptions &
		UseQueryThrowOptions<TFactory> & { readonly throwOnError?: TThrow },
): UseQueryResultWithData<TFactory, TThrow>;
export function useQuery<
	TFactory extends QueryFactory,
	const TThrow extends boolean | undefined = undefined,
>(
	factory: TFactory,
	handle: QueryHandle<TFactory>,
	options?: UseQueryOptions &
		UseQueryThrowOptions<TFactory> & { readonly throwOnError?: TThrow },
): UseQueryResult<TFactory, TThrow>;
export function useQuery<TFactory extends QueryFactory>(
	factory: TFactory,
	handle: QueryHandle<TFactory>,
	options: UseQueryOptions & { readonly throwOnError?: boolean } = {},
	// Overloads name the return; the body picks at runtime.
):
	| UseQueryResult<TFactory, boolean>
	| UseQueryResultWithData<TFactory, boolean> {
	const client = useQueryClient();
	const query = QueryBinding.queryFor(client, factory, handle);
	assertSent(client, query);
	Query.readUnsafe(query);

	const refetchInterval = options.refetchInterval;
	const refetchOnReconnect = options.refetchOnReconnect;
	const refetchOnWindowFocus = options.refetchOnWindowFocus;
	const whilePending = options.whilePending;
	const [store] = useState(() => storeFor(query, options));
	const observer = store.observer;
	const result = QueryObserver.getOptimisticResultUnsafe(
		observer,
		query,
		options,
	);
	useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
	useEffect(() => {
		QueryObserver.setOptionsUnsafe(observer, query, {
			refetchInterval,
			refetchOnReconnect,
			refetchOnWindowFocus,
			whilePending,
		});
	}, [
		observer,
		query,
		refetchInterval,
		refetchOnReconnect,
		refetchOnWindowFocus,
		whilePending,
	]);

	// The promise is returned as the tuple's first element, where reads can't
	// be seen, so it always counts as read.
	QueryObserver.trackProp(observer, "promise");
	const controls = promiseControls(QueryObserver.trackResult(observer, result));
	const throwOnError = throwsOnError(
		query,
		options.throwOnError,
		client.throwOnError,
	);
	const withData = "data" in handle;
	if (!throwOnError) {
		const resultPromise = resultThenable<DataOf<TFactory>, ErrorOf<TFactory>>(
			result.promise,
		);
		if (withData) {
			// SAFETY: `use` unwraps to Result when throwOnError is false.
			return [
				use(resultPromise),
				controls,
			] as unknown as UseQueryResultWithData<TFactory, false>;
		}
		// SAFETY: Result thenable for typed ErrorOf when throwOnError is false.
		return [
			QueryObserver.trackThenable(observer, resultPromise),
			controls,
		] as unknown as UseQueryResult<TFactory, false>;
	}
	if (withData) {
		const data = use(result.promise);
		// SAFETY: as below; `use` unwraps the promise to its data.
		return [data, controls] as unknown as UseQueryResultWithData<
			TFactory,
			true
		>;
	}
	// SAFETY: the result's promise is this factory's entry's promise (or an
	// earlier input's entry of the same factory), and the result has every
	// field of both control shapes.
	return [
		QueryObserver.trackThenable(observer, result.promise),
		controls,
	] as unknown as UseQueryResult<TFactory, true>;
}
