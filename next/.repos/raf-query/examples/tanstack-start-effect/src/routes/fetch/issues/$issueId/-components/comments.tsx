import { currentUser } from "@examples/db/types";
import {
	CommentComposer,
	CommentItem,
	CommentSkeletons,
} from "@examples/kit/components/comments";
import { LoadMore } from "@examples/kit/components/load-more";
import { warnMockDbWrite } from "@examples/kit/lib/mock-db-toast";
import { type QueryHandleWithData, useQuery } from "@raf-query/react";
import { useRouteContext } from "@tanstack/react-router";
import { Effect } from "effect";
import { useOptimistic, useRef } from "react";

import { Issues } from "~/issues.ts";
import { commentsQuery, invalidateIssues } from "~/queries.ts";
import type { Comment } from "~/rpc.ts";

/**
 * Saves the comment, then waits for the refetched comments. A failure
 * rejects, so the form's action throws to the nearest error boundary.
 */
const addComment = Effect.fn("addComment")(function* (input: {
	readonly body: string;
	readonly id: string;
	readonly issueId: number;
}) {
	const issues = yield* Issues;
	yield* issues.AddComment(input);
	yield* invalidateIssues;
});

export function Comments(props: {
	readonly handle: QueryHandleWithData<typeof commentsQuery>;
}) {
	const queryClient = useRouteContext({
		from: "__root__",
		select: (context) => context.queryClient,
	});
	const formRef = useRef<HTMLFormElement>(null);
	const [pages, comments] = useQuery(commentsQuery, props.handle, {
		throwOnError: true,
	});
	const issueId = props.handle.input.issueId;
	const loaded = pages.pages.flatMap((page) => page.comments);
	const confirmedIds = new Set(loaded.map((comment) => comment.id));
	const [shown, addOptimistic] = useOptimistic<ReadonlyArray<Comment>, Comment>(
		loaded,
		(current, comment) =>
			current.some((existing) => existing.id === comment.id)
				? current
				: [comment, ...current],
	);
	const lastPage = pages.pages.at(-1);
	const total = lastPage?.total ?? 0;
	const pendingCount = shown.filter(
		(comment) => !confirmedIds.has(comment.id),
	).length;
	const displayTotal = total + pendingCount;
	const firstPage = new Set(
		pages.pages[0]?.comments.map((comment) => comment.id),
	);

	return (
		<section className="grid gap-4">
			<h2 className="font-semibold">
				{displayTotal} {displayTotal === 1 ? "comment" : "comments"}
			</h2>
			<form
				action={async (formData) => {
					const body = String(formData.get("body") ?? "").trim();
					if (body === "") {
						return;
					}
					const id = crypto.randomUUID();
					warnMockDbWrite();
					formRef.current?.reset();
					addOptimistic({
						author: currentUser,
						body,
						createdAt: new Date().toISOString(),
						id,
						issueId,
					});
					await queryClient.runPromise(addComment({ body, id, issueId }));
				}}
				className="grid gap-2"
				ref={formRef}
			>
				<CommentComposer />
			</form>
			<ol className="grid gap-3">
				{shown.map((comment) => (
					<CommentItem
						comment={comment}
						fadeIn={!firstPage.has(comment.id)}
						key={comment.id}
						pending={!confirmedIds.has(comment.id)}
					/>
				))}
				{comments.isFetchingNextPage ? (
					<CommentSkeletons
						count={Math.min(
							lastPage?.comments.length ?? 0,
							total - loaded.length,
						)}
					/>
				) : null}
			</ol>
			{comments.hasNextPage && !comments.isFetchingNextPage ? (
				<LoadMore
					onLoad={() => {
						void comments.fetchNextPage();
					}}
				/>
			) : null}
		</section>
	);
}
