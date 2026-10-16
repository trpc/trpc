import {
	HydrationBoundary,
	QueryClient,
	QueryProvider,
} from "@raf-query/react";
import { Suspense } from "react";

import { Comments } from "./comments.tsx";
import { Post } from "./post.tsx";
import { commentsQuery, postQuery, queryClientConfig } from "./queries.ts";

/** The docs' Next.js page and root layout, as one server component. */
export async function Page() {
	const qc = new QueryClient(queryClientConfig);
	const comments = qc.prefetch(commentsQuery, { slug: "hello" });
	const post = await qc.ensure(postQuery, { slug: "hello" });
	return (
		<html lang="en">
			<body>
				<QueryProvider config={queryClientConfig}>
					<HydrationBoundary client={qc}>
						<Post handle={post} />
						<Suspense fallback={<p>Loading comments…</p>}>
							<Comments handle={comments} />
						</Suspense>
					</HydrationBoundary>
				</QueryProvider>
			</body>
		</html>
	);
}
