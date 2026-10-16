// #region home
import { infiniteQueryOptions, queryOptions } from "@raf-query/react";

import { getPost, listComments } from "./api.ts";

// #endregion home
import { listIssues } from "./api.ts";

// #region home
export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
	});
}

export function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		queryKey: ["comments", input.slug],
		queryFn: (context) =>
			listComments({ cursor: context.pageParam, slug: input.slug }),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	});
}
// #endregion home

export function issueListQuery(input: { status: "open" | "done" }) {
	return infiniteQueryOptions({
		queryKey: ["issues", input],
		queryFn: async () => ({
			items: await listIssues(input),
			nextCursor: null,
		}),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	});
}

// #region api-fetch
import { apiFetch } from "#api-fetch";

export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: (context) =>
			apiFetch(`/api/issues/${input.id}`, { signal: context.signal }).then(
				(response) => response.json(),
			),
	});
}
// #endregion
