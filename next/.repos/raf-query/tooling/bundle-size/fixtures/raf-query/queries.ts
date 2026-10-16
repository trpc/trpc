import { infiniteQueryOptions, queryOptions } from "@raf-query/react";

import { type CommentPage, getIssue, listComments } from "../shared/api.ts";

export function issueQuery(input: { readonly id: number }) {
	return queryOptions({
		queryFn: () => getIssue(input.id),
		queryKey: ["issues", input.id],
	});
}

export function commentsQuery(input: { readonly issueId: number }) {
	return infiniteQueryOptions<CommentPage, number>({
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: 0,
		queryFn: (context) =>
			listComments({ cursor: context.pageParam, issueId: input.issueId }),
		queryKey: ["issues", input.issueId, "comments"],
	});
}
