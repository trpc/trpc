import { Suspense, type ReactNode } from "react";
import { type QueryHandle, useQuery } from "@raf-query/react";
import { postQuery } from "~/queries.ts";

declare const loaderData: { post: QueryHandle<typeof postQuery> };

declare function PostBody(props: {
	readonly post: Promise<unknown>;
}): ReactNode;

declare function Spinner(): ReactNode;

function Parent() {
	// #region passing-promises-down
	const [postPromise] = useQuery(postQuery, loaderData.post);
	return (
		<Suspense fallback={<Spinner />}>
			<PostBody post={postPromise} />
		</Suspense>
	);
	// #endregion
}
