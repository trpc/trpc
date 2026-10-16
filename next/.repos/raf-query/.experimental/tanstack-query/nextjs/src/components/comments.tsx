"use client";

import { api, parseResponse } from "@examples/api/client";
import { type Comment, currentUser } from "@examples/db/types";
import { Button } from "@examples/ui/components/button";
import { LoadMore } from "@examples/kit/components/load-more";
import { Skeleton } from "@examples/ui/components/skeleton";
import { Textarea } from "@examples/ui/components/textarea";
import { cn } from "@examples/ui/lib/utils";
import {
	type QueryHandle,
	useQuery,
	useQueryClient,
} from "@raf-query/experimental-tanstack-react-query";
import { use, useOptimistic } from "react";

import { commentsQuery } from "~/queries.ts";

const commentClassName = "rounded-lg border p-3";

const timeFormat = new Intl.DateTimeFormat("en", {
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
	month: "short",
});

export function Comments(props: {
	readonly handle: QueryHandle<typeof commentsQuery>;
}) {
	const queryClient = useQueryClient();
	const [pagesPromise, comments] = useQuery(commentsQuery, props.handle);
	const pages = use(pagesPromise);
	const issueId = props.handle.input.issueId;
	const loaded = pages.pages.flatMap((page) => page.comments);
	const [shown, addOptimistic] = useOptimistic<ReadonlyArray<Comment>, Comment>(
		loaded,
		(current, comment) =>
			current.some((existing) => existing.id === comment.id)
				? current
				: [comment, ...current],
	);
	const lastPage = pages.pages.at(-1);
	const total = lastPage?.total ?? 0;
	const firstPage = new Set(
		pages.pages[0]?.comments.map((comment) => comment.id),
	);

	return (
		<section className="grid gap-4">
			<h2 className="font-semibold">
				{total} {total === 1 ? "comment" : "comments"}
			</h2>
			<form
				action={async (formData) => {
					const body = String(formData.get("body") ?? "");
					const id = crypto.randomUUID();
					addOptimistic({
						author: currentUser,
						body,
						createdAt: new Date().toISOString(),
						id,
						issueId,
					});
					await parseResponse(
						api.issues[":id"].comments.$post({
							json: { body, id },
							param: { id: String(issueId) },
						}),
					);
					await queryClient.invalidateQueries({ queryKey: ["issues"] });
				}}
				className="grid gap-2"
			>
				<Textarea name="body" placeholder="Add a comment" required />
				<Button className="justify-self-end" type="submit">
					Comment
				</Button>
			</form>
			<ol className="grid gap-3">
				{shown.map((comment) => (
					<li
						className={cn(
							commentClassName,
							!firstPage.has(comment.id) && "animate-in duration-500 fade-in",
						)}
						key={comment.id}
					>
						<div className="mb-1 flex gap-2 text-xs text-muted-foreground">
							<span className="font-medium text-foreground">
								{comment.author.name}
							</span>
							<time dateTime={comment.createdAt}>
								{timeFormat.format(new Date(comment.createdAt))}
							</time>
						</div>
						<p className="text-sm">{comment.body}</p>
					</li>
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

function CommentSkeletons(props: { readonly count: number }) {
	return Array.from({ length: props.count }, (_, index) => (
		<li className={commentClassName} key={index}>
			<Skeleton className="mb-1 h-4 w-32" />
			<Skeleton className="h-5 w-full" />
		</li>
	));
}

export function CommentsSkeleton() {
	return (
		<div className="grid gap-3">
			<Skeleton className="h-6 w-32" />
			<Skeleton className="h-16" />
			<Skeleton className="h-16" />
		</div>
	);
}
