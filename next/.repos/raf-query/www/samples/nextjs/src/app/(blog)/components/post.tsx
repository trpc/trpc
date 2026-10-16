// #region component
"use client";
// #endregion

import { type QueryHandle, useQuery } from "@raf-query/react";
import { use } from "react";

import { postQuery } from "~/queries.ts";

// #region component
export function Post(props: { handle: QueryHandle<typeof postQuery> }) {
	const [postPromise] = useQuery(postQuery, props.handle);
	//     ^?
	const post = use(postPromise);
	return <h1>{post.title}</h1>;
}
// #endregion component
