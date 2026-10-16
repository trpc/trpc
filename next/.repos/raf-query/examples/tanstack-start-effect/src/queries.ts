import {
	infiniteQueryOptions,
	QueryCache,
	queryOptions,
} from "@raf-query/react";
import { Schedule, Schema } from "effect";

import { Issues } from "~/issues.ts";
import { type IssueListInput, IssueNotFound } from "~/rpc.ts";

/**
 * Refetches every issue query being read. Actions end with it, so they stay
 * pending until the saved change is on screen.
 */
export const invalidateIssues = QueryCache.QueryCache.use((cache) =>
	cache.invalidate({ queryKey: ["issues"] }),
);

/** Three retries, backing off from 1 s. A missing issue won't turn up on a retry. */
const retryUnlessNotFound = Schedule.exponential("1 second").pipe(
	Schedule.while(
		(step) => step.attempt <= 3 && !Schema.is(IssueNotFound)(step.input),
	),
);

export function issueListQuery(input: IssueListInput) {
	return infiniteQueryOptions({
		queryFn: (context) =>
			Issues.use((issues) =>
				issues.ListIssues({
					...input,
					cursor: context.pageParam,
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
		queryFn: () => Issues.use((issues) => issues.CountIssues()),
		queryKey: ["issues", "counts"],
	});
}

/**
 * Fails with the error of `Issues.GetIssue`. The issue page turns
 * `IssueNotFound` into the router's `notFound()` when it reads the issue.
 */
export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryFn: () => Issues.use((issues) => issues.GetIssue(input)),
		queryKey: ["issues", "detail", input.id],
		retry: retryUnlessNotFound,
	});
}

export function commentsQuery(input: { issueId: number }) {
	return infiniteQueryOptions({
		queryFn: (context) =>
			Issues.use((issues) =>
				issues.ListComments({
					...input,
					cursor: context.pageParam,
				}),
			),
		// After `queryFn`, as above.
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryKey: ["issues", "comments", input.issueId],
	});
}

/**
 * Fails with the error of `Issues.GetIssueAssignee`. React narrows with
 * `Schema.is`.
 */
export function assigneeQuery(input: { issueId: number }) {
	return queryOptions({
		queryFn: () => Issues.use((issues) => issues.GetIssueAssignee(input)),
		queryKey: ["issues", "assignee", input.issueId],
		retry: retryUnlessNotFound,
	});
}
