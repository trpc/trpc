import type { QueryHandle } from "@raf-query/react";
import { useQuery } from "@raf-query/react";
import { Suspense, use, type ReactNode } from "react";
import type { Post } from "~/api.ts";
import { postQuery } from "~/queries.ts";

declare function Spinner(): ReactNode;

declare const loaderData: { post: QueryHandle<typeof postQuery> };

function Parent() {
	// #region passing-promises-down
	const [postPromise] = useQuery(postQuery, loaderData.post); // from `qc.prefetch`
	return (
		<Suspense fallback={<Spinner />}>
			<PostBody post={postPromise} />
		</Suspense>
	);
	// #endregion
}

function PostBody(props: { post: Promise<Post> }) {
	const post = use(props.post);
	return <p>{post.body}</p>;
}
