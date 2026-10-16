import {
	environmentManager,
	type InfiniteQueryExecuteOptions,
	noop,
	type QueryClient,
	type QueryExecuteOptions,
	type Updater,
} from "@tanstack/react-query";

import {
	type AnyQueryOptions,
	type DataOf,
	handleOf,
	type InputArgs,
	type InputOf,
	type LoadArgs,
	optionsFor,
	type QueryFactory,
	type QueryHandle,
} from "./options.ts";

/**
 * Run a factory's query through TanStack: cached data that's still fresh is
 * returned, anything else fetches (deduped with a request in flight).
 */
function start(
	client: QueryClient,
	options: AnyQueryOptions,
	pages?: number,
): Promise<unknown> {
	// `client.query()` turns retries off unless set; requests here are shared
	// with the components that read them, so they retry like a read would.
	const retry =
		client.defaultQueryOptions(options).retry ??
		(environmentManager.isServer() ? 0 : 3);
	if (options.kind === "infinite") {
		const execute = { ...options, pages, retry };
		return client.infiniteQuery(
			// SAFETY: `kind: "infinite"` is only stamped by `infiniteQueryOptions`,
			// whose options are TanStack infinite query options.
			execute as unknown as InfiniteQueryExecuteOptions,
		);
	}
	return client.query(
		// SAFETY: `kind: "query"` is only stamped by `queryOptions`, whose options
		// are TanStack query options.
		{ ...options, retry } as QueryExecuteOptions,
	);
}

/**
 * Wait only on a cache miss. Cached data resolves right away; if it's stale,
 * the request `start` began revalidates it in the background.
 */
function load(
	client: QueryClient,
	options: AnyQueryOptions,
	pages: number | undefined,
): Promise<unknown> {
	const request = start(client, options, pages);
	const cached = client.getQueryData(options.queryKey);
	if (cached === undefined) {
		return request;
	}
	request.catch(noop);
	return Promise.resolve(cached);
}

/**
 * Start a query without waiting and return its handle. Fresh data is
 * reused; stale data refetches in the background. Errors surface where the
 * data is read, never here.
 */
export function prefetch<TFactory extends QueryFactory>(
	client: QueryClient,
	factory: TFactory,
	...args: InputArgs<TFactory>
): QueryHandle<TFactory> {
	const options = optionsFor(client, factory, args[0]);
	start(client, options).catch(noop);
	return handleOf<TFactory>(options, args[0]);
}

/**
 * Start a query and wait for it on a cache miss. Rejects if that request
 * fails. Stale cached data resolves immediately and revalidates.
 */
export async function ensure<TFactory extends QueryFactory>(
	client: QueryClient,
	factory: TFactory,
	...args: LoadArgs<TFactory>
): Promise<QueryHandle<TFactory>> {
	const options = optionsFor(client, factory, args[0]);
	await load(client, options, args[1]?.pages);
	return handleOf<TFactory>(options, args[0]);
}

/** Like `ensure`, but resolves to the data. */
export async function ensureData<TFactory extends QueryFactory>(
	client: QueryClient,
	factory: TFactory,
	...args: LoadArgs<TFactory>
): Promise<DataOf<TFactory>> {
	const options = optionsFor(client, factory, args[0]);
	// SAFETY: the entry under this factory's key holds this factory's data.
	return (await load(client, options, args[1]?.pages)) as DataOf<TFactory>;
}

/**
 * Mark one query stale and refetch it if it's being read. Resolves once that
 * refetch settles, so an action stays pending until fresh data is on screen.
 * For key prefixes, use `queryClient.invalidateQueries({ queryKey })`.
 */
export function invalidate<TFactory extends QueryFactory>(
	client: QueryClient,
	factory: TFactory,
	...args: InputArgs<TFactory>
): Promise<void> {
	const options = optionsFor(client, factory, args[0]);
	return client.invalidateQueries({ exact: true, queryKey: options.queryKey });
}

/** Write data for a factory call. Readers re-render without suspending. */
export function setData<TFactory extends QueryFactory>(
	client: QueryClient,
	factory: TFactory,
	input: InputOf<TFactory>,
	updater: Updater<DataOf<TFactory> | undefined, DataOf<TFactory>>,
): void {
	const options = optionsFor(client, factory, input);
	client.setQueryData(options.queryKey, updater);
}

/** Cached data for a factory call, or `undefined`. */
export function getData<TFactory extends QueryFactory>(
	client: QueryClient,
	factory: TFactory,
	...args: InputArgs<TFactory>
): DataOf<TFactory> | undefined {
	const options = optionsFor(client, factory, args[0]);
	// SAFETY: the entry under this factory's key holds this factory's data.
	return client.getQueryData(options.queryKey) as DataOf<TFactory> | undefined;
}
