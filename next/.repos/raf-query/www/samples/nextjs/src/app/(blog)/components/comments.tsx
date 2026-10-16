// The hero folds this whole file. `#component` is the same code, unfolded,
// for the walkthrough and the Next.js page.

// #region hero
// ---collapse---
// #endregion hero

// #region component
// #region hero
"use client";
// #endregion hero
// #endregion component

import { type QueryHandle, useQuery } from "@raf-query/react";
import { use } from "react";

import type { PostComment } from "~/api.ts";
import { commentsQuery } from "~/queries.ts";

declare function Comment(props: { comment: PostComment }): React.ReactNode;

// #region component
// #region hero
export function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	// May still be loading. If so, use() suspends until it lands.
	const [pagesPromise] = useQuery(commentsQuery, props.handle);
	const pages = use(pagesPromise);
	//     ^?
	return pages.pages
		.flatMap((page) => page.items)
		.map((comment) => <Comment key={comment.id} comment={comment} />);
}
// #endregion hero
// #endregion component

// #region hero
// ---/collapse---
// #endregion hero
