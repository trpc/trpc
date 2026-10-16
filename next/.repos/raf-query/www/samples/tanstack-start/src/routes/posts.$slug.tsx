import { type QueryHandle, useQuery } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, use } from "react";

import { CommentsSkeleton, renderComment } from "~/components/comments.tsx";
import { commentsQuery, postQuery } from "~/queries.ts";

// #region route
export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => {
		const qc = args.context.queryClient;
		const { slug } = args.params;
		// Never waits: the comments load while the page renders.
		const comments = qc.prefetch(commentsQuery, { slug });
		// Waits only if the post isn't in the cache yet.
		const post = await qc.ensure(postQuery, { slug });
		return { comments, post };
	},
	component: PostPage,
});
// #endregion route

// #region component
function PostPage() {
	const data = Route.useLoaderData();
	// The route already waited for this, so this is the post itself.
	const [post] = useQuery(postQuery, data.post);
	//     ^?
	return (
		<article>
			<h1>{post.title}</h1>
			<Suspense fallback={<CommentsSkeleton />}>
				<Comments handle={data.comments} />
			</Suspense>
		</article>
	);
}

function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	// May still be loading. If so, use() suspends until it lands.
	const [pagesPromise] = useQuery(commentsQuery, props.handle);
	//     ^?
	const pages = use(pagesPromise);
	return pages.pages.flatMap((page) => page.items).map(renderComment);
}
// #endregion component
