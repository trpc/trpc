import { infiniteQueryOptions, QueryClient } from "@raf-query/react";
import { postQuery } from "~/queries.ts";
import { type CommentPage, listComments } from "~/api.ts";

const qc = new QueryClient();

function issuesQuery() {
	return infiniteQueryOptions({
		queryKey: ["issues"],
		queryFn: async () => ({
			items: [] as Array<never>,
			nextCursor: null,
		}),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	});
}

// #region one-input-serializable
qc.prefetch(postQuery, { slug: "hello-world" });
qc.prefetch(issuesQuery); // a factory without input
// #endregion

// #region type-inference
const commentsOptions = infiniteQueryOptions({
	getNextPageParam: (lastPage: CommentPage) => lastPage.nextCursor,
	initialPageParam: 0,
	queryFn: (context) =>
		listComments({ cursor: context.pageParam, slug: "hello-world" }),
	queryKey: ["comments", "hello-world"],
});
commentsOptions;
// ^?
// #endregion

// #region type-helpers
import type { DataOf, InputOf, QueryHandle } from "@raf-query/react";

type PostData = DataOf<typeof postQuery>; // what queryFn resolves to
//   ^?
type PostInput = InputOf<typeof postQuery>;
//   ^?
type PostHandle = QueryHandle<typeof postQuery>; // for props
// #endregion
