import { useSuspenseInfiniteQuery } from "@tanstack/react-query";

import { commentsQuery } from "./queries.ts";

export function Comments(props: { readonly issueId: number }) {
	const comments = useSuspenseInfiniteQuery(
		commentsQuery({ issueId: props.issueId }),
	);
	return (
		<section>
			<ul>
				{comments.data.pages
					.flatMap((page) => page.comments)
					.map((comment) => (
						<li key={comment.id}>{comment.body}</li>
					))}
			</ul>
			{comments.hasNextPage ? (
				<button
					disabled={comments.isFetchingNextPage}
					onClick={() => comments.fetchNextPage()}
					type="button"
				>
					Load more
				</button>
			) : null}
		</section>
	);
}
