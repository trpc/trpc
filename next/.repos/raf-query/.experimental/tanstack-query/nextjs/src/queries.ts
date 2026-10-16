import { api, parseFound, parseResponse } from "@examples/api/client";
import type { IssueListInput } from "@examples/db/types";
import {
	infiniteQueryOptions,
	queryOptions,
} from "@raf-query/experimental-tanstack-react-query";
import { notFound } from "next/navigation";

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
		queryFn: async () => {
			const issue = await parseFound(
				api.issues[":id"].$get({ param: { id: String(input.id) } }),
			);
			if (!issue) {
				notFound();
			}
			return issue;
		},
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
		// `null` for a missing issue: the issue query already 404s the page, and
		// this one starts beside it, so throwing here would fail a second time.
		queryFn: () =>
			parseFound(
				api.issues[":id"].assignee.$get({
					param: { id: String(input.issueId) },
				}),
			),
		queryKey: ["issues", "assignee", input.issueId],
	});
}
