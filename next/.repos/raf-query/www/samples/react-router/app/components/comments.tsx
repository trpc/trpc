import { type QueryHandle, useQuery } from "@raf-query/react";
import { use } from "react";

import type { PostComment } from "~/api.ts";
import { commentsQuery } from "~/queries.ts";

declare function Comment(props: { comment: PostComment }): React.ReactNode;

// #region component
export function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	// May still be loading. If so, use() suspends until it lands.
	const [pagesPromise] = useQuery(commentsQuery, props.handle);
	const pages = use(pagesPromise);
	return pages.pages
		.flatMap((page) => page.items)
		.map((comment) => <Comment key={comment.id} comment={comment} />);
}
// #endregion component

export function CommentsSkeleton() {
	return <p>Loading comments…</p>;
}
