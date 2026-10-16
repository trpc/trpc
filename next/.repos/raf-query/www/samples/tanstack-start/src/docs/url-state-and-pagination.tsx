import { Suspense, type ReactNode } from "react";
import { type QueryHandle, useQuery } from "@raf-query/react";
import { postQuery } from "~/queries.ts";

declare const loaderData: { post: QueryHandle<typeof postQuery> };

declare function PostBody(props: {
	readonly post: Promise<unknown>;
}): ReactNode;

declare function PostSkeleton(): ReactNode;

function PostPage() {
	// #region skeletons-for-unrelated-content
	// This loader prefetches the post instead of ensuring it.
	const [postPromise, postState] = useQuery(postQuery, loaderData.post);

	return (
		<Suspense key={postState.hash} fallback={<PostSkeleton />}>
			<PostBody post={postPromise} />
		</Suspense>
	);
	// #endregion
}
