import { queryOptions } from "@raf-query/react";
import { getPost } from "~/api.ts";
import { QueryClient } from "@raf-query/react";

// #region intro
export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
		retry: 5, // or false, true, a predicate, or a Schedule
	});
}
// #endregion

// #region retry-delay
queryOptions({
	queryKey: ["post", "hello"],
	queryFn: () => getPost("hello"),
	// Constant
	retryDelay: 1000,
});

queryOptions({
	queryKey: ["post", "hello"],
	queryFn: () => getPost("hello"),
	// Exponential with a ceiling, the default's shape
	retryDelay: (failureCount) =>
		Math.min(1000 * 2 ** (failureCount - 1), 30_000),
});
// #endregion

declare function reportError(
	error: unknown,
	context: { readonly key: unknown },
): void;

// #region one-place-for-every-error
const queryClient = new QueryClient({
	onError: (error, query) => {
		reportError(error, { key: query.key });
	},
});
// #endregion
