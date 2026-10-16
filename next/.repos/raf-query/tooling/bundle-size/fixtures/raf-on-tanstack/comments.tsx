import {
	type QueryHandle,
	useQuery,
} from "@raf-query/experimental-tanstack-react-query";
import { use } from "react";

import { commentsQuery } from "./queries.ts";

export function Comments(props: {
	readonly handle: QueryHandle<typeof commentsQuery>;
}) {
	const [pagesPromise, comments] = useQuery(commentsQuery, props.handle);
	const pages = use(pagesPromise);
	return (
		<section>
			<ul>
				{pages.pages
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
