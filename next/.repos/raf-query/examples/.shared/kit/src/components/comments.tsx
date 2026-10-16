"use client";

import type { Comment } from "@examples/db/types";
import { Button } from "@examples/ui/components/button";
import { Skeleton } from "@examples/ui/components/skeleton";
import { Textarea } from "@examples/ui/components/textarea";
import { cn } from "@examples/ui/lib/utils";
import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

const commentClassName = "rounded-lg border p-3";

const timeFormat = new Intl.DateTimeFormat("en", {
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
	month: "short",
});

/**
 * One comment in the list. `pending` is a comment that hasn't saved yet;
 * `fadeIn` fades in a comment from a page loaded after the first.
 */
export function CommentItem(props: {
	readonly comment: Comment;
	readonly fadeIn: boolean;
	readonly pending: boolean;
}) {
	const comment = props.comment;
	return (
		<li
			aria-busy={props.pending || undefined}
			className={cn(
				commentClassName,
				props.pending
					? "animate-pulse border-dashed bg-muted/40 text-muted-foreground"
					: props.fadeIn && "animate-in duration-500 fade-in",
			)}
		>
			<div className="mb-1 flex gap-2 text-xs text-muted-foreground">
				<span
					className={cn(
						"font-medium",
						props.pending ? "text-muted-foreground" : "text-foreground",
					)}
				>
					{comment.author.name}
				</span>
				<time dateTime={comment.createdAt}>
					{props.pending
						? "Posting…"
						: timeFormat.format(new Date(comment.createdAt))}
				</time>
			</div>
			<p className="text-sm">{comment.body}</p>
		</li>
	);
}

/** The new comment's textarea and submit button. Render it inside the form. */
export function CommentComposer() {
	const { pending } = useFormStatus();
	return (
		<>
			<Textarea
				disabled={pending}
				name="body"
				placeholder="Add a comment"
				required
			/>
			<Button
				className="justify-self-end"
				disabled={pending}
				type="submit"
				variant={pending ? "secondary" : "default"}
			>
				{pending ? <Loader2 className="animate-spin" /> : null}
				{pending ? "Posting…" : "Comment"}
			</Button>
		</>
	);
}

export function CommentSkeletons(props: { readonly count: number }) {
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
