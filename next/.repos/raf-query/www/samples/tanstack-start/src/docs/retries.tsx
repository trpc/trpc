import { Suspense, type ReactNode } from "react";
import { type QueryHandle } from "@raf-query/react";
import { CatchBoundary } from "@tanstack/react-router";
import { commentsQuery } from "~/queries.ts";

declare const post: { hash: string };

declare const loaderData: { comments: QueryHandle<typeof commentsQuery> };

declare function Comments(props: {
	readonly handle: QueryHandle<typeof commentsQuery>;
}): ReactNode;

declare function CommentsSkeleton(): ReactNode;

function ErrorExample() {
	return (
		// #region showing-errors
		<CatchBoundary
			getResetKey={() => post.hash}
			errorComponent={(props) => (
				<div role="alert">
					<p>
						Couldn't load comments:{" "}
						{props.error instanceof Error
							? props.error.message
							: String(props.error)}
					</p>
					<button onClick={props.reset}>Try again</button>
				</div>
			)}
		>
			<Suspense fallback={<CommentsSkeleton />}>
				<Comments handle={loaderData.comments} />
			</Suspense>
		</CatchBoundary>
		// #endregion
	);
}
