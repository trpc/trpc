declare function listIssues(): Promise<unknown>;

declare const toast: { error(message: string): void };

declare module "@raf-query/react" {
	interface Register {
		queryMeta: { errorMessage?: string; scope?: string };
	}
}

// #region intro
import { infiniteQueryOptions, Query, QueryClient } from "@raf-query/react";

export function issuesQuery() {
	return infiniteQueryOptions({
		queryKey: ["issues"],
		queryFn: async () => ({
			items: await listIssues(),
			nextCursor: null,
		}),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		meta: { errorMessage: "Couldn't load issues" },
	});
}

const queryClient = new QueryClient({
	onError: (error, query) => {
		toast.error(
			Query.metaUnsafe(query)?.errorMessage ?? "Something went wrong",
		);
	},
});
// #endregion
