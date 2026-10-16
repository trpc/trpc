import { type ErrorOf, queryOptions } from "@raf-query/react";
import { Schema } from "effect";
import { IssueApi, Unauthorized } from "~/issues.ts";

// #region retry-predicate
export function assigneeQuery(input: { issueId: number }) {
	return queryOptions({
		queryKey: ["issue", input.issueId, "assignee"],
		queryFn: () => IssueApi.use((api) => api.assignee(input.issueId)),
		retry: (failures, error) =>
			failures <= 3 && !Schema.is(Unauthorized)(error),
	});
}

type AssigneeError = ErrorOf<typeof assigneeQuery>;
//   ^?
// #endregion
