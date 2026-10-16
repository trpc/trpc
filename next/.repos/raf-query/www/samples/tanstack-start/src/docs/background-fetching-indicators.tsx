import { type QueryHandleWithData, useQuery } from "@raf-query/react";
import { postQuery } from "~/queries.ts";
import { useIsFetching } from "@raf-query/react";

declare function Spinner(props: { readonly label: string }): React.ReactNode;

// #region one-query-isfetching
function Post(props: { handle: QueryHandleWithData<typeof postQuery> }) {
	const [post, postState] = useQuery(postQuery, props.handle);
	return (
		<article aria-busy={postState.isFetching}>
			<h1>
				{post.title}
				{postState.isFetching ? <Spinner label="Refreshing" /> : null}
			</h1>
			<p>{post.body}</p>
		</article>
	);
}
// #endregion

declare function ProgressBar(): React.ReactNode;

// #region useisfetching
function GlobalProgress() {
	const fetching = useIsFetching();
	return fetching > 0 ? <ProgressBar /> : null;
}
// #endregion
