import { api, parseFound, parseResponse } from "~/api.ts";
import type { IssueListInput } from "@examples/db/types";
import { infiniteQueryOptions, queryOptions } from "@raf-query/react";

export function issueListQuery(input: IssueListInput) {
	return infiniteQueryOptions({
		queryFn: (context) =>
			parseResponse(
				api.issues.$get({
					query: { ...input, cursor: String(context.pageParam) },
				}),
			),
		// After `queryFn`: TypeScript infers the page type from the first one.
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryKey: ["issues", "list", input],
	});
}

export function issueCountsQuery() {
	return queryOptions({
		queryFn: () => parseResponse(api.issues.counts.$get()),
		queryKey: ["issues", "counts"],
	});
}

export function issueQuery(input: { id: number }) {
	return queryOptions({
		// `null` when the issue is missing. The page calls `notFound()` so the
		// route can open before this request finishes.
		queryFn: () =>
			parseFound(api.issues[":id"].$get({ param: { id: String(input.id) } })),
		queryKey: ["issues", "detail", input.id],
	});
}

export function commentsQuery(input: { issueId: number }) {
	return infiniteQueryOptions({
		queryFn: (context) =>
			parseResponse(
				api.issues[":id"].comments.$get({
					param: { id: String(input.issueId) },
					query: { cursor: String(context.pageParam) },
				}),
			),
		// After `queryFn`, as above.
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryKey: ["issues", "comments", input.issueId],
	});
}

export function assigneeQuery(input: { issueId: number }) {
	return queryOptions({
		// `null` for a missing issue. The page 404s from the issue query, and this
		// one starts beside it, so throwing here would fail a second time.
		queryFn: () =>
			parseFound(
				api.issues[":id"].assignee.$get({
					param: { id: String(input.issueId) },
				}),
			),
		queryKey: ["issues", "assignee", input.issueId],
	});
}
