import type { CommentPage, Post } from "~/api.ts";
import { commentsQuery, postQuery } from "~/queries.ts";

// #region annotated-options
import type { InfiniteQueryOptions, QueryOptions } from "@raf-query/react";

const post: QueryOptions<{ data: Post }> = postQuery({ slug: "hello-world" });
const comments: InfiniteQueryOptions<{ page: CommentPage; pageParam: number }> =
	commentsQuery({ slug: "hello-world" });
// #endregion
