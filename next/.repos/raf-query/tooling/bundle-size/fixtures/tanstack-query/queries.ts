import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import { type CommentPage, getIssue, listComments } from "../shared/api.ts";

export function issueQuery(input: { readonly id: number }) {
	return queryOptions({
		queryFn: () => getIssue(input.id),
		queryKey: ["issues", input.id],
	});
}

export function commentsQuery(input: { readonly issueId: number }) {
	return infiniteQueryOptions({
		getNextPageParam: (lastPage: CommentPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryFn: (context) =>
			listComments({ cursor: context.pageParam, issueId: input.issueId }),
		queryKey: ["issues", input.issueId, "comments"],
	});
}
