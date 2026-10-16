import {
	dehydrate,
	HydrationBoundary,
	type QueryHandle,
	useQuery,
} from "@raf-query/react";
import { Suspense, use } from "react";

import type { PostComment } from "~/api.ts";
import { CommentsSkeleton } from "~/components/comments.tsx";
import { commentsQuery, postQuery } from "~/queries.ts";
import { queryClientContext } from "~/query-client.ts";

import type { Route } from "./+types/blog.$slug";

declare function Comment(props: { comment: PostComment }): React.ReactNode;
declare function PostSkeleton(): React.ReactNode;

// Homepage sample: both queries stream. `posts.$slug.tsx` keeps fetch +
// prefetch for the guide that teaches that split.

// #region hero
// #region loader
export function loader(args: Route.LoaderArgs) {
	const qc = args.context.get(queryClientContext);
	const { slug } = args.params;
	// Never waits: both load while the page renders.
	const comments = qc.prefetch(commentsQuery, { slug });
	const post = qc.prefetch(postQuery, { slug });
	return { comments, dehydratedState: dehydrate(qc), post };
}
// #endregion loader

// #region component
export default function PostPage(props: Route.ComponentProps) {
	const { comments, dehydratedState, post } = props.loaderData;
	return (
		<HydrationBoundary state={dehydratedState}>
			<article>
				<Suspense fallback={<PostSkeleton />}>
					<Post handle={post} />
				</Suspense>
				<Suspense fallback={<CommentsSkeleton />}>
					<PostComments handle={comments} />
				</Suspense>
			</article>
		</HydrationBoundary>
	);
}

function Post(props: { handle: QueryHandle<typeof postQuery> }) {
	const [postPromise] = useQuery(postQuery, props.handle);
	//     ^?
	const post = use(postPromise);
	return <h1>{post.title}</h1>;
}

// ---collapse---
function PostComments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	// May still be loading. If so, use() suspends until it lands.
	const [pagesPromise] = useQuery(commentsQuery, props.handle);
	const pages = use(pagesPromise);
	return pages.pages
		.flatMap((page) => page.items)
		.map((comment) => <Comment key={comment.id} comment={comment} />);
}
// ---/collapse---
// #endregion component
// #endregion hero
