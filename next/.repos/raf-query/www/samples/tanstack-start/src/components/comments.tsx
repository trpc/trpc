import type { PostComment } from "~/api.ts";

export function CommentsSkeleton() {
	return <p aria-busy>Loading comments…</p>;
}

export function renderComment(comment: PostComment) {
	return (
		<p key={comment.id}>
			<strong>{comment.author}</strong> {comment.body}
		</p>
	);
}
