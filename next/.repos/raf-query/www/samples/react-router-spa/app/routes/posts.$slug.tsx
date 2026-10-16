import { type QueryHandleWithData, useQuery } from "@raf-query/react";
import { Suspense } from "react";

import { Comments, CommentsSkeleton } from "~/components/comments.tsx";
import { commentsQuery, postQuery } from "~/queries.ts";
import { queryClient } from "~/query-client.ts";

import type { Route } from "./+types/posts.$slug";

// #region loader
export async function clientLoader(args: Route.ClientLoaderArgs) {
	const { slug } = args.params;
	// Doesn't wait: the comments stream in after the page renders.
	const comments = queryClient.prefetch(commentsQuery, { slug });
	// Waits on the first visit only. Coming back shows the cached post at
	// once, and refetches it behind the page once it's stale.
	const post = await queryClient.ensure(postQuery, { slug });
	return { comments, post };
}
// #endregion loader

// #region component
export default function PostPage(props: Route.ComponentProps) {
	const { comments, post } = props.loaderData;
	return (
		<article>
			<Post handle={post} />
			<Suspense fallback={<CommentsSkeleton />}>
				<Comments handle={comments} />
			</Suspense>
		</article>
	);
}

function Post(props: { handle: QueryHandleWithData<typeof postQuery> }) {
	// The loader waited for the post, so this is the post, not a promise.
	const [post] = useQuery(postQuery, props.handle);
	//     ^?
	return <h1>{post.title}</h1>;
}
// #endregion component
