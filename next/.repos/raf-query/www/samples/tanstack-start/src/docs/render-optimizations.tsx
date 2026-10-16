import { Suspense } from "react";
import { type QueryHandleWithData, useQuery } from "@raf-query/react";
import { postQuery } from "~/queries.ts";
import type { ReactNode } from "react";
import { Route } from "~/routes/posts.$slug.tsx";
import { use } from "react";
import type { Todo } from "~/api.ts";

declare function PostBody(props: { readonly post: unknown }): ReactNode;

declare function PostSkeleton(): ReactNode;

// #region tracked-controls
function PostPage() {
	const loaderData = Route.useLoaderData();
	// Reads only the promise: doesn't re-render while refetching.
	const [postPromise] = useQuery(postQuery, loaderData.post);
	return (
		<>
			<RefreshButton handle={loaderData.post} />
			<Suspense fallback={<PostSkeleton />}>
				<PostBody post={postPromise} />
			</Suspense>
		</>
	);
}

function RefreshButton(props: {
	handle: QueryHandleWithData<typeof postQuery>;
}) {
	// Reads isFetching: re-renders when a request starts and ends.
	const [, post] = useQuery(postQuery, props.handle);
	return (
		<button disabled={post.isFetching} onClick={() => post.refetch()}>
			Refresh
		</button>
	);
}
// #endregion

declare const todosPromise: Promise<ReadonlyArray<Todo>>;

// #region deriving-data
const todos = use(todosPromise);
const done = todos.filter((todo) => todo.done);
// #endregion
