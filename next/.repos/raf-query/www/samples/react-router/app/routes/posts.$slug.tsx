import {
	dehydrate,
	HydrationBoundary,
	type QueryHandleWithData,
	useQuery,
} from "@raf-query/react";
import { Suspense } from "react";

import { Comments, CommentsSkeleton } from "~/components/comments.tsx";
import { commentsQuery, postQuery } from "~/queries.ts";
import { queryClientContext } from "~/query-client.ts";

import type { Route } from "./+types/posts.$slug";

// #region loader
export async function loader(args: Route.LoaderArgs) {
	const qc = args.context.get(queryClientContext);
	const { slug } = args.params;
	// Doesn't wait: the comments stream in after the page renders.
	const comments = qc.prefetch(commentsQuery, { slug });
	// Waits, so the post is in the page's first HTML.
	const post = await qc.fetch(postQuery, { slug });
	return {
		comments,
		dehydratedState: dehydrate(qc),
		post,
	};
}
// #endregion loader

// #region component
export default function PostPage(props: Route.ComponentProps) {
	const { comments, dehydratedState, post } = props.loaderData;
	return (
		<HydrationBoundary state={dehydratedState}>
			<article>
				<Post handle={post} />
				<Suspense fallback={<CommentsSkeleton />}>
					<Comments handle={comments} />
				</Suspense>
			</article>
		</HydrationBoundary>
	);
}

function Post(props: { handle: QueryHandleWithData<typeof postQuery> }) {
	// The loader waited for the post, so this is the post, not a promise.
	const [post] = useQuery(postQuery, props.handle);
	//     ^?
	return <h1>{post.title}</h1>;
}
// #endregion component
