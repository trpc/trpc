import { HydrationBoundary } from "@raf-query/react";
// ---collapse---
import { Suspense } from "react";

import { Comments } from "../../components/comments.tsx";
import { CommentsSkeleton } from "../../components/comments-skeleton.tsx";
import { PostSkeleton } from "../../components/post-skeleton.tsx";
import { Post } from "../../components/post.tsx";
// ---/collapse---
import { commentsQuery, postQuery } from "~/queries.ts";
import { getQueryClient } from "~/query-client.ts";

// #region page
export default async function Page(props: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await props.params;
	const qc = getQueryClient();
	// Never waits: both load while the page streams.
	const comments = qc.prefetch(commentsQuery, { slug });
	const post = qc.prefetch(postQuery, { slug });
	return (
		<HydrationBoundary client={qc}>
			<article>
				<Suspense fallback={<PostSkeleton />}>
					<Post handle={post} />
				</Suspense>
				<Suspense fallback={<CommentsSkeleton />}>
					<Comments handle={comments} />
				</Suspense>
			</article>
		</HydrationBoundary>
	);
}
// #endregion page
