"use client";

import { type QueryHandleWithData, useQuery } from "@raf-query/react";

import { postQuery } from "./queries.ts";

export function Post(props: { handle: QueryHandleWithData<typeof postQuery> }) {
	const [post] = useQuery(postQuery, props.handle);
	return <h1>{post.title}</h1>;
}
