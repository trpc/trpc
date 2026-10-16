export { allKeyed, type Settled } from "./all-keyed.ts";
export {
	ensure,
	ensureData,
	getData,
	invalidate,
	prefetch,
	setData,
} from "./client.ts";
export {
	type AnyQueryOptions,
	type DataOf,
	type InfiniteQueryBehavior,
	type InfiniteQueryOptions,
	infiniteQueryOptions,
	type InfiniteQueryOptionsInput,
	type InfiniteQueryTypes,
	type InputArgs,
	type InputOf,
	type IsPaged,
	type LoadArgs,
	type LoadOptions,
	type QueryBehavior,
	type QueryFactory,
	type QueryHandle,
	type QueryOptions,
	queryOptions,
	type QueryOptionsInput,
	type QueryTypes,
} from "./options.ts";
export {
	type PagingControls,
	type QueryControls,
	useQuery,
	type UseQueryControls,
	type UseQueryOptions,
	type UseQueryResult,
} from "./use-query.ts";
export type { Thenable } from "./thenable.ts";
export { useWaterfall } from "./use-waterfall.ts";

// The cache is TanStack's own. Its hooks are deliberately not re-exported.
export {
	CancelledError,
	hashKey,
	type InfiniteData,
	MutationCache,
	QueryCache,
	QueryClient,
	type QueryClientConfig,
	QueryClientProvider,
	type QueryKey,
	useQueryClient,
} from "@tanstack/react-query";
