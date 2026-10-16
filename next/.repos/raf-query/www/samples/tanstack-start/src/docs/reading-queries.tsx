import { type QueryHandle, useQuery } from "@raf-query/react";
import { Suspense, startTransition } from "react";
import { commentsQuery, postQuery } from "~/queries.ts";
import { Route } from "~/routes/posts.$slug.tsx";
import { use } from "react";

declare function CommentsSkeleton(): React.ReactNode;

declare function Comments(props: {
	handle: QueryHandle<typeof commentsQuery>;
}): React.ReactNode;

// #region post-page
function PostPage() {
	const loaderData = Route.useLoaderData();
	// `post` came from `qc.ensure`, `comments` from `qc.prefetch`.
	const [post, postState] = useQuery(postQuery, loaderData.post);

	return (
		<article>
			<h1>{post.title}</h1>
			<button
				disabled={postState.isFetching}
				onClick={() => startTransition(() => postState.refetch())}
			>
				Refresh
			</button>
			<p>{post.body}</p>
			<Suspense fallback={<CommentsSkeleton />}>
				<Comments handle={loaderData.comments} />
			</Suspense>
		</article>
	);
}
// #endregion

declare function DetailsTable(props: { details: Details }): React.ReactNode;

interface Details {
	readonly body: string;
}

// #region details
function Details(props: { open: boolean; details: Promise<Details> }) {
	if (!props.open) return null;
	const details = use(props.details);
	return <DetailsTable details={details} />;
}
// #endregion
