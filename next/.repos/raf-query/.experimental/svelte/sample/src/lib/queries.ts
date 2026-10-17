// #region queries
import {
	infiniteQueryOptions,
	queryOptions,
} from "@raf-query/experimental-svelte";

import { type CommentPage, getAuthor, getPost, listComments } from "./api.ts";

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
		getNextPageParam: (lastPage: CommentPage) => lastPage.nextCursor,
	});
}

export function authorQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["author", input.id],
		queryFn: () => getAuthor(input.id),
	});
}
// #endregion queries
