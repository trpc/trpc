import { type ErrorOf, queryOptions, type ServicesOf } from "@raf-query/react";

import { IssueApi } from "./issues.ts";

export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: () => IssueApi.use((api) => api.get(input.id)),
	});
}

export function assigneeQuery(input: { issueId: number }) {
	return queryOptions({
		queryKey: ["issue", input.issueId, "assignee"],
		queryFn: () => IssueApi.use((api) => api.assignee(input.issueId)),
	});
}

export type IssueError = ErrorOf<typeof issueQuery>;
//          ^?
export type AssigneeError = ErrorOf<typeof assigneeQuery>;
//          ^?
export type Services = ServicesOf<typeof issueQuery>;
//          ^?
